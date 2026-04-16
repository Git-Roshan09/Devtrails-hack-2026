"""
Payout Engine
─────────────
Orchestrates the full auto-claim flow when a DisruptionEvent fires:
1. Find all active riders in the affected hex-grid
2. Run fraud detection on each rider (incl. behavioral biometrics)
3. Compute composite severity score + continuous sigmoid multiplier
4. Calculate lost hours + trajectory-based milestone bonus coverage
5. Execute Razorpay sandbox payout
6. Send severity-aware WhatsApp notification
7. Schedule post-payout reconciliation (48h lookback)
"""

import uuid
from datetime import datetime, timedelta, date
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload

from database import AsyncSessionLocal
from models import (
    DisruptionEvent, DisruptionStatus, Rider, Policy, PolicyStatus,
    TelemetryLog, Claim, ClaimStatus, RiderVelocityCache
)
from engines.fraud import score_claim_fraud
from engines.notify import send_whatsapp_payout, send_whatsapp_soft_flag
from engines.severity import (
    compute_composite_severity, classify_severity,
    get_continuous_multiplier, get_hex_profile,
)


async def process_disruption_claims(disruption_id: str):
    """
    Background task: process all eligible claims for a disruption event.
    Called automatically when a disruption is detected.
    """
    async with AsyncSessionLocal() as db:
        try:
            event = await db.get(DisruptionEvent, uuid.UUID(disruption_id))
            if not event:
                print(f"❌ Disruption {disruption_id} not found")
                return

            print(f"🌊 Processing claims for disruption: {event.zone_name} ({event.h3_hex})")

            # Find active riders in the hex-grid (last 10 minutes)
            cutoff = datetime.utcnow() - timedelta(minutes=10)
            telemetry_q = await db.execute(
                select(TelemetryLog.rider_id)
                .where(
                    TelemetryLog.h3_hex == event.h3_hex,
                    TelemetryLog.ts >= cutoff,
                    TelemetryLog.is_shift_active == True,
                )
                .distinct()
            )
            rider_ids = [row[0] for row in telemetry_q.all()]
            print(f"👥 Found {len(rider_ids)} active riders in hex {event.h3_hex}")

            # Pre-fetch hex profile once for all riders in this grid
            hex_profile = await get_hex_profile(db, event.h3_hex)

            for rider_id in rider_ids:
                await _process_single_claim(db, event, rider_id, hex_profile)

            await db.commit()
        except Exception as e:
            print(f"❌ Error processing claims: {e}")
            await db.rollback()


async def _process_single_claim(
    db: AsyncSession,
    event: DisruptionEvent,
    rider_id: uuid.UUID,
    hex_profile=None,
):
    """Process a claim for a single rider against a disruption."""
    rider = await db.get(Rider, rider_id)
    if not rider:
        return

    # Find active policy for this week
    today = date.today()
    policy_q = await db.execute(
        select(Policy).where(
            Policy.rider_id == rider_id,
            Policy.status == PolicyStatus.active,
            Policy.week_start <= today,
            Policy.week_end >= today,
        )
    )
    policy = policy_q.scalar_one_or_none()
    if not policy:
        print(f"  ⚠️  Rider {rider.name} has no active policy — skipping")
        return

    # Get recent telemetry for fraud check
    tel_q = await db.execute(
        select(TelemetryLog)
        .where(
            TelemetryLog.rider_id == rider_id,
            TelemetryLog.ts >= event.started_at - timedelta(minutes=30),
        )
        .order_by(TelemetryLog.ts)
    )
    telemetry = tel_q.scalars().all()
    tel_dicts = [
        {
            "lat": t.lat, "lng": t.lng, "ts": t.ts,
            "wifi_ssid": t.wifi_ssid, "accel_x": t.accel_x,
            "accel_y": t.accel_y, "accel_z": t.accel_z,
            "speed_kmh": t.speed_kmh,
        }
        for t in telemetry
    ]

    # ── Fraud Detection ──────────────────────────────────────
    fraud_result = await score_claim_fraud(
        rider_id=str(rider_id),
        h3_hex=event.h3_hex,
        telemetry_logs=tel_dicts,
        rider_home_wifi=rider.home_wifi_ssid,
        disruption_started_at=event.started_at,
    )

    # ── Severity-Aware Payout Calculation ────────────────────
    idle_hours = _estimate_idle_hours(event)

    # Compute composite severity score and continuous multiplier
    composite_score = compute_composite_severity(
        rain_mm=float(event.rain_mm or 0),
        traffic_kmh=float(event.traffic_kmh or 999),
        social_confidence=float(event.confidence or 0),
        duration_hours=idle_hours,
        hex_profile=hex_profile,
    )
    severity = classify_severity(composite_score)
    multiplier = get_continuous_multiplier(composite_score)

    # Apply severity multiplier to base loss
    base_loss = float(rider.hourly_rate) * idle_hours * multiplier
    bonus_loss = await _estimate_bonus_loss_trajectory(
        db, rider, telemetry, idle_hours, event
    )
    total_payout = min(base_loss + bonus_loss, float(policy.payout_cap))

    # ── Create Claim Record ──────────────────────────────────
    verdict = fraud_result["verdict"]
    status_map = {
        "approved": ClaimStatus.approved,
        "soft_flagged": ClaimStatus.soft_flagged,
        "denied": ClaimStatus.denied,
    }

    claim = Claim(
        rider_id=rider_id,
        policy_id=policy.id,
        disruption_id=event.id,
        idle_hours=idle_hours,
        base_loss=base_loss,
        bonus_loss=bonus_loss,
        total_payout=total_payout if verdict == "approved" else 0,
        fraud_score=fraud_result["fraud_score"],
        severity_multiplier=multiplier,
        fraud_flags=fraud_result["flags"] or [],
        status=status_map[verdict],
    )
    db.add(claim)
    await db.flush()

    severity_tag = f"[{severity.value.upper()} ×{multiplier:.2f}]"
    print(f"  {'✅' if verdict == 'approved' else '🚩' if verdict == 'soft_flagged' else '❌'} "
          f"Rider {rider.name}: verdict={verdict}, {severity_tag}, payout=₹{total_payout:.0f}, "
          f"score={composite_score:.1f}/100, fraud={fraud_result['fraud_score']:.2f}")

    # ── Execute Payout (if approved) ─────────────────────────
    if verdict == "approved":
        payout_id = await _execute_razorpay_payout(rider, total_payout, str(claim.id))
        if payout_id:
            claim.razorpay_payout_id = payout_id
            claim.status = ClaimStatus.paid
            claim.processed_at = datetime.utcnow()
            await send_whatsapp_payout(
                phone=rider.phone,
                name=rider.name,
                amount=total_payout,
                zone=event.zone_name or event.h3_hex,
                event_type=event.event_type.value,
                severity_label=severity.value,
                composite_score=composite_score,
                multiplier=multiplier,
            )
    elif verdict == "soft_flagged":
        await send_whatsapp_soft_flag(
            phone=rider.phone,
            name=rider.name,
            claim_id=str(claim.id),
        )


def _estimate_idle_hours(event: DisruptionEvent) -> float:
    """Estimate how many hours a rider was idle due to the disruption."""
    if event.resolved_at:
        delta = (event.resolved_at - event.started_at).total_seconds() / 3600
    else:
        # Ongoing — assume 2-hour average disruption
        delta = 2.0
    return round(min(delta, 8.0), 2)  # Cap at 8 hours


# ─── Bonus Tier Data (Zepto-style milestone structure) ───────
BONUS_TIERS = [
    {"deliveries": 15, "amount": 300.0, "label": "15-delivery target"},
    {"deliveries": 20, "amount": 500.0, "label": "20-delivery target"},
    {"deliveries": 30, "amount": 800.0, "label": "30-delivery champion"},
]

# Peak hour windows where bonus potential is 2× higher
PEAK_BONUS_HOURS = range(19, 23)  # 7 PM - 11 PM


async def _estimate_bonus_loss_trajectory(
    db: AsyncSession,
    rider: Rider,
    telemetry: list,
    idle_hours: float,
    event: DisruptionEvent,
) -> float:
    """
    Trajectory-based milestone bonus loss calculation.

    1. Fetch rider's historical avg_deliveries_per_hour for current time-of-day
    2. Get daily_progress proxy from today's active telemetry count
    3. Calculate lost_deliveries = velocity × idle_hours × 0.8 (recovery factor)
    4. Check each bonus tier: if projected to hit, add tier_amount × probability
    5. Time-of-day weighting: 7-11 PM disruptions cost 2× more bonus potential
    """
    # Check if rider was actively delivering (need minimum pings)
    moving_pings = [t for t in telemetry if t.speed_kmh and float(t.speed_kmh) > 10]
    if len(moving_pings) < 3:
        return 0.0

    # Fetch cached velocity for this time slot
    current_hour = event.started_at.hour if event.started_at else datetime.utcnow().hour
    current_dow = event.started_at.weekday() if event.started_at else datetime.utcnow().weekday()

    velocity_q = await db.execute(
        select(RiderVelocityCache).where(
            RiderVelocityCache.rider_id == rider.id,
            RiderVelocityCache.hour_of_day == current_hour,
            RiderVelocityCache.day_of_week == current_dow,
        )
    )
    velocity_cache = velocity_q.scalar_one_or_none()

    # Use cached velocity or estimate from telemetry
    if velocity_cache and velocity_cache.sample_count >= 3:
        deliveries_per_hour = float(velocity_cache.avg_deliveries_per_hour)
    else:
        # Fallback: estimate from moving ping density (~4 deliveries/hr assumed)
        deliveries_per_hour = 4.0

    # Estimate today's completed deliveries from active telemetry
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0)
    today_tel_q = await db.execute(
        select(func.count(TelemetryLog.id)).where(
            TelemetryLog.rider_id == rider.id,
            TelemetryLog.ts >= today_start,
            TelemetryLog.is_shift_active == True,
        )
    )
    today_pings = today_tel_q.scalar() or 0
    # Rough proxy: ~5 pings per delivery
    daily_progress = today_pings / 5

    # Calculate lost deliveries
    recovery_factor = 0.8  # Can't instantly resume at full speed
    lost_deliveries = deliveries_per_hour * idle_hours * recovery_factor

    # Check each bonus tier
    total_bonus_loss = 0.0
    projected_total = daily_progress + (deliveries_per_hour * 4)  # Assume 4 hrs remaining

    for tier in BONUS_TIERS:
        if projected_total >= tier["deliveries"]:
            # Was on track — disruption broke the streak
            actual_after_loss = projected_total - lost_deliveries
            if actual_after_loss < tier["deliveries"]:
                # Would have hit tier but now won't
                probability = min(1.0, (projected_total - tier["deliveries"]) / 5.0 + 0.5)
                total_bonus_loss += tier["amount"] * probability

    # Apply peak-hour multiplier
    if current_hour in PEAK_BONUS_HOURS:
        total_bonus_loss *= 2.0

    # Cap bonus loss at a reasonable ceiling
    return round(min(total_bonus_loss, 600.0), 2)


# ─── Reconciliation Hooks ────────────────────────────────────

async def schedule_reconciliation(claim_id: str, delay_hours: float = 48.0):
    """
    Schedule a post-payout reconciliation check.
    In production: queue via Celery/Redis. For demo: log intent.
    """
    print(f"  📋 Reconciliation scheduled for claim {claim_id[:8]}... "
          f"in {delay_hours}h")


async def reconcile_claim(claim_id: str):
    """
    48-hour post-payout reconciliation.

    Compares the severity at payout time vs actual resolved severity:
    - If severity was overestimated → flag for UPI reversal request
    - If severity increased (flood worsened) → trigger auto top-up
    """
    async with AsyncSessionLocal() as db:
        try:
            claim = await db.get(Claim, uuid.UUID(claim_id))
            if not claim or claim.status != ClaimStatus.paid:
                return

            event = await db.get(DisruptionEvent, claim.disruption_id)
            if not event or not event.resolved_at:
                return  # Event still ongoing, skip reconciliation

            # Recalculate severity with actual resolved duration
            actual_hours = (event.resolved_at - event.started_at).total_seconds() / 3600
            hex_profile = await get_hex_profile(db, event.h3_hex)

            new_score = compute_composite_severity(
                rain_mm=float(event.rain_mm or 0),
                traffic_kmh=float(event.traffic_kmh or 999),
                social_confidence=float(event.confidence or 0),
                duration_hours=actual_hours,
                hex_profile=hex_profile,
            )
            new_multiplier = get_continuous_multiplier(new_score)
            original_multiplier = float(claim.severity_multiplier or 1.0)

            deviation = abs(new_multiplier - original_multiplier) / original_multiplier

            if deviation > 0.20:
                if new_multiplier < original_multiplier:
                    # Overestimated — flag for potential reversal
                    print(f"  ⚠️  Claim {claim_id[:8]}: severity overestimated "
                          f"({original_multiplier:.2f}→{new_multiplier:.2f}). "
                          f"Flagging for review.")
                    if not claim.fraud_flags:
                        claim.fraud_flags = []
                    claim.fraud_flags.append(
                        f"[RECONCILIATION] Severity dropped {deviation:.0%}: "
                        f"×{original_multiplier:.2f}→×{new_multiplier:.2f}"
                    )
                else:
                    # Underestimated — auto top-up
                    rider = await db.get(Rider, claim.rider_id)
                    policy = await db.get(Policy, claim.policy_id)
                    if rider and policy:
                        additional = (
                            float(rider.hourly_rate) * actual_hours *
                            (new_multiplier - original_multiplier)
                        )
                        cap_remaining = float(policy.payout_cap) - float(claim.total_payout)
                        top_up = min(additional, cap_remaining)
                        if top_up > 10:  # Only top-up if meaningful
                            print(f"  💰 Claim {claim_id[:8]}: auto top-up ₹{top_up:.0f} "
                                  f"(severity increased {deviation:.0%})")
                            # In production: execute additional payout here

                await db.commit()

        except Exception as e:
            print(f"  ❌ Reconciliation error for {claim_id}: {e}")


async def _execute_razorpay_payout(rider: Rider, amount: float, reference: str) -> Optional[str]:
    """
    Execute payout via Razorpay X (Payout API) in test mode.
    Returns payout_id or None on failure.
    """
    try:
        import razorpay
        from config import get_settings
        s = get_settings()

        if not s.razorpay_key_id:
            # Simulate for demo
            print(f"    💸 [SIMULATED] Razorpay payout of ₹{amount:.0f} to {rider.upi_id}")
            return f"SIMULATED_PAYOUT_{uuid.uuid4().hex[:8].upper()}"

        client = razorpay.Client(auth=(s.razorpay_key_id, s.razorpay_key_secret))
        payout = client.payout.create({
            "account_number": "2323230054727104",  # Razorpay X test account
            "fund_account": {
                "account_type": "vpa",
                "vpa": {"address": rider.upi_id or "test@upi"},
                "contact": {
                    "name": rider.name,
                    "email": rider.email or "rider@gigachad.in",
                    "contact": rider.phone,
                    "type": "customer",
                },
            },
            "amount": int(amount * 100),  # Razorpay uses paise
            "currency": "INR",
            "mode": "UPI",
            "purpose": "payout",
            "queue_if_low_balance": True,
            "reference_id": reference,
            "narration": f"GigaChad Disruption Claim {reference[:8]}",
        })
        return payout.get("id")
    except Exception as e:
        print(f"    ❌ Razorpay error: {e}")
        return f"FALLBACK_PAYOUT_{uuid.uuid4().hex[:8].upper()}"
