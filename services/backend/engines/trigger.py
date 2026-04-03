"""
Double-Trigger Engine
─────────────────────
Evaluates OpenWeather + TomTom data for a given H3 hex cell.
Triggers if: Rain > 30mm AND Traffic < 5km/h simultaneously.

Social Trigger Engine
──────────────────────
Uses Groq Llama-3 to classify Tamil news / X posts for strike/VVIP events.
"""

import httpx
import h3
from config import get_settings

settings = get_settings()

# Chennai hex-grid center coordinates for API calls
_HEX_TO_LATLNG: dict = {}

RAIN_THRESHOLD_MM = 30.0
TRAFFIC_THRESHOLD_KMH = 5.0
SOCIAL_CONFIDENCE_THRESHOLD = 0.85

STRIKE_KEYWORDS = [
    "bandh", "strike", "barricade", "curfew", "traffic block",
    "road block", "VVIP", "bus burning", "shutdown", "நிறுத்தம்",
    "ஹர்த்தால்", "மறியல்", "சாலை மறியல்",
]


def _hex_centroid(h3_hex: str) -> tuple[float, float]:
    """Return (lat, lng) centroid of an H3 cell."""
    if h3_hex not in _HEX_TO_LATLNG:
        lat, lng = h3.cell_to_latlng(h3_hex)
        _HEX_TO_LATLNG[h3_hex] = (lat, lng)
    return _HEX_TO_LATLNG[h3_hex]


async def evaluate_double_trigger(h3_hex: str) -> dict:
    """
    Fetch live weather + traffic and evaluate double-trigger logic.
    Returns triggered=True and rain/traffic values if both thresholds breached.
    """
    lat, lng = _hex_centroid(h3_hex)

    rain_mm = 0.0
    traffic_kmh = 999.0
    weather_data = {}
    traffic_data = {}
    errors = []

    # ── OpenWeather ──────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"lat": lat, "lon": lng, "appid": settings.openweather_api_key},
            )
            weather_data = resp.json()
            # rain.1h gives mm in last 1 hour
            rain_mm = weather_data.get("rain", {}).get("1h", 0.0)
    except Exception as e:
        errors.append(f"OpenWeather error: {e}")
        # Fallback: use a simulated value for demo
        rain_mm = 0.0

    # ── TomTom Traffic ───────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
                params={"point": f"{lat},{lng}", "key": settings.tomtom_api_key},
            )
            traffic_data = resp.json()
            segment = traffic_data.get("flowSegmentData", {})
            traffic_kmh = segment.get("currentSpeed", 999)
    except Exception as e:
        errors.append(f"TomTom error: {e}")
        traffic_kmh = 999.0

    triggered = rain_mm >= RAIN_THRESHOLD_MM and traffic_kmh <= TRAFFIC_THRESHOLD_KMH
    confidence = 1.0 if triggered else max(rain_mm / RAIN_THRESHOLD_MM, 0) * max((TRAFFIC_THRESHOLD_KMH - traffic_kmh) / TRAFFIC_THRESHOLD_KMH, 0)

    return {
        "triggered": triggered,
        "h3_hex": h3_hex,
        "lat": lat,
        "lng": lng,
        "rain_mm": rain_mm,
        "traffic_kmh": traffic_kmh,
        "confidence": round(confidence, 4),
        "errors": errors,
    }


async def evaluate_social_trigger(zone_name: str) -> dict:
    """
    Use Groq Llama-3 to classify if there is a civic disruption event in a zone.
    In production: feed real-time Tamil news / X posts.
    For demo: uses a canned news prompt scenario.
    """
    from groq import Groq

    client = Groq(api_key=settings.groq_api_key)

    # In production: fetch from Twitter/X API or Tamil news feed.
    # For demo: simulate a news feed snippet.
    simulated_news = f"""
    [Tamil News Feed – {zone_name}]
    - "OMR road barricade causing massive traffic jam near Perungudi toll" (Times of India Tamil Nadu)  
    - "VVIP movement expected in T. Nagar at 7pm today, police diverting traffic"
    - "Auto strike: Velachery auto drivers call for general strike today"
    - "Heavy police presence near {zone_name}, road closures reported"
    """

    prompt = f"""
You are a civic disruption classifier for Chennai, India.

Analyze these news snippets and determine if there is an active civic disruption 
(strike, VVIP movement, barricade, road blockage, bandh) in the zone: {zone_name}

News:
{simulated_news}

Respond with JSON only:
{{
  "is_disrupted": true/false,
  "disruption_type": "strike|vvip_movement|barricade|none",
  "confidence": 0.0-1.0,
  "key_signals": ["signal1", "signal2"],
  "summary": "one line summary"
}}
"""

    try:
        response = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        result = response.choices[0].message.content
        import json
        parsed = json.loads(result)
        triggered = parsed.get("is_disrupted", False) and parsed.get("confidence", 0) >= SOCIAL_CONFIDENCE_THRESHOLD
        return {
            "triggered": triggered,
            "confidence": parsed.get("confidence", 0),
            "disruption_type": parsed.get("disruption_type", "none"),
            "key_signals": parsed.get("key_signals", []),
            "summary": parsed.get("summary", ""),
            "zone_name": zone_name,
        }
    except Exception as e:
        return {
            "triggered": False,
            "confidence": 0.0,
            "error": str(e),
            "zone_name": zone_name,
        }
