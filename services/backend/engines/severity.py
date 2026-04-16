"""
Severity Classification Engine
───────────────────────────────
Composite severity scoring system for disruption events.

1. Compute composite severity index (0-100) from weighted signals
2. Classify into severity labels (minor/moderate/severe/catastrophic)
3. Return continuous sigmoid payout multiplier (0.3x - 1.5x)
4. Use hex-grid calibration for location-aware thresholds

Formula:
  Score = (0.40 × Rain_Percentile) + (0.35 × Traffic_Impact) +
          (0.15 × Social_Signal) + (0.10 × Duration_Factor)

Multiplier:
  multiplier = 0.3 + (1.2 / (1 + exp(-10 × (normalized_score - 0.6))))
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Optional


# ─── Severity Label Thresholds ──────────────────────────────
SEVERITY_THRESHOLDS = {
    "minor": (0, 25),
    "moderate": (25, 50),
    "severe": (50, 75),
    "catastrophic": (75, 100),
}

# ─── Default historical baselines (when hex profile unavailable) ───
DEFAULT_BASELINE = {
    "flood_threshold_mm": 30.0,
    "drainage_efficiency": 0.5,
    "historical_cancel_correlation": 0.5,
    "seasonal_adjustment": 1.0,
}

# ─── Seasonal rain baselines for Chennai (mm/hour P95 by month) ───
# Used to compute rain percentile relative to season
SEASONAL_RAIN_P95 = {
    1: 15.0, 2: 10.0, 3: 12.0, 4: 20.0, 5: 30.0, 6: 45.0,
    7: 50.0, 8: 55.0, 9: 60.0, 10: 75.0, 11: 90.0, 12: 60.0,
}


def compute_composite_severity(
    rain_mm: float = 0.0,
    traffic_kmh: float = 999.0,
    social_confidence: float = 0.0,
    duration_hours: float = 0.0,
    hex_profile: Optional[HexRiskProfile] = None,
    month: Optional[int] = None,
) -> float:
    """
    Compute composite severity index (0-100) from weighted signals.

    Uses hex-grid calibrated thresholds when available, falling back
    to seasonal defaults.
    """
    if month is None:
        month = datetime.utcnow().month

    rain_pct = _get_rain_percentile(rain_mm, hex_profile, month)
    traffic_impact = _get_traffic_impact(traffic_kmh)
    social_signal = min(social_confidence, 1.0) * 100.0
    duration_factor = _get_duration_factor(duration_hours)

    # Weighted composite: sum = 0.40 + 0.35 + 0.15 + 0.10 = 1.0
    score = (
        0.40 * rain_pct +
        0.35 * traffic_impact +
        0.15 * social_signal +
        0.10 * duration_factor
    )

    # Apply drainage efficiency penalty if hex profile available
    # Poor drainage (low score) amplifies severity
    if hex_profile and hex_profile.drainage_efficiency is not None:
        drainage = float(hex_profile.drainage_efficiency)
        # drainage=0.0 → 1.3x amplification, drainage=1.0 → 1.0x (no change)
        drainage_amplifier = 1.0 + (1.0 - drainage) * 0.3
        score = score * drainage_amplifier

    return round(min(max(score, 0.0), 100.0), 2)


def classify_severity(score: float):
    """Classify a composite score (0-100) into a severity label."""
    from models import DisruptionSeverity
    if score >= 75:
        return DisruptionSeverity.catastrophic
    elif score >= 50:
        return DisruptionSeverity.severe
    elif score >= 25:
        return DisruptionSeverity.moderate
    else:
        return DisruptionSeverity.minor


def get_continuous_multiplier(score: float) -> float:
    """
    Compute continuous payout multiplier using sigmoid curve.

    Input:  composite score (0-100)
    Output: multiplier (0.3 to 1.5, smooth, no cliff effects)

    Formula: 0.3 + (1.2 / (1 + exp(-10 × (normalized_score - 0.6))))
    """
    normalized = score / 100.0  # Scale to 0-1
    exponent = -10.0 * (normalized - 0.6)

    # Clamp exponent to prevent overflow
    exponent = max(min(exponent, 50.0), -50.0)

    multiplier = 0.3 + (1.2 / (1.0 + math.exp(exponent)))
    return round(multiplier, 4)


def get_severity_label_and_multiplier(
    rain_mm: float = 0.0,
    traffic_kmh: float = 999.0,
    social_confidence: float = 0.0,
    duration_hours: float = 0.0,
    hex_profile: Optional[HexRiskProfile] = None,
    month: Optional[int] = None,
) -> dict:
    """
    All-in-one: compute composite score, classify severity, and get multiplier.
    Returns a dict with all severity information for storage/display.
    """
    score = compute_composite_severity(
        rain_mm=rain_mm,
        traffic_kmh=traffic_kmh,
        social_confidence=social_confidence,
        duration_hours=duration_hours,
        hex_profile=hex_profile,
        month=month,
    )
    severity = classify_severity(score)
    multiplier = get_continuous_multiplier(score)

    return {
        "composite_score": score,
        "severity": severity,
        "severity_label": severity.value,
        "multiplier": multiplier,
    }


# ─── Internal Signal Processors ─────────────────────────────

def _get_rain_percentile(
    rain_mm: float,
    hex_profile: Optional[HexRiskProfile],
    month: int,
) -> float:
    """
    Compute rain severity as a percentile (0-100) relative to
    hex-grid threshold and seasonal baseline.

    Uses calibrated flood_threshold_mm × seasonal_adjustment when
    hex profile is available, otherwise uses seasonal P95 values.
    """
    if rain_mm <= 0:
        return 0.0

    # Determine baseline threshold
    if hex_profile:
        threshold = float(hex_profile.flood_threshold_mm or 30.0)
        seasonal_adj = float(hex_profile.seasonal_adjustment or 1.0)
        effective_threshold = threshold * seasonal_adj
    else:
        # Use seasonal P95 as reference
        effective_threshold = SEASONAL_RAIN_P95.get(month, 30.0)

    if effective_threshold <= 0:
        effective_threshold = 30.0

    # Percentile: how far rain_mm is relative to threshold
    # At threshold → 50th percentile, 2× threshold → ~90th, 3× → ~98th
    # Using logistic scaling for smooth curve
    ratio = rain_mm / effective_threshold
    percentile = 100.0 / (1.0 + math.exp(-3.0 * (ratio - 1.0)))

    return round(min(percentile, 100.0), 2)


def _get_traffic_impact(traffic_kmh: float) -> float:
    """
    Compute traffic impact as inverted percentile (0-100).
    Lower speed → higher impact.

    Mapping:
      >= 30 km/h → 0 (normal flow)
      15 km/h    → ~25 (slow)
      5 km/h     → ~75 (gridlock)
      0 km/h     → 100 (complete halt)
    """
    if traffic_kmh >= 30:
        return 0.0
    if traffic_kmh <= 0:
        return 100.0

    # Inverted exponential: rapid increase as speed drops below 10
    impact = 100.0 * (1.0 - (traffic_kmh / 30.0)) ** 1.5
    return round(min(max(impact, 0.0), 100.0), 2)


def _get_duration_factor(duration_hours: float) -> float:
    """
    Compute duration factor (0-100), capped at 4 hours.

    Mapping:
      0h   → 0
      1h   → 25
      2h   → 50
      3h   → 75
      4h+  → 100
    """
    capped = min(duration_hours, 4.0)
    return round((capped / 4.0) * 100.0, 2)


# ─── Database Helper ─────────────────────────────────────────

async def get_hex_profile(db, h3_hex: str):
    """Fetch hex-grid risk profile from DB, returns None if not calibrated."""
    from sqlalchemy import select
    from models import HexRiskProfile
    result = await db.execute(
        select(HexRiskProfile).where(HexRiskProfile.h3_index == h3_hex)
    )
    return result.scalar_one_or_none()
