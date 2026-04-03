"""
Custom Tools for GigaChad AI Agents
───────────────────────────────────
CrewAI tools that agents use to interact with external systems.
"""

from typing import Any
from crewai_tools import BaseTool
from pydantic import BaseModel, Field


class WeatherCheckInput(BaseModel):
    zone: str = Field(description="Chennai zone name (e.g., velachery, omr, t_nagar)")


class WeatherCheckTool(BaseTool):
    name: str = "weather_check"
    description: str = "Check current weather and risk level for a Chennai zone. Returns temperature, rain, and disruption risk."
    args_schema: type[BaseModel] = WeatherCheckInput

    def _run(self, zone: str) -> str:
        import asyncio
        from engines.weather_forecaster import get_zone_weather
        
        try:
            forecast = asyncio.get_event_loop().run_until_complete(get_zone_weather(zone))
            return f"""
Weather for {zone}:
- Temperature: {forecast.temp_celsius}°C
- Rain (1h): {forecast.rain_mm_1h}mm
- Humidity: {forecast.humidity_percent}%
- Wind: {forecast.wind_speed_kmh}km/h
- Waterlog Risk: {forecast.waterlog_risk:.0%}
- Disruption Risk: {forecast.disruption_risk:.0%}
- Description: {forecast.description}
"""
        except Exception as e:
            return f"Error checking weather: {e}"


class NewsCheckInput(BaseModel):
    pass  # No input needed


class NewsCheckTool(BaseTool):
    name: str = "news_scanner"
    description: str = "Scan Tamil news sites and Twitter for Chennai disruption events. Returns list of detected disruptions."
    args_schema: type[BaseModel] = NewsCheckInput

    def _run(self) -> str:
        import asyncio
        from engines.news_scraper import get_disruption_news
        
        try:
            disruptions = asyncio.get_event_loop().run_until_complete(get_disruption_news())
            if not disruptions:
                return "No active disruptions detected in news sources."
            
            result = f"Found {len(disruptions)} disruption(s):\n"
            for d in disruptions[:5]:
                result += f"- {d['event_type']} in {d['zone_name']} (confidence: {d['confidence']:.0%})\n"
                result += f"  Source: {d['source']} - {d['title'][:60]}...\n"
            return result
        except Exception as e:
            return f"Error scanning news: {e}"


class RiskAssessInput(BaseModel):
    zone: str = Field(description="Chennai zone name to assess")


class RiskAssessmentTool(BaseTool):
    name: str = "risk_assessment"
    description: str = "Perform comprehensive risk assessment for a Chennai zone. Combines weather, traffic, news, and social signals."
    args_schema: type[BaseModel] = RiskAssessInput

    def _run(self, zone: str) -> str:
        import asyncio
        from engines.risk_aggregator import assess_zone_risk
        
        try:
            assessment = asyncio.get_event_loop().run_until_complete(assess_zone_risk(zone))
            return f"""
Risk Assessment for {zone}:
- Weather Risk: {assessment.weather_risk:.0%}
- Traffic Risk: {assessment.traffic_risk:.0%}
- News Risk: {assessment.news_risk:.0%}
- Social Risk: {assessment.social_risk:.0%}
- Overall Risk: {assessment.overall_risk:.0%}
- Risk Level: {assessment.risk_level.upper()}
- Should Trigger Disruption: {assessment.should_trigger_disruption}
- Should Send Warning: {assessment.should_send_warning}
- Risk Factors: {', '.join(assessment.risk_factors) if assessment.risk_factors else 'None'}
"""
        except Exception as e:
            return f"Error assessing risk: {e}"


class TrafficCheckInput(BaseModel):
    h3_hex: str = Field(description="H3 hex grid ID for the location")


class TrafficCheckTool(BaseTool):
    name: str = "traffic_check"
    description: str = "Check live traffic conditions using TomTom API for a specific H3 hex grid."
    args_schema: type[BaseModel] = TrafficCheckInput

    def _run(self, h3_hex: str) -> str:
        import asyncio
        from engines.trigger import evaluate_double_trigger
        
        try:
            result = asyncio.get_event_loop().run_until_complete(evaluate_double_trigger(h3_hex))
            triggered = "YES" if result["triggered"] else "NO"
            return f"""
Traffic Check for Hex {h3_hex}:
- Location: ({result['lat']:.4f}, {result['lng']:.4f})
- Rain (1h): {result['rain_mm']}mm
- Traffic Speed: {result['traffic_kmh']}km/h
- Double-Trigger Fired: {triggered}
- Confidence: {result['confidence']:.0%}
"""
        except Exception as e:
            return f"Error checking traffic: {e}"


class FraudCheckInput(BaseModel):
    rider_id: str = Field(description="UUID of the rider")
    h3_hex: str = Field(description="H3 hex grid where claim is made")


class FraudCheckTool(BaseTool):
    name: str = "fraud_detector"
    description: str = "Check fraud indicators for a rider claim. Returns fraud score and detected flags."
    args_schema: type[BaseModel] = FraudCheckInput

    def _run(self, rider_id: str, h3_hex: str) -> str:
        # Simplified fraud check without full telemetry
        return f"""
Fraud Check for Rider {rider_id[:8]}:
- Requires telemetry data for full analysis
- Use database query to fetch rider telemetry first
- Then run engines.fraud.score_claim_fraud()
"""


class PayoutCalculatorInput(BaseModel):
    hourly_rate: float = Field(description="Rider's hourly rate in INR")
    idle_hours: float = Field(description="Estimated hours lost due to disruption")
    tier: str = Field(description="Policy tier: giga_basic, giga_plus, or giga_pro")


class PayoutCalculatorTool(BaseTool):
    name: str = "payout_calculator"
    description: str = "Calculate payout amount for a disruption claim based on idle hours and policy tier."
    args_schema: type[BaseModel] = PayoutCalculatorInput

    def _run(self, hourly_rate: float, idle_hours: float, tier: str) -> str:
        payout_caps = {
            "giga_basic": 300.0,
            "giga_plus": 600.0,
            "giga_pro": 1000.0,
        }
        
        cap = payout_caps.get(tier, 300.0)
        base_loss = hourly_rate * idle_hours
        bonus_loss = 100.0 if idle_hours >= 1.5 else 0.0  # Milestone bonus
        total = min(base_loss + bonus_loss, cap)
        
        return f"""
Payout Calculation:
- Hourly Rate: ₹{hourly_rate:.0f}
- Idle Hours: {idle_hours:.1f}
- Base Loss: ₹{base_loss:.0f}
- Bonus Loss: ₹{bonus_loss:.0f}
- Policy Tier: {tier}
- Payout Cap: ₹{cap:.0f}
- Final Payout: ₹{total:.0f}
"""


class SendWarningInput(BaseModel):
    phone: str = Field(description="Rider's phone number")
    name: str = Field(description="Rider's name")
    zone: str = Field(description="Zone with predicted disruption")
    minutes: int = Field(description="Minutes until disruption expected")


class SendWarningTool(BaseTool):
    name: str = "send_warning"
    description: str = "Send proactive storm/disruption warning to rider via WhatsApp."
    args_schema: type[BaseModel] = SendWarningInput

    def _run(self, phone: str, name: str, zone: str, minutes: int) -> str:
        import asyncio
        from engines.notify import send_whatsapp_storm_warning
        
        try:
            result = asyncio.get_event_loop().run_until_complete(
                send_whatsapp_storm_warning(phone, name, zone, minutes)
            )
            return f"Warning sent to {name} ({phone}): {result.get('status', 'unknown')}"
        except Exception as e:
            return f"Error sending warning: {e}"


class DatabaseQueryInput(BaseModel):
    query_type: str = Field(description="Type: riders_in_zone, active_policies, recent_claims")
    zone: str = Field(default=None, description="Zone name for filtering (optional)")


class DatabaseQueryTool(BaseTool):
    name: str = "database_query"
    description: str = "Query database for riders, policies, or claims. Use for getting data to process."
    args_schema: type[BaseModel] = DatabaseQueryInput

    def _run(self, query_type: str, zone: str = None) -> str:
        return f"""
Database Query Tool:
- Query Type: {query_type}
- Zone Filter: {zone or 'All'}

Note: In production, this connects to PostgreSQL.
For now, returns mock data for demonstration.

Sample riders in {zone or 'Chennai'}:
1. Hari (rider_001) - Active policy: Giga Plus
2. Kumar (rider_002) - Active policy: Giga Basic
3. Ravi (rider_003) - No active policy
"""


# Export all tools
def get_all_tools():
    """Return instances of all available tools."""
    return [
        WeatherCheckTool(),
        NewsCheckTool(),
        RiskAssessmentTool(),
        TrafficCheckTool(),
        FraudCheckTool(),
        PayoutCalculatorTool(),
        SendWarningTool(),
        DatabaseQueryTool(),
    ]


def get_monitoring_tools():
    """Tools for the monitoring agent."""
    return [
        WeatherCheckTool(),
        NewsCheckTool(),
        RiskAssessmentTool(),
        TrafficCheckTool(),
    ]


def get_claim_tools():
    """Tools for the claim processing agent."""
    return [
        FraudCheckTool(),
        PayoutCalculatorTool(),
        DatabaseQueryTool(),
    ]


def get_notification_tools():
    """Tools for the notification agent."""
    return [
        SendWarningTool(),
        DatabaseQueryTool(),
    ]
