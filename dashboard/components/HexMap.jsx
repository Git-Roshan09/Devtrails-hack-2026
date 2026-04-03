"use client";
import { useEffect, useRef } from "react";

// Chennai approx bounding: 12.85 – 13.15 lat, 80.05 – 80.35 lng
const CHENNAI_CENTER = [13.0, 80.2];

export default function HexMap({ disruptions = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapInstanceRef.current) return; // Already initialized

    const L = require("leaflet");

    const map = L.map(mapRef.current, {
      center: CHENNAI_CENTER,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap contributors © CARTO",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Add Chennai micro-zone markers
    const zones = [
      { name: "Velachery", lat: 12.9789, lng: 80.218,  color: "#00e676" },
      { name: "OMR",       lat: 12.901,  lng: 80.2279, color: "#00e676" },
      { name: "T. Nagar",  lat: 13.0418, lng: 80.2341, color: "#00e676" },
      { name: "Anna Nagar",lat: 13.0891, lng: 80.2152, color: "#00e676" },
      { name: "Tambaram",  lat: 12.9249, lng: 80.1,    color: "#00e676" },
    ];

    zones.forEach(z => {
      L.circleMarker([z.lat, z.lng], {
        radius: 20,
        color: z.color,
        fillColor: z.color,
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: "4 4",
      }).addTo(map).bindPopup(`<b>${z.name}</b><br>GigaChad Zone ✅`);

      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div style="background:#0a1a0a;border:1px solid ${z.color};border-radius:6px;padding:2px 6px;font-size:11px;color:${z.color};white-space:nowrap;font-weight:700">${z.name}</div>`,
          className: "",
          iconAnchor: [30, 10],
        }),
      }).addTo(map);
    });

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
  }, []);

  // Update disruption overlays when disruptions change
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const L = require("leaflet");

    layerGroupRef.current.clearLayers();

    disruptions.forEach(d => {
      // Find zone coordinates
      const zoneCoords = {
        velachery: [12.9789, 80.218],
        omr:       [12.901,  80.2279],
        t_nagar:   [13.0418, 80.2341],
        anna_nagar:[13.0891, 80.2152],
        tambaram:  [12.9249, 80.1],
      };
      const zoneName = d.zone_name?.toLowerCase().replace(" ", "_") || "velachery";
      const coords = zoneCoords[zoneName] || zoneCoords.velachery;

      // Pulsing red disruption circle
      L.circleMarker(coords, {
        radius: 40,
        color: "#ff3b3b",
        fillColor: "#ff3b3b",
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(layerGroupRef.current)
        .bindPopup(`
          <div style="font-family:monospace;font-size:12px">
            <b>🌊 ${d.zone_name} — ${d.event_type}</b><br>
            Rain: ${d.rain_mm || "?"}mm | Traffic: ${d.traffic_kmh || "?"}km/h<br>
            <span style="color:#ff9800">DISRUPTION ACTIVE</span>
          </div>
        `);
    });
  }, [disruptions]);

  return (
    <div
      ref={mapRef}
      style={{ height: "420px", width: "100%", backgroundColor: "#0a0a0a" }}
    />
  );
}
