from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from database import get_db
from models import DisruptionEvent, DisruptionType, DisruptionStatus, DisruptionSeverity
from engines.trigger import evaluate_double_trigger, evaluate_social_trigger
from engines.severity import (
    compute_composite_severity, classify_severity,
    get_continuous_multiplier, get_hex_profile,
)

router = APIRouter()


# ── Pydantic Schemas ─────────────────────────────────────────

class DisruptionOut(BaseModel):
    id: uuid.UUID
    event_type: DisruptionType
    h3_hex: str
    zone_name: Optional[str]
    rain_mm: Optional[float]
    traffic_kmh: Optional[float]
    confidence: Optional[float]
    trigger_source: Optional[str]
    status: DisruptionStatus
    severity: Optional[DisruptionSeverity]
    composite_score: Optional[float]
    started_at: datetime

    class Config:
        from_attributes = True


# ── Weather Data Fusion ──────────────────────────────────────

class WeatherDataFusion:
    """
    Multi-source weather data fusion engine.

    Aggregates signals from multiple data sources with weighted trust levels:
    - IMD official alerts: weight 0.9 (most authoritative)
    - OpenWeather API: weight 0.6 (widely available)
    - Rider telemetry consensus: weight 0.8 (ground truth from riders)
    - TomTom traffic: weight 0.7 (indirect weather signal)

    Conflict resolution:
    - If sources differ by >30%, use conservative estimate
    - Temporal alignment: backdate to earliest credible signal
    """

    SOURCE_WEIGHTS = {
        "imd_official": 0.9,
        "rider_telemetry": 0.8,
        "tomtom_traffic": 0.7,
        "openweather": 0.6,
    }

    def __init__(self):
        self.signals = []
        self.conflicts = []

    def add_signal(self, source: str, rain_mm: float, traffic_kmh: float,
                   confidence: float = 1.0, timestamp: datetime = None):
        weight = self.SOURCE_WEIGHTS.get(source, 0.5)
        self.signals.append({
            "source": source,
            "rain_mm": rain_mm,
            "traffic_kmh": traffic_kmh,
            "confidence": confidence,
            "weight": weight,
            "timestamp": timestamp or datetime.utcnow(),
        })

    def fuse(self) -> dict:
        """
        Produce fused weather signal from all added signals.
        Returns weighted average with conflict flags.
        """
        if not self.signals:
            return {
                "rain_mm": 0.0, "traffic_kmh": 999.0,
                "confidence": 0.0, "source_agreement": 1.0,
                "sources_used": 0, "conflicts": [],
            }

        # Weighted averages
        total_weight = sum(s["weight"] * s["confidence"] for s in self.signals)
        if total_weight == 0:
            total_weight = 1.0

        fused_rain = sum(
            s["rain_mm"] * s["weight"] * s["confidence"]
            for s in self.signals
        ) / total_weight

        fused_traffic = sum(
            s["traffic_kmh"] * s["weight"] * s["confidence"]
            for s in self.signals
        ) / total_weight

        # Check for conflicts (>30% divergence between sources)
        conflicts = []
        rain_values = [s["rain_mm"] for s in self.signals if s["rain_mm"] > 0]
        if len(rain_values) >= 2:
            rain_max = max(rain_values)
            rain_min = min(rain_values)
            if rain_max > 0 and (rain_max - rain_min) / rain_max > 0.30:
                conflicts.append(
                    f"rain_divergence: {rain_min:.1f}mm–{rain_max:.1f}mm "
                    f"({((rain_max-rain_min)/rain_max):.0%} spread)"
                )
                # Use conservative (lower) estimate when sources conflict
                fused_rain = rain_min + (rain_max - rain_min) * 0.3

        # Source agreement metric
        source_agreement = 1.0 - (len(conflicts) * 0.25)
        source_agreement = max(source_agreement, 0.0)

        # Temporal alignment: use earliest timestamp
        earliest = min(s["timestamp"] for s in self.signals)

        return {
            "rain_mm": round(fused_rain, 2),
            "traffic_kmh": round(fused_traffic, 2),
            "confidence": round(source_agreement, 4),
            "source_agreement": round(source_agreement, 4),
            "sources_used": len(self.signals),
            "conflicts": conflicts,
            "earliest_signal": earliest,
        }


# ── Endpoints ────────────────────────────────────────────────

@router.get("/active", response_model=list[DisruptionOut])
async def list_active_disruptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DisruptionEvent)
        .where(DisruptionEvent.status == DisruptionStatus.active)
        .order_by(DisruptionEvent.started_at.desc())
    )
    return result.scalars().all()


@router.get("/hex/{h3_hex}", response_model=list[DisruptionOut])
async def disruptions_in_hex(h3_hex: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DisruptionEvent).where(
            DisruptionEvent.h3_hex == h3_hex,
            DisruptionEvent.status == DisruptionStatus.active,
        )
    )
    return result.scalars().all()


@router.post("/check/{h3_hex}")
async def check_disruption_for_hex(
    h3_hex: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Pull live data from multiple sources, fuse weather signals,
    evaluate against hex-grid calibrated thresholds, auto-classify severity,
    and create a DisruptionEvent if conditions are met.
    """
    # ── Multi-source data collection ───────────────────────────
    fusion = WeatherDataFusion()

    # Source 1: OpenWeather + TomTom (double trigger engine)
    trigger_result = await evaluate_double_trigger(h3_hex)
    fusion.add_signal(
        source="openweather",
        rain_mm=trigger_result.get("rain_mm", 0),
        traffic_kmh=trigger_result.get("traffic_kmh", 999),
    )
    fusion.add_signal(
        source="tomtom_traffic",
        rain_mm=trigger_result.get("rain_mm", 0),
        traffic_kmh=trigger_result.get("traffic_kmh", 999),
    )

    # Fuse signals
    fused = fusion.fuse()
    rain_mm = fused["rain_mm"]
    traffic_kmh = fused["traffic_kmh"]

    # ── Hex-grid calibrated threshold check ────────────────────
    hex_profile = await get_hex_profile(db, h3_hex)
    if hex_profile:
        effective_threshold = (
            float(hex_profile.flood_threshold_mm or 30.0) *
            float(hex_profile.seasonal_adjustment or 1.0)
        )
    else:
        effective_threshold = 30.0  # Default

    triggered = rain_mm >= effective_threshold and traffic_kmh <= 5.0

    if triggered:
        # ── Auto-classify severity ─────────────────────────────
        composite_score = compute_composite_severity(
            rain_mm=rain_mm,
            traffic_kmh=traffic_kmh,
            social_confidence=fused.get("confidence", 0),
            duration_hours=0,  # Just started
            hex_profile=hex_profile,
        )
        severity = classify_severity(composite_score)

        event = DisruptionEvent(
            event_type=DisruptionType.flood if rain_mm > effective_threshold else DisruptionType.traffic_gridlock,
            h3_hex=h3_hex,
            zone_name=trigger_result.get("zone_name"),
            rain_mm=rain_mm,
            traffic_kmh=traffic_kmh,
            trigger_source="weather_fusion",
            confidence=fused.get("confidence", 1.0),
            severity=severity,
            composite_score=composite_score,
        )
        db.add(event)
        await db.flush()

        # Fire auto-claim processing in background
        from engines.payout import process_disruption_claims
        background_tasks.add_task(process_disruption_claims, str(event.id))

        return {
            "triggered": True,
            "event_id": str(event.id),
            "severity": severity.value,
            "composite_score": composite_score,
            "multiplier": get_continuous_multiplier(composite_score),
            "effective_threshold": effective_threshold,
            "fused_data": fused,
            "conflicts": fused.get("conflicts", []),
            "details": trigger_result,
        }

    return {"triggered": False, "effective_threshold": effective_threshold, "details": trigger_result}


@router.post("/check-social")
async def check_social_disruption(
    zone_name: str,
    h3_hex: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Use Groq Llama-3 to scan social signals for strike/VVIP disruption."""
    result = await evaluate_social_trigger(zone_name)

    if result["triggered"]:
        # Auto-classify severity for social disruptions
        hex_profile = await get_hex_profile(db, h3_hex)
        composite_score = compute_composite_severity(
            rain_mm=0,
            traffic_kmh=5.0,  # Assume gridlock during social disruption
            social_confidence=result.get("confidence", 0.9),
            duration_hours=0,
            hex_profile=hex_profile,
        )
        severity = classify_severity(composite_score)

        event = DisruptionEvent(
            event_type=DisruptionType.strike,
            h3_hex=h3_hex,
            zone_name=zone_name,
            confidence=result["confidence"],
            trigger_source="llm_nlp",
            severity=severity,
            composite_score=composite_score,
        )
        db.add(event)
        await db.flush()

        from engines.payout import process_disruption_claims
        background_tasks.add_task(process_disruption_claims, str(event.id))

        return {
            "triggered": True,
            "event_id": str(event.id),
            "severity": severity.value,
            "composite_score": composite_score,
            "details": result,
        }

    return {"triggered": False, "details": result}


@router.patch("/{disruption_id}/resolve")
async def resolve_disruption(disruption_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    event = await db.get(DisruptionEvent, disruption_id)
    if not event:
        raise HTTPException(404, "Disruption not found")
    event.status = DisruptionStatus.resolved
    event.resolved_at = datetime.utcnow()

    # Recalculate composite score with actual duration
    if event.started_at:
        actual_hours = (event.resolved_at - event.started_at).total_seconds() / 3600
        hex_profile = await get_hex_profile(db, event.h3_hex)
        event.composite_score = compute_composite_severity(
            rain_mm=float(event.rain_mm or 0),
            traffic_kmh=float(event.traffic_kmh or 999),
            social_confidence=float(event.confidence or 0),
            duration_hours=actual_hours,
            hex_profile=hex_profile,
        )
        event.severity = classify_severity(event.composite_score)

    return {"status": "resolved", "id": str(disruption_id),
            "final_severity": event.severity.value if event.severity else None,
            "final_score": float(event.composite_score or 0)}
