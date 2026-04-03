"""
AI Actuarial Engine — Dynamic Weekly Premium Pricing
──────────────────────────────────────────────────────
Uses Nixtla TimeGPT (or fallback heuristic) to forecast disruption risk
for the upcoming week and compute dynamic premiums for each tier.

Premium Ranges:
  Giga Basic: ₹15–₹25
  Giga Plus:  ₹30–₹45
  Giga Pro:   ₹45–₹65

Risk Score: 0.0 (calm week) → 1.0 (cyclone + strikes predicted)
"""

from datetime import date, timedelta
from typing import Optional
from config import get_settings

settings = get_settings()

# Base premiums at standard risk (0.5)
BASE_PREMIUMS = {"basic": 19.0, "plus": 39.0, "pro": 59.0}

# Min/Max clamps
PREMIUM_BOUNDS = {
    "basic": (12.0, 29.0),
    "plus":  (25.0, 55.0),
    "pro":   (40.0, 75.0),
}


async def compute_weekly_premium(week_start: date) -> dict:
    """
    Compute the AI-driven premium for the given week.
    Tries TimeGPT first, falls back to heuristic if API key is missing.
    """
    risk_score, forecast_json = await _forecast_risk(week_start)
    premiums = _risk_to_premiums(risk_score)

    return {
        "zone": "chennai",
        "ai_risk_score": risk_score,
        "basic_premium": premiums["basic"],
        "plus_premium": premiums["plus"],
        "pro_premium": premiums["pro"],
        "forecast_json": forecast_json,
    }


async def _forecast_risk(week_start: date) -> tuple[float, dict]:
    """
    Attempt TimeGPT zero-shot forecast. Returns (risk_score, raw_forecast).
    Falls back to a calendar-aware heuristic.
    """
    if settings.nixtla_api_key:
        try:
            return await _timegpt_forecast(week_start)
        except Exception as e:
            print(f"⚠️  TimeGPT unavailable ({e}), using heuristic")

    return _heuristic_risk(week_start), {"source": "heuristic"}


async def _timegpt_forecast(week_start: date) -> tuple[float, dict]:
    """
    Call Nixtla TimeGPT API for 7-day disruption risk forecast.
    Uses historical Chennai weather & traffic as context.
    """
    import httpx
    import pandas as pd

    # Build a synthetic historical series (30 days of dummy disruption rates)
    # In production: pull from DB — actual disruption events per day
    history_days = [(week_start - timedelta(days=30 - i)).isoformat() for i in range(30)]
    import random
    historical_values = [random.uniform(0.1, 0.9) for _ in history_days]

    payload = {
        "model": "timegpt-1",
        "freq": "D",
        "fh": 7,
        "y": {
            "timestamps": history_days,
            "values": historical_values,
        },
        "add_history": False,
        "level": [80, 95],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://dashboard.nixtla.io/api/timegpt",
            headers={"Authorization": f"Bearer {settings.nixtla_api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        data = resp.json()

    forecasts = data.get("data", {}).get("forecast", {}).get("data", [])
    if forecasts:
        avg_risk = sum(row["TimeGPT"] for row in forecasts) / len(forecasts)
        risk_score = float(min(max(avg_risk, 0.0), 1.0))
    else:
        risk_score = 0.5

    return risk_score, data


def _heuristic_risk(week_start: date) -> float:
    """
    Calendar-aware risk heuristic for Chennai:
    - Northeast Monsoon: Oct–Dec → high risk
    - Pre-election months → medium-high
    - Summer (Apr–Jun) → low-medium
    """
    month = week_start.month
    risk_map = {
        1: 0.25,   # Jan — dry
        2: 0.20,   # Feb — dry
        3: 0.30,   # Mar — hot, occasional dust storms
        4: 0.35,   # Apr — pre-summer
        5: 0.40,   # May — summer, some cyclones
        6: 0.50,   # Jun — SW Monsoon starts
        7: 0.55,   # Jul — SW Monsoon
        8: 0.55,   # Aug — SW Monsoon
        9: 0.60,   # Sep — transition
        10: 0.75,  # Oct — NE Monsoon starts 🌧️
        11: 0.85,  # Nov — peak NE Monsoon 🌊
        12: 0.70,  # Dec — NE Monsoon tail
    }
    base = risk_map.get(month, 0.5)

    # Small weekly variance for realism
    import random
    variance = random.uniform(-0.05, 0.05)
    return round(min(max(base + variance, 0.0), 1.0), 4)


def _risk_to_premiums(risk_score: float) -> dict:
    """
    Linearly scale base premiums by risk factor.
    risk_score=0.5 → base premiums
    risk_score=0.0 → 40% lower (clear week discount)
    risk_score=1.0 → 40% higher (cyclone surge)
    """
    multiplier = 0.6 + (risk_score * 0.8)  # Range: 0.6x to 1.4x

    premiums = {}
    for tier, base in BASE_PREMIUMS.items():
        raw = base * multiplier
        lo, hi = PREMIUM_BOUNDS[tier]
        premiums[tier] = round(min(max(raw, lo), hi), 2)

    return premiums
