"""
One-shot migration runner — adds the missing claims columns to Supabase.
Run once: python run_migration.py
"""
import asyncio
import asyncpg
import os
from pathlib import Path

DATABASE_URL = os.getenv(
    "DATABASE_URL"
)

# Convert SQLAlchemy URL → raw asyncpg DSN
DSN = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

MIGRATION_SQL = """
-- Migration: add missing columns to claims table
-- Safe to run multiple times (IF NOT EXISTS / default handling)

DO $$ BEGIN
    CREATE TYPE disruption_severity AS ENUM ('minor', 'moderate', 'severe', 'catastrophic');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- disruption_events columns
ALTER TABLE disruption_events
    ADD COLUMN IF NOT EXISTS severity disruption_severity DEFAULT 'moderate',
    ADD COLUMN IF NOT EXISTS composite_score NUMERIC(5,2);

-- claims columns (the ones that were missing)
ALTER TABLE claims
    ADD COLUMN IF NOT EXISTS severity_multiplier    NUMERIC(4,2)  DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS rider_feedback_score   NUMERIC(2,1),
    ADD COLUMN IF NOT EXISTS audio_proof_url        TEXT,
    ADD COLUMN IF NOT EXISTS razorpay_payout_id     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS processed_at           TIMESTAMPTZ;

-- riders KYC columns (in case also missing)
ALTER TABLE riders
    ADD COLUMN IF NOT EXISTS aadhar_verified        BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS masked_aadhar          VARCHAR(20),
    ADD COLUMN IF NOT EXISTS upi_verified           BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS upi_verification_code  VARCHAR(10),
    ADD COLUMN IF NOT EXISTS pan_verified           BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pan_number             VARCHAR(15),
    ADD COLUMN IF NOT EXISTS kyc_verified_at        TIMESTAMPTZ;

-- support tables
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
"""

async def run():
    print(f"Connecting to database...")
    conn = await asyncpg.connect(DSN)
    try:
        print("Running migration...")
        await conn.execute(MIGRATION_SQL)
        print("✅ Migration completed successfully!")
        
        # Verify the column exists now
        result = await conn.fetchval("""
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'claims' AND column_name = 'severity_multiplier'
        """)
        print(f"✅ severity_multiplier column exists: {result == 1}")
        
        # Show all claims columns
        cols = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'claims' 
            ORDER BY ordinal_position
        """)
        print("\nCurrent claims table columns:")
        for col in cols:
            print(f"  {col['column_name']}: {col['data_type']}")
    finally:
        await conn.close()

asyncio.run(run())
