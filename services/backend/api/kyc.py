"""
KYC API Endpoints
─────────────────
Hassle-free KYC verification endpoints for riders.

Flow:
1. POST /api/kyc/digilocker/init → Get DigiLocker auth URL
2. GET  /api/kyc/digilocker/callback → Handle DigiLocker redirect
3. POST /api/kyc/upi/validate → Validate UPI ID format
4. POST /api/kyc/upi/verify → Send ₹1 test & confirm
5. GET  /api/kyc/status → Get KYC status
"""

from datetime import datetime
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import Rider
from engines.kyc import (
    generate_digilocker_auth_url,
    verify_digilocker_callback,
    validate_upi_id,
    send_upi_test_transfer,
    calculate_kyc_status,
    complete_kyc,
    verify_pan,
    KYCStatus,
)
from config import get_settings

settings = get_settings()
router = APIRouter(prefix="/api/kyc", tags=["kyc"])


# ══════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════

class DigiLockerInitRequest(BaseModel):
    rider_id: str


class DigiLockerInitResponse(BaseModel):
    auth_url: str
    message: str


class UPIValidateRequest(BaseModel):
    rider_id: str
    upi_id: str


class UPIValidateResponse(BaseModel):
    valid: bool
    upi_id: str
    name_at_bank: Optional[str] = None
    error: Optional[str] = None


class UPIVerifyRequest(BaseModel):
    rider_id: str
    upi_id: str
    confirmation_code: Optional[str] = None  # Last 4 digits of transfer


class UPIVerifyResponse(BaseModel):
    success: bool
    step: str  # "transfer_sent" or "verified"
    message: str
    last_4: Optional[str] = None


class PANVerifyRequest(BaseModel):
    rider_id: str
    pan_number: str
    name: str
    dob: str  # YYYY-MM-DD


# ══════════════════════════════════════════════════════════════
# KYC STATUS
# ══════════════════════════════════════════════════════════════

@router.get("/status/{rider_id}", response_model=KYCStatus)
async def get_kyc_status(
    rider_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get current KYC verification status for a rider."""
    rider = await db.get(Rider, UUID(rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    return calculate_kyc_status(rider)


# ══════════════════════════════════════════════════════════════
# DIGILOCKER (Aadhar eKYC)
# ══════════════════════════════════════════════════════════════

@router.post("/digilocker/init", response_model=DigiLockerInitResponse)
async def init_digilocker_verification(
    request: DigiLockerInitRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Start DigiLocker verification flow.
    Returns URL to redirect user to DigiLocker login.
    """
    rider = await db.get(Rider, UUID(request.rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Already verified?
    if rider.aadhar_verified:
        raise HTTPException(status_code=400, detail="Aadhar already verified")
    
    callback_url = f"{settings.backend_url}/api/kyc/digilocker/callback"
    auth_url = await generate_digilocker_auth_url(request.rider_id, callback_url)
    
    return DigiLockerInitResponse(
        auth_url=auth_url,
        message="Redirect user to this URL for DigiLocker authentication"
    )


@router.get("/digilocker/callback")
async def digilocker_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle DigiLocker OAuth callback.
    Extracts Aadhar details and updates rider record.
    """
    # Extract rider_id from state
    try:
        rider_id = state.split("_")[0]
    except:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    
    rider = await db.get(Rider, UUID(rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Verify with DigiLocker
    result = await verify_digilocker_callback(code, state)
    
    if result.success:
        rider.aadhar_verified = True
        rider.masked_aadhar = result.masked_aadhar
        if result.name:
            rider.name = result.name
        await db.commit()
        
        # Redirect to success page
        return RedirectResponse(
            url=f"{settings.frontend_url}/kyc/success?step=aadhar",
            status_code=302
        )
    else:
        return RedirectResponse(
            url=f"{settings.frontend_url}/kyc/error?message={result.error}",
            status_code=302
        )


# ══════════════════════════════════════════════════════════════
# UPI VERIFICATION
# ══════════════════════════════════════════════════════════════

@router.post("/upi/validate", response_model=UPIValidateResponse)
async def validate_upi(
    request: UPIValidateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Validate UPI ID format and check if it exists.
    Does NOT verify ownership yet.
    """
    rider = await db.get(Rider, UUID(request.rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    result = await validate_upi_id(request.upi_id)
    
    return UPIValidateResponse(
        valid=result.success,
        upi_id=request.upi_id,
        name_at_bank=result.name_at_bank,
        error=result.error,
    )


@router.post("/upi/verify", response_model=UPIVerifyResponse)
async def verify_upi_ownership(
    request: UPIVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Two-step UPI verification:
    1. First call (no confirmation_code): Send ₹1 test transfer
    2. Second call (with confirmation_code): Verify last 4 digits
    """
    rider = await db.get(Rider, UUID(request.rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    if rider.upi_verified:
        raise HTTPException(status_code=400, detail="UPI already verified")
    
    # Step 1: Send test transfer
    if not request.confirmation_code:
        # First validate the UPI ID
        validation = await validate_upi_id(request.upi_id)
        if not validation.success:
            raise HTTPException(status_code=400, detail=validation.error)
        
        # Send ₹1 test transfer
        transfer = await send_upi_test_transfer(request.upi_id, request.rider_id)
        
        if not transfer.get("success"):
            raise HTTPException(status_code=500, detail=transfer.get("error", "Transfer failed"))
        
        # Store pending verification
        rider.upi_id = request.upi_id
        rider.upi_verification_code = transfer.get("last_4")
        await db.commit()
        
        return UPIVerifyResponse(
            success=True,
            step="transfer_sent",
            message=f"₹1 sent to {request.upi_id}. Enter the last 4 digits of the transaction ID to verify.",
            last_4=None,  # Don't reveal yet
        )
    
    # Step 2: Verify confirmation code
    else:
        if rider.upi_verification_code != request.confirmation_code:
            return UPIVerifyResponse(
                success=False,
                step="verification_failed",
                message="Incorrect code. Check your UPI app for the transaction ID.",
            )
        
        # Mark as verified
        rider.upi_verified = True
        rider.upi_verification_code = None  # Clear
        
        # Check if KYC is now complete
        if rider.aadhar_verified and rider.upi_verified:
            rider.kyc_verified_at = datetime.utcnow()
        
        await db.commit()
        
        return UPIVerifyResponse(
            success=True,
            step="verified",
            message="UPI verified successfully! You're ready to receive payouts.",
        )


# ══════════════════════════════════════════════════════════════
# SIMPLIFIED KYC (Skip DigiLocker)
# ══════════════════════════════════════════════════════════════

@router.post("/quick")
async def quick_kyc(
    rider_id: str,
    upi_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Quick KYC for hackathon demo - just validates UPI.
    In production, would require Aadhar verification.
    """
    rider = await db.get(Rider, UUID(rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    # Validate UPI
    upi_result = await validate_upi_id(upi_id)
    
    if upi_result.success:
        rider.upi_id = upi_id
        rider.upi_verified = True
        rider.kyc_verified_at = datetime.utcnow()
        await db.commit()
        
        return {
            "success": True,
            "message": "KYC completed! You can now receive payouts.",
            "kyc_status": calculate_kyc_status(rider).dict(),
        }
    else:
        raise HTTPException(status_code=400, detail=upi_result.error)


@router.post("/pan/verify")
async def verify_pan_kyc(
    request: PANVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Alternative KYC using PAN verification.
    For riders who prefer not to use DigiLocker.
    """
    rider = await db.get(Rider, UUID(request.rider_id))
    if not rider:
        raise HTTPException(status_code=404, detail="Rider not found")
    
    result = await verify_pan(request.pan_number, request.name, request.dob)
    
    if result.get("success"):
        rider.pan_verified = True
        rider.pan_number = request.pan_number[:5] + "XXXX" + request.pan_number[-1]  # Masked
        
        # PAN alone counts as identity verification (alternative to Aadhar)
        if rider.upi_verified:
            rider.kyc_verified_at = datetime.utcnow()
        
        await db.commit()
        
        return {
            "success": True,
            "message": "PAN verified successfully!",
            "kyc_status": calculate_kyc_status(rider).dict(),
        }
    else:
        raise HTTPException(status_code=400, detail=result.get("error", "PAN verification failed"))
