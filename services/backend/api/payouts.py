"""
Payout Management API
─────────────────────
Endpoints for managing insurance payouts and claim processing.

Routes:
- GET  /api/payouts - List all payouts
- GET  /api/payouts/{claim_id} - Get payout details
- POST /api/payouts/{claim_id}/execute - Manual payout trigger
- POST /api/payouts/batch - Batch payout processing
- GET  /api/payouts/summary - Payout statistics
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import Claim, ClaimStatus, Rider, Policy, DisruptionEvent, PolicyTier
from engines.payout import process_disruption_claims, _execute_razorpay_payout
from engines.notify import send_whatsapp_payout

router = APIRouter(prefix="/api/payouts", tags=["payouts"])


# ══════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════

class PayoutResponse(BaseModel):
    id: str
    rider_id: str
    rider_name: str
    rider_phone: str
    disruption_id: str
    disruption_type: str
    zone: str
    status: str
    amount: float
    fraud_score: float
    severity_multiplier: Optional[float]
    composite_score: Optional[float]
    fraud_flags: list[str]
    razorpay_payout_id: Optional[str]
    created_at: datetime
    processed_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class PayoutSummary(BaseModel):
    total_claims: int
    total_paid: float
    pending_count: int
    pending_amount: float
    approved_count: int
    approved_amount: float
    paid_count: int
    paid_amount: float
    flagged_count: int
    denied_count: int
    avg_fraud_score: float
    period_start: datetime
    period_end: datetime


class BatchPayoutRequest(BaseModel):
    claim_ids: list[str]


class BatchPayoutResponse(BaseModel):
    processed: int
    failed: int
    results: list[dict]


class ExecutePayoutResponse(BaseModel):
    claim_id: str
    status: str
    razorpay_payout_id: Optional[str]
    amount: float
    message: str


# ══════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("", response_model=list[PayoutResponse])
async def list_payouts(
    status: Optional[str] = Query(None, description="Filter by status"),
    zone: Optional[str] = Query(None, description="Filter by zone"),
    days: int = Query(7, description="Days to look back"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    """List payouts/claims with optional filters."""
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    query = (
        select(Claim, Rider, DisruptionEvent)
        .join(Rider, Claim.rider_id == Rider.id)
        .join(DisruptionEvent, Claim.disruption_id == DisruptionEvent.id)
        .where(Claim.created_at >= cutoff)
        .order_by(Claim.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    
    if status:
        query = query.where(Claim.status == ClaimStatus(status))
    
    if zone:
        query = query.where(DisruptionEvent.zone_name == zone)
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        PayoutResponse(
            id=str(claim.id),
            rider_id=str(rider.id),
            rider_name=rider.name,
            rider_phone=rider.phone,
            disruption_id=str(disruption.id),
            disruption_type=disruption.event_type.value,
            zone=disruption.zone_name or disruption.h3_hex,
            status=claim.status.value,
            amount=float(claim.total_payout or 0),
            fraud_score=float(claim.fraud_score or 0),
            severity_multiplier=float(claim.severity_multiplier or 1.0),
            composite_score=float(disruption.composite_score or 0),
            fraud_flags=claim.fraud_flags or [],
            razorpay_payout_id=claim.razorpay_payout_id,
            created_at=claim.created_at,
            processed_at=claim.processed_at,
        )
        for claim, rider, disruption in rows
    ]


@router.get("/summary", response_model=PayoutSummary)
async def get_payout_summary(
    days: int = Query(7, description="Days to look back"),
    db: AsyncSession = Depends(get_db),
):
    """Get payout statistics for the dashboard."""
    
    period_end = datetime.utcnow()
    period_start = period_end - timedelta(days=days)
    
    # Aggregate query
    result = await db.execute(
        select(
            func.count(Claim.id).label("total"),
            func.sum(Claim.total_payout).label("total_paid"),
            func.avg(Claim.fraud_score).label("avg_fraud"),
        )
        .where(Claim.created_at >= period_start)
    )
    totals = result.one()
    
    # Status breakdown
    status_counts = {}
    status_amounts = {}
    
    for status in ClaimStatus:
        result = await db.execute(
            select(
                func.count(Claim.id),
                func.coalesce(func.sum(Claim.total_payout), 0)
            )
            .where(and_(
                Claim.created_at >= period_start,
                Claim.status == status
            ))
        )
        count, amount = result.one()
        status_counts[status.value] = count
        status_amounts[status.value] = float(amount or 0)
    
    return PayoutSummary(
        total_claims=totals.total or 0,
        total_paid=float(totals.total_paid or 0),
        pending_count=status_counts.get("pending", 0),
        pending_amount=status_amounts.get("pending", 0),
        approved_count=status_counts.get("approved", 0),
        approved_amount=status_amounts.get("approved", 0),
        paid_count=status_counts.get("paid", 0),
        paid_amount=status_amounts.get("paid", 0),
        flagged_count=status_counts.get("soft_flagged", 0),
        denied_count=status_counts.get("denied", 0),
        avg_fraud_score=float(totals.avg_fraud or 0),
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/{claim_id}", response_model=PayoutResponse)
async def get_payout_details(
    claim_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed payout/claim information."""
    
    result = await db.execute(
        select(Claim, Rider, DisruptionEvent)
        .join(Rider, Claim.rider_id == Rider.id)
        .join(DisruptionEvent, Claim.disruption_id == DisruptionEvent.id)
        .where(Claim.id == UUID(claim_id))
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    claim, rider, disruption = row
    
    return PayoutResponse(
        id=str(claim.id),
        rider_id=str(rider.id),
        rider_name=rider.name,
        rider_phone=rider.phone,
        disruption_id=str(disruption.id),
        disruption_type=disruption.event_type.value,
        zone=disruption.zone_name or disruption.h3_hex,
        status=claim.status.value,
        amount=float(claim.total_payout or 0),
        fraud_score=float(claim.fraud_score or 0),
        severity_multiplier=float(claim.severity_multiplier or 1.0),
        composite_score=float(disruption.composite_score or 0),
        fraud_flags=claim.fraud_flags or [],
        razorpay_payout_id=claim.razorpay_payout_id,
        created_at=claim.created_at,
        processed_at=claim.processed_at,
    )


@router.post("/{claim_id}/execute", response_model=ExecutePayoutResponse)
async def execute_payout(
    claim_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Manually execute payout for an approved claim.
    Sends funds via Razorpay and notifies rider via WhatsApp.
    """
    
    result = await db.execute(
        select(Claim, Rider, DisruptionEvent)
        .join(Rider, Claim.rider_id == Rider.id)
        .join(DisruptionEvent, Claim.disruption_id == DisruptionEvent.id)
        .where(Claim.id == UUID(claim_id))
    )
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    claim, rider, disruption = row
    
    # Validate status
    if claim.status == ClaimStatus.paid:
        raise HTTPException(
            status_code=400, 
            detail=f"Claim already paid. Razorpay ID: {claim.razorpay_payout_id}"
        )
    
    if claim.status == ClaimStatus.denied:
        raise HTTPException(status_code=400, detail="Claim was denied")
    
    if claim.status == ClaimStatus.soft_flagged and claim.fraud_score > 0.8:
        raise HTTPException(
            status_code=400, 
            detail=f"Claim has high fraud score ({claim.fraud_score:.2f}). Manual review required."
        )
    
    # Execute payout
    try:
        payout_id = await _execute_razorpay_payout(
            rider=rider,
            amount=float(claim.total_payout),
            reference=str(claim.id),
        )
        
        if payout_id:
            claim.razorpay_payout_id = payout_id
            claim.status = ClaimStatus.paid
            claim.processed_at = datetime.utcnow()
            await db.commit()
            
            # Send notification in background
            background_tasks.add_task(
                send_whatsapp_payout,
                phone=rider.phone,
                name=rider.name,
                amount=float(claim.total_payout),
                zone=disruption.zone_name or disruption.h3_hex,
                event_type=disruption.event_type.value,
            )
            
            return ExecutePayoutResponse(
                claim_id=str(claim.id),
                status="paid",
                razorpay_payout_id=payout_id,
                amount=float(claim.total_payout),
                message=f"Payout of ₹{claim.total_payout} sent to {rider.name}",
            )
        else:
            return ExecutePayoutResponse(
                claim_id=str(claim.id),
                status="failed",
                razorpay_payout_id=None,
                amount=float(claim.total_payout),
                message="Razorpay payout execution failed",
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payout error: {str(e)}")


@router.post("/batch", response_model=BatchPayoutResponse)
async def batch_execute_payouts(
    request: BatchPayoutRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Execute payouts for multiple approved claims.
    Processes claims sequentially to avoid rate limiting.
    """
    
    results = []
    processed = 0
    failed = 0
    
    for claim_id in request.claim_ids:
        try:
            result = await db.execute(
                select(Claim, Rider, DisruptionEvent)
                .join(Rider, Claim.rider_id == Rider.id)
                .join(DisruptionEvent, Claim.disruption_id == DisruptionEvent.id)
                .where(Claim.id == UUID(claim_id))
            )
            row = result.first()
            
            if not row:
                results.append({"claim_id": claim_id, "status": "not_found"})
                failed += 1
                continue
            
            claim, rider, disruption = row
            
            if claim.status in [ClaimStatus.paid, ClaimStatus.denied]:
                results.append({"claim_id": claim_id, "status": "skipped", "reason": claim.status.value})
                continue
            
            # Execute payout
            payout_id = await _execute_razorpay_payout(
                rider=rider,
                amount=float(claim.total_payout),
                reference=str(claim.id),
            )
            
            if payout_id:
                claim.razorpay_payout_id = payout_id
                claim.status = ClaimStatus.paid
                claim.processed_at = datetime.utcnow()
                processed += 1
                results.append({
                    "claim_id": claim_id, 
                    "status": "paid", 
                    "payout_id": payout_id,
                    "amount": float(claim.total_payout),
                })
                
                # Queue notification
                background_tasks.add_task(
                    send_whatsapp_payout,
                    phone=rider.phone,
                    name=rider.name,
                    amount=float(claim.total_payout),
                    zone=disruption.zone_name or disruption.h3_hex,
                    event_type=disruption.event_type.value,
                )
            else:
                failed += 1
                results.append({"claim_id": claim_id, "status": "failed"})
                
        except Exception as e:
            failed += 1
            results.append({"claim_id": claim_id, "status": "error", "error": str(e)})
    
    await db.commit()
    
    return BatchPayoutResponse(
        processed=processed,
        failed=failed,
        results=results,
    )


@router.post("/process-disruption/{disruption_id}")
async def process_disruption_payouts(
    disruption_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger auto-claim processing for a disruption event.
    Creates claims for all eligible riders in the affected zone.
    """
    
    result = await db.execute(
        select(DisruptionEvent).where(DisruptionEvent.id == UUID(disruption_id))
    )
    disruption = result.scalar_one_or_none()
    
    if not disruption:
        raise HTTPException(status_code=404, detail="Disruption event not found")
    
    try:
        claims_result = await process_disruption_claims(disruption_id)
        return {
            "status": "processed",
            "disruption_id": disruption_id,
            "zone": disruption.zone_name or disruption.h3_hex,
            "result": claims_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@router.patch("/{claim_id}/status")
async def update_claim_status(
    claim_id: str,
    status: ClaimStatus,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Manually update claim status (for admin review).
    Used for soft-flagged claims requiring manual approval.
    """
    
    claim = await db.get(Claim, UUID(claim_id))
    
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    if claim.status == ClaimStatus.paid:
        raise HTTPException(status_code=400, detail="Cannot modify paid claim")
    
    old_status = claim.status
    claim.status = status
    
    if reason:
        if not claim.fraud_flags:
            claim.fraud_flags = []
        claim.fraud_flags.append(f"[MANUAL] {reason}")
    
    await db.commit()
    
    return {
        "claim_id": claim_id,
        "old_status": old_status.value,
        "new_status": status.value,
        "reason": reason,
    }
