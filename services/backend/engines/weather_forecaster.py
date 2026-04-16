"""
Enhanced Weather Forecaster Engine
──────────────────────────────────
Multi-source weather monitoring for Chennai with predictive capabilities.

Sources:
- OpenWeatherMap (current + 5-day forecast)
- Tomorrow.io (minute-level precipitation)
- IMD (Indian Meteorological Department) alerts

Features:
- Hyper-local H3 hex-grid predictions
- Waterlogging risk scoring (not just rain)
- Proactive storm warnings
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass
import httpx
import h3

from config import get_settings
from engines.h3_utils import latlng_to_cell

settings = get_settings()

# ── Chennai Weather Thresholds ──────────────────────────────
RAIN_WARNING_MM = 15.0      # Moderate rain warning
RAIN_SEVERE_MM = 30.0       # Severe rain (triggers payout)
RAIN_EXTREME_MM = 50.0      # Extreme rain (cyclonic)
WATERLOG_RISK_THRESHOLD = 0.7

# Low-lying areas prone to waterlogging (higher risk multiplier)
WATERLOG_PRONE_ZONES = {
    "velachery": 1.5,
    "perungudi": 1.3,
    "thoraipakkam": 1.2,
    "guindy": 1.2,
    "adyar": 1.1,
    "omr": 1.0,  # Elevated roads, lower risk
    "t_nagar": 1.2,
    "anna_nagar": 1.1,
}

# Chennai zone coordinates
CHENNAI_ZONES = {
    "omr": {"lat": 12.9516, "lng": 80.2363},
    "velachery": {"lat": 12.9815, "lng": 80.2180},
    "t_nagar": {"lat": 13.0418, "lng": 80.2341},
    "adyar": {"lat": 13.0067, "lng": 80.2574},
    "anna_nagar": {"lat": 13.0850, "lng": 80.2101},
    "guindy": {"lat": 13.0067, "lng": 80.2206},
    "perungudi": {"lat": 12.9653, "lng": 80.2461},
    "sholinganallur": {"lat": 12.9010, "lng": 80.2279},
    "thoraipakkam": {"lat": 12.9367, "lng": 80.2336},
    "tambaram": {"lat": 12.9249, "lng": 80.1000},
    "central_chennai": {"lat": 13.0827, "lng": 80.2707},
}


@dataclass
class WeatherForecast:
    """Weather forecast for a specific zone."""
    zone: str
    lat: float
    lng: float
    h3_hex: str
    timestamp: datetime
    
    # Current conditions
    temp_celsius: float = 0.0
    humidity_percent: float = 0.0
    wind_speed_kmh: float = 0.0
    rain_mm_1h: float = 0.0
    description: str = ""
    
    # Forecasted conditions (next 3 hours)
    forecast_rain_mm: float = 0.0
    forecast_description: str = ""
    
    # Risk scores
    waterlog_risk: float = 0.0
    disruption_risk: float = 0.0
    
    # Alerts
    alerts: list = None
    
    def __post_init__(self):
        if self.alerts is None:
            self.alerts = []


async def get_current_weather(lat: float, lng: float) -> dict:
    """Get current weather from OpenWeatherMap."""
    if not settings.openweather_api_key:
        return {"error": "OpenWeather API key not configured"}
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={
                    "lat": lat,
                    "lon": lng,
                    "appid": settings.openweather_api_key,
                    "units": "metric",
                },
            )
            return resp.json()
    except Exception as e:
        return {"error": str(e)}


async def get_weather_forecast(lat: float, lng: float) -> dict:
    """Get 5-day forecast from OpenWeatherMap."""
    if not settings.openweather_api_key:
        return {"error": "OpenWeather API key not configured"}
    
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/forecast",
                params={
                    "lat": lat,
                    "lon": lng,
                    "appid": settings.openweather_api_key,
                    "units": "metric",
                },
            )
            return resp.json()
    except Exception as e:
        return {"error": str(e)}


async def get_tomorrow_io_forecast(lat: float, lng: float) -> dict:
    """
    Get minute-level precipitation forecast from Tomorrow.io.
    Better for predicting exact rainfall timing.
    """
    if not settings.tomorrow_io_api_key:
        return {"error": "Tomorrow.io API key not configured"}
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.tomorrow.io/v4/timelines",
                params={
                    "location": f"{lat},{lng}",
                    "fields": "precipitationIntensity,precipitationType,weatherCode",
                    "timesteps": "1h",
                    "units": "metric",
                    "apikey": settings.tomorrow_io_api_key,
                },
            )
            return resp.json()
    except Exception as e:
        return {"error": str(e)}


async def get_imd_alerts() -> list[dict]:
    """
    Fetch IMD (Indian Meteorological Department) cyclone/flood alerts.
    Uses RSS feed or scrapes IMD Chennai page.
    """
    alerts = []
    
    try:
        # IMD Chennai RSS
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://mausam.imd.gov.in/imd_latest/rss_chennai_fc.php",
                headers={"User-Agent": "Mozilla/5.0"},
            )
            
            import feedparser
            feed = feedparser.parse(resp.text)
            
            for entry in feed.entries[:5]:
                title = entry.get("title", "").lower()
                if any(kw in title for kw in ["warning", "alert", "cyclone", "heavy rain", "flood"]):
                    alerts.append({
                        "source": "IMD",
                        "title": entry.get("title", ""),
                        "description": entry.get("summary", ""),
                        "severity": _classify_imd_severity(title),
                        "timestamp": datetime.utcnow().isoformat(),
                    })
    except Exception as e:
        print(f"⚠️ IMD alerts fetch error: {e}")
    
    return alerts


def _classify_imd_severity(title: str) -> str:
    """Classify IMD alert severity."""
    title_lower = title.lower()
    if any(kw in title_lower for kw in ["red", "extreme", "cyclone", "very heavy"]):
        return "extreme"
    if any(kw in title_lower for kw in ["orange", "heavy"]):
        return "severe"
    if any(kw in title_lower for kw in ["yellow", "moderate"]):
        return "moderate"
    return "low"


def calculate_waterlog_risk(rain_mm: float, zone: str, humidity: float = 80.0) -> float:
    """
    Calculate waterlogging risk based on rain, zone topology, and recent conditions.
    Returns 0.0 (no risk) to 1.0 (definite waterlogging).
    """
    if rain_mm < 10:
        return 0.0
    
    # Base risk from rain amount
    if rain_mm >= RAIN_EXTREME_MM:
        base_risk = 0.95
    elif rain_mm >= RAIN_SEVERE_MM:
        base_risk = 0.75
    elif rain_mm >= RAIN_WARNING_MM:
        base_risk = 0.45
    else:
        base_risk = 0.20
    
    # Zone multiplier (low-lying areas flood faster)
    zone_multiplier = WATERLOG_PRONE_ZONES.get(zone, 1.0)
    
    # Humidity factor (saturated soil = more flooding)
    humidity_factor = 1.0 + (humidity - 70) / 100.0 if humidity > 70 else 1.0
    
    risk = min(base_risk * zone_multiplier * humidity_factor, 1.0)
    return round(risk, 4)


def calculate_disruption_risk(weather: dict, zone: str) -> float:
    """
    Calculate overall disruption risk for delivery partners.
    Combines rain, wind, visibility, and zone factors.
    """
    rain_mm = weather.get("rain", {}).get("1h", 0.0)
    wind_speed = weather.get("wind", {}).get("speed", 0.0) * 3.6  # m/s to km/h
    visibility = weather.get("visibility", 10000) / 1000  # meters to km
    
    # Rain component (50% weight)
    rain_risk = min(rain_mm / 50.0, 1.0) * 0.5
    
    # Wind component (25% weight) - dangerous for bikes at >40 km/h
    wind_risk = min(wind_speed / 60.0, 1.0) * 0.25
    
    # Visibility component (25% weight) - dangerous at <2km
    vis_risk = max(0, (5 - visibility) / 5) * 0.25
    
    # Zone waterlog factor
    zone_factor = WATERLOG_PRONE_ZONES.get(zone, 1.0)
    
    total_risk = min((rain_risk + wind_risk + vis_risk) * zone_factor, 1.0)
    return round(total_risk, 4)


async def get_zone_weather(zone: str) -> WeatherForecast:
    """
    Get comprehensive weather data for a Chennai zone.
    Returns WeatherForecast with all risk calculations.
    """
    zone_info = CHENNAI_ZONES.get(zone, CHENNAI_ZONES["central_chennai"])
    lat, lng = zone_info["lat"], zone_info["lng"]
    h3_hex = latlng_to_cell(lat, lng, settings.h3_resolution)
    
    # Fetch current weather
    current = await get_current_weather(lat, lng)
    
    if "error" in current:
        return WeatherForecast(
            zone=zone,
            lat=lat,
            lng=lng,
            h3_hex=h3_hex,
            timestamp=datetime.utcnow(),
            alerts=[{"error": current["error"]}],
        )
    
    # Fetch forecast
    forecast_data = await get_weather_forecast(lat, lng)
    
    # Extract data
    main = current.get("main", {})
    wind = current.get("wind", {})
    rain = current.get("rain", {})
    weather_desc = current.get("weather", [{}])[0]
    
    rain_mm = rain.get("1h", 0.0)
    humidity = main.get("humidity", 50)
    
    # Calculate risks
    waterlog_risk = calculate_waterlog_risk(rain_mm, zone, humidity)
    disruption_risk = calculate_disruption_risk(current, zone)
    
    # Build forecast
    forecast = WeatherForecast(
        zone=zone,
        lat=lat,
        lng=lng,
        h3_hex=h3_hex,
        timestamp=datetime.utcnow(),
        temp_celsius=main.get("temp", 0),
        humidity_percent=humidity,
        wind_speed_kmh=wind.get("speed", 0) * 3.6,
        rain_mm_1h=rain_mm,
        description=weather_desc.get("description", ""),
        waterlog_risk=waterlog_risk,
        disruption_risk=disruption_risk,
    )
    
    # Process forecast for next 3 hours
    if "list" in forecast_data:
        next_3h = forecast_data["list"][:1]  # First forecast entry
        if next_3h:
            entry = next_3h[0]
            forecast.forecast_rain_mm = entry.get("rain", {}).get("3h", 0.0)
            forecast.forecast_description = entry.get("weather", [{}])[0].get("description", "")
    
    # Add alerts if severe
    if rain_mm >= RAIN_SEVERE_MM:
        forecast.alerts.append({
            "type": "severe_rain",
            "message": f"Severe rain ({rain_mm:.1f}mm) in {zone}",
            "severity": "high",
        })
    
    if waterlog_risk >= WATERLOG_RISK_THRESHOLD:
        forecast.alerts.append({
            "type": "waterlogging",
            "message": f"High waterlogging risk ({waterlog_risk:.0%}) in {zone}",
            "severity": "high",
        })
    
    return forecast


async def get_all_chennai_weather() -> list[WeatherForecast]:
    """
    Get weather for all Chennai zones in parallel.
    Used for city-wide disruption monitoring.
    """
    tasks = [get_zone_weather(zone) for zone in CHENNAI_ZONES.keys()]
    forecasts = await asyncio.gather(*tasks, return_exceptions=True)
    
    return [f for f in forecasts if isinstance(f, WeatherForecast)]


async def check_weather_triggers() -> list[dict]:
    """
    Check all zones for weather-based disruption triggers.
    Returns list of triggered disruption events.
    """
    print("🌧️ Checking weather triggers for all Chennai zones...")
    
    forecasts = await get_all_chennai_weather()
    imd_alerts = await get_imd_alerts()
    
    triggered_events = []
    
    for forecast in forecasts:
        if forecast.disruption_risk >= 0.6:
            event = {
                "event_type": "flood" if forecast.waterlog_risk > 0.5 else "traffic_gridlock",
                "zone_name": forecast.zone,
                "h3_hex": forecast.h3_hex,
                "confidence": forecast.disruption_risk,
                "trigger_source": "weather_api",
                "rain_mm": forecast.rain_mm_1h,
                "details": {
                    "waterlog_risk": forecast.waterlog_risk,
                    "temp_celsius": forecast.temp_celsius,
                    "humidity": forecast.humidity_percent,
                    "description": forecast.description,
                },
            }
            triggered_events.append(event)
            print(f"  🚨 {forecast.zone}: risk={forecast.disruption_risk:.0%}, rain={forecast.rain_mm_1h:.1f}mm")
    
    # Add IMD alerts as events
    for alert in imd_alerts:
        if alert["severity"] in ["severe", "extreme"]:
            triggered_events.append({
                "event_type": "flood",
                "zone_name": "chennai_wide",
                "h3_hex": "citywide",
                "confidence": 0.9 if alert["severity"] == "extreme" else 0.75,
                "trigger_source": "imd_alert",
                "details": {
                    "imd_title": alert["title"],
                    "imd_description": alert["description"],
                },
            })
    
    print(f"  📊 Total triggered events: {len(triggered_events)}")
    return triggered_events


async def get_7_day_risk_forecast() -> dict:
    """
    Get 7-day risk forecast for premium calculation.
    Used by the actuarial engine every Sunday.
    """
    forecasts = []
    
    # Use Chennai central as reference
    lat, lng = settings.chennai_lat, settings.chennai_lng
    forecast_data = await get_weather_forecast(lat, lng)
    
    if "error" in forecast_data:
        return {"error": forecast_data["error"], "risk_score": 0.5}
    
    # Process 7 days of forecasts
    daily_risks = []
    
    for entry in forecast_data.get("list", []):
        rain_3h = entry.get("rain", {}).get("3h", 0.0)
        wind_speed = entry.get("wind", {}).get("speed", 0.0) * 3.6
        
        # Simple daily risk calculation
        day_risk = min(rain_3h / 30.0, 1.0) * 0.6 + min(wind_speed / 50.0, 1.0) * 0.4
        daily_risks.append(day_risk)
    
    # Average risk for the week
    avg_risk = sum(daily_risks) / len(daily_risks) if daily_risks else 0.5
    max_risk = max(daily_risks) if daily_risks else 0.5
    
    # Weight max_risk more (worst day matters)
    combined_risk = (avg_risk * 0.4 + max_risk * 0.6)
    
    # Get IMD alerts for severe weather
    imd_alerts = await get_imd_alerts()
    if any(a["severity"] == "extreme" for a in imd_alerts):
        combined_risk = min(combined_risk + 0.3, 1.0)
    elif any(a["severity"] == "severe" for a in imd_alerts):
        combined_risk = min(combined_risk + 0.15, 1.0)
    
    return {
        "risk_score": round(combined_risk, 4),
        "avg_daily_risk": round(avg_risk, 4),
        "max_daily_risk": round(max_risk, 4),
        "imd_alerts": len(imd_alerts),
        "forecast_days": len(daily_risks) // 8,  # 8 entries per day
        "calculated_at": datetime.utcnow().isoformat(),
    }


# ── Standalone test ─────────────────────────────────────────
if __name__ == "__main__":
    async def test():
        print("Testing weather forecaster...")
        
        # Test single zone
        forecast = await get_zone_weather("velachery")
        print(f"\nVelachery Weather:")
        print(f"  Temp: {forecast.temp_celsius}°C")
        print(f"  Rain: {forecast.rain_mm_1h}mm")
        print(f"  Waterlog Risk: {forecast.waterlog_risk:.0%}")
        print(f"  Disruption Risk: {forecast.disruption_risk:.0%}")
        
        # Test 7-day forecast
        risk = await get_7_day_risk_forecast()
        print(f"\n7-Day Risk Forecast:")
        print(f"  Risk Score: {risk['risk_score']:.2f}")
    
    asyncio.run(test())
