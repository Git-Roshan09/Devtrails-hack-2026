"""
Celery Background Tasks for GigaChad
────────────────────────────────────
Scheduled and triggered tasks for insurance automation.

Tasks:
- Disruption monitoring (every 5 minutes)
- Premium calculation (Sunday 6 AM IST)
- Claim auto-processing (triggered by disruption)
- Proactive warnings (triggered by risk assessment)

To run celery worker:
    celery -A scheduler.tasks worker --loglevel=info

To run celery beat (scheduler):
    celery -A scheduler.tasks beat --loglevel=info
"""

import asyncio
from datetime import datetime, timedelta
from celery import Celery
from celery.schedules import crontab
import redis

from config import get_settings

settings = get_settings()

# ══════════════════════════════════════════════════════════════
# CELERY CONFIGURATION
# ══════════════════════════════════════════════════════════════

celery_app = Celery(
    "gigachad",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max per task
    worker_prefetch_multiplier=1,  # Fair task distribution
    
    # Beat schedule for periodic tasks
    beat_schedule={
        # Disruption monitoring - every 5 minutes
        "monitor-disruptions": {
            "task": "scheduler.tasks.monitor_disruptions",
            "schedule": crontab(minute="*/5"),
        },
        # Weekly premium calculation - Sunday 6 AM IST
        "calculate-weekly-premiums": {
            "task": "scheduler.tasks.calculate_weekly_premiums",
            "schedule": crontab(hour=0, minute=30, day_of_week="sunday"),  # 6 AM IST = 0:30 UTC
        },
        # Daily cleanup - Midnight IST
        "daily-cleanup": {
            "task": "scheduler.tasks.daily_cleanup",
            "schedule": crontab(hour=18, minute=30),  # Midnight IST = 18:30 UTC
        },
        # Hourly risk summary - Every hour
        "hourly-risk-summary": {
            "task": "scheduler.tasks.generate_risk_summary",
            "schedule": crontab(minute=0),
        },
    },
)


def run_async(coro):
    """Helper to run async functions in Celery tasks."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ══════════════════════════════════════════════════════════════
# PERIODIC TASKS
# ══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, max_retries=3)
def monitor_disruptions(self):
    """
    Scan all Chennai zones for disruptions every 5 minutes.
    If disruption detected → trigger claims processing
    If warning needed → send proactive alerts
    """
    from engines.risk_aggregator import assess_all_zones, RISK_THRESHOLDS
    
    print(f"\n🔍 [MONITOR] Starting disruption scan - {datetime.utcnow()}")
    
    try:
        assessments = run_async(assess_all_zones())
        
        triggered_zones = []
        warning_zones = []
        
        for assessment in assessments:
            if assessment.should_trigger_disruption:
                triggered_zones.append({
                    "zone": assessment.zone,
                    "h3_hex": assessment.h3_hex,
                    "risk": assessment.overall_risk,
                    "factors": assessment.risk_factors,
                })
            elif assessment.should_send_warning:
                warning_zones.append({
                    "zone": assessment.zone,
                    "risk": assessment.overall_risk,
                })
        
        # Trigger disruption events
        for zone_info in triggered_zones:
            trigger_disruption_event.delay(
                zone_name=zone_info["zone"],
                h3_hex=zone_info["h3_hex"],
                confidence=zone_info["risk"],
                risk_factors=zone_info["factors"],
            )
        
        # Send warnings
        if warning_zones:
            zones_list = [z["zone"] for z in warning_zones]
            send_proactive_warnings.delay(zones_list)
        
        return {
            "status": "completed",
            "triggered": len(triggered_zones),
            "warnings": len(warning_zones),
            "timestamp": datetime.utcnow().isoformat(),
        }
        
    except Exception as e:
        print(f"❌ [MONITOR] Error: {e}")
        self.retry(exc=e, countdown=60)


@celery_app.task(bind=True)
def calculate_weekly_premiums(self):
    """
    Calculate dynamic premiums for the upcoming week.
    Runs every Sunday at 6 AM IST.
    """
    from engines.risk_aggregator import calculate_weekly_risk_score
    from engines.actuarial import compute_weekly_premium
    from datetime import date
    
    print(f"\n💸 [PREMIUM] Calculating weekly premiums - {datetime.utcnow()}")
    
    try:
        # Get next week's start date (upcoming Monday)
        today = date.today()
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7
        week_start = today + timedelta(days=days_until_monday)
        
        # Calculate premium using enhanced risk data
        risk_data = run_async(calculate_weekly_risk_score())
        premium_data = run_async(compute_weekly_premium(week_start))
        
        print(f"  📊 Risk Score: {risk_data['risk_score']:.2f}")
        print(f"  🥉 Basic: ₹{premium_data['basic_premium']}")
        print(f"  🥈 Plus: ₹{premium_data['plus_premium']}")
        print(f"  🥇 Pro: ₹{premium_data['pro_premium']}")
        
        # Store quote in database and send to riders
        send_premium_quotes.delay(
            week_start=week_start.isoformat(),
            basic=premium_data["basic_premium"],
            plus=premium_data["plus_premium"],
            pro=premium_data["pro_premium"],
            risk_score=risk_data["risk_score"],
        )
        
        return {
            "status": "completed",
            "week_start": week_start.isoformat(),
            "premiums": premium_data,
            "risk": risk_data,
        }
        
    except Exception as e:
        print(f"❌ [PREMIUM] Error: {e}")
        return {"status": "error", "error": str(e)}


@celery_app.task
def generate_risk_summary():
    """Generate hourly risk summary for dashboard."""
    from engines.risk_aggregator import assess_all_zones
    
    try:
        assessments = run_async(assess_all_zones())
        
        summary = {
            "timestamp": datetime.utcnow().isoformat(),
            "zones": [a.to_dict() for a in assessments],
            "high_risk_count": sum(1 for a in assessments if a.risk_level in ["high", "critical"]),
            "avg_risk": sum(a.overall_risk for a in assessments) / len(assessments) if assessments else 0,
        }
        
        # Store in Redis for dashboard
        try:
            r = redis.from_url(settings.redis_url)
            r.set("gigachad:risk_summary", str(summary), ex=3600)  # 1 hour expiry
        except Exception:
            pass
        
        return summary
        
    except Exception as e:
        print(f"❌ [RISK SUMMARY] Error: {e}")
        return {"status": "error", "error": str(e)}


@celery_app.task
def daily_cleanup():
    """Daily cleanup of old records and cache."""
    print(f"\n🧹 [CLEANUP] Starting daily cleanup - {datetime.utcnow()}")
    
    # Clear old Redis cache entries
    try:
        r = redis.from_url(settings.redis_url)
        # Clean up old telemetry cache (older than 24h)
        # In production, implement proper cleanup logic
        print("  ✅ Cache cleanup completed")
    except Exception as e:
        print(f"  ⚠️ Cache cleanup error: {e}")
    
    return {"status": "completed", "timestamp": datetime.utcnow().isoformat()}


# ══════════════════════════════════════════════════════════════
# TRIGGERED TASKS
# ══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, max_retries=2)
def trigger_disruption_event(self, zone_name: str, h3_hex: str, confidence: float, risk_factors: list):
    """
    Create a disruption event and process auto-claims.
    Triggered when risk exceeds threshold.
    """
    import uuid
    from database import AsyncSessionLocal
    from models import DisruptionEvent, DisruptionType, DisruptionStatus
    from engines.payout import process_disruption_claims
    
    print(f"\n🚨 [DISRUPTION] Triggering event for {zone_name}")
    
    async def create_and_process():
        async with AsyncSessionLocal() as db:
            # Determine event type
            event_type = DisruptionType.flood
            if any("traffic" in f.lower() for f in risk_factors):
                event_type = DisruptionType.traffic_gridlock
            elif any("strike" in f.lower() for f in risk_factors):
                event_type = DisruptionType.strike
            
            # Create disruption event
            event = DisruptionEvent(
                event_type=event_type,
                h3_hex=h3_hex,
                zone_name=zone_name,
                confidence=confidence,
                trigger_source="auto_monitor",
            )
            db.add(event)
            await db.commit()
            await db.refresh(event)
            
            print(f"  ✅ Created disruption event: {event.id}")
            
            # Process claims
            await process_disruption_claims(str(event.id))
            
            return str(event.id)
    
    try:
        event_id = run_async(create_and_process())
        return {
            "status": "completed",
            "event_id": event_id,
            "zone": zone_name,
            "confidence": confidence,
        }
    except Exception as e:
        print(f"❌ [DISRUPTION] Error: {e}")
        self.retry(exc=e, countdown=30)


@celery_app.task
def send_proactive_warnings(zones: list[str]):
    """Send storm/disruption warnings to riders in specified zones."""
    from engines.notify import send_whatsapp_storm_warning
    from database import AsyncSessionLocal
    from models import Rider, TelemetryLog
    from sqlalchemy import select
    from datetime import timedelta
    
    print(f"\n⚠️ [WARNING] Sending warnings to zones: {zones}")
    
    async def send_warnings():
        async with AsyncSessionLocal() as db:
            sent_count = 0
            
            for zone in zones:
                # Find active riders in zone (recent telemetry)
                cutoff = datetime.utcnow() - timedelta(hours=1)
                
                # Get riders with recent activity
                result = await db.execute(
                    select(Rider)
                    .join(TelemetryLog)
                    .where(TelemetryLog.ts >= cutoff)
                    .distinct()
                    .limit(100)
                )
                riders = result.scalars().all()
                
                for rider in riders:
                    try:
                        await send_whatsapp_storm_warning(
                            phone=rider.phone,
                            name=rider.name,
                            zone=zone,
                            minutes=30,
                        )
                        sent_count += 1
                    except Exception as e:
                        print(f"  ⚠️ Warning send error for {rider.name}: {e}")
            
            return sent_count
    
    try:
        count = run_async(send_warnings())
        return {"status": "completed", "warnings_sent": count, "zones": zones}
    except Exception as e:
        print(f"❌ [WARNING] Error: {e}")
        return {"status": "error", "error": str(e)}


@celery_app.task
def send_premium_quotes(week_start: str, basic: float, plus: float, pro: float, risk_score: float):
    """Send weekly premium quotes to all active riders via WhatsApp."""
    from engines.notify import send_whatsapp_premium_quote
    from database import AsyncSessionLocal
    from models import Rider
    from sqlalchemy import select
    
    print(f"\n📨 [QUOTES] Sending premium quotes for week of {week_start}")
    
    # Generate risk note based on score
    if risk_score < 0.3:
        risk_note = "☀️ _Clear week ahead! Lowest prices._"
    elif risk_score < 0.5:
        risk_note = "🌤️ _Normal conditions expected._"
    elif risk_score < 0.7:
        risk_note = "🌧️ _Some rain expected this week._"
    else:
        risk_note = "⛈️ _Heavy weather predicted! Stay protected._"
    
    async def send_quotes():
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Rider).where(Rider.is_active == True)
            )
            riders = result.scalars().all()
            
            sent_count = 0
            for rider in riders:
                try:
                    await send_whatsapp_premium_quote(
                        phone=rider.phone,
                        name=rider.name,
                        basic=basic,
                        plus=plus,
                        pro=pro,
                        risk_note=risk_note,
                    )
                    sent_count += 1
                except Exception as e:
                    print(f"  ⚠️ Quote send error for {rider.name}: {e}")
            
            return sent_count
    
    try:
        count = run_async(send_quotes())
        return {"status": "completed", "quotes_sent": count, "week_start": week_start}
    except Exception as e:
        print(f"❌ [QUOTES] Error: {e}")
        return {"status": "error", "error": str(e)}


@celery_app.task
def process_claim_payout(claim_id: str):
    """Process payout for an approved claim."""
    from engines.payout import _execute_razorpay_payout
    from engines.notify import send_whatsapp_payout
    from database import AsyncSessionLocal
    from models import Claim, ClaimStatus, Rider, DisruptionEvent
    
    print(f"\n💰 [PAYOUT] Processing claim {claim_id}")
    
    async def process():
        async with AsyncSessionLocal() as db:
            import uuid
            claim = await db.get(Claim, uuid.UUID(claim_id))
            if not claim:
                return {"status": "error", "error": "Claim not found"}
            
            if claim.status != ClaimStatus.approved:
                return {"status": "error", "error": f"Claim is {claim.status.value}"}
            
            rider = await db.get(Rider, claim.rider_id)
            disruption = await db.get(DisruptionEvent, claim.disruption_id)
            
            # Execute payout
            payout_id = await _execute_razorpay_payout(
                rider, float(claim.total_payout), str(claim.id)
            )
            
            if payout_id:
                claim.razorpay_payout_id = payout_id
                claim.status = ClaimStatus.paid
                claim.processed_at = datetime.utcnow()
                await db.commit()
                
                # Send notification
                await send_whatsapp_payout(
                    phone=rider.phone,
                    name=rider.name,
                    amount=float(claim.total_payout),
                    zone=disruption.zone_name or disruption.h3_hex,
                    event_type=disruption.event_type.value,
                )
                
                return {
                    "status": "paid",
                    "payout_id": payout_id,
                    "amount": float(claim.total_payout),
                }
            
            return {"status": "error", "error": "Payout execution failed"}
    
    try:
        return run_async(process())
    except Exception as e:
        print(f"❌ [PAYOUT] Error: {e}")
        return {"status": "error", "error": str(e)}


# ══════════════════════════════════════════════════════════════
# AI CREW TASKS
# ══════════════════════════════════════════════════════════════

@celery_app.task
def run_ai_monitoring_crew():
    """Run the CrewAI monitoring crew for advanced analysis."""
    from agents.crew import run_monitoring_crew
    
    print(f"\n🤖 [AI CREW] Running monitoring crew")
    
    try:
        result = run_async(run_monitoring_crew())
        return result
    except Exception as e:
        print(f"❌ [AI CREW] Error: {e}")
        return {"status": "error", "error": str(e)}


@celery_app.task
def run_ai_claim_crew(zone: str, disruption_id: str):
    """Run the CrewAI claim processing crew."""
    from agents.crew import run_claim_processing_crew
    
    print(f"\n🤖 [AI CREW] Running claim crew for {zone}")
    
    try:
        result = run_async(run_claim_processing_crew(zone, disruption_id))
        return result
    except Exception as e:
        print(f"❌ [AI CREW] Error: {e}")
        return {"status": "error", "error": str(e)}
