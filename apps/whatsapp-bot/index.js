require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

// In-memory session state per phone number
const sessions = {};

// ── Incoming WhatsApp Message Handler ────────────────────────
app.post("/webhook/whatsapp", async (req, res) => {
  const from = req.body.From;        // e.g. "whatsapp:+919876543210"
  const body = (req.body.Body || "").trim().toLowerCase();
  const phone = from.replace("whatsapp:", "");

  console.log(`📱 Message from ${phone}: "${body}"`);

  let reply = "";

  try {
    if (body === "hi" || body === "hello" || body === "start") {
      reply = await handleGreeting(phone);
    } else if (["1", "basic", "giga basic"].includes(body)) {
      reply = await handleOptIn(phone, "giga_basic");
    } else if (["2", "plus", "giga plus"].includes(body)) {
      reply = await handleOptIn(phone, "giga_plus");
    } else if (["3", "pro", "giga pro"].includes(body)) {
      reply = await handleOptIn(phone, "giga_pro");
    } else if (body === "status") {
      reply = await handleStatus(phone);
    } else if (body === "claims") {
      reply = await handleClaims(phone);
    } else if (body === "skip") {
      reply = "No problem! We'll reach out again next Sunday 🙏\nStay safe on the roads today!";
    } else {
      reply = await handleDefault(body, phone);
    }
  } catch (err) {
    console.error("Handler error:", err.message);
    reply = "Oops! Something went wrong. Please try again in a moment 🙏";
  }

  await sendReply(from, reply);
  res.status(200).send("OK");
});

// ── Handlers ─────────────────────────────────────────────────

async function handleGreeting(phone) {
  // Try to find the rider
  let riderId;
  try {
    const resp = await axios.get(`${BACKEND_URL}/api/riders/`);
    const rider = resp.data.find(r => r.phone === phone);
    if (rider) riderId = rider.id;
  } catch (e) {}

  // Fetch current week quote
  let quote;
  try {
    const resp = await axios.get(`${BACKEND_URL}/api/policies/current-quote`);
    quote = resp.data;
  } catch (e) {
    quote = {
      ai_risk_score: 0.5,
      tiers: {
        giga_basic: { premium: 19, cap: 300 },
        giga_plus: { premium: 39, cap: 600 },
        giga_pro: { premium: 59, cap: 1000 },
      }
    };
  }

  const riskPct = Math.round((quote.ai_risk_score || 0.5) * 100);
  const riskEmoji = riskPct > 65 ? "🌧️ High risk week!" : riskPct > 40 ? "⛅ Medium risk" : "☀️ Looking clear!";
  const { basic, plus, pro } = {
    basic: quote.tiers.giga_basic,
    plus: quote.tiers.giga_plus,
    pro: quote.tiers.giga_pro,
  };

  return `🛡️ *Welcome to GigaChad!*
_The AI-Powered Income Shield for Chennai Delivery Partners_

${riskEmoji} AI Risk Score: ${riskPct}%

This week's protection plans:
🥉 *1. Giga Basic* — ₹${basic.premium}/week → ₹${basic.cap} coverage
🥈 *2. Giga Plus* — ₹${plus.premium}/week → ₹${plus.cap} coverage  
🥇 *3. Giga Pro* — ₹${pro.premium}/week → ₹${pro.cap} coverage

Reply *1*, *2*, or *3* to activate your shield 💪
Reply *STATUS* to check active policy
Reply *CLAIMS* to see your payouts`;
}

async function handleOptIn(phone, tier) {
  try {
    // Find rider by phone
    const resp = await axios.get(`${BACKEND_URL}/api/riders/`);
    const rider = resp.data.find(r => r.phone === phone);
    if (!rider) {
      return `We couldn't find your account. Please contact support or re-register 🙏`;
    }

    const optResp = await axios.post(`${BACKEND_URL}/api/policies/opt-in`, {
      rider_id: rider.id,
      tier: tier,
    });

    const policy = optResp.data;
    const tierName = { giga_basic: "Giga Basic 🥉", giga_plus: "Giga Plus 🥈", giga_pro: "Giga Pro 🥇" }[tier];

    return `✅ *${tierName} activated!*

📅 Coverage: ${policy.week_start} → ${policy.week_end}
💰 Premium: ₹${policy.weekly_premium}/week
🛡️ Payout cap: ₹${policy.payout_cap} per event

_You're now protected from floods, strikes, and gridlocks._
_Payouts happen automatically — zero forms needed!_ 🚀

Stay safe on the roads, bro 🙏`;
  } catch (err) {
    return `Couldn't activate policy: ${err.response?.data?.detail || err.message}`;
  }
}

async function handleStatus(phone) {
  try {
    const resp = await axios.get(`${BACKEND_URL}/api/riders/`);
    const rider = resp.data.find(r => r.phone === phone);
    if (!rider) return "No account found for this number.";

    const polResp = await axios.get(`${BACKEND_URL}/api/policies/rider/${rider.id}`);
    const active = polResp.data.find(p => p.status === "active");
    if (!active) {
      return `No active policy this week 😕\nSend *HI* to see this week's plans!`;
    }

    return `✅ *Active Policy: ${{ giga_basic: "Giga Basic", giga_plus: "Giga Plus", giga_pro: "Giga Pro" }[active.tier]}*
📅 Valid: ${active.week_start} → ${active.week_end}
🛡️ Cap: ₹${active.payout_cap} per event
⚡ Status: PROTECTED

_You're covered! Rest easy and deliver hard._ 💪`;
  } catch (err) {
    return `Error fetching status: ${err.message}`;
  }
}

async function handleClaims(phone) {
  try {
    const resp = await axios.get(`${BACKEND_URL}/api/riders/`);
    const rider = resp.data.find(r => r.phone === phone);
    if (!rider) return "No account found.";

    const clResp = await axios.get(`${BACKEND_URL}/api/claims/rider/${rider.id}`);
    const claims = clResp.data.slice(0, 5);

    if (!claims.length) {
      return `No claims yet!\n_Good news: that means Chennai's been behaving._ ☀️`;
    }

    const lines = claims.map(c => {
      const emoji = { paid: "✅", approved: "✅", soft_flagged: "⚠️", denied: "❌", pending: "⏳" }[c.status] || "❓";
      return `${emoji} ₹${c.total_payout || 0} — ${c.status} (${c.created_at?.split("T")[0]})`;
    }).join("\n");

    return `📋 *Your Recent Claims:*\n\n${lines}`;
  } catch (err) {
    return `Error fetching claims: ${err.message}`;
  }
}

async function handleDefault(body, phone) {
  // Check for video/media appeal submission
  if (body.includes("http") || body.startsWith("appeal")) {
    return `📹 Video received! Our team will review it within 1 hour.\nIf genuine, your payout will be processed immediately. 🙏`;
  }
  return `I didn't understand that. Here's what I can do:\n
📋 *HI* — See this week's plans
📊 *STATUS* — Check active policy
💸 *CLAIMS* — See your payouts
🔢 *1/2/3* — Opt into a plan`;
}

// ── Send Reply ────────────────────────────────────────────────
async function sendReply(to, message) {
  if (!process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID === "your_twilio_account_sid") {
    console.log(`\n[SIMULATED REPLY → ${to}]\n${message}\n${"─".repeat(50)}`);
    return;
  }
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886",
    to: to,
    body: message,
  });
}

// ── Health Check ──────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", service: "gigachad-whatsapp-bot" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🤖 GigaChad WhatsApp Bot running on :${PORT}`));
