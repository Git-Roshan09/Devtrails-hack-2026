-- Align existing DB schema with severity payout + fraud models

DO $$
BEGIN
    CREATE TYPE disruption_severity AS ENUM ('minor', 'moderate', 'severe', 'catastrophic');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE IF EXISTS disruption_events
    ADD COLUMN IF NOT EXISTS severity disruption_severity DEFAULT 'moderate',
    ADD COLUMN IF NOT EXISTS composite_score NUMERIC(5,2);

ALTER TABLE IF EXISTS claims
    ADD COLUMN IF NOT EXISTS severity_multiplier NUMERIC(4,2) DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS rider_feedback_score NUMERIC(2,1),
    ADD COLUMN IF NOT EXISTS audio_proof_url TEXT;

CREATE TABLE IF NOT EXISTS hex_risk_profiles (
    h3_index                      VARCHAR(20) PRIMARY KEY,
    zone_name                     VARCHAR(100),
    flood_threshold_mm            NUMERIC(6,2) DEFAULT 30.0,
    drainage_efficiency           NUMERIC(3,2) DEFAULT 0.5,
    historical_cancel_correlation NUMERIC(5,4) DEFAULT 0.5,
    seasonal_adjustment           NUMERIC(4,2) DEFAULT 1.0,
    last_calibrated_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rider_velocity_cache (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rider_id                 UUID REFERENCES riders(id) ON DELETE CASCADE,
    hour_of_day              INTEGER NOT NULL,
    day_of_week              INTEGER NOT NULL,
    avg_deliveries_per_hour  NUMERIC(4,2) DEFAULT 0.0,
    sample_count             INTEGER DEFAULT 0,
    updated_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS riders
    ADD COLUMN IF NOT EXISTS aadhar_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS masked_aadhar VARCHAR(20),
    ADD COLUMN IF NOT EXISTS upi_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS upi_verification_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS pan_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pan_number VARCHAR(15),
    ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
