import uuid
import enum
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import (
    Column, String, Boolean, Numeric, ARRAY, Text,
    ForeignKey, DateTime, Date, Enum as SAEnum, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped
from database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    rider = "rider"


class PolicyTier(str, enum.Enum):
    giga_basic = "giga_basic"
    giga_plus = "giga_plus"
    giga_pro = "giga_pro"

    @property
    def payout_cap(self) -> float:
        return {"giga_basic": 300.0, "giga_plus": 600.0, "giga_pro": 1000.0}[self.value]


class PolicyStatus(str, enum.Enum):
    pending_payment = "pending_payment"
    active = "active"
    expired = "expired"
    cancelled = "cancelled"


class DisruptionType(str, enum.Enum):
    flood = "flood"
    traffic_gridlock = "traffic_gridlock"
    strike = "strike"
    digital_blackout = "digital_blackout"
    vvip_movement = "vvip_movement"


class DisruptionStatus(str, enum.Enum):
    active = "active"
    resolved = "resolved"


class ClaimStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    soft_flagged = "soft_flagged"
    denied = "denied"
    paid = "paid"


# ─── ORM MODELS ─────────────────────────────────────────────

class Rider(Base):
    __tablename__ = "riders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firebase_uid = Column(String(100), unique=True, index=True)
    role = Column(SAEnum(UserRole), default=UserRole.rider)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, nullable=False)
    email = Column(String(150))
    upi_id = Column(String(100))
    hourly_rate = Column(Numeric(8, 2), default=100.00)
    platform = Column(String(30), default="zepto")
    home_wifi_ssid = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # KYC Fields
    aadhar_verified = Column(Boolean, default=False)
    masked_aadhar = Column(String(20))  # XXXX-XXXX-1234
    upi_verified = Column(Boolean, default=False)
    upi_verification_code = Column(String(10))  # Temp code for verification
    pan_verified = Column(Boolean, default=False)
    pan_number = Column(String(15))  # Masked: ABCDEXXXX9F
    kyc_verified_at = Column(DateTime(timezone=True))

    policies = relationship("Policy", back_populates="rider")
    telemetry_logs = relationship("TelemetryLog", back_populates="rider")
    claims = relationship("Claim", back_populates="rider")


class Policy(Base):
    __tablename__ = "policies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("riders.id", ondelete="CASCADE"))
    tier = Column(SAEnum(PolicyTier), nullable=False)
    weekly_premium = Column(Numeric(8, 2), nullable=False)
    payout_cap = Column(Numeric(8, 2), nullable=False)
    week_start = Column(Date, nullable=False)
    week_end = Column(Date, nullable=False)
    status = Column(SAEnum(PolicyStatus), default=PolicyStatus.pending_payment)
    ai_risk_score = Column(Numeric(5, 4))
    razorpay_order_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rider = relationship("Rider", back_populates="policies")
    claims = relationship("Claim", back_populates="policy")


class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("riders.id", ondelete="CASCADE"))
    lat = Column(Numeric(10, 7), nullable=False)
    lng = Column(Numeric(10, 7), nullable=False)
    h3_hex = Column(String(20))
    speed_kmh = Column(Numeric(6, 2))
    accel_x = Column(Numeric(8, 4))
    accel_y = Column(Numeric(8, 4))
    accel_z = Column(Numeric(8, 4))
    wifi_ssid = Column(String(100))
    network_type = Column(String(20))
    is_shift_active = Column(Boolean, default=True)
    is_fake = Column(Boolean, default=False)
    ts = Column(DateTime(timezone=True), server_default=func.now())

    rider = relationship("Rider", back_populates="telemetry_logs")


class DisruptionEvent(Base):
    __tablename__ = "disruption_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type = Column(SAEnum(DisruptionType), nullable=False)
    h3_hex = Column(String(20), nullable=False)
    zone_name = Column(String(100))
    rain_mm = Column(Numeric(6, 2))
    traffic_kmh = Column(Numeric(6, 2))
    confidence = Column(Numeric(5, 4))
    trigger_source = Column(String(50))
    status = Column(SAEnum(DisruptionStatus), default=DisruptionStatus.active)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True))

    claims = relationship("Claim", back_populates="disruption")


class Claim(Base):
    __tablename__ = "claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("riders.id"))
    policy_id = Column(UUID(as_uuid=True), ForeignKey("policies.id"))
    disruption_id = Column(UUID(as_uuid=True), ForeignKey("disruption_events.id"))
    idle_hours = Column(Numeric(5, 2))
    base_loss = Column(Numeric(8, 2))
    bonus_loss = Column(Numeric(8, 2), default=0)
    total_payout = Column(Numeric(8, 2))
    fraud_score = Column(Numeric(5, 4))
    status = Column(SAEnum(ClaimStatus), default=ClaimStatus.pending)
    fraud_flags = Column(ARRAY(Text))
    appeal_video_url = Column(Text)
    razorpay_payout_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True))

    rider = relationship("Rider", back_populates="claims")
    policy = relationship("Policy", back_populates="claims")
    disruption = relationship("DisruptionEvent", back_populates="claims")


class PremiumQuote(Base):
    __tablename__ = "premium_quotes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week_start = Column(Date, nullable=False, unique=True)
    zone = Column(String(100), default="chennai")
    ai_risk_score = Column(Numeric(5, 4))
    basic_premium = Column(Numeric(8, 2))
    plus_premium = Column(Numeric(8, 2))
    pro_premium = Column(Numeric(8, 2))
    forecast_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
