from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import h3

from database import get_db
from models import TelemetryLog, Rider

router = APIRouter()

# Uber H3 resolution — ~0.5km² hexagons, perfect for Chennai micro-zones
H3_RESOLUTION = 9


# ── Pydantic Schemas ─────────────────────────────────────────

class TelemetryPing(BaseModel):
    rider_id: uuid.UUID
    lat: float
    lng: float
    speed_kmh: Optional[float] = None
    accel_x: Optional[float] = None
    accel_y: Optional[float] = None
    accel_z: Optional[float] = None
    wifi_ssid: Optional[str] = None
    network_type: Optional[str] = "4G"
    is_shift_active: bool = True
    is_fake: bool = False          # flag simulated GPS data


class TelemetryOut(BaseModel):
    id: uuid.UUID
    rider_id: uuid.UUID
    lat: float
    lng: float
    h3_hex: Optional[str]
    speed_kmh: Optional[float]
    wifi_ssid: Optional[str]
    is_fake: bool
    ts: datetime

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────

@router.post("/ping", response_model=TelemetryOut, status_code=201)
async def ingest_telemetry(data: TelemetryPing, db: AsyncSession = Depends(get_db)):
    """Accept a GPS + sensor ping from the mobile app (real or simulated)."""
    rider = await db.get(Rider, data.rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")

    # Compute H3 hex for this coordinate
    h3_hex = h3.geo_to_h3(data.lat, data.lng, H3_RESOLUTION)

    log = TelemetryLog(
        rider_id=data.rider_id,
        lat=data.lat,
        lng=data.lng,
        h3_hex=h3_hex,
        speed_kmh=data.speed_kmh,
        accel_x=data.accel_x,
        accel_y=data.accel_y,
        accel_z=data.accel_z,
        wifi_ssid=data.wifi_ssid,
        network_type=data.network_type,
        is_shift_active=data.is_shift_active,
        is_fake=data.is_fake,
    )
    db.add(log)
    await db.flush()
    return log


@router.get("/rider/{rider_id}/latest")
async def latest_telemetry(rider_id: uuid.UUID, limit: int = 10, db: AsyncSession = Depends(get_db)):
    """Return the N most recent telemetry pings for a rider."""
    result = await db.execute(
        select(TelemetryLog)
        .where(TelemetryLog.rider_id == rider_id)
        .order_by(desc(TelemetryLog.ts))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/hex/{h3_hex}/active-riders")
async def riders_in_hex(h3_hex: str, db: AsyncSession = Depends(get_db)):
    """Return riders currently active in a hex-grid (last 5 minutes)."""
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(minutes=5)

    result = await db.execute(
        select(TelemetryLog.rider_id, TelemetryLog.lat, TelemetryLog.lng, TelemetryLog.ts)
        .where(
            TelemetryLog.h3_hex == h3_hex,
            TelemetryLog.ts >= cutoff,
            TelemetryLog.is_shift_active == True,
        )
        .distinct(TelemetryLog.rider_id)
    )
    rows = result.all()
    return {
        "h3_hex": h3_hex,
        "active_rider_count": len(rows),
        "riders": [{"rider_id": str(r.rider_id), "lat": float(r.lat), "lng": float(r.lng)} for r in rows],
    }
