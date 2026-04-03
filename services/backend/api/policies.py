from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta
import uuid

from database import get_db
from models import Policy, PolicyTier, PolicyStatus, Rider, PremiumQuote
from engines.actuarial import compute_weekly_premium

router = APIRouter()

TIER_CAPS = {
    PolicyTier.giga_basic: 300.0,
    PolicyTier.giga_plus: 600.0,
    PolicyTier.giga_pro: 1000.0,
}


# ── Pydantic Schemas ─────────────────────────────────────────

class PolicyOptIn(BaseModel):
    rider_id: uuid.UUID
    tier: PolicyTier


class PolicyOut(BaseModel):
    id: uuid.UUID
    rider_id: uuid.UUID
    tier: PolicyTier
    weekly_premium: float
    payout_cap: float
    week_start: date
    week_end: date
    status: PolicyStatus
    ai_risk_score: Optional[float]

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────

@router.get("/current-quote")
async def get_current_quote(db: AsyncSession = Depends(get_db)):
    """Return this week's AI-computed premium quote."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday

    result = await db.execute(
        select(PremiumQuote).where(PremiumQuote.week_start == week_start)
    )
    quote = result.scalar_one_or_none()

    if not quote:
        # Compute on-demand
        quote_data = await compute_weekly_premium(week_start)
        quote = PremiumQuote(
            week_start=week_start,
            **quote_data,
        )
        db.add(quote)
        await db.flush()

    return {
        "week_start": str(week_start),
        "ai_risk_score": float(quote.ai_risk_score or 0.5),
        "tiers": {
            "giga_basic": {"premium": float(quote.basic_premium), "cap": 300},
            "giga_plus":  {"premium": float(quote.plus_premium),  "cap": 600},
            "giga_pro":   {"premium": float(quote.pro_premium),   "cap": 1000},
        },
    }


@router.post("/opt-in", response_model=PolicyOut, status_code=201)
async def opt_in(data: PolicyOptIn, db: AsyncSession = Depends(get_db)):
    """Rider opts into a weekly policy tier."""
    rider = await db.get(Rider, data.rider_id)
    if not rider:
        raise HTTPException(404, "Rider not found")

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Cancel any existing active policy for this week
    existing = await db.execute(
        select(Policy).where(
            Policy.rider_id == data.rider_id,
            Policy.week_start == week_start,
            Policy.status == PolicyStatus.active,
        )
    )
    for old in existing.scalars().all():
        old.status = PolicyStatus.cancelled

    # Determine premium
    quote_result = await db.execute(
        select(PremiumQuote).where(PremiumQuote.week_start == week_start)
    )
    quote = quote_result.scalar_one_or_none()
    if not quote:
        quote_data = await compute_weekly_premium(week_start)
        quote = PremiumQuote(week_start=week_start, **quote_data)
        db.add(quote)
        await db.flush()

    premium_map = {
        PolicyTier.giga_basic: float(quote.basic_premium),
        PolicyTier.giga_plus: float(quote.plus_premium),
        PolicyTier.giga_pro: float(quote.pro_premium),
    }

    policy = Policy(
        rider_id=data.rider_id,
        tier=data.tier,
        weekly_premium=premium_map[data.tier],
        payout_cap=TIER_CAPS[data.tier],
        week_start=week_start,
        week_end=week_end,
        status=PolicyStatus.active,   # For demo: skip payment step
        ai_risk_score=quote.ai_risk_score,
    )
    db.add(policy)
    await db.flush()
    return policy


@router.get("/rider/{rider_id}", response_model=list[PolicyOut])
async def rider_policies(rider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Policy).where(Policy.rider_id == rider_id).order_by(Policy.created_at.desc())
    )
    return result.scalars().all()
