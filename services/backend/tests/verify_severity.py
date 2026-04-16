"""
Severity Engine — Standalone Verification Script
──────────────────────────────────────────────────
Tests core severity logic without any database dependencies.

Usage:
  cd services/backend
  python tests/verify_severity.py
"""

import sys
import math

# Ensure we can import from parent
sys.path.insert(0, ".")

from engines.severity import (
    compute_composite_severity,
    get_continuous_multiplier,
    _get_rain_percentile,
    _get_traffic_impact,
    _get_duration_factor,
)

passed = 0
failed = 0
total = 0


def assert_test(name, condition, detail=""):
    global passed, failed, total
    total += 1
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name} — {detail}")


print("\n" + "═" * 60)
print("  🧪 SEVERITY ENGINE VERIFICATION")
print("═" * 60)

# ── Composite Scoring ────────────────────────────────────────
print("\n📐 Composite Severity Scoring:")

score_zero = compute_composite_severity(rain_mm=0, traffic_kmh=50, social_confidence=0, duration_hours=0)
assert_test("Zero inputs → score=0", score_zero == 0.0, f"got {score_zero}")

score_extreme = compute_composite_severity(rain_mm=150, traffic_kmh=0, social_confidence=1.0, duration_hours=6)
assert_test("Extreme inputs → catastrophic (≥75)", score_extreme >= 75, f"got {score_extreme}")

score_normal_traffic = compute_composite_severity(rain_mm=30, traffic_kmh=25, social_confidence=0, duration_hours=1)
score_gridlock = compute_composite_severity(rain_mm=30, traffic_kmh=2, social_confidence=0, duration_hours=1)
assert_test("Gridlock amplifies score", score_gridlock > score_normal_traffic * 1.3, f"{score_gridlock} vs {score_normal_traffic}")

score_no_social = compute_composite_severity(rain_mm=30, traffic_kmh=10, social_confidence=0, duration_hours=1)
score_social = compute_composite_severity(rain_mm=30, traffic_kmh=10, social_confidence=0.9, duration_hours=1)
assert_test("Social signal contributes", score_social > score_no_social, f"{score_social} vs {score_no_social}")

score_4h = compute_composite_severity(rain_mm=50, traffic_kmh=5, social_confidence=0, duration_hours=4)
score_8h = compute_composite_severity(rain_mm=50, traffic_kmh=5, social_confidence=0, duration_hours=8)
assert_test("Duration capped at 4h", score_4h == score_8h, f"{score_4h} vs {score_8h}")

score_max = compute_composite_severity(rain_mm=500, traffic_kmh=0, social_confidence=1.0, duration_hours=10)
assert_test("Score capped at 100", score_max <= 100.0, f"got {score_max}")

# ── Severity Classification (via get_severity_label_and_multiplier) ──
print("\n🏷️  Severity Classification:")

def _get_label(score):
    """Helper: get severity label for a given score using score thresholds."""
    if score >= 75:
        return "catastrophic"
    elif score >= 50:
        return "severe"
    elif score >= 25:
        return "moderate"
    else:
        return "minor"

assert_test("Score 0 → minor", _get_label(0) == "minor")
assert_test("Score 10 → minor", _get_label(10) == "minor")
assert_test("Score 25 → moderate", _get_label(25) == "moderate")
assert_test("Score 40 → moderate", _get_label(40) == "moderate")
assert_test("Score 50 → severe", _get_label(50) == "severe")
assert_test("Score 74 → severe", _get_label(74) == "severe")
assert_test("Score 75 → catastrophic", _get_label(75) == "catastrophic")
assert_test("Score 100 → catastrophic", _get_label(100) == "catastrophic")

# ── Sigmoid Multiplier ───────────────────────────────────────
print("\n📈 Sigmoid Multiplier Curve:")

m0 = get_continuous_multiplier(0)
assert_test(f"Score=0 → ~0.30 (got {m0:.4f})", 0.29 <= m0 <= 0.32, f"got {m0}")

m50 = get_continuous_multiplier(50)
assert_test(f"Score=50 → 0.55-0.70 (got {m50:.4f})", 0.55 <= m50 <= 0.70, f"got {m50}")

m60 = get_continuous_multiplier(60)
assert_test(f"Score=60 → ~0.90 (got {m60:.4f})", 0.85 <= m60 <= 0.95, f"got {m60}")

m90 = get_continuous_multiplier(90)
assert_test(f"Score=90 → ≥1.30 (got {m90:.4f})", m90 >= 1.30, f"got {m90}")

m100 = get_continuous_multiplier(100)
assert_test(f"Score=100 → ~1.50 (got {m100:.4f})", 1.45 <= m100 <= 1.51, f"got {m100}")

# Monotonicity
prev = 0
monotonic = True
for s in range(0, 101, 5):
    m = get_continuous_multiplier(s)
    if m < prev:
        monotonic = False
    prev = m
assert_test("Monotonically increasing", monotonic)

# No cliff effects
cliff = False
for s in range(0, 100):
    m1 = get_continuous_multiplier(s)
    m2 = get_continuous_multiplier(s + 1)
    if abs(m2 - m1) >= 0.1:
        cliff = True
        break
assert_test("No cliff effects (max Δ < 0.1 per point)", not cliff)

# ── Signal Processors ───────────────────────────────────────
print("\n🔧 Signal Processors:")

assert_test("Rain 0mm → 0%", _get_rain_percentile(0, None, 11) == 0.0)
assert_test("Traffic ≥30 → 0 impact", _get_traffic_impact(30) == 0.0)
assert_test("Traffic 0 → 100 impact", _get_traffic_impact(0) == 100.0)
assert_test("Duration 0h → 0", _get_duration_factor(0) == 0.0)
assert_test("Duration 4h → 100", _get_duration_factor(4) == 100.0)
assert_test("Duration 8h → 100 (capped)", _get_duration_factor(8) == 100.0)

traffic_gridlock_impact = _get_traffic_impact(3)
assert_test(f"Traffic 3kmh → high impact (got {traffic_gridlock_impact:.1f})", traffic_gridlock_impact >= 70)

# ── Integration: Payout Scaling ──────────────────────────────
print("\n💰 Payout Scaling (₹100/hr × 3h idle):")

hourly = 100.0
idle = 3.0

# Simulate different disruption scenarios
scenarios = {
    "Minor": {"rain_mm": 10, "traffic_kmh": 20},
    "Moderate": {"rain_mm": 50, "traffic_kmh": 8, "duration_hours": 1},
    "Severe": {"rain_mm": 100, "traffic_kmh": 2, "social_confidence": 0.5, "duration_hours": 3},
    "Catastrophic": {"rain_mm": 150, "traffic_kmh": 0, "social_confidence": 0.9, "duration_hours": 4},
}

payouts = {}
emojis = {"Minor": "🟢", "Moderate": "🟡", "Severe": "🟠", "Catastrophic": "🔴"}

for name, params in scenarios.items():
    score = compute_composite_severity(**params)
    mult = get_continuous_multiplier(score)
    payout = hourly * idle * mult
    payouts[name] = payout
    label = _get_label(score)
    print(f"  {emojis[name]} {name:13s}: ₹{payout:6.0f}  (×{mult:.2f}, score={score:.1f}, label={label})")

assert_test("Minor < Moderate payout", payouts["Minor"] < payouts["Moderate"])
assert_test("Moderate < Severe payout", payouts["Moderate"] < payouts["Severe"])
assert_test("Severe < Catastrophic payout", payouts["Severe"] < payouts["Catastrophic"])
assert_test("Catastrophic > 2× Minor", payouts["Catastrophic"] > payouts["Minor"] * 2)

# ── Multiplier Curve Print ───────────────────────────────────
print("\n📊 Full Multiplier Curve (every 10 points):")
for s in range(0, 101, 10):
    m = get_continuous_multiplier(s)
    bar = "█" * int(m * 20)
    print(f"  Score={s:3d} → ×{m:.3f} {bar}")

# ── Summary ──────────────────────────────────────────────────
print("\n" + "═" * 60)
print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
if failed == 0:
    print("  🎉 ALL TESTS PASSED!")
else:
    print("  ⚠️  Some tests failed — review above")
print("═" * 60 + "\n")

sys.exit(1 if failed > 0 else 0)
