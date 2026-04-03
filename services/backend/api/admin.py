"""
Admin & Demo endpoints — simulate disruptions, run full demo flow, dashboard stats.
"""
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import h3

from database import get_db
from models import (
    DisruptionEvent, DisruptionType, DisruptionStatus,
    Rider, Policy, PolicyStatus, Claim, ClaimStatus, TelemetryLog
)
from engines.payout import process_disruption_claims

router = APIRouter()

# Chennai micro-zone hex grids (Resolution 9)
CHENNAI_ZONES = {
    "velachery":    h3.geo_to_h3(12.9789, 80.2180, 9),
    "omr":          h3.geo_to_h3(12.9010, 80.2279, 9),
    "t_nagar":      h3.geo_to_h3(13.0418, 80.2341, 9),
    "anna_nagar":   h3.geo_to_h3(13.0891, 80.2152, 9),
    "tambaram":     h3.geo_to_h3(12.9249, 80.1000, 9),
}


class SimulateDisruptionRequest(BaseModel):
    zone: str = "velachery"
    event_type: DisruptionType = DisruptionType.flood
    rain_mm: float = 38.0
    traffic_kmh: float = 2.5


@router.post("/simulate-disruption")
async def simulate_disruption(
    req: SimulateDisruptionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    🚨 DEMO: Manually fire a disruption to trigger the full auto-claim flow.
    """
    h3_hex = CHENNAI_ZONES.get(req.zone.lower())
    if not h3_hex:
        return {"error": f"Unknown zone. Available: {list(CHENNAI_ZONES.keys())}"}

    event = DisruptionEvent(
        event_type=req.event_type,
        h3_hex=h3_hex,
        zone_name=req.zone.title(),
        rain_mm=req.rain_mm,
        traffic_kmh=req.traffic_kmh,
        trigger_source="admin_simulation",
        confidence=1.0,
    )
    db.add(event)
    await db.flush()

    background_tasks.add_task(process_disruption_claims, str(event.id))

    return {
        "status": "disruption_simulated",
        "event_id": str(event.id),
        "zone": req.zone,
        "h3_hex": h3_hex,
        "message": f"Processing claims for all active riders in {req.zone.title()} hex-grid...",
    }


@router.post("/simulate-telemetry/{rider_id}")
async def simulate_telemetry(
    rider_id: uuid.UUID,
    zone: str = "velachery",
    db: AsyncSession = Depends(get_db),
):
    """
    🚨 DEMO: Inject fake GPS pings for a rider into a specific zone.
    """
    import random

    zone_center = {
        "velachery": (12.9789, 80.2180),
        "omr":       (12.9010, 80.2279),
        "t_nagar":   (13.0418, 80.2341),
    }
    base_lat, base_lng = zone_center.get(zone.lower(), (12.9789, 80.2180))

    rider = await db.get(Rider, rider_id)
    if not rider:
        return {"error": "Rider not found"}

    logs = []
    for _ in range(5):
        # Small random jitter around zone center
        lat = base_lat + random.uniform(-0.002, 0.002)
        lng = base_lng + random.uniform(-0.002, 0.002)
        h3_hex = h3.geo_to_h3(lat, lng, 9)

        log = TelemetryLog(
            rider_id=rider_id,
            lat=lat,
            lng=lng,
            h3_hex=h3_hex,
            speed_kmh=random.uniform(0, 3),  # Very slow — stuck in disruption
            accel_x=random.uniform(-0.3, 0.3),
            accel_y=random.uniform(-0.3, 0.3),
            accel_z=9.8,
            wifi_ssid="Zepto_DarkStore_WiFi",   # Not home WiFi — passes fraud check
            network_type="4G",
            is_shift_active=True,
            is_fake=True,
        )
        db.add(log)
        logs.append({"lat": lat, "lng": lng, "h3_hex": h3_hex})

    await db.flush()
    return {"status": "telemetry_injected", "rider_id": str(rider_id), "pings": logs}


@router.get("/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate stats for the insurer dashboard."""
    total_riders = await db.scalar(select(func.count(Rider.id)).where(Rider.is_active == True))
    active_policies = await db.scalar(select(func.count(Policy.id)).where(Policy.status == PolicyStatus.active))
    active_disruptions = await db.scalar(
        select(func.count(DisruptionEvent.id)).where(DisruptionEvent.status == DisruptionStatus.active)
    )
    total_claims = await db.scalar(select(func.count(Claim.id)))
    paid_claims = await db.scalar(select(func.count(Claim.id)).where(Claim.status == ClaimStatus.paid))
    total_paid_out = await db.scalar(
        select(func.coalesce(func.sum(Claim.total_payout), 0)).where(Claim.status == ClaimStatus.paid)
    )
    fraud_flagged = await db.scalar(
        select(func.count(Claim.id)).where(Claim.status.in_([ClaimStatus.soft_flagged, ClaimStatus.denied]))
    )

    return {
        "total_riders": total_riders,
        "active_policies": active_policies,
        "active_disruptions": active_disruptions,
        "total_claims": total_claims,
        "paid_claims": paid_claims,
        "total_paid_out_inr": float(total_paid_out or 0),
        "fraud_flagged": fraud_flagged,
        "zones": CHENNAI_ZONES,
    }
