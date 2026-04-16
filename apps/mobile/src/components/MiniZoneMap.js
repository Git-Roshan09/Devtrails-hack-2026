import React, { useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import MapView, { Marker, Circle, Callout } from "react-native-maps";

const FALLBACK_CENTER = { latitude: 12.9789, longitude: 80.218 };

function getInitialRegion(riderLocation, zones) {
  const points = [
    {
      latitude: Number(riderLocation?.lat || FALLBACK_CENTER.latitude),
      longitude: Number(riderLocation?.lng || FALLBACK_CENTER.longitude),
    },
    ...zones.map((z) => ({ latitude: Number(z.lat), longitude: Number(z.lng) })),
  ];

  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.04, (maxLat - minLat) * 2),
    longitudeDelta: Math.max(0.04, (maxLng - minLng) * 2),
  };
}

export default function MiniZoneMap({ riderLocation, zones }) {
  const mapRef = useRef(null);
  const [selectedZoneId, setSelectedZoneId] = useState(zones[0]?.id || null);

  const initialRegion = useMemo(() => getInitialRegion(riderLocation, zones), [riderLocation, zones]);
  const riderCoords = {
    latitude: Number(riderLocation?.lat || FALLBACK_CENTER.latitude),
    longitude: Number(riderLocation?.lng || FALLBACK_CENTER.longitude),
  };

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || zones[0];

  const focusZone = (zone) => {
    setSelectedZoneId(zone.id);
    mapRef.current?.animateToRegion(
      {
        latitude: Number(zone.lat),
        longitude: Number(zone.lng),
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      450
    );
  };

  return (
    <View style={s.wrap}>
      <MapView ref={mapRef} style={s.map} initialRegion={initialRegion}>
        <Marker coordinate={riderCoords} pinColor="#00d26a" title="You are here">
          <Callout>
            <View style={s.callout}>
              <Text style={s.calloutTitle}>Current Position</Text>
              <Text style={s.calloutBody}>
                {riderCoords.latitude.toFixed(4)}, {riderCoords.longitude.toFixed(4)}
              </Text>
            </View>
          </Callout>
        </Marker>

        {zones.map((zone) => {
          const lat = Number(zone.lat);
          const lng = Number(zone.lng);
          const selected = zone.id === selectedZoneId;

          return (
            <React.Fragment key={zone.id}>
              <Circle
                center={{ latitude: lat, longitude: lng }}
                radius={selected ? 550 : 420}
                fillColor={selected ? "rgba(255,77,77,0.30)" : "rgba(255,77,77,0.18)"}
                strokeColor={selected ? "rgba(255,77,77,0.9)" : "rgba(255,77,77,0.45)"}
                strokeWidth={selected ? 2 : 1}
              />
              <Marker
                coordinate={{ latitude: lat, longitude: lng }}
                pinColor={selected ? "#ff3b3b" : "#ff6a6a"}
                title={zone.name}
                description={zone.risk}
                onPress={() => setSelectedZoneId(zone.id)}
              >
                <Callout onPress={() => focusZone(zone)}>
                  <View style={s.callout}>
                    <Text style={s.calloutTitle}>{zone.name}</Text>
                    <Text style={s.calloutBody}>{zone.risk}</Text>
                    <Text style={s.calloutHint}>Tap to focus zone</Text>
                  </View>
                </Callout>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapView>

      <View style={s.legendWrap}>
        <Text style={s.legend}>Tap markers to view zone risks and focus map</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.zonePills}>
        {zones.map((zone) => {
          const active = zone.id === selectedZoneId;
          return (
            <TouchableOpacity
              key={zone.id}
              style={[s.pill, active && s.pillActive]}
              onPress={() => focusZone(zone)}
            >
              <Text style={[s.pillText, active && s.pillTextActive]}>{zone.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedZone ? (
        <View style={s.zoneInfo}>
          <Text style={s.zoneInfoTitle}>{selectedZone.name}</Text>
          <Text style={s.zoneInfoBody}>{selectedZone.risk}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    backgroundColor: "#101b16",
    overflow: "hidden",
    marginTop: 8,
  },
  map: {
    height: 250,
    width: "100%",
  },
  callout: {
    maxWidth: 210,
    padding: 2,
  },
  calloutTitle: {
    fontWeight: "700",
    marginBottom: 2,
  },
  calloutBody: {
    fontSize: 12,
    color: "#333",
  },
  calloutHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#d44",
    fontWeight: "600",
  },
  legendWrap: {
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  legend: {
    color: "#95d5af",
    fontSize: 11,
    fontWeight: "600",
  },
  zonePills: {
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pill: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#303030",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillActive: {
    backgroundColor: "#361212",
    borderColor: "#ff5a5a",
  },
  pillText: {
    color: "#c9c9c9",
    fontSize: 12,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#ffd4d4",
  },
  zoneInfo: {
    borderTopWidth: 1,
    borderTopColor: "#232323",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#161010",
  },
  zoneInfoTitle: {
    color: "#ffdcdc",
    fontWeight: "700",
    fontSize: 13,
  },
  zoneInfoBody: {
    marginTop: 3,
    color: "#f2abab",
    fontSize: 12,
  },
});
