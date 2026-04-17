"""
GigaChad WhatsApp Notification Service
Uses Twilio's WhatsApp Sandbox to send real-time alerts to riders.
"""
from twilio.rest import Client
from config import get_settings
import asyncio
from functools import partial

settings = get_settings()

def _get_client():
    if not settings.twilio_account_sid or settings.twilio_account_sid.startswith("your_"):
        return None
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


def _send_sync(to_phone: str, message: str):
    """Synchronous Twilio send (runs in thread pool)."""
    client = _get_client()
    if not client:
        print(f"[WhatsApp] Twilio not configured — skipping message to {to_phone}")
        return

    # Ensure phone is in E.164 format
    if not to_phone.startswith("+"):
        to_phone = f"+91{to_phone}"  # Fallback to India prefix

    try:
        msg = client.messages.create(
            from_=settings.twilio_whatsapp_number,          # whatsapp:+14155238886
            to=f"whatsapp:{to_phone}",
            body=message,
        )
        print(f"[WhatsApp] ✅ Sent to {to_phone} — SID: {msg.sid}")
    except Exception as e:
        print(f"[WhatsApp] ❌ Failed to send to {to_phone}: {e}")


async def send_whatsapp(to_phone: str, message: str):
    """Non-blocking async wrapper — won't slow down API responses."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, partial(_send_sync, to_phone, message))


# ── Pre-built message templates ──────────────────────────────────────────────

async def notify_shift_started(rider_name: str, phone: str, zone: str):
    msg = (
        f"🛡️ *GigaChad Shield ACTIVE!*\n\n"
        f"Hey {rider_name}! Your shift has started.\n"
        f"📍 Zone: {zone.replace('_', ' ').title()}\n\n"
        f"Your income is now protected. Ride safe! 🏍️\n"
        f"_GigaChad AI is watching your zone for disruptions._"
    )
    await send_whatsapp(phone, msg)


async def notify_disruption_alert(rider_name: str, phone: str, zone: str, event_type: str, severity: str):
    emoji = {"flood": "🌊", "traffic_gridlock": "🚦", "strike": "✊", "vvip_movement": "🚔"}.get(event_type, "⚠️")
    msg = (
        f"{emoji} *DISRUPTION ALERT — {event_type.replace('_', ' ').upper()}*\n\n"
        f"Hey {rider_name}, a *{severity}* disruption has been detected in your zone!\n"
        f"📍 Zone: {zone.replace('_', ' ').title()}\n\n"
        f"✅ Your GigaChad policy is actively monitoring this.\n"
        f"If you're idle, a *payout claim will be raised automatically.*\n\n"
        f"_Stay safe. GigaChad has your back._"
    )
    await send_whatsapp(phone, msg)


async def notify_payout(rider_name: str, phone: str, amount: float, status: str):
    if status == "paid":
        msg = (
            f"💸 *PAYOUT CONFIRMED!*\n\n"
            f"Hey {rider_name}! Your claim has been approved.\n\n"
            f"✅ *₹{amount:.0f}* has been credited to your UPI.\n\n"
            f"Thank you for trusting GigaChad Income Shield 🛡️\n"
            f"_Start your next shift to stay protected._"
        )
    elif status == "denied":
        msg = (
            f"❌ *Claim Update*\n\n"
            f"Hey {rider_name}, after our AI review, your recent claim could not be approved.\n\n"
            f"You can appeal by submitting a 10-second video in the GigaChad app.\n"
            f"_We're always here to support you._"
        )
    else:
        return
    await send_whatsapp(phone, msg)


async def notify_shift_summary(rider_name: str, phone: str, ping_count: int, zone: str, payout_earned: float):
    msg = (
        f"📊 *Shift Summary*\n\n"
        f"Great work today, {rider_name}! 🎉\n\n"
        f"📍 Zone: {zone.replace('_', ' ').title()}\n"
        f"📡 Location pings sent: *{ping_count}*\n"
        f"💰 Payouts this shift: *₹{payout_earned:.0f}*\n"
        f"🛡️ Protection status: *Active*\n\n"
        f"_Ride Safe. See you on the next shift!_ ⚡"
    )
    await send_whatsapp(phone, msg)
