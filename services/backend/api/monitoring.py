"""
Risk Monitoring API
───────────────────
Endpoints for real-time risk assessment and disruption monitoring.

Routes:
- GET  /api/monitoring/risk - Current risk assessment
- GET  /api/monitoring/risk/{zone} - Zone-specific risk
- POST /api/monitoring/scan - Trigger manual scan
- GET  /api/monitoring/disruptions - Active disruptions
- POST /api/monitoring/disruptions - Create manual disruption
- GET  /api/monitoring/weather - Weather conditions
- GET  /api/monitoring/news - Latest disruption news
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db
from models import DisruptionEvent, DisruptionType, DisruptionStatus
from engines.risk_aggregator import (
    assess_zone_risk, 
    assess_all_zones, 
    calculate_weekly_risk_score,
    RiskAssessment,
)
from engines.weather_forecaster import get_zone_weather, get_chennai_overview
from engines.news_scraper import get_disruption_news
from config import get_settings

settings = get_settings()
router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


# ══════════════════════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════════════════════

class ZoneRiskResponse(BaseModel):
    zone: str
    h3_hex: str
    overall_risk: float
    risk_level: str
    weather_risk: float
    traffic_risk: float
    news_risk: float
    social_risk: float
    risk_factors: list[str]
    should_trigger: bool
    should_warn: bool
    timestamp: datetime


class CityRiskResponse(BaseModel):
    city_avg_risk: float
    high_risk_zones: int
    total_zones: int
    zones: list[ZoneRiskResponse]
    timestamp: datetime


class WeatherResponse(BaseModel):
    zone: Optional[str]
    temperature: float
    humidity: float
    rain_mm: float
    wind_speed: float
    conditions: str
    risk_score: float
    waterlog_risk: float
    alert: Optional[str]
    timestamp: datetime


class NewsItem(BaseModel):
    title: str
    source: str
    url: Optional[str]
    zone: Optional[str]
    disruption_type: Optional[str]
    confidence: float
    published: Optional[datetime]


class NewsResponse(BaseModel):
    count: int
    disruption_detected: bool
    items: list[NewsItem]
    timestamp: datetime


class DisruptionResponse(BaseModel):
    id: str
    event_type: str
    zone: str
    h3_hex: str
    confidence: float
    status: str
    trigger_source: str
    created_at: datetime
    resolved_at: Optional[datetime]


class CreateDisruptionRequest(BaseModel):
    event_type: DisruptionType
    zone_name: str
    h3_hex: Optional[str] = None
    confidence: float = 0.8
    trigger_source: str = "manual"


class ScanResponse(BaseModel):
    status: str
    zones_scanned: int
    disruptions_triggered: int
    warnings_sent: int
    timestamp: datetime


# ══════════════════════════════════════════════════════════════
# RISK ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/risk", response_model=CityRiskResponse)
async def get_city_risk():
    """Get real-time risk assessment for all Chennai zones."""
    
    try:
        assessments = await assess_all_zones()
        
        zones = [
            ZoneRiskResponse(
                zone=a.zone,
                h3_hex=a.h3_hex,
                overall_risk=a.overall_risk,
                risk_level=a.risk_level,
                weather_risk=a.weather_risk,
                traffic_risk=a.traffic_risk,
                news_risk=a.news_risk,
                social_risk=a.social_risk,
                risk_factors=a.risk_factors,
                should_trigger=a.should_trigger_disruption,
                should_warn=a.should_send_warning,
                timestamp=a.timestamp,
            )
            for a in assessments
        ]
        
        high_risk = sum(1 for z in zones if z.risk_level in ["high", "critical"])
        avg_risk = sum(z.overall_risk for z in zones) / len(zones) if zones else 0
        
        return CityRiskResponse(
            city_avg_risk=avg_risk,
            high_risk_zones=high_risk,
            total_zones=len(zones),
            zones=zones,
            timestamp=datetime.utcnow(),
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk assessment error: {str(e)}")


@router.get("/risk/{zone}", response_model=ZoneRiskResponse)
async def get_zone_risk(zone: str):
    """Get real-time risk assessment for a specific zone."""
    
    # Validate zone
    from engines.risk_aggregator import CHENNAI_ZONES
    if zone not in CHENNAI_ZONES:
        raise HTTPException(
            status_code=404, 
            detail=f"Unknown zone. Available: {list(CHENNAI_ZONES.keys())}"
        )
    
    try:
        assessment = await assess_zone_risk(zone)
        
        return ZoneRiskResponse(
            zone=assessment.zone,
            h3_hex=assessment.h3_hex,
            overall_risk=assessment.overall_risk,
            risk_level=assessment.risk_level,
            weather_risk=assessment.weather_risk,
            traffic_risk=assessment.traffic_risk,
            news_risk=assessment.news_risk,
            social_risk=assessment.social_risk,
            risk_factors=assessment.risk_factors,
            should_trigger=assessment.should_trigger_disruption,
            should_warn=assessment.should_send_warning,
            timestamp=assessment.timestamp,
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk assessment error: {str(e)}")


@router.get("/risk/weekly/forecast")
async def get_weekly_risk_forecast():
    """Get 7-day risk forecast for premium calculation."""
    
    try:
        forecast = await calculate_weekly_risk_score()
        return forecast
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast error: {str(e)}")


# ══════════════════════════════════════════════════════════════
# WEATHER ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/weather", response_model=WeatherResponse)
async def get_weather_overview():
    """Get current weather conditions for Chennai."""
    
    try:
        weather = await get_chennai_overview()
        
        return WeatherResponse(
            zone=None,
            temperature=weather.get("temperature", 0),
            humidity=weather.get("humidity", 0),
            rain_mm=weather.get("rain_mm", 0),
            wind_speed=weather.get("wind_speed", 0),
            conditions=weather.get("conditions", "unknown"),
            risk_score=weather.get("risk_score", 0),
            waterlog_risk=weather.get("waterlog_risk", 0),
            alert=weather.get("alert"),
            timestamp=datetime.utcnow(),
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weather error: {str(e)}")


@router.get("/weather/{zone}", response_model=WeatherResponse)
async def get_zone_weather_details(zone: str):
    """Get weather conditions for a specific zone."""
    
    try:
        weather = await get_zone_weather(zone)
        
        return WeatherResponse(
            zone=zone,
            temperature=weather.get("temperature", 0),
            humidity=weather.get("humidity", 0),
            rain_mm=weather.get("rain_mm", 0),
            wind_speed=weather.get("wind_speed", 0),
            conditions=weather.get("conditions", "unknown"),
            risk_score=weather.get("risk_score", 0),
            waterlog_risk=weather.get("waterlog_risk", 0),
            alert=weather.get("alert"),
            timestamp=datetime.utcnow(),
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weather error: {str(e)}")


# ══════════════════════════════════════════════════════════════
# NEWS ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/news", response_model=NewsResponse)
async def get_disruption_news_feed(
    zone: Optional[str] = None,
    hours: int = Query(6, le=24),
):
    """Get recent news that may indicate disruptions."""
    
    try:
        news = await get_disruption_news(hours=hours)
        
        items = []
        disruption_detected = False
        
        for article in news.get("articles", []):
            item_zone = article.get("zone")
            
            # Filter by zone if specified
            if zone and item_zone and item_zone.lower() != zone.lower():
                continue
            
            confidence = article.get("confidence", 0)
            if confidence > 0.7:
                disruption_detected = True
            
            items.append(NewsItem(
                title=article.get("title", ""),
                source=article.get("source", "unknown"),
                url=article.get("url"),
                zone=item_zone,
                disruption_type=article.get("disruption_type"),
                confidence=confidence,
                published=article.get("published"),
            ))
        
        return NewsResponse(
            count=len(items),
            disruption_detected=disruption_detected,
            items=items,
            timestamp=datetime.utcnow(),
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"News error: {str(e)}")


# ══════════════════════════════════════════════════════════════
# DISRUPTION ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.get("/disruptions", response_model=list[DisruptionResponse])
async def list_disruptions(
    status: Optional[str] = Query(None),
    days: int = Query(7, le=30),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List recent disruption events."""
    
    cutoff = datetime.utcnow() - timedelta(days=days)
    
    query = (
        select(DisruptionEvent)
        .where(DisruptionEvent.created_at >= cutoff)
        .order_by(DisruptionEvent.created_at.desc())
        .limit(limit)
    )
    
    if status:
        query = query.where(DisruptionEvent.status == DisruptionStatus(status))
    
    result = await db.execute(query)
    disruptions = result.scalars().all()
    
    return [
        DisruptionResponse(
            id=str(d.id),
            event_type=d.event_type.value,
            zone=d.zone_name or "Unknown",
            h3_hex=d.h3_hex,
            confidence=d.confidence,
            status=d.status.value if d.status else "unknown",
            trigger_source=d.trigger_source or "unknown",
            created_at=d.created_at,
            resolved_at=d.resolved_at,
        )
        for d in disruptions
    ]


@router.get("/disruptions/active", response_model=list[DisruptionResponse])
async def get_active_disruptions(
    db: AsyncSession = Depends(get_db),
):
    """Get currently active disruption events."""
    
    cutoff = datetime.utcnow() - timedelta(hours=6)
    
    result = await db.execute(
        select(DisruptionEvent)
        .where(and_(
            DisruptionEvent.created_at >= cutoff,
            DisruptionEvent.resolved_at.is_(None),
        ))
        .order_by(DisruptionEvent.created_at.desc())
    )
    disruptions = result.scalars().all()
    
    return [
        DisruptionResponse(
            id=str(d.id),
            event_type=d.event_type.value,
            zone=d.zone_name or "Unknown",
            h3_hex=d.h3_hex,
            confidence=d.confidence,
            status=d.status.value if d.status else "active",
            trigger_source=d.trigger_source or "unknown",
            created_at=d.created_at,
            resolved_at=d.resolved_at,
        )
        for d in disruptions
    ]


@router.post("/disruptions", response_model=DisruptionResponse)
async def create_manual_disruption(
    request: CreateDisruptionRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Manually create a disruption event (admin override)."""
    
    # Get H3 hex if not provided
    h3_hex = request.h3_hex
    if not h3_hex:
        from engines.risk_aggregator import CHENNAI_ZONES
        zone_info = CHENNAI_ZONES.get(request.zone_name)
        if zone_info:
            h3_hex = zone_info.get("h3_hex", "")
        else:
            h3_hex = "manual_zone"
    
    disruption = DisruptionEvent(
        event_type=request.event_type,
        h3_hex=h3_hex,
        zone_name=request.zone_name,
        confidence=request.confidence,
        trigger_source=request.trigger_source,
    )
    
    db.add(disruption)
    await db.commit()
    await db.refresh(disruption)
    
    # Trigger claim processing in background
    from engines.payout import process_disruption_claims
    background_tasks.add_task(process_disruption_claims, str(disruption.id))
    
    return DisruptionResponse(
        id=str(disruption.id),
        event_type=disruption.event_type.value,
        zone=disruption.zone_name or "Unknown",
        h3_hex=disruption.h3_hex,
        confidence=disruption.confidence,
        status="active",
        trigger_source=disruption.trigger_source,
        created_at=disruption.created_at,
        resolved_at=disruption.resolved_at,
    )


@router.patch("/disruptions/{disruption_id}/resolve")
async def resolve_disruption(
    disruption_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mark a disruption event as resolved."""
    
    disruption = await db.get(DisruptionEvent, UUID(disruption_id))
    
    if not disruption:
        raise HTTPException(status_code=404, detail="Disruption not found")
    
    disruption.resolved_at = datetime.utcnow()
    disruption.status = DisruptionStatus.resolved
    await db.commit()
    
    return {
        "disruption_id": disruption_id,
        "status": "resolved",
        "resolved_at": disruption.resolved_at.isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# SCAN ENDPOINTS
# ══════════════════════════════════════════════════════════════

@router.post("/scan", response_model=ScanResponse)
async def trigger_manual_scan(
    background_tasks: BackgroundTasks,
):
    """
    Trigger a manual disruption scan across all zones.
    Useful for testing or forcing an immediate check.
    """
    
    try:
        # Run immediate assessment
        assessments = await assess_all_zones()
        
        triggered = []
        warnings = []
        
        for assessment in assessments:
            if assessment.should_trigger_disruption:
                triggered.append(assessment.zone)
            elif assessment.should_send_warning:
                warnings.append(assessment.zone)
        
        # Queue background processing
        if triggered:
            from scheduler.tasks import trigger_disruption_event
            for assessment in assessments:
                if assessment.should_trigger_disruption:
                    background_tasks.add_task(
                        trigger_disruption_event.delay,
                        zone_name=assessment.zone,
                        h3_hex=assessment.h3_hex,
                        confidence=assessment.overall_risk,
                        risk_factors=assessment.risk_factors,
                    )
        
        if warnings:
            from scheduler.tasks import send_proactive_warnings
            background_tasks.add_task(
                send_proactive_warnings.delay,
                warnings,
            )
        
        return ScanResponse(
            status="completed",
            zones_scanned=len(assessments),
            disruptions_triggered=len(triggered),
            warnings_sent=len(warnings),
            timestamp=datetime.utcnow(),
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan error: {str(e)}")


@router.get("/zones")
async def list_zones():
    """Get list of all monitored Chennai zones."""
    
    from engines.risk_aggregator import CHENNAI_ZONES
    
    return {
        "zones": [
            {
                "name": name,
                "lat": info["lat"],
                "lng": info["lng"],
                "h3_hex": info.get("h3_hex", ""),
            }
            for name, info in CHENNAI_ZONES.items()
        ],
        "count": len(CHENNAI_ZONES),
    }
