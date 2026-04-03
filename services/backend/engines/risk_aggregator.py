"""
Risk Aggregator Engine
──────────────────────
Combines all risk signals (weather, news, traffic, social) into a unified
disruption risk assessment for Chennai zones.

This is the brain that decides:
1. Should we trigger a disruption event?
2. Should we send proactive warnings?
3. What's the premium risk for next week?
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field
import h3

from config import get_settings
from engines.weather_forecaster import (
    get_zone_weather,
    get_all_chennai_weather,
    check_weather_triggers,
    get_7_day_risk_forecast,
    WeatherForecast,
)
from engines.news_scraper import get_disruption_news
from engines.trigger import evaluate_double_trigger, evaluate_social_trigger

settings = get_settings()


@dataclass
class RiskAssessment:
    """Comprehensive risk assessment for a zone."""
    zone: str
    h3_hex: str
    timestamp: datetime
    
    # Component risks (0.0 - 1.0)
    weather_risk: float = 0.0
    traffic_risk: float = 0.0
    news_risk: float = 0.0
    social_risk: float = 0.0
    
    # Combined risk
    overall_risk: float = 0.0
    risk_level: str = "low"  # low, moderate, high, critical
    
    # Decision flags
    should_trigger_disruption: bool = False
    should_send_warning: bool = False
    
    # Sources
    risk_factors: list = field(default_factory=list)
    
    def to_dict(self) -> dict:
        return {
            "zone": self.zone,
            "h3_hex": self.h3_hex,
            "timestamp": self.timestamp.isoformat(),
            "weather_risk": self.weather_risk,
            "traffic_risk": self.traffic_risk,
            "news_risk": self.news_risk,
            "social_risk": self.social_risk,
            "overall_risk": self.overall_risk,
            "risk_level": self.risk_level,
            "should_trigger_disruption": self.should_trigger_disruption,
            "should_send_warning": self.should_send_warning,
            "risk_factors": self.risk_factors,
        }


# Risk thresholds
RISK_THRESHOLDS = {
    "warning": 0.50,      # Send proactive warning
    "disruption": 0.70,   # Trigger disruption event (enables claims)
    "critical": 0.85,     # Critical - immediate payout processing
}

# Risk weights (sum = 1.0)
RISK_WEIGHTS = {
    "weather": 0.40,      # Weather is primary signal
    "traffic": 0.30,      # Traffic confirms ground truth
    "news": 0.15,         # News provides context
    "social": 0.15,       # Social for real-time signals
}


async def assess_zone_risk(zone: str) -> RiskAssessment:
    """
    Perform comprehensive risk assessment for a single zone.
    Combines all data sources into a unified risk score.
    """
    from engines.news_scraper import CHENNAI_ZONES
    
    zone_info = CHENNAI_ZONES.get(zone, {})
    lat = zone_info.get("lat", settings.chennai_lat)
    lng = zone_info.get("lng", settings.chennai_lng)
    h3_hex = h3.latlng_to_cell(lat, lng, settings.h3_resolution)
    
    assessment = RiskAssessment(
        zone=zone,
        h3_hex=h3_hex,
        timestamp=datetime.utcnow(),
    )
    
    risk_factors = []
    
    # ── 1. Weather Risk ──────────────────────────────────────
    try:
        weather = await get_zone_weather(zone)
        assessment.weather_risk = weather.disruption_risk
        
        if weather.rain_mm_1h >= 30:
            risk_factors.append(f"Heavy rain: {weather.rain_mm_1h:.1f}mm")
        if weather.waterlog_risk >= 0.5:
            risk_factors.append(f"Waterlogging risk: {weather.waterlog_risk:.0%}")
        if weather.wind_speed_kmh >= 40:
            risk_factors.append(f"High wind: {weather.wind_speed_kmh:.0f}km/h")
    except Exception as e:
        print(f"⚠️ Weather risk error for {zone}: {e}")
    
    # ── 2. Traffic Risk (TomTom) ─────────────────────────────
    try:
        traffic_result = await evaluate_double_trigger(h3_hex)
        if traffic_result.get("traffic_kmh", 999) < 10:
            assessment.traffic_risk = 0.8 + (5 - traffic_result["traffic_kmh"]) / 25
            risk_factors.append(f"Traffic gridlock: {traffic_result['traffic_kmh']:.0f}km/h")
        elif traffic_result.get("traffic_kmh", 999) < 20:
            assessment.traffic_risk = 0.4 + (20 - traffic_result["traffic_kmh"]) / 50
            risk_factors.append(f"Slow traffic: {traffic_result['traffic_kmh']:.0f}km/h")
        else:
            assessment.traffic_risk = max(0, 0.3 - traffic_result.get("traffic_kmh", 30) / 100)
    except Exception as e:
        print(f"⚠️ Traffic risk error for {zone}: {e}")
    
    # ── 3. News Risk ─────────────────────────────────────────
    try:
        news_disruptions = await get_disruption_news()
        zone_news = [n for n in news_disruptions if n.get("zone_name") == zone]
        
        if zone_news:
            max_confidence = max(n.get("confidence", 0) for n in zone_news)
            assessment.news_risk = max_confidence
            for news in zone_news[:2]:
                risk_factors.append(f"News: {news.get('title', '')[:50]}...")
    except Exception as e:
        print(f"⚠️ News risk error for {zone}: {e}")
    
    # ── 4. Social Risk (LLM Analysis) ────────────────────────
    try:
        social_result = await evaluate_social_trigger(zone)
        if social_result.get("triggered"):
            assessment.social_risk = social_result.get("confidence", 0)
            risk_factors.append(f"Social: {social_result.get('summary', 'Disruption detected')[:40]}")
    except Exception as e:
        print(f"⚠️ Social risk error for {zone}: {e}")
    
    # ── Calculate Overall Risk ───────────────────────────────
    assessment.overall_risk = (
        assessment.weather_risk * RISK_WEIGHTS["weather"] +
        assessment.traffic_risk * RISK_WEIGHTS["traffic"] +
        assessment.news_risk * RISK_WEIGHTS["news"] +
        assessment.social_risk * RISK_WEIGHTS["social"]
    )
    
    # Apply non-linear scaling for critical situations
    if assessment.weather_risk > 0.8 and assessment.traffic_risk > 0.6:
        assessment.overall_risk = min(assessment.overall_risk * 1.2, 1.0)
    
    assessment.overall_risk = round(assessment.overall_risk, 4)
    
    # ── Determine Risk Level ─────────────────────────────────
    if assessment.overall_risk >= RISK_THRESHOLDS["critical"]:
        assessment.risk_level = "critical"
    elif assessment.overall_risk >= RISK_THRESHOLDS["disruption"]:
        assessment.risk_level = "high"
    elif assessment.overall_risk >= RISK_THRESHOLDS["warning"]:
        assessment.risk_level = "moderate"
    else:
        assessment.risk_level = "low"
    
    # ── Decision Flags ───────────────────────────────────────
    assessment.should_trigger_disruption = assessment.overall_risk >= RISK_THRESHOLDS["disruption"]
    assessment.should_send_warning = assessment.overall_risk >= RISK_THRESHOLDS["warning"]
    
    assessment.risk_factors = risk_factors
    
    return assessment


async def assess_all_zones() -> list[RiskAssessment]:
    """
    Assess risk for all Chennai zones in parallel.
    Returns list of RiskAssessments, sorted by risk (highest first).
    """
    from engines.news_scraper import CHENNAI_ZONES
    
    print("🔍 Assessing risk for all Chennai zones...")
    
    tasks = [assess_zone_risk(zone) for zone in CHENNAI_ZONES.keys()]
    assessments = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out errors
    valid_assessments = [a for a in assessments if isinstance(a, RiskAssessment)]
    
    # Sort by risk
    valid_assessments.sort(key=lambda a: a.overall_risk, reverse=True)
    
    # Print summary
    print(f"\n📊 Risk Summary ({datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC):")
    for a in valid_assessments:
        emoji = "🔴" if a.risk_level == "critical" else "🟠" if a.risk_level == "high" else "🟡" if a.risk_level == "moderate" else "🟢"
        print(f"  {emoji} {a.zone}: {a.overall_risk:.0%} ({a.risk_level})")
    
    return valid_assessments


async def get_triggered_disruptions() -> list[dict]:
    """
    Get all zones that should have disruption events triggered.
    This is called by the monitoring system periodically.
    """
    assessments = await assess_all_zones()
    
    triggered = []
    for a in assessments:
        if a.should_trigger_disruption:
            triggered.append({
                "zone_name": a.zone,
                "h3_hex": a.h3_hex,
                "event_type": _determine_event_type(a),
                "confidence": a.overall_risk,
                "risk_factors": a.risk_factors,
                "triggered_at": a.timestamp.isoformat(),
            })
    
    return triggered


def _determine_event_type(assessment: RiskAssessment) -> str:
    """Determine the primary disruption type based on risk components."""
    if assessment.weather_risk > 0.6:
        return "flood"
    if assessment.traffic_risk > 0.6:
        return "traffic_gridlock"
    if assessment.social_risk > 0.6:
        return "strike"
    return "traffic_gridlock"


async def get_zones_for_warning() -> list[dict]:
    """
    Get zones where riders should receive proactive warnings.
    Called before disruptions hit to help riders relocate.
    """
    assessments = await assess_all_zones()
    
    warnings = []
    for a in assessments:
        if a.should_send_warning and not a.should_trigger_disruption:
            warnings.append({
                "zone_name": a.zone,
                "risk_level": a.risk_level,
                "overall_risk": a.overall_risk,
                "risk_factors": a.risk_factors,
                "suggested_action": _suggest_action(a),
            })
    
    return warnings


def _suggest_action(assessment: RiskAssessment) -> str:
    """Suggest action for rider based on risk assessment."""
    if assessment.weather_risk > 0.5:
        return "Move to covered area; heavy rain expected"
    if assessment.traffic_risk > 0.5:
        return "Avoid main roads; use alternate routes"
    return "Stay alert; conditions may worsen"


async def calculate_weekly_risk_score() -> dict:
    """
    Calculate comprehensive risk score for premium calculation.
    Combines weather forecast with historical patterns and current events.
    """
    print("📈 Calculating weekly risk score for premium adjustment...")
    
    # Get 7-day weather forecast
    weather_forecast = await get_7_day_risk_forecast()
    weather_risk = weather_forecast.get("risk_score", 0.5)
    
    # Get current disruption news (persistence factor)
    news_disruptions = await get_disruption_news()
    news_count = len(news_disruptions)
    news_risk = min(news_count * 0.1, 0.3)  # Cap at 0.3
    
    # Seasonal adjustment (Northeast Monsoon: Oct-Dec)
    month = datetime.utcnow().month
    seasonal_risk = {
        1: 0.05, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.20,
        6: 0.25, 7: 0.30, 8: 0.30, 9: 0.35, 10: 0.45,
        11: 0.55, 12: 0.40,
    }.get(month, 0.25)
    
    # Combine risks
    combined_risk = (
        weather_risk * 0.50 +      # Weather forecast is primary
        news_risk * 0.20 +          # Current news adds context
        seasonal_risk * 0.30        # Seasonal patterns
    )
    
    # Clamp to valid range
    combined_risk = max(0.1, min(combined_risk, 0.95))
    
    return {
        "risk_score": round(combined_risk, 4),
        "components": {
            "weather_forecast": round(weather_risk, 4),
            "news_factor": round(news_risk, 4),
            "seasonal_factor": round(seasonal_risk, 4),
        },
        "weather_details": weather_forecast,
        "news_count": news_count,
        "month": month,
        "calculated_at": datetime.utcnow().isoformat(),
    }


# ── Standalone test ─────────────────────────────────────────
if __name__ == "__main__":
    async def test():
        print("Testing risk aggregator...")
        
        # Test single zone
        assessment = await assess_zone_risk("velachery")
        print(f"\nVelachery Risk Assessment:")
        print(f"  Weather: {assessment.weather_risk:.0%}")
        print(f"  Traffic: {assessment.traffic_risk:.0%}")
        print(f"  News: {assessment.news_risk:.0%}")
        print(f"  Social: {assessment.social_risk:.0%}")
        print(f"  Overall: {assessment.overall_risk:.0%} ({assessment.risk_level})")
        print(f"  Trigger: {assessment.should_trigger_disruption}")
        
        # Test all zones
        await assess_all_zones()
        
        # Test weekly risk
        weekly = await calculate_weekly_risk_score()
        print(f"\nWeekly Risk Score: {weekly['risk_score']:.2f}")
    
    asyncio.run(test())
