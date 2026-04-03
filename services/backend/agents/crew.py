"""
GigaChad CrewAI Orchestration
─────────────────────────────
Multi-agent system for autonomous insurance operations.

Agents:
1. Risk Analyst - Monitors weather, news, traffic for disruptions
2. Claim Adjuster - Validates claims and calculates payouts
3. Notification Manager - Sends warnings and payout notifications
4. Premium Actuary - Calculates dynamic weekly premiums

Crews:
- Monitoring Crew: Continuous disruption detection
- Claim Processing Crew: Auto-process claims when disruption fires
- Sunday Premium Crew: Weekly premium calculation
"""

import asyncio
from datetime import datetime
from typing import Optional
from crewai import Agent, Task, Crew, Process
from langchain_groq import ChatGroq

from config import get_settings
from agents.tools import (
    get_monitoring_tools,
    get_claim_tools,
    get_notification_tools,
    get_all_tools,
)

settings = get_settings()


def get_llm():
    """Get the Groq LLM instance for agents."""
    return ChatGroq(
        api_key=settings.groq_api_key,
        model_name="llama3-70b-8192",  # Using larger model for reasoning
        temperature=0.1,
    )


# ═══════════════════════════════════════════════════════════════
# AGENT DEFINITIONS
# ═══════════════════════════════════════════════════════════════

def create_risk_analyst() -> Agent:
    """
    Risk Analyst Agent
    ──────────────────
    Continuously monitors Chennai for disruption events.
    Expertise: Weather patterns, traffic analysis, news interpretation
    """
    return Agent(
        role="Senior Risk Analyst",
        goal="Detect and assess disruption events in Chennai that affect Q-Commerce delivery partners",
        backstory="""You are an expert risk analyst specializing in Chennai's urban dynamics. 
        You understand the Northeast Monsoon patterns, know which areas flood first (Velachery, Perungudi),
        and can interpret traffic data to identify gridlock situations. You've been monitoring Chennai 
        for years and know that rain alone doesn't stop deliveries - waterlogging does. You work for 
        GigaChad, protecting gig workers from income loss.""",
        tools=get_monitoring_tools(),
        llm=get_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=5,
    )


def create_claim_adjuster() -> Agent:
    """
    Claim Adjuster Agent
    ────────────────────
    Validates claims, checks for fraud, calculates payouts.
    Expertise: Fraud detection, telemetry analysis, payout rules
    """
    return Agent(
        role="AI Claim Adjuster",
        goal="Validate disruption claims, detect fraud, and calculate fair payouts for affected riders",
        backstory="""You are an AI-powered claim adjuster for GigaChad's parametric insurance.
        Your job is to ensure only genuine claims are paid while protecting riders from income loss.
        You understand GPS spoofing patterns, know that a phone on WiFi at home during a 'storm claim'
        is suspicious, and can calculate lost wages based on historical earnings data. You're fair
        but vigilant against fraud rings trying to game the system.""",
        tools=get_claim_tools(),
        llm=get_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=5,
    )


def create_notification_manager() -> Agent:
    """
    Notification Manager Agent
    ──────────────────────────
    Sends proactive warnings and payout notifications via WhatsApp.
    Expertise: Communication, timing, personalization
    """
    return Agent(
        role="Rider Communication Manager",
        goal="Keep riders informed with timely warnings and instant payout notifications",
        backstory="""You manage all communication with GigaChad's rider community via WhatsApp.
        You send proactive storm warnings so riders can relocate before disruptions hit.
        When payouts are processed, you send instant confirmation messages. You speak in 
        Tanglish (Tamil+English) and use emojis to be friendly. Your messages are always
        helpful, never spammy, and respect the rider's time.""",
        tools=get_notification_tools(),
        llm=get_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )


def create_premium_actuary() -> Agent:
    """
    Premium Actuary Agent
    ─────────────────────
    Calculates dynamic weekly premiums based on risk forecasts.
    Expertise: Time-series analysis, risk modeling, pricing
    """
    return Agent(
        role="AI Actuarial Analyst",
        goal="Calculate fair, dynamic weekly premiums that balance rider affordability with insurer sustainability",
        backstory="""You are GigaChad's AI actuary, responsible for the Sunday premium quotes.
        You analyze 7-day weather forecasts, upcoming events, and historical disruption data
        to set fair prices. During clear weeks, you offer discounts (₹15 Basic). During
        monsoon peaks, you adjust upward (₹45 Basic) to maintain the liquidity pool.
        Your pricing is transparent and riders trust your assessments.""",
        tools=get_monitoring_tools(),  # Uses weather and news tools
        llm=get_llm(),
        verbose=True,
        allow_delegation=False,
        max_iter=3,
    )


# ═══════════════════════════════════════════════════════════════
# TASK DEFINITIONS
# ═══════════════════════════════════════════════════════════════

def create_monitoring_task(agent: Agent) -> Task:
    """Task for continuous disruption monitoring."""
    return Task(
        description="""
        Perform a comprehensive disruption scan for all Chennai zones:
        
        1. Check weather conditions for each major zone (OMR, Velachery, T. Nagar, etc.)
        2. Scan news sources for any disruption events (floods, strikes, VVIP movements)
        3. Assess overall risk for each zone
        4. Identify zones that need:
           a) Immediate disruption trigger (risk > 70%)
           b) Proactive warning to riders (risk 50-70%)
        
        Output a structured report with:
        - Zones requiring disruption triggers
        - Zones requiring warnings
        - Key risk factors identified
        - Recommended actions
        """,
        expected_output="JSON report with triggered_zones, warning_zones, and risk_factors",
        agent=agent,
    )


def create_claim_validation_task(agent: Agent, zone: str, disruption_id: str) -> Task:
    """Task for validating claims in a disrupted zone."""
    return Task(
        description=f"""
        Process claims for disruption event in {zone} (ID: {disruption_id}):
        
        1. Query database for all riders with active policies in {zone}
        2. For each rider, check their telemetry data for fraud indicators
        3. Calculate payout amounts based on:
           - Policy tier (Basic/Plus/Pro)
           - Estimated idle hours (default: 2 hours)
           - Hourly rate from rider profile
        4. Classify each claim as:
           - APPROVED: No fraud flags, auto-payout
           - SOFT_FLAGGED: Minor concerns, request video verification
           - DENIED: Clear fraud indicators
        
        Output claim decisions for each affected rider.
        """,
        expected_output="List of claim decisions with rider_id, status, payout_amount, and reasoning",
        agent=agent,
    )


def create_warning_task(agent: Agent, zones: list[str]) -> Task:
    """Task for sending proactive warnings."""
    return Task(
        description=f"""
        Send proactive storm/disruption warnings to riders in these zones: {zones}
        
        1. Query database for active riders in each zone
        2. Compose a friendly Tanglish warning message
        3. Include:
           - Expected disruption type (rain/traffic/strike)
           - Time until disruption (~30 minutes)
           - Suggested safe zone to relocate to
           - Reminder that protection is active if they stay
        4. Send warnings via WhatsApp
        
        Be helpful and friendly, not alarming.
        """,
        expected_output="Summary of warnings sent with count and any delivery failures",
        agent=agent,
    )


def create_premium_calculation_task(agent: Agent) -> Task:
    """Task for Sunday premium calculation."""
    return Task(
        description="""
        Calculate next week's dynamic premiums for GigaChad insurance:
        
        1. Analyze 7-day weather forecast for Chennai
        2. Check for any scheduled events (festivals, elections, protests)
        3. Review IMD alerts for cyclone or heavy rain warnings
        4. Calculate risk score (0.0 - 1.0) for the upcoming week
        5. Determine premiums for each tier:
           - Giga Basic: ₹12-29 range (base ₹19)
           - Giga Plus: ₹25-55 range (base ₹39)
           - Giga Pro: ₹40-75 range (base ₹59)
        6. Generate a risk note explaining the pricing
        
        Output the premium quotes and risk explanation.
        """,
        expected_output="Premium quotes with basic, plus, pro prices and risk_note explanation",
        agent=agent,
    )


# ═══════════════════════════════════════════════════════════════
# CREW DEFINITIONS
# ═══════════════════════════════════════════════════════════════

class GigaChadCrew:
    """Main crew orchestration class."""
    
    def __init__(self):
        self.risk_analyst = create_risk_analyst()
        self.claim_adjuster = create_claim_adjuster()
        self.notification_manager = create_notification_manager()
        self.premium_actuary = create_premium_actuary()
    
    def monitoring_crew(self) -> Crew:
        """Crew for continuous disruption monitoring."""
        return Crew(
            agents=[self.risk_analyst],
            tasks=[create_monitoring_task(self.risk_analyst)],
            process=Process.sequential,
            verbose=True,
        )
    
    def claim_processing_crew(self, zone: str, disruption_id: str) -> Crew:
        """Crew for processing claims after a disruption."""
        return Crew(
            agents=[self.claim_adjuster, self.notification_manager],
            tasks=[
                create_claim_validation_task(self.claim_adjuster, zone, disruption_id),
            ],
            process=Process.sequential,
            verbose=True,
        )
    
    def warning_crew(self, zones: list[str]) -> Crew:
        """Crew for sending proactive warnings."""
        return Crew(
            agents=[self.notification_manager],
            tasks=[create_warning_task(self.notification_manager, zones)],
            process=Process.sequential,
            verbose=True,
        )
    
    def premium_crew(self) -> Crew:
        """Crew for Sunday premium calculation."""
        return Crew(
            agents=[self.premium_actuary],
            tasks=[create_premium_calculation_task(self.premium_actuary)],
            process=Process.sequential,
            verbose=True,
        )


# ═══════════════════════════════════════════════════════════════
# CREW EXECUTION FUNCTIONS
# ═══════════════════════════════════════════════════════════════

async def run_monitoring_crew() -> dict:
    """
    Execute the monitoring crew to scan for disruptions.
    Called periodically (every 5-10 minutes) by the scheduler.
    """
    print(f"\n{'='*60}")
    print(f"🔍 MONITORING CREW ACTIVATED - {datetime.utcnow().isoformat()}")
    print(f"{'='*60}\n")
    
    try:
        crew = GigaChadCrew()
        monitoring_crew = crew.monitoring_crew()
        result = monitoring_crew.kickoff()
        
        # Parse result and take actions
        return {
            "status": "completed",
            "timestamp": datetime.utcnow().isoformat(),
            "result": str(result),
        }
    except Exception as e:
        print(f"❌ Monitoring crew error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def run_claim_processing_crew(zone: str, disruption_id: str) -> dict:
    """
    Execute the claim processing crew for a specific disruption.
    Called automatically when a disruption event is triggered.
    """
    print(f"\n{'='*60}")
    print(f"💰 CLAIM PROCESSING CREW - Zone: {zone}")
    print(f"{'='*60}\n")
    
    try:
        crew = GigaChadCrew()
        claim_crew = crew.claim_processing_crew(zone, disruption_id)
        result = claim_crew.kickoff()
        
        return {
            "status": "completed",
            "zone": zone,
            "disruption_id": disruption_id,
            "result": str(result),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        print(f"❌ Claim processing error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def run_warning_crew(zones: list[str]) -> dict:
    """
    Execute the warning crew to notify riders of incoming disruptions.
    """
    print(f"\n{'='*60}")
    print(f"⚠️ WARNING CREW - Zones: {', '.join(zones)}")
    print(f"{'='*60}\n")
    
    try:
        crew = GigaChadCrew()
        warning_crew = crew.warning_crew(zones)
        result = warning_crew.kickoff()
        
        return {
            "status": "completed",
            "zones": zones,
            "result": str(result),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        print(f"❌ Warning crew error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


async def run_premium_crew() -> dict:
    """
    Execute the premium calculation crew.
    Called every Sunday for weekly premium quotes.
    """
    print(f"\n{'='*60}")
    print(f"💸 PREMIUM CALCULATION CREW - Sunday Run")
    print(f"{'='*60}\n")
    
    try:
        crew = GigaChadCrew()
        premium_crew = crew.premium_crew()
        result = premium_crew.kickoff()
        
        return {
            "status": "completed",
            "result": str(result),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        print(f"❌ Premium crew error: {e}")
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


# ═══════════════════════════════════════════════════════════════
# STANDALONE TEST
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    async def test():
        print("Testing GigaChad Crew AI...")
        
        # Test monitoring crew
        result = await run_monitoring_crew()
        print(f"\nMonitoring Result: {result['status']}")
    
    asyncio.run(test())
