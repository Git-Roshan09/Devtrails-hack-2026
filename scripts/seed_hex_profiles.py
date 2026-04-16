"""
Hex-Grid Risk Profile Seeder
─────────────────────────────
Seeds the hex_risk_profiles table with calibrated thresholds
for known Chennai micro-zones.

Usage:
  cd services/backend
  python ../../scripts/seed_hex_profiles.py
"""

import asyncio
import h3
from datetime import datetime

# Import after setting up path
import sys
sys.path.insert(0, ".")


# Chennai zones with calibrated flood/drainage data
CHENNAI_HEX_PROFILES = {
    "velachery": {
        "lat": 12.9815, "lng": 80.2180,
        "flood_threshold_mm": 22.0,     # Floods easily — poor drainage
        "drainage_efficiency": 0.25,     # Low drainage (notorious flooding area)
        "historical_cancel_correlation": 0.82,
        "seasonal_adjustment": 1.3,      # Worse during NE monsoon
    },
    "omr": {
        "lat": 12.9100, "lng": 80.2270,
        "flood_threshold_mm": 28.0,
        "drainage_efficiency": 0.45,
        "historical_cancel_correlation": 0.65,
        "seasonal_adjustment": 1.1,
    },
    "t_nagar": {
        "lat": 13.0418, "lng": 80.2341,
        "flood_threshold_mm": 32.0,
        "drainage_efficiency": 0.55,
        "historical_cancel_correlation": 0.58,
        "seasonal_adjustment": 1.0,
    },
    "alwarpet": {
        "lat": 13.0339, "lng": 80.2503,
        "flood_threshold_mm": 35.0,      # Better drainage
        "drainage_efficiency": 0.70,
        "historical_cancel_correlation": 0.45,
        "seasonal_adjustment": 0.9,
    },
    "anna_nagar": {
        "lat": 13.0850, "lng": 80.2101,
        "flood_threshold_mm": 30.0,
        "drainage_efficiency": 0.60,
        "historical_cancel_correlation": 0.50,
        "seasonal_adjustment": 1.0,
    },
    "perungudi": {
        "lat": 12.9611, "lng": 80.2400,
        "flood_threshold_mm": 25.0,
        "drainage_efficiency": 0.30,     # IT corridor, poor drainage
        "historical_cancel_correlation": 0.75,
        "seasonal_adjustment": 1.2,
    },
    "adyar": {
        "lat": 13.0063, "lng": 80.2574,
        "flood_threshold_mm": 26.0,
        "drainage_efficiency": 0.35,     # River proximity
        "historical_cancel_correlation": 0.70,
        "seasonal_adjustment": 1.2,
    },
    "sholinganallur": {
        "lat": 12.9010, "lng": 80.2279,
        "flood_threshold_mm": 24.0,
        "drainage_efficiency": 0.28,
        "historical_cancel_correlation": 0.78,
        "seasonal_adjustment": 1.25,
    },
    "tambaram": {
        "lat": 12.9249, "lng": 80.1000,
        "flood_threshold_mm": 27.0,
        "drainage_efficiency": 0.40,
        "historical_cancel_correlation": 0.60,
        "seasonal_adjustment": 1.1,
    },
    "mylapore": {
        "lat": 13.0368, "lng": 80.2676,
        "flood_threshold_mm": 33.0,
        "drainage_efficiency": 0.60,
        "historical_cancel_correlation": 0.48,
        "seasonal_adjustment": 1.0,
    },
}


async def seed_hex_profiles():
    from database import AsyncSessionLocal
    from models import HexRiskProfile
    from config import get_settings

    settings = get_settings()

    print("🌍 Seeding hex-grid risk profiles for Chennai zones...\n")

    async with AsyncSessionLocal() as db:
        count = 0
        for zone_name, data in CHENNAI_HEX_PROFILES.items():
            h3_hex = h3.latlng_to_cell(data["lat"], data["lng"], settings.h3_resolution)

            # Upsert: check if exists
            from sqlalchemy import select
            existing = await db.execute(
                select(HexRiskProfile).where(HexRiskProfile.h3_index == h3_hex)
            )
            profile = existing.scalar_one_or_none()

            if profile:
                profile.flood_threshold_mm = data["flood_threshold_mm"]
                profile.drainage_efficiency = data["drainage_efficiency"]
                profile.historical_cancel_correlation = data["historical_cancel_correlation"]
                profile.seasonal_adjustment = data["seasonal_adjustment"]
                profile.last_calibrated_at = datetime.utcnow()
                print(f"  🔄 Updated: {zone_name} → {h3_hex}")
            else:
                profile = HexRiskProfile(
                    h3_index=h3_hex,
                    zone_name=zone_name,
                    flood_threshold_mm=data["flood_threshold_mm"],
                    drainage_efficiency=data["drainage_efficiency"],
                    historical_cancel_correlation=data["historical_cancel_correlation"],
                    seasonal_adjustment=data["seasonal_adjustment"],
                    last_calibrated_at=datetime.utcnow(),
                )
                db.add(profile)
                print(f"  ✅ Created: {zone_name} → {h3_hex} "
                      f"(flood={data['flood_threshold_mm']}mm, "
                      f"drainage={data['drainage_efficiency']})")

            count += 1

        await db.commit()
        print(f"\n🎉 Seeded {count} hex-grid risk profiles.")


if __name__ == "__main__":
    asyncio.run(seed_hex_profiles())
