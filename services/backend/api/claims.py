from fastapi import APIRouter, Depends, HTTPException, Form, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from database import get_db
from models import Claim, ClaimStatus, Rider

router = APIRouter()


class ClaimOut(BaseModel):
    id: uuid.UUID
    rider_id: uuid.UUID
    policy_id: Optional[uuid.UUID]
    disruption_id: Optional[uuid.UUID]
    idle_hours: Optional[float]
    base_loss: Optional[float]
    bonus_loss: Optional[float]
    total_payout: Optional[float]
    fraud_score: Optional[float]
    severity_multiplier: Optional[float]
    status: ClaimStatus
    fraud_flags: Optional[list[str]]
    created_at: datetime

    class Config:
        from_attributes = True


class ClaimSubmitResponse(BaseModel):
    success: bool
    claim_id: uuid.UUID
    message: str


@router.get("/", response_model=list[ClaimOut])
async def list_claims(status: Optional[ClaimStatus] = None, db: AsyncSession = Depends(get_db)):
    query = select(Claim).order_by(Claim.created_at.desc())
    if status:
        query = query.where(Claim.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{claim_id}", response_model=ClaimOut)
async def get_claim(claim_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    claim = await db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    return claim


@router.get("/rider/{rider_id}", response_model=list[ClaimOut])
async def rider_claims(rider_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Claim).where(Claim.rider_id == rider_id).order_by(Claim.created_at.desc())
    )
    return result.scalars().all()


@router.post("/submit", response_model=ClaimSubmitResponse, status_code=201)
async def submit_claim(
    rider_id: uuid.UUID = Form(...),
    disruption_type: str = Form(...),
    description: Optional[str] = Form(None),
    zone: Optional[str] = Form(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    evidence: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Mobile claim submission endpoint.
    Accepts multipart payload with optional media evidence.
    """
    if not await db.get(Rider, rider_id):
        raise HTTPException(404, "Rider not found")

    # Demo-safe placeholder values until full adjudication engine links disruption/policy.
    idle_hours = 2.0
    base_loss = 200.0
    bonus_loss = 0.0
    payout = base_loss + bonus_loss

    evidence_ref = None
    if evidence:
        evidence_ref = evidence.filename

    claim = Claim(
        rider_id=rider_id,
        idle_hours=idle_hours,
        base_loss=base_loss,
        bonus_loss=bonus_loss,
        total_payout=payout,
        fraud_score=0.05,
        status=ClaimStatus.pending,
        fraud_flags=[],
        appeal_video_url=evidence_ref,
    )

    db.add(claim)
    await db.commit()
    await db.refresh(claim)

    return ClaimSubmitResponse(
        success=True,
        claim_id=claim.id,
        message="Claim submitted successfully",
    )


@router.post("/{claim_id}/appeal")
async def submit_appeal(
    claim_id: uuid.UUID,
    video_url: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db)
):
    """Rider submits a 10-second video URL to appeal a soft-flagged claim."""
    claim = await db.get(Claim, claim_id)
    if not claim:
        raise HTTPException(404, "Claim not found")
    if claim.status != ClaimStatus.soft_flagged:
        raise HTTPException(400, f"Claim is {claim.status.value}, not soft_flagged")

    claim.appeal_video_url = video_url or (video.filename if video else None)
    # In production: queue for human review. For demo: auto-approve.
    claim.status = ClaimStatus.approved
    await db.commit()

    return {"status": "appeal_submitted", "claim_id": str(claim_id)}
