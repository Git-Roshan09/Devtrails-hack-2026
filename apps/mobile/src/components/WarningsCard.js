import React from "react";
import { View, Text, StyleSheet } from "react-native";
import MiniZoneMap from "./MiniZoneMap";

export default function WarningsCard({ zones, riderLocation }) {
  return (
    <View style={s.card}>
      <Text style={s.title}>Red Zone Warnings</Text>
      <Text style={s.sub}>Avoid these zones to reduce missed deliveries and risk.</Text>
      <MiniZoneMap zones={zones} riderLocation={riderLocation} />

      <View style={{ marginTop: 12, gap: 8 }}>
        {zones.map((zone) => (
          <View key={zone.id} style={s.warningRow}>
            <View style={s.dot} />
            <View style={{ flex: 1 }}>
              <Text style={s.zoneName}>{zone.name}</Text>
              <Text style={s.risk}>{zone.risk}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#121212", borderColor: "#252525", borderWidth: 1, borderRadius: 14, padding: 16 },
  title: { color: "#fff", fontWeight: "700", fontSize: 16 },
  sub: { color: "#9a9a9a", marginTop: 4 },
  warningRow: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "#1c1111", borderRadius: 10, padding: 10 },
  dot: { width: 10, height: 10, borderRadius: 99, backgroundColor: "#ff4d4d" },
  zoneName: { color: "#ffd9d9", fontWeight: "700" },
  risk: { color: "#f2abab", fontSize: 12, marginTop: 1 },
});
