/**
 * GigaChad Telemetry App
 * ──────────────────────
 * Expo Go compatible — no custom native build needed.
 * Sends GPS to the GigaChad backend every 30 seconds.
 * Continues in background via expo-task-manager.
 */

import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  StatusBar,
  Animated,
  SafeAreaView,
  TextInput,
} from "react-native";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";


const BACKEND_URL = "https://pink-parts-fold.loca.lt"; 
// Note: We now fetch rider id from Postgres via Firebase UID, 
// so hardcoded RIDER_ID is no longer strictly used, but we keep the var for API calls if needed.

const BG_TASK_NAME = "GIGACHAD_GPS_TASK";
const PING_INTERVAL_SECONDS = 10;

const ZONES = {
  Velachery:   { lat: 12.9789, lng: 80.218  },
  OMR:         { lat: 12.901,  lng: 80.2279 },
  "T. Nagar":  { lat: 13.0418, lng: 80.2341 },
  "Anna Nagar":{ lat: 13.0891, lng: 80.2152 },
  Tambaram:    { lat: 12.9249, lng: 80.1    },
};


TaskManager.defineTask(BG_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log("[BG Task] Error:", error.message);
    return;
  }
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    if (loc) {
      // In background tasks, we may need to fetch the rider ID from async storage in a real app
      await sendPing(loc.coords.latitude, loc.coords.longitude, false, null);
    }
  }
});

// ─── SEND PING ───────────────────────────────────────────────
async function sendPing(lat, lng, isFake, riderId) {
  try {
    const body = JSON.stringify({
      rider_id: riderId || "demo-uuid",
      lat,
      lng,
      speed_kmh: 0,
      wifi_ssid: "GigaChad_Field",
      network_type: "4G",
      is_shift_active: true,
      is_fake: isFake,
    });

    const resp = await fetch(`${BACKEND_URL}/api/telemetry/ping`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Bypass-Tunnel-Reminder": "true" // Required by localtunnel to avoid the warning page
      },
      body,
    });

    const ok = resp.status === 201 || resp.status === 200;
    console.log(`[Ping] lat=${lat.toFixed(4)} lng=${lng.toFixed(4)} fake=${isFake} → ${ok ? "✅" : "❌ " + resp.status}`);
    return ok;
  } catch (e) {
    console.log("[Ping] Network error:", e.message);
    return false;
  }
}

// ─── APP ─────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [dbRiderId, setDbRiderId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [isTracking, setIsTracking] = useState(false);
  const [useFakeGps, setUseFakeGps] = useState(true);
  const [selectedZone, setSelectedZone] = useState("Velachery");
  const [lastPing, setLastPing] = useState(null);
  const [pingCount, setPingCount] = useState(0);
  const [status, setStatus] = useState("idle");
  const [currentCoords, setCurrentCoords] = useState(null);

  const fakeInterval = useRef(null);
  const dotAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Sync with backend to get postgres Rider ID
        try {
          const token = await user.getIdToken();
          const res = await fetch(`${BACKEND_URL}/api/auth/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
            body: JSON.stringify({ firebase_token: token, name: user.email, phone: "mobile" })
          });
          if(res.ok) {
            const data = await res.json();
            setDbRiderId(data.id);
          }
        } catch(e) {
          console.error("Backend auth sync failed:", e);
        }
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    try {
      setLoginError("");
      await signInWithEmailAndPassword(auth, email, password);
    } catch(err) {
      setLoginError("Invalid credentials");
    }
  };

  // Pulse animation when tracking
  useEffect(() => {
    if (isTracking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.2, duration: 700, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      dotAnim.stopAnimation();
      dotAnim.setValue(1);
    }
  }, [isTracking]);

  async function startTracking() {
    if (!dbRiderId) {
      Alert.alert("Setup Required", "Failed to retrieve your actual rider UUID from the backend. Are you connected to the network?");
      return;
    }

    // Request permissions
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      Alert.alert("Permission Denied", "Location permission is required to protect your income.");
      setStatus("error");
      return;
    }

    if (useFakeGps) {
      // ── FAKE GPS MODE (Demo) ──────────────────────────────
      const zone = ZONES[selectedZone];
      startFakeGps(zone);
    } else {
      // ── REAL GPS MODE ─────────────────────────────────────
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== "granted") {
        Alert.alert(
          "Background Location",
          "Background location permission is needed to protect you while your screen is off. Grant it in Settings.",
          [{ text: "OK" }]
        );
        // Fall back to foreground-only tracking
      }

      await Location.startLocationUpdatesAsync(BG_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: PING_INTERVAL_SECONDS * 1000,
        distanceInterval: 50, // metres
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "GigaChad Shield Active 🛡️",
          notificationBody: "Your income is protected. Tracking location.",
          notificationColor: "#00e676",
        },
      });
    }

    setIsTracking(true);
    setStatus("tracking");
  }

  async function stopTracking() {
    // Stop fake GPS interval
    if (fakeInterval.current) {
      clearInterval(fakeInterval.current);
      fakeInterval.current = null;
    }

    // Stop real background task if running
    const hasTask = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME).catch(() => false);
    if (hasTask) {
      await Location.stopLocationUpdatesAsync(BG_TASK_NAME).catch(() => {});
    }

    setIsTracking(false);
    setStatus("idle");
  }

  function startFakeGps(zone) {
    // Send immediately
    sendFakePing(zone);

    // Then every 30 seconds
    fakeInterval.current = setInterval(() => sendFakePing(zone), PING_INTERVAL_SECONDS * 1000);
  }

  async function sendFakePing(zone) {
    // Add small jitter so it doesn't look static
    const lat = zone.lat + (Math.random() - 0.5) * 0.002;
    const lng = zone.lng + (Math.random() - 0.5) * 0.002;

    const ok = await sendPing(lat, lng, true, dbRiderId);
    if (ok) {
      setCurrentCoords({ lat: lat.toFixed(5), lng: lng.toFixed(5) });
      setLastPing(new Date().toLocaleTimeString());
      setPingCount((c) => c + 1);
    }
  }

  function toggleZone(name) {
    setSelectedZone(name);
    // Restart if already tracking in fake mode
    if (isTracking && useFakeGps) {
      if (fakeInterval.current) clearInterval(fakeInterval.current);
      startFakeGps(ZONES[name]);
    }
  }

  const statusColor = { idle: "#555", tracking: "#00e676", error: "#f44336" }[status];
  const statusLabel = { idle: "● Idle", tracking: "● Broadcasting", error: "● Error" }[status];

  // ── Render Loading or Login screen if not auth'd ─────────
  if (authLoading) return <View style={s.safe}><Text style={{color:'#fff', marginTop: 100, textAlign:'center'}}>Loading...</Text></View>;
  
  if (!currentUser) {
    return (
      <SafeAreaView style={[s.safe, {justifyContent: 'center', padding: 20}]}>
        <Text style={[s.logo, {textAlign:'center', marginBottom: 10}]}>⚡ GigaChad</Text>
        <Text style={[s.sub, {textAlign:'center', marginBottom: 40}]}>Mobile Telemetry Gateway</Text>
        
        <View style={s.card}>
          {loginError ? <Text style={{color:'red', marginBottom: 10}}>{loginError}</Text> : null}
          <Text style={s.cardTitle}>EMAIL</Text>
          <TextInput 
            style={s.input} 
            placeholder="rider@gigachad.com" 
            placeholderTextColor="#555"
            value={email} onChangeText={setEmail} autoCapitalize="none" 
          />
          <Text style={[s.cardTitle, {marginTop: 15}]}>PASSWORD</Text>
          <TextInput 
            style={s.input} 
            placeholder="••••••••" 
            placeholderTextColor="#555"
            secureTextEntry 
            value={password} onChangeText={setPassword} 
          />
          <TouchableOpacity style={s.ctaBtn} onPress={handleLogin}>
            <Text style={s.ctaTxt}>SIGN IN</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.info}>* If you haven't registered, create an account on the GigaChad Web Platform first.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => signOut(auth)} style={{position: 'absolute', right: 0, top: 15, zIndex: 10}}>
             <Text style={{color: '#f44336', fontSize: 12}}>Logout</Text>
          </TouchableOpacity>
          <Text style={s.logo}>⚡ GigaChad</Text>
          <Text style={s.sub}>Income Shield · Telemetry</Text>
        </View>

        {/* ── Status Pill ────────────────────── */}
        <View style={[s.pill, { borderColor: statusColor + "55" }]}>
          <Animated.View style={[s.dot, { backgroundColor: statusColor, opacity: isTracking ? dotAnim : 1 }]} />
          <Text style={[s.pillText, { color: statusColor }]}>{statusLabel}</Text>
          {isTracking && (
            <Text style={s.pillCount}>{pingCount} pings sent</Text>
          )}
        </View>

        {/* ── GPS Mode ───────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>GPS MODE</Text>
          <View style={s.modeRow}>
            <TouchableOpacity
              style={[s.modeBtn, !useFakeGps && s.modeBtnActive]}
              onPress={() => { setUseFakeGps(false); if (isTracking) { stopTracking(); } }}
            >
              <Text style={[s.modeBtnTxt, !useFakeGps && s.modeBtnTxtActive]}>🛰️ Real GPS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modeBtn, useFakeGps && s.modeBtnActive]}
              onPress={() => { setUseFakeGps(true); if (isTracking) { stopTracking(); } }}
            >
              <Text style={[s.modeBtnTxt, useFakeGps && s.modeBtnTxtActive]}>🎭 Fake GPS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Zone Selector (Fake GPS only) ──── */}
        {useFakeGps && (
          <View style={s.card}>
            <Text style={s.cardTitle}>SIMULATE ZONE</Text>
            {Object.keys(ZONES).map((name) => (
              <TouchableOpacity
                key={name}
                style={[s.zoneRow, selectedZone === name && s.zoneRowActive]}
                onPress={() => toggleZone(name)}
              >
                <View style={[s.zoneRadio, selectedZone === name && s.zoneRadioActive]} />
                <Text style={[s.zoneName, selectedZone === name && s.zoneNameActive]}>
                  📍 {name}
                </Text>
                <Text style={s.zoneCoords}>
                  {ZONES[name].lat.toFixed(3)}, {ZONES[name].lng.toFixed(3)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Last Ping Info ─────────────────── */}
        {lastPing && (
          <View style={s.card}>
            <Text style={s.cardTitle}>LAST PING</Text>
            <Text style={s.pingTime}>{lastPing}</Text>
            {currentCoords && (
              <Text style={s.pingCoords}>
                Lat {currentCoords.lat} · Lng {currentCoords.lng}
              </Text>
            )}
            <Text style={s.pingZone}>Zone: {useFakeGps ? selectedZone : "Real Location"}</Text>
          </View>
        )}

        {/* ── Main CTA Button ────────────────── */}
        <TouchableOpacity
          style={[s.ctaBtn, isTracking && s.ctaBtnStop]}
          onPress={isTracking ? stopTracking : startTracking}
          activeOpacity={0.85}
        >
          <Text style={s.ctaIcon}>{isTracking ? "⏹" : "▶"}</Text>
          <Text style={s.ctaTxt}>
            {isTracking ? "Stop Shift" : "Start Shift"}
          </Text>
        </TouchableOpacity>

        {/* ── Info ───────────────────────────── */}
        <Text style={s.info}>
          {useFakeGps
            ? `Sending fake GPS pings from ${selectedZone} every ${PING_INTERVAL_SECONDS}s`
            : `Broadcasting real GPS to backend every ${PING_INTERVAL_SECONDS}s (works in background)`}
        </Text>

        <Text style={s.legal}>
          GigaChad monitors your location only during active shifts to validate income protection claims.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#0a0a0a" },
  scroll: { padding: 20, paddingBottom: 48 },

  header: { alignItems: "center", marginBottom: 24, paddingTop: 12 },
  logo:   { fontSize: 30, fontWeight: "900", color: "#00e676", letterSpacing: 3 },
  sub:    { color: "#444", fontSize: 12, marginTop: 4, letterSpacing: 1 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 20,
    gap: 8,
  },
  dot:       { width: 8, height: 8, borderRadius: 4 },
  pillText:  { fontSize: 13, fontWeight: "700" },
  pillCount: { fontSize: 12, color: "#555", marginLeft: 4 },

  card: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1e1e1e",
  },
  cardTitle: {
    color: "#555",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    backgroundColor: "#161616",
  },
  modeBtnActive:    { backgroundColor: "#001a0d", borderColor: "#00e676" },
  modeBtnTxt:       { color: "#555", fontSize: 13, fontWeight: "600" },
  modeBtnTxtActive: { color: "#00e676" },

  zoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#161616",
    gap: 10,
  },
  zoneRowActive: { /* highlighted by child styles */ },
  zoneRadio: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: "#333",
  },
  zoneRadioActive: { borderColor: "#00e676", backgroundColor: "#00e676" },
  zoneName:       { flex: 1, color: "#666", fontSize: 14 },
  zoneNameActive: { color: "#fff", fontWeight: "700" },
  zoneCoords:     { color: "#333", fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },

  pingTime:   { color: "#fff", fontSize: 18, fontWeight: "700" },
  pingCoords: {
    color: "#555", fontSize: 11, marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  pingZone:   { color: "#00e676", fontSize: 12, marginTop: 6 },

  ctaBtn: {
    backgroundColor: "#00e676",
    borderRadius: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  ctaBtnStop: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#f44336" },
  ctaIcon:    { fontSize: 18 },
  ctaTxt:     { fontSize: 18, fontWeight: "900", color: "#000", letterSpacing: 1 },

  info:  { color: "#555", fontSize: 12, textAlign: "center", marginBottom: 12, lineHeight: 18 },
  legal: { color: "#2a2a2a", fontSize: 10, textAlign: "center", paddingHorizontal: 20, lineHeight: 16 },
  input: {
    backgroundColor: "#1a1a1a",
    color: "#fff",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  }
});
