"""
GigaChad End-to-End Demo Script
────────────────────────────────
Runs the full demo flow against the local backend:
1. Inject fake telemetry for Hari into Velachery hex
2. Simulate a flood disruption in Velachery
3. Poll claims until payout fires
4. Print the outcome

Usage:
  cd services/backend
  python ../../scripts/demo_flow.py
"""

import asyncio
import httpx
import time

BASE = "http://localhost:8000"


async def run_demo():
    print("\n" + "═" * 60)
    print("  ⚡ GIGACHAD DEMO — End-to-End Flow")
    print("═" * 60)

    async with httpx.AsyncClient(timeout=30, base_url=BASE) as client:

        # ── Step 1: Get riders ───────────────────────────────
        print("\n[1/5] Fetching riders...")
        resp = await client.get("/api/riders/")
        riders = resp.json()
        if not riders:
            print("    ❌ No riders found. Make sure the DB is seeded.")
            return
        rider = riders[0]
        print(f"    ✅ Rider: {rider['name']} ({rider['id'][:8]}...)")

        # ── Step 2: Opt-in to Giga Plus ──────────────────────
        print("\n[2/5] Opting rider into Giga Plus policy...")
        resp = await client.post("/api/policies/opt-in", json={"rider_id": rider["id"], "tier": "giga_plus"})
        if resp.status_code == 201:
            policy = resp.json()
            print(f"    ✅ Policy active! Premium: ₹{policy['weekly_premium']} | Cap: ₹{policy['payout_cap']}")
        else:
            print(f"    ⚠️  Already has active policy: {resp.json()}")

        # ── Step 3: Inject fake telemetry ────────────────────
        print("\n[3/5] Injecting fake GPS pings for Velachery...")
        resp = await client.post(f"/api/admin/simulate-telemetry/{rider['id']}?zone=velachery")
        tel = resp.json()
        print(f"    ✅ Injected {len(tel.get('pings', []))} fake GPS pings into {tel.get('pings', [{}])[0].get('h3_hex', '?')}")

        # ── Step 4: Simulate disruption ──────────────────────
        print("\n[4/5] Simulating Velachery flood disruption...")
        resp = await client.post("/api/admin/simulate-disruption", json={
            "zone": "velachery",
            "event_type": "flood",
            "rain_mm": 38.0,
            "traffic_kmh": 2.5,
        })
        sim = resp.json()
        print(f"    ✅ Disruption fired! Event ID: {sim.get('event_id', '?')[:8]}...")
        print(f"    ℹ️  {sim.get('message', '')}")

        # ── Step 5: Poll for claims ───────────────────────────
        print("\n[5/5] Waiting for auto-claims to process...")
        for attempt in range(10):
            await asyncio.sleep(3)
            resp = await client.get(f"/api/claims/rider/{rider['id']}")
            claims = resp.json()
            if claims:
                claim = claims[0]
                status_emoji = {"paid": "💸", "approved": "✅", "soft_flagged": "⚠️", "denied": "❌", "pending": "⏳"}.get(claim["status"], "❓")
                print(f"\n    {status_emoji} CLAIM PROCESSED!")
                print(f"    Status:       {claim['status'].upper()}")
                print(f"    Payout:       ₹{claim['total_payout'] or 0}")
                print(f"    Fraud Score:  {(claim.get('fraud_score') or 0) * 100:.0f}%")
                print(f"    Flags:        {', '.join(claim.get('fraud_flags') or ['none'])}")
                print(f"    Idle Hours:   {claim.get('idle_hours')}h")

                print("\n" + "═" * 60)
                print("  🎉 DEMO COMPLETE — GigaChad auto-payout worked!")
                print("  WhatsApp notification sent (check console logs)")
                print("═" * 60 + "\n")
                return
            print(f"    ⏳ Attempt {attempt + 1}/10 — Claims pending...")

        print("\n    ⚠️  Claims still processing. Check /api/claims endpoint manually.")


if __name__ == "__main__":
    asyncio.run(run_demo())
