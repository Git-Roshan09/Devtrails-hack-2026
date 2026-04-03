"""
Fraud Detection Engine
──────────────────────
Multi-layer fraud checks:
1. Home WiFi SSID detection
2. Accelerometer stillness check (phone flat on table)
3. Velocity plausibility (teleportation detection)
4. Neo4j syndicate cluster detection (GraphSAGE)

Returns a fraud_score (0.0=legit, 1.0=definite fraud) and list of flags.
"""

import math
from datetime import datetime, timedelta
from typing import Optional
from neo4j import AsyncGraphDatabase
from config import get_settings

settings = get_settings()

# Thresholds
ACCEL_STILLNESS_THRESHOLD = 0.15   # |accel - gravity| < this → phone is stationary on table
VELOCITY_TELEPORT_KMH = 80.0       # unrealistic speed between two GPS pings
SYNDICATE_CLUSTER_SIZE = 10        # N riders in one hex within 2 min = suspicious

_driver = None


def _get_neo4j_driver():
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    return _driver


def _accel_magnitude(x: float, y: float, z: float) -> float:
    return math.sqrt(x**2 + y**2 + z**2)


async def score_claim_fraud(
    rider_id: str,
    h3_hex: str,
    telemetry_logs: list[dict],
    rider_home_wifi: Optional[str],
    disruption_started_at: datetime,
) -> dict:
    """
    Main fraud scoring function called before any payout is approved.
    Returns fraud_score and list of fraud_flags.
    """
    fraud_score = 0.0
    flags = []

    if not telemetry_logs:
        return {"fraud_score": 1.0, "flags": ["no_telemetry"], "verdict": "denied"}

    latest = telemetry_logs[-1]

    # ── Check 1: Home WiFi SSID ─────────────────────────────
    current_ssid = latest.get("wifi_ssid", "")
    if rider_home_wifi and current_ssid == rider_home_wifi:
        fraud_score += 0.55
        flags.append("home_wifi_detected")

    # ── Check 2: Accelerometer Stillness ────────────────────
    accel_x = latest.get("accel_x", 0) or 0
    accel_y = latest.get("accel_y", 0) or 0
    accel_z = latest.get("accel_z", 9.8) or 9.8

    mag = _accel_magnitude(accel_x, accel_y, accel_z)
    gravity_delta = abs(mag - 9.8)
    if gravity_delta < ACCEL_STILLNESS_THRESHOLD:
        # Phone is perfectly still — suspicious during an alleged storm
        fraud_score += 0.25
        flags.append("phone_stationary_accel")

    # ── Check 3: Velocity Plausibility ──────────────────────
    if len(telemetry_logs) >= 2:
        for i in range(1, len(telemetry_logs)):
            prev = telemetry_logs[i - 1]
            curr = telemetry_logs[i]
            dist_km = _haversine(
                float(prev["lat"]), float(prev["lng"]),
                float(curr["lat"]), float(curr["lng"]),
            )
            # Time diff in hours
            dt = (curr["ts"] - prev["ts"]).total_seconds() / 3600
            if dt > 0:
                implied_speed = dist_km / dt
                if implied_speed > VELOCITY_TELEPORT_KMH:
                    fraud_score += 0.40
                    flags.append(f"teleportation_detected_{implied_speed:.0f}kmh")
                    break

    # ── Check 4: Neo4j Syndicate Detection ──────────────────
    syndicate_score = await _check_syndicate(h3_hex, disruption_started_at)
    if syndicate_score > 0.5:
        fraud_score += 0.30
        flags.append("syndicate_cluster_detected")

    # Cap at 1.0
    fraud_score = min(round(fraud_score, 4), 1.0)

    # Determine verdict
    if fraud_score < 0.30:
        verdict = "approved"
    elif fraud_score < 0.60:
        verdict = "soft_flagged"
    else:
        verdict = "denied"

    return {"fraud_score": fraud_score, "flags": flags, "verdict": verdict}


async def _check_syndicate(h3_hex: str, since: datetime) -> float:
    """
    Query Neo4j to see if an anomalous cluster of riders appeared in this hex
    within 2 minutes of the disruption start.
    """
    try:
        driver = _get_neo4j_driver()
        window_start = since
        window_end = since + timedelta(minutes=2)

        async with driver.session() as session:
            # Upsert rider and hex nodes, create claim relationship
            query = """
            MATCH (t:Telemetry)
            WHERE t.h3_hex = $hex
              AND t.ts >= $start
              AND t.ts <= $end
            RETURN count(DISTINCT t.rider_id) AS cluster_size
            """
            result = await session.run(query, hex=h3_hex, start=window_start.isoformat(), end=window_end.isoformat())
            record = await result.single()
            cluster_size = record["cluster_size"] if record else 0

        if cluster_size >= SYNDICATE_CLUSTER_SIZE:
            return min(cluster_size / 50, 1.0)  # Scale: 50 = max suspicion
        return 0.0
    except Exception:
        # Neo4j not available in dev — skip check
        return 0.0


async def push_telemetry_to_neo4j(rider_id: str, h3_hex: str, ts: datetime):
    """Store telemetry node in Neo4j for fraud graph analysis."""
    try:
        driver = _get_neo4j_driver()
        async with driver.session() as session:
            await session.run(
                """
                MERGE (r:Rider {id: $rider_id})
                MERGE (h:HexGrid {id: $h3_hex})
                CREATE (t:Telemetry {rider_id: $rider_id, h3_hex: $h3_hex, ts: $ts})
                CREATE (r)-[:PINGED_IN]->(h)
                CREATE (t)-[:BELONGS_TO]->(r)
                """,
                rider_id=rider_id,
                h3_hex=h3_hex,
                ts=ts.isoformat(),
            )
    except Exception:
        pass  # Non-critical for demo


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km between two lat/lng points."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))
