from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid

from database import get_db
from models import Rider

router = APIRouter()


# ── Pydantic Schemas ─────────────────────────────────────────

class RiderCreate(BaseModel):
    name: str
    phone: str
    upi_id: Optional[str] = None
    hourly_rate: float = 100.0
    home_wifi_ssid: Optional[str] = None


class RiderOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str
    upi_id: Optional[str]
    hourly_rate: float
    platform: str
    is_active: bool

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────

@router.get("/", response_model=list[RiderOut])
async def list_riders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Rider).where(Rider.is_active == True))
    return result.scalars().all()


@router.get("/{rider_id}", response_model=RiderOut)
async def get_rider(rider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    rider = await db.get(Rider, rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")
    return rider


@router.post("/", response_model=RiderOut, status_code=201)
async def create_rider(data: RiderCreate, db: AsyncSession = Depends(get_db)):
    # Check phone uniqueness
    existing = await db.execute(select(Rider).where(Rider.phone == data.phone))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Rider with phone {data.phone} already exists")

    rider = Rider(**data.model_dump())
    db.add(rider)
    await db.flush()
    return rider


@router.patch("/{rider_id}/deactivate")
async def deactivate_rider(rider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    rider = await db.get(Rider, rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")
    rider.is_active = False
    return {"status": "deactivated", "rider_id": str(rider_id)}
