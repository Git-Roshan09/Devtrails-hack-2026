"""
WhatsApp Webhook Handler (Twilio)
─────────────────────────────────
Handles incoming WhatsApp messages for:
- Plan selection (reply 1/2/3 to weekly quote)
- Video appeal for soft-flagged claims
- Opt-out (reply SKIP)
- General queries

Twilio Webhook URL: https://your-domain/api/webhooks/whatsapp
Configure in Twilio Console → Messaging → WhatsApp Sandbox → Webhook URL
"""

from datetime import datetime, date, timedelta
from typing import Optional
import re
from fastapi import APIRouter, Request, HTTPException, Form, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from database import AsyncSessionLocal
from models import Rider, Policy, PolicyTier, PolicyStatus, Claim, ClaimStatus
from engines.notify import _send_message
from config import get_settings

settings = get_settings()
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ══════════════════════════════════════════════════════════════
# TWILIO WHATSAPP WEBHOOK
# ══════════════════════════════════════════════════════════════

@router.post("/whatsapp")
async def whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(""),
    NumMedia: int = Form(0),
    MediaUrl0: Optional[str] = Form(None),
    MediaContentType0: Optional[str] = Form(None),
):
    """
    Handle incoming WhatsApp messages from Twilio.
    
    Message types handled:
    - "1", "2", "3" → Plan selection
    - "SKIP" → Opt out of weekly plan
    - Video attachment → Soft-flag appeal
    - Text → General inquiry
    """
    # Extract phone number (remove 'whatsapp:' prefix)
    phone = From.replace("whatsapp:", "").strip()
    message = Body.strip().upper()
    
    print(f"📱 [WhatsApp IN] From: {phone} | Message: {Body[:50]}... | Media: {NumMedia}")
    
    async with AsyncSessionLocal() as db:
        # Find rider by phone
        result = await db.execute(
            select(Rider).where(Rider.phone == phone)
        )
        rider = result.scalar_one_or_none()
        
        if not rider:
            # Unknown number - prompt registration
            await _send_message(phone, (
                "👋 Hey! We don't recognize this number.\n\n"
                "Register at *gigachad.in* to get income protection.\n"
                "_India's first parametric micro-insurance for delivery partners._"
            ))
            return Response(content="", media_type="text/xml")
        
        # ── Handle Plan Selection (1/2/3) ──────────────────────
        if message in ["1", "2", "3"]:
            response = await _handle_plan_selection(db, rider, message)
        
        # ── Handle Opt-Out ─────────────────────────────────────
        elif message == "SKIP":
            response = await _handle_skip(rider)
        
        # ── Handle Video Appeal (soft-flagged claim) ───────────
        elif NumMedia > 0 and MediaContentType0 and "video" in MediaContentType0:
            response = await _handle_video_appeal(db, rider, MediaUrl0)
        
        # ── Handle Help/Status Queries ─────────────────────────
        elif message in ["STATUS", "HELP", "HI", "HELLO"]:
            response = await _handle_status_query(db, rider)
        
        # ── Default Response ───────────────────────────────────
        else:
            response = (
                f"Hey {rider.name.split()[0]}! 👋\n\n"
                f"Reply with:\n"
                f"• *STATUS* - Check your coverage & claims\n"
                f"• *1, 2, or 3* - Select a plan after receiving quote\n"
                f"• *SKIP* - Opt out this week\n"
                f"• Send a *video* to appeal a flagged claim\n\n"
                f"_Need help? Visit gigachad.in/support_"
            )
        
        await _send_message(phone, response)
    
    # Return empty TwiML (we handle responses via REST API)
    return Response(content="", media_type="text/xml")


# ══════════════════════════════════════════════════════════════
# MESSAGE HANDLERS
# ══════════════════════════════════════════════════════════════

async def _handle_plan_selection(db: AsyncSession, rider: Rider, selection: str) -> str:
    """Process plan selection (1=Basic, 2=Plus, 3=Pro)."""
    
    tier_map = {
        "1": PolicyTier.giga_basic,
        "2": PolicyTier.giga_plus,
        "3": PolicyTier.giga_pro,
    }
    tier = tier_map[selection]
    
    # Calculate week dates
    today = date.today()
    # Next Monday
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    week_start = today + timedelta(days=days_until_monday)
    week_end = week_start + timedelta(days=6)
    
    # Check for existing policy this week
    existing = await db.execute(
        select(Policy).where(and_(
            Policy.rider_id == rider.id,
            Policy.week_start == week_start,
        ))
    )
    if existing.scalar_one_or_none():
        return (
            f"⚠️ You already have a policy for the week of {week_start.strftime('%b %d')}!\n\n"
            f"Reply *STATUS* to check your coverage details."
        )
    
    # Get premium (in production, fetch from actuarial engine)
    premium_map = {
        PolicyTier.giga_basic: 49,
        PolicyTier.giga_plus: 99,
        PolicyTier.giga_pro: 149,
    }
    premium = premium_map[tier]
    payout_cap = tier.payout_cap
    
    # Create policy (payment pending)
    policy = Policy(
        rider_id=rider.id,
        tier=tier,
        premium_paid=premium,
        payout_cap=payout_cap,
        week_start=week_start,
        week_end=week_end,
        status=PolicyStatus.pending,  # Will activate after payment
    )
    db.add(policy)
    await db.commit()
    
    # Generate UPI payment link (Razorpay)
    payment_link = f"https://rzp.io/gigachad?amount={premium}&policy={policy.id}"
    
    tier_emoji = {"giga_basic": "🥉", "giga_plus": "🥈", "giga_pro": "🥇"}[tier.value]
    tier_name = {"giga_basic": "Basic", "giga_plus": "Plus", "giga_pro": "Pro"}[tier.value]
    
    return (
        f"{tier_emoji} *Giga {tier_name} Selected!*\n\n"
        f"📅 Coverage: {week_start.strftime('%b %d')} - {week_end.strftime('%b %d')}\n"
        f"💰 Premium: ₹{premium}\n"
        f"🛡️ Max Payout: ₹{payout_cap}\n\n"
        f"*Pay via UPI to activate:*\n"
        f"UPI ID: `gigachad@ybl`\n"
        f"Amount: ₹{premium}\n\n"
        f"_Or click: {payment_link}_\n\n"
        f"Your policy activates instantly after payment confirmation! ⚡"
    )


async def _handle_skip(rider: Rider) -> str:
    """Handle opt-out for the week."""
    return (
        f"Got it, {rider.name.split()[0]}! 👍\n\n"
        f"You've opted out of coverage this week.\n"
        f"We'll send you next week's quote on Sunday.\n\n"
        f"_Stay safe out there! 🛵_"
    )


async def _handle_video_appeal(db: AsyncSession, rider: Rider, video_url: str) -> str:
    """Process video appeal for soft-flagged claims."""
    
    # Find most recent soft-flagged claim
    result = await db.execute(
        select(Claim)
        .where(and_(
            Claim.rider_id == rider.id,
            Claim.status == ClaimStatus.soft_flagged,
        ))
        .order_by(Claim.created_at.desc())
        .limit(1)
    )
    claim = result.scalar_one_or_none()
    
    if not claim:
        return (
            "🤔 We couldn't find a pending claim that needs video verification.\n\n"
            "If you believe there's an error, reply *STATUS* to check your claims."
        )
    
    # Store video URL for manual review
    if not claim.fraud_flags:
        claim.fraud_flags = []
    claim.fraud_flags.append(f"[VIDEO_APPEAL] {video_url}")
    claim.fraud_flags.append(f"[APPEAL_TIME] {datetime.utcnow().isoformat()}")
    
    # Queue for manual review (in production, trigger admin notification)
    await db.commit()
    
    return (
        f"✅ *Video Received!*\n\n"
        f"We've received your verification video for claim `{str(claim.id)[:8]}`.\n\n"
        f"Our team will review and process your payout within *2 hours*.\n\n"
        f"_Thanks for your patience! 🙏_"
    )


async def _handle_status_query(db: AsyncSession, rider: Rider) -> str:
    """Return rider's current status, active policy, and recent claims."""
    
    today = date.today()
    
    # Get active policy
    policy_result = await db.execute(
        select(Policy).where(and_(
            Policy.rider_id == rider.id,
            Policy.status == PolicyStatus.active,
            Policy.week_start <= today,
            Policy.week_end >= today,
        ))
    )
    active_policy = policy_result.scalar_one_or_none()
    
    # Get recent claims (last 30 days)
    claims_result = await db.execute(
        select(Claim)
        .where(and_(
            Claim.rider_id == rider.id,
            Claim.created_at >= datetime.utcnow() - timedelta(days=30),
        ))
        .order_by(Claim.created_at.desc())
        .limit(5)
    )
    recent_claims = claims_result.scalars().all()
    
    # Build response
    name = rider.name.split()[0]
    
    # Coverage status
    if active_policy:
        tier_name = {"giga_basic": "Basic", "giga_plus": "Plus", "giga_pro": "Pro"}[active_policy.tier.value]
        coverage = (
            f"🛡️ *Active Coverage*\n"
            f"Plan: Giga {tier_name}\n"
            f"Valid: {active_policy.week_start.strftime('%b %d')} - {active_policy.week_end.strftime('%b %d')}\n"
            f"Max Payout: ₹{active_policy.payout_cap}\n"
        )
    else:
        coverage = "⚠️ *No Active Coverage*\nWait for Sunday's quote or visit gigachad.in to get protected!"
    
    # Claims summary
    if recent_claims:
        claims_text = "\n📋 *Recent Claims*\n"
        status_emoji = {
            "pending": "⏳", "approved": "✅", "soft_flagged": "🚩",
            "denied": "❌", "paid": "💰"
        }
        for c in recent_claims[:3]:
            emoji = status_emoji.get(c.status.value, "•")
            claims_text += f"{emoji} ₹{c.total_payout:.0f} - {c.status.value} ({c.created_at.strftime('%b %d')})\n"
    else:
        claims_text = "\n📋 No claims in the last 30 days"
    
    # Total earned
    total_paid = sum(c.total_payout for c in recent_claims if c.status == ClaimStatus.paid)
    
    return (
        f"Hey {name}! Here's your status:\n\n"
        f"{coverage}\n"
        f"{claims_text}\n"
        f"💵 *Total Received (30d)*: ₹{total_paid:.0f}\n\n"
        f"_Questions? Reply HELP_"
    )


# ══════════════════════════════════════════════════════════════
# PAYMENT WEBHOOK (Razorpay)
# ══════════════════════════════════════════════════════════════

@router.post("/razorpay/payment")
async def razorpay_payment_webhook(request: Request):
    """
    Handle Razorpay payment confirmation webhook.
    Activates the policy after successful payment.
    """
    import hmac
    import hashlib
    
    # Verify webhook signature
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    
    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    payload = await request.json()
    event = payload.get("event")
    
    if event == "payment.captured":
        payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
        notes = payment.get("notes", {})
        policy_id = notes.get("policy_id")
        
        if policy_id:
            async with AsyncSessionLocal() as db:
                policy = await db.get(Policy, policy_id)
                if policy and policy.status == PolicyStatus.pending:
                    policy.status = PolicyStatus.active
                    policy.razorpay_payment_id = payment.get("id")
                    await db.commit()
                    
                    # Notify rider
                    rider = await db.get(Rider, policy.rider_id)
                    if rider:
                        tier_name = {"giga_basic": "Basic", "giga_plus": "Plus", "giga_pro": "Pro"}[policy.tier.value]
                        await _send_message(rider.phone, (
                            f"🎉 *Payment Confirmed!*\n\n"
                            f"Your *Giga {tier_name}* plan is now ACTIVE!\n"
                            f"Coverage: {policy.week_start.strftime('%b %d')} - {policy.week_end.strftime('%b %d')}\n\n"
                            f"_You're protected. Ride safe! 🛵_"
                        ))
    
    return {"status": "ok"}
