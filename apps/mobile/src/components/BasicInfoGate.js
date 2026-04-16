import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

export default function BasicInfoGate({ profile, onChange, onSave }) {
  return (
    <View style={s.card}>
      <Text style={s.title}>Before starting location tracking</Text>
      <Text style={s.sub}>Add basic rider details for payouts and alerts.</Text>

      <Text style={s.label}>Full Name</Text>
      <TextInput
        style={s.input}
        value={profile.name}
        onChangeText={(v) => onChange("name", v)}
        placeholder="Rider full name"
        placeholderTextColor="#666"
      />

      <Text style={s.label}>Phone Number</Text>
      <TextInput
        style={s.input}
        value={profile.phone}
        keyboardType="phone-pad"
        onChangeText={(v) => onChange("phone", v)}
        placeholder="10-digit phone"
        placeholderTextColor="#666"
      />

      <Text style={s.label}>Preferred Zone</Text>
      <TextInput
        style={s.input}
        value={profile.zone}
        onChangeText={(v) => onChange("zone", v)}
        placeholder="Velachery"
        placeholderTextColor="#666"
      />

      <TouchableOpacity style={s.cta} onPress={onSave}>
        <Text style={s.ctaText}>Save and Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#121212", borderColor: "#252525", borderWidth: 1, borderRadius: 14, padding: 18 },
  title: { color: "#fff", fontWeight: "700", fontSize: 18 },
  sub: { color: "#9a9a9a", marginTop: 4, marginBottom: 12 },
  label: { color: "#9a9a9a", fontSize: 12, marginBottom: 4, marginTop: 8 },
  input: {
    backgroundColor: "#1b1b1b",
    borderColor: "#2d2d2d",
    borderWidth: 1,
    borderRadius: 10,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cta: { marginTop: 14, backgroundColor: "#00d26a", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  ctaText: { color: "#062515", fontWeight: "800" },
});
