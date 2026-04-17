"use client";
import { useEffect, useRef } from "react";

const CHENNAI_CENTER = [13.0, 80.2];

export default function HexMap({ disruptions = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mapInstanceRef.current) return;

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

    const zones = [
      { name: "Velachery", lat: 12.9789, lng: 80.218, color: "#00e676" },
      { name: "OMR", lat: 12.901, lng: 80.2279, color: "#00e676" },
      { name: "T. Nagar", lat: 13.0418, lng: 80.2341, color: "#00e676" },
      { name: "Anna Nagar", lat: 13.0891, lng: 80.2152, color: "#00e676" },
      { name: "Tambaram", lat: 12.9249, lng: 80.1, color: "#00e676" },
    ];

    zones.forEach(z => {
      L.circleMarker([z.lat, z.lng], {
        radius: 20,
        color: z.color,
        fillColor: z.color,
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: "4 4",
      }).addTo(map).bindPopup(`<b>${z.name}</b><br><span style="color:#00e676;font-size:11px">GigaChad Covered ✓</span>`);

      L.marker([z.lat, z.lng], {
        icon: L.divIcon({
          html: `<div style="background:var(--color-surface);border:1px solid ${z.color};border-radius:6px;padding:2px 6px;font-size:11px;color:${z.color};white-space:nowrap;font-weight:700">${z.name}</div>`,
          className: "",
          iconAnchor: [30, 10],
        }),
      }).addTo(map);
    });

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const L = require("leaflet");

    layerGroupRef.current.clearLayers();

    disruptions.forEach(d => {
      const zoneCoords = {
        velachery: [12.9789, 80.218],
        omr: [12.901, 80.2279],
        t_nagar: [13.0418, 80.2341],
        anna_nagar: [13.0891, 80.2152],
        tambaram: [12.9249, 80.1],
      };
      const zoneName = d.zone_name?.toLowerCase().replace(" ", "_") || "velachery";
      const coords = zoneCoords[zoneName] || zoneCoords.velachery;

      L.circleMarker(coords, {
        radius: 40,
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.18,
        weight: 2,
      }).addTo(layerGroupRef.current)
        .bindPopup(`
          <div style="font-family:inherit;font-size:12px;padding:4px">
            <b style="color:#ef4444;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">${d.zone_name} — ${d.event_type}</b><br>
            <span style="color:#888888">Rain: ${d.rain_mm || "?"}mm | Traffic: ${d.traffic_kmh || "?"}km/h</span><br>
            <span style="color:#f59e0b;font-weight:bold;font-size:10px">ACTIVE DISRUPTION</span>
          </div>
        `);
    });
  }, [disruptions]);

  return (
    <div
      ref={mapRef}
      style={{ height: "420px", width: "100%", backgroundColor: "var(--color-surface, #111111)" }}
    />
  );
}
