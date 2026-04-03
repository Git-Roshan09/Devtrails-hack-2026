"""
WhatsApp Notification Engine (Twilio)
──────────────────────────────────────
Sends templated messages to riders via Twilio WhatsApp Sandbox.
All messages support Tamil/Tanglish with English fallback.
"""

from config import get_settings

settings = get_settings()


def _get_twilio_client():
    from twilio.rest import Client
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


async def send_whatsapp_payout(phone: str, name: str, amount: float, zone: str, event_type: str):
    """
    Notify rider of successful auto-payout.
    """
    first_name = name.split()[0]
    event_emoji = {"flood": "🌊", "strike": "✊", "vvip_movement": "🚔", "traffic_gridlock": "🚧"}.get(event_type, "⚡")

    message = (
        f"Hi {first_name}! 🤙\n\n"
        f"{event_emoji} *GigaChad Auto-Claim Processed!*\n\n"
        f"We detected a disruption in *{zone}* that halted your deliveries.\n\n"
        f"💸 *₹{amount:.0f}* has been credited to your UPI account.\n\n"
        f"_Zero forms. Zero waiting. That's the GigaChad promise._ 💪\n\n"
        f"Stay safe bro! 🙏"
    )
    return await _send_message(phone, message)


async def send_whatsapp_soft_flag(phone: str, name: str, claim_id: str):
    """
    Notify rider that their claim is soft-flagged and needs video verification.
    """
    first_name = name.split()[0]
    message = (
        f"Hey {first_name}, we need your help 🙏\n\n"
        f"Our system flagged your claim for manual review (Claim ID: `{claim_id[:8]}`)\n\n"
        f"📹 *Please send a 10-second video* of the current road/weather condition "
        f"to help us verify and approve your payout instantly.\n\n"
        f"_Reply with your video here_ 👇"
    )
    return await _send_message(phone, message)


async def send_whatsapp_premium_quote(phone: str, name: str, basic: float, plus: float, pro: float, risk_note: str = ""):
    """
    Sunday weekly opt-in message with dynamic premiums.
    """
    first_name = name.split()[0]
    message = (
        f"Good Morning {first_name}! ☀️\n\n"
        f"*GigaChad Weekly Protection — This Week's Quote*\n"
        f"{risk_note}\n\n"
        f"🥉 *Giga Basic* — ₹{basic:.0f}/week → ₹300 coverage\n"
        f"🥈 *Giga Plus* — ₹{plus:.0f}/week → ₹600 coverage\n"
        f"🥇 *Giga Pro* — ₹{pro:.0f}/week → ₹1,000 coverage\n\n"
        f"Reply *1* for Basic, *2* for Plus, *3* for Pro\n"
        f"Or reply *SKIP* to opt out this week.\n\n"
        f"_Protecting you from Chennai's storms 🌧️_"
    )
    return await _send_message(phone, message)


async def send_whatsapp_storm_warning(phone: str, name: str, zone: str, minutes: int, alternative_zone: str = "Alwarpet"):
    """
    Proactive warning before a disruption hits.
    """
    first_name = name.split()[0]
    message = (
        f"⚠️ *Storm Alert for {first_name}!*\n\n"
        f"Heavy rain predicted in *{zone}* in ~{minutes} minutes.\n\n"
        f"📍 _Move to {alternative_zone}_ to maintain your orders.\n\n"
        f"_If you stay, your income protection is active and will trigger automatically._ 🛡️"
    )
    return await _send_message(phone, message)


async def _send_message(to_phone: str, body: str) -> dict:
    """
    Send a WhatsApp message via Twilio.
    Falls back to console log if credentials are missing (dev mode).
    """
    if not settings.twilio_account_sid or settings.twilio_account_sid == "your_twilio_account_sid":
        print(f"\n📱 [WhatsApp SIMULATED] → {to_phone}\n{body}\n{'─'*50}")
        return {"status": "simulated", "to": to_phone}

    try:
        client = _get_twilio_client()
        msg = client.messages.create(
            from_=settings.twilio_whatsapp_number,
            to=f"whatsapp:{to_phone}",
            body=body,
        )
        return {"status": "sent", "sid": msg.sid, "to": to_phone}
    except Exception as e:
        print(f"❌ Twilio error: {e}")
        return {"status": "error", "error": str(e)}
