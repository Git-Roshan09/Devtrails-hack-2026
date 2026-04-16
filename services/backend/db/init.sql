-- ============================================================
-- GigaChad Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('admin', 'rider');

CREATE TABLE IF NOT EXISTS riders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid    VARCHAR(100) UNIQUE,
    role            user_role DEFAULT 'rider',
    name            VARCHAR(100) NOT NULL,
    phone           VARCHAR(20) UNIQUE NOT NULL,   -- used as WhatsApp ID
    email           VARCHAR(150),
    upi_id          VARCHAR(100),
    hourly_rate     NUMERIC(8,2) DEFAULT 100.00,   -- avg ₹/hr for payout calc
    platform        VARCHAR(30) DEFAULT 'zepto',
    home_wifi_ssid  VARCHAR(100),                  -- for fraud: known home WiFi
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    aadhar_verified BOOLEAN DEFAULT FALSE,
    masked_aadhar   VARCHAR(20),
    upi_verified    BOOLEAN DEFAULT FALSE,
    upi_verification_code VARCHAR(10),
    pan_verified    BOOLEAN DEFAULT FALSE,
    pan_number      VARCHAR(15),
    kyc_verified_at TIMESTAMPTZ
);

-- ─── POLICIES ───────────────────────────────────────────────
CREATE TYPE policy_tier AS ENUM ('giga_basic', 'giga_plus', 'giga_pro');
CREATE TYPE policy_status AS ENUM ('pending_payment', 'active', 'expired', 'cancelled');

CREATE TABLE IF NOT EXISTS policies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id        UUID REFERENCES riders(id) ON DELETE CASCADE,
    tier            policy_tier NOT NULL,
    weekly_premium  NUMERIC(8,2) NOT NULL,
    payout_cap      NUMERIC(8,2) NOT NULL,         -- 300 / 600 / 1000
    week_start      DATE NOT NULL,
    week_end        DATE NOT NULL,
    status          policy_status DEFAULT 'pending_payment',
    ai_risk_score   NUMERIC(5,4),                  -- 0.0–1.0 from TimeGPT
    razorpay_order_id VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TELEMETRY LOGS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id        UUID REFERENCES riders(id) ON DELETE CASCADE,
    lat             NUMERIC(10,7) NOT NULL,
    lng             NUMERIC(10,7) NOT NULL,
    h3_hex          VARCHAR(20),                   -- Uber H3 hex cell ID
    speed_kmh       NUMERIC(6,2),
    accel_x         NUMERIC(8,4),
    accel_y         NUMERIC(8,4),
    accel_z         NUMERIC(8,4),
    wifi_ssid       VARCHAR(100),
    network_type    VARCHAR(20),                   -- 4G / WiFi / offline
    is_shift_active BOOLEAN DEFAULT TRUE,
    is_fake         BOOLEAN DEFAULT FALSE,         -- marks simulated data
    ts              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_telemetry_rider_ts ON telemetry_logs(rider_id, ts DESC);
CREATE INDEX idx_telemetry_hex ON telemetry_logs(h3_hex);

-- ─── DISRUPTION EVENTS ──────────────────────────────────────
CREATE TYPE disruption_type AS ENUM ('flood', 'traffic_gridlock', 'strike', 'digital_blackout', 'vvip_movement');
CREATE TYPE disruption_status AS ENUM ('active', 'resolved');
DO $$
BEGIN
    CREATE TYPE disruption_severity AS ENUM ('minor', 'moderate', 'severe', 'catastrophic');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS disruption_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      disruption_type NOT NULL,
    h3_hex          VARCHAR(20) NOT NULL,          -- affected hex-grid
    zone_name       VARCHAR(100),                  -- "Velachery", "OMR"
    rain_mm         NUMERIC(6,2),
    traffic_kmh     NUMERIC(6,2),
    confidence      NUMERIC(5,4),                  -- 0.0–1.0 for social triggers
    trigger_source  VARCHAR(50),                   -- 'openweather+tomtom' / 'llm_nlp'
    status          disruption_status DEFAULT 'active',
    severity        disruption_severity DEFAULT 'moderate',
    composite_score NUMERIC(5,2),                  -- 0-100 composite severity index
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_disruption_hex ON disruption_events(h3_hex, status);

-- ─── CLAIMS ─────────────────────────────────────────────────
CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'soft_flagged', 'denied', 'paid');

CREATE TABLE IF NOT EXISTS claims (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id        UUID REFERENCES riders(id),
    policy_id       UUID REFERENCES policies(id),
    disruption_id   UUID REFERENCES disruption_events(id),
    idle_hours      NUMERIC(5,2),
    base_loss       NUMERIC(8,2),
    bonus_loss      NUMERIC(8,2) DEFAULT 0,
    total_payout    NUMERIC(8,2),
    fraud_score     NUMERIC(5,4),                  -- 0.0 = legit, 1.0 = fraud
    severity_multiplier NUMERIC(4,2) DEFAULT 1.0, -- severity payout multiplier
    rider_feedback_score NUMERIC(2,1),             -- 1=too low, 2=fair, 3=too high
    status          claim_status DEFAULT 'pending',
    fraud_flags     TEXT[],                        -- ['home_wifi', 'stationary_accel']
    appeal_video_url TEXT,
    audio_proof_url TEXT,
    razorpay_payout_id VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    processed_at    TIMESTAMPTZ
);

-- ─── SEVERITY SUPPORT TABLES ───────────────────────────────
CREATE TABLE IF NOT EXISTS hex_risk_profiles (
    h3_index                     VARCHAR(20) PRIMARY KEY,
    zone_name                    VARCHAR(100),
    flood_threshold_mm           NUMERIC(6,2) DEFAULT 30.0,
    drainage_efficiency          NUMERIC(3,2) DEFAULT 0.5,
    historical_cancel_correlation NUMERIC(5,4) DEFAULT 0.5,
    seasonal_adjustment          NUMERIC(4,2) DEFAULT 1.0,
    last_calibrated_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rider_velocity_cache (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id                UUID REFERENCES riders(id) ON DELETE CASCADE,
    hour_of_day             INTEGER NOT NULL,
    day_of_week             INTEGER NOT NULL,
    avg_deliveries_per_hour NUMERIC(4,2) DEFAULT 0.0,
    sample_count            INTEGER DEFAULT 0,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PREMIUM QUOTES (Weekly Forecasts) ──────────────────────
CREATE TABLE IF NOT EXISTS premium_quotes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    week_start      DATE NOT NULL UNIQUE,
    zone            VARCHAR(100) DEFAULT 'chennai',
    ai_risk_score   NUMERIC(5,4),
    basic_premium   NUMERIC(8,2),
    plus_premium    NUMERIC(8,2),
    pro_premium     NUMERIC(8,2),
    forecast_json   JSONB,                         -- raw TimeGPT output
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SEED DATA ───────────────────────────────────────────────
INSERT INTO riders (name, phone, upi_id, hourly_rate, home_wifi_ssid, role) VALUES
  ('Hari Kumar',    '+919876543210', 'hari@upi',    100.00, 'Hari_Home_5G', 'rider'),
  ('Ravi Shankar',  '+919876543211', 'ravi@upi',     95.00, 'Ravi_JioFiber', 'rider'),
  ('Murugan S',     '+919876543212', 'murugan@upi', 110.00, 'Murugan_BSNL', 'rider'),
  ('Priya D',       '+919876543213', 'priya@upi',    90.00, 'Priya_Wifi', 'rider'),
  ('Karthik R',     '+919876543214', 'karthik@upi', 105.00, 'Karthik_ACT', 'rider'),
  ('Admin User',    '+919000000000', 'admin@upi',   0.00,   'Admin_Wifi', 'admin')
ON CONFLICT DO NOTHING;
