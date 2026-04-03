from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from database import get_db
from models import DisruptionEvent, DisruptionType, DisruptionStatus
from engines.trigger import evaluate_double_trigger, evaluate_social_trigger

router = APIRouter()


# ── Pydantic Schemas ─────────────────────────────────────────

class DisruptionOut(BaseModel):
    id: uuid.UUID
    event_type: DisruptionType
    h3_hex: str
    zone_name: Optional[str]
    rain_mm: Optional[float]
    traffic_kmh: Optional[float]
    confidence: Optional[float]
    trigger_source: Optional[str]
    status: DisruptionStatus
    started_at: datetime

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────

@router.get("/active", response_model=list[DisruptionOut])
async def list_active_disruptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DisruptionEvent)
        .where(DisruptionEvent.status == DisruptionStatus.active)
        .order_by(DisruptionEvent.started_at.desc())
    )
    return result.scalars().all()


@router.get("/hex/{h3_hex}", response_model=list[DisruptionOut])
async def disruptions_in_hex(h3_hex: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DisruptionEvent).where(
            DisruptionEvent.h3_hex == h3_hex,
            DisruptionEvent.status == DisruptionStatus.active,
        )
    )
    return result.scalars().all()


@router.post("/check/{h3_hex}")
async def check_disruption_for_hex(
    h3_hex: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Pull live OpenWeather + TomTom data for the hex, evaluate double-trigger,
    and create a DisruptionEvent if conditions are met.
    """
    result = await evaluate_double_trigger(h3_hex)
    if result["triggered"]:
        event = DisruptionEvent(
            event_type=DisruptionType.flood if result["rain_mm"] > 30 else DisruptionType.traffic_gridlock,
            h3_hex=h3_hex,
            zone_name=result.get("zone_name"),
            rain_mm=result.get("rain_mm"),
            traffic_kmh=result.get("traffic_kmh"),
            trigger_source="openweather+tomtom",
            confidence=result.get("confidence", 1.0),
        )
        db.add(event)
        await db.flush()

        # Fire auto-claim processing in background
        from engines.payout import process_disruption_claims
        background_tasks.add_task(process_disruption_claims, str(event.id))

        return {"triggered": True, "event_id": str(event.id), "details": result}

    return {"triggered": False, "details": result}


@router.post("/check-social")
async def check_social_disruption(
    zone_name: str,
    h3_hex: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Use Groq Llama-3 to scan social signals for strike/VVIP disruption."""
    result = await evaluate_social_trigger(zone_name)

    if result["triggered"]:
        event = DisruptionEvent(
            event_type=DisruptionType.strike,
            h3_hex=h3_hex,
            zone_name=zone_name,
            confidence=result["confidence"],
            trigger_source="llm_nlp",
        )
        db.add(event)
        await db.flush()

        from engines.payout import process_disruption_claims
        background_tasks.add_task(process_disruption_claims, str(event.id))

        return {"triggered": True, "event_id": str(event.id), "details": result}

    return {"triggered": False, "details": result}


@router.patch("/{disruption_id}/resolve")
async def resolve_disruption(disruption_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(DisruptionEvent, disruption_id)
    if not event:
        raise HTTPException(404, "Disruption not found")
    event.status = DisruptionStatus.resolved
    event.resolved_at = datetime.utcnow()
    return {"status": "resolved", "id": str(disruption_id)}
