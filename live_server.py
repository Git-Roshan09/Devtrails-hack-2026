from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uvicorn

app = FastAPI()

# Allow CORS so our web frontend and mobile app can talk to the backend unhindered
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── MODELS ─────────────────────────────────────────────────────────────
class Ping(BaseModel):
    rider_id: str
    lat: float
    lng: float
    speed_kmh: Optional[float] = 0.0
    wifi_ssid: Optional[str] = None
    network_type: Optional[str] = None
    is_shift_active: Optional[bool] = True
    is_fake: Optional[bool] = False

# ─── IN-MEMORY LIVE STORE ───────────────────────────────────────────────
# For this simple backend, we'll store everything in memory.
# Every time the mobile app pings, we append to this list.
live_locations = []

@app.post("/api/telemetry/ping")
async def receive_ping(ping: Ping):
    ping_data = ping.dict()
    ping_data["timestamp"] = datetime.now().isoformat()
    
    # Store the location
    live_locations.append(ping_data)
    
    # Keep only the latest 1000 pings to prevent memory bloat
    if len(live_locations) > 1000:
        live_locations.pop(0)
        
    fake_tag = "[FAKE GPS]" if ping.is_fake else "[REAL GPS]"
    print(f"📍 {fake_tag} Received ping from Rider {ping.rider_id[:8]}... -> Lat: {ping.lat:.4f}, Lng: {ping.lng:.4f}")
    
    return {"status": "ok", "message": "Location stored securely."}

@app.get("/api/locations")
async def get_locations():
    return {"data": live_locations}

# ─── LIVE MAP DASHBOARD ────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def live_dashboard():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>GigaChad Live Tracker</title>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
            body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0a0a0a; color: white; }
            #map { height: 100vh; width: 100vw; }
            .info-panel { 
                position: absolute; 
                top: 20px; 
                left: 50px; 
                z-index: 1000; 
                background: rgba(10, 10, 10, 0.85); 
                padding: 20px; 
                border-radius: 12px; 
                border: 1px solid #00e676; 
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                backdrop-filter: blur(5px);
            }
            .title { margin: 0 0 10px 0; color: #00e676; font-size: 24px; font-weight: 900; letter-spacing: 1px; }
            .stats { font-size: 14px; color: #ccc; }
        </style>
    </head>
    <body>
        <div class="info-panel">
            <h2 class="title">⚡ GigaChad Live Tracker</h2>
            <div class="stats" id="ping-count">Waiting for mobile telemetry...</div>
            <div class="stats" id="active-riders">Active Riders: 0</div>
        </div>
        <div id="map"></div>

        <script>
            // Initialize Leaflet map centered roughly on Chennai
            var map = L.map('map').setView([13.0, 80.2], 12);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap contributors © CARTO',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);

            var markers = {};
            var paths = {};

            async function fetchLocations() {
                try {
                    const res = await fetch('/api/locations');
                    const json = await res.json();
                    
                    document.getElementById('ping-count').innerText = "Total Pings Received: " + json.data.length;

                    // Group pings by rider_id to figure out the latest location and draw paths
                    const pingsByRider = {};
                    json.data.forEach(p => {
                        if (!pingsByRider[p.rider_id]) pingsByRider[p.rider_id] = [];
                        pingsByRider[p.rider_id].push(p);
                    });

                    document.getElementById('active-riders').innerText = "Active Riders: " + Object.keys(pingsByRider).length;

                    for (let riderId in pingsByRider) {
                        const riderPings = pingsByRider[riderId];
                        const latestPing = riderPings[riderPings.length - 1];
                        
                        // Define marker if it doesn't exist
                        if (!markers[riderId]) {
                            markers[riderId] = L.circleMarker([latestPing.lat, latestPing.lng], {
                                radius: 8,
                                color: '#000',
                                weight: 2,
                                fillColor: '#00e676',
                                fillOpacity: 1
                            }).addTo(map);
                        } else {
                            markers[riderId].setLatLng([latestPing.lat, latestPing.lng]);
                        }

                        // Update popup
                        const timeStr = new Date(latestPing.timestamp).toLocaleTimeString();
                        const fakeBadge = latestPing.is_fake ? "<span style='color:#ff9800;font-size:10px;'>[FAKE GPS]</span>" : "<span style='color:#00e676;font-size:10px;'>[REAL GPS]</span>";
                        markers[riderId].bindPopup(`
                            <div style="font-family:monospace;font-size:12px;">
                                <b>Rider:</b> ${riderId.substring(0,8)}...<br>
                                <b>Speed:</b> ${latestPing.speed_kmh} km/h<br>
                                <b>Last Ping:</b> ${timeStr}<br>
                                ${fakeBadge}
                            </div>
                        `);

                        // Draw path trail
                        if (paths[riderId]) {
                            map.removeLayer(paths[riderId]);
                        }
                        const latlngs = riderPings.map(p => [p.lat, p.lng]);
                        paths[riderId] = L.polyline(latlngs, {color: '#00e676', weight: 4, opacity: 0.5}).addTo(map);
                        
                        // Auto-center map if there's only 1 rider for demo purposes
                        if (Object.keys(pingsByRider).length === 1 && riderPings.length % 5 === 0) {
                            map.flyTo([latestPing.lat, latestPing.lng], 14, {animate: true, duration: 1});
                        }
                    }
                } catch (e) {
                    console.error("Error fetching locations:", e);
                }
            }

            // Poll backend every 2 seconds for fresh live location updates
            setInterval(fetchLocations, 2000);
        </script>
    </body>
    </html>
    """

if __name__ == "__main__":
    print("🚀 GigaChad Simple Live Server starting...")
    print("👉 Open your browser at: http://localhost:8000")
    print("👉 Make sure your mobile app's BACKEND_URL points to your PC's IP address and port 8000!")
    uvicorn.run(app, host="0.0.0.0", port=8000)
