"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default markers not showing
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom rider icon
const riderIcon = L.divIcon({
  className: "rider-marker",
  html: `
    <div style="
      width: 24px; 
      height: 24px; 
      background: #00e676; 
      border: 3px solid white; 
      border-radius: 50%; 
      box-shadow: 0 0 10px #00e676;
      animation: pulse 2s infinite;
    "></div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Zone icons based on risk status
const createZoneIcon = (status, name) => {
  const colors = {
    danger: { bg: "#ef4444", border: "#dc2626" },
    warning: { bg: "#f59e0b", border: "#d97706" },
    normal: { bg: "#22c55e", border: "#16a34a" },
    safe: { bg: "#22c55e", border: "#16a34a" },
  };
  const color = colors[status] || colors.safe;
  
  return L.divIcon({
    className: "zone-marker",
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
      ">
        <div style="
          background: ${color.bg};
          border: 2px solid ${color.border};
          border-radius: 50%;
          width: 16px;
          height: 16px;
          opacity: 0.8;
        "></div>
        <div style="
          background: rgba(0,0,0,0.7);
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          margin-top: 4px;
          white-space: nowrap;
        ">${name}</div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

export default function LiveMap({ riderLocation, zones }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const riderMarkerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Initialize map centered on Chennai
    const map = L.map(mapRef.current, {
      center: [12.9716, 80.1938],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark theme map tiles
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Add zone markers
    zones.forEach((zone) => {
      L.marker([zone.lat, zone.lng], {
        icon: createZoneIcon(zone.status, zone.name),
      }).addTo(map);

      // Add circle for zone coverage
      L.circle([zone.lat, zone.lng], {
        color: zone.status === "danger" ? "#ef4444" : zone.status === "warning" ? "#f59e0b" : "#22c55e",
        fillColor: zone.status === "danger" ? "#ef4444" : zone.status === "warning" ? "#f59e0b" : "#22c55e",
        fillOpacity: 0.15,
        radius: 1500,
        weight: 1,
      }).addTo(map);
    });

    // Add rider marker
    riderMarkerRef.current = L.marker([riderLocation.lat, riderLocation.lng], {
      icon: riderIcon,
    }).addTo(map);

    // Add popup to rider marker
    riderMarkerRef.current.bindPopup(`
      <div style="text-align: center; padding: 5px;">
        <strong style="color: #00e676;">🛵 You are here</strong><br/>
        <small>Lat: ${riderLocation.lat.toFixed(4)}</small><br/>
        <small>Lng: ${riderLocation.lng.toFixed(4)}</small>
      </div>
    `);

    mapInstanceRef.current = map;

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update rider position
  useEffect(() => {
    if (riderMarkerRef.current && riderLocation) {
      riderMarkerRef.current.setLatLng([riderLocation.lat, riderLocation.lng]);
      
      // Update popup content
      riderMarkerRef.current.setPopupContent(`
        <div style="text-align: center; padding: 5px;">
          <strong style="color: #00e676;">🛵 You are here</strong><br/>
          <small>Lat: ${riderLocation.lat.toFixed(4)}</small><br/>
          <small>Lng: ${riderLocation.lng.toFixed(4)}</small>
        </div>
      `);
    }
  }, [riderLocation]);

  return (
    <>
      <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: "12px" }} />
      <style jsx global>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.7); }
          70% { box-shadow: 0 0 0 15px rgba(0, 230, 118, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 230, 118, 0); }
        }
        .leaflet-container {
          background: #0a0a0a !important;
        }
        .leaflet-popup-content-wrapper {
          background: #111 !important;
          color: white !important;
          border-radius: 8px !important;
        }
        .leaflet-popup-tip {
          background: #111 !important;
        }
      `}</style>
    </>
  );
}
