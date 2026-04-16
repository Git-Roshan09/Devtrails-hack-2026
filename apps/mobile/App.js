import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Animated, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import AuthPanel from "./src/components/AuthPanel";
import BasicInfoGate from "./src/components/BasicInfoGate";
import WalletCard from "./src/components/WalletCard";
import WarningsCard from "./src/components/WarningsCard";
import SubmitClaimModal from "./src/components/SubmitClaimModal";
import { RED_ZONES } from "./src/data/zones";

const BACKEND_URL = "https://grumpy-moles-wash.loca.lt";
const BG_TASK_NAME = "GIGACHAD_GPS_TASK";
const PING_INTERVAL_SECONDS = 10;
const RIDER_ID_STORAGE_KEY = "gc_rider_id";
const PROFILE_PREFIX = "gc_profile_";

async function sendPing(lat, lng, riderId) {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/telemetry/ping`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Bypass-Tunnel-Reminder": "true",
      },
      body: JSON.stringify({
        rider_id: riderId,
        lat,
        lng,
        speed_kmh: 0,
        wifi_ssid: "GigaChad_Field",
        network_type: "4G",
        is_shift_active: true,
        is_fake: false,
      }),
    });

    return resp.ok;
  } catch (e) {
    return false;
  }
}

TaskManager.defineTask(BG_TASK_NAME, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const loc = data.locations[0];
  const riderId = await AsyncStorage.getItem(RIDER_ID_STORAGE_KEY);
  if (!riderId) return;
  await sendPing(loc.coords.latitude, loc.coords.longitude, riderId);
});

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const [dbRiderId, setDbRiderId] = useState("");
  const [profile, setProfile] = useState({ name: "", phone: "", zone: "", ready: false });
  const [activeTab, setActiveTab] = useState("home");

  const [tracking, setTracking] = useState(false);
  const [pingCount, setPingCount] = useState(0);
  const [lastPing, setLastPing] = useState("");
  const [riderLocation, setRiderLocation] = useState({ lat: 12.9789, lng: 80.218 });

  const [claims, setClaims] = useState([]);
  const [claimModalVisible, setClaimModalVisible] = useState(false);
  const [shiftSummary, setShiftSummary] = useState({ visible: false, step: -1, label: "", done: false, pings: 0 });
  const [liveMsgIdx, setLiveMsgIdx] = useState(0);
  const liveDotAnim = React.useRef(new Animated.Value(0.3)).current;

  const syncRiderAccount = async (user) => {
    const token = await user.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/auth/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Bypass-Tunnel-Reminder": "true",
      },
      body: JSON.stringify({
        firebase_token: token,
        name: user.displayName || user.email,
        phone: "mobile",
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.detail || "Account sync failed");
    }

    setDbRiderId(payload.id);
    await AsyncStorage.setItem(RIDER_ID_STORAGE_KEY, payload.id);
    return payload.id;
  };

  const loadProfile = async (uid) => {
    const raw = await AsyncStorage.getItem(`${PROFILE_PREFIX}${uid}`);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    setProfile(parsed);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setDbRiderId("");
        setProfile({ name: "", phone: "", zone: "", ready: false });
        setAuthLoading(false);
        return;
      }

      try {
        await syncRiderAccount(user);
      } catch (e) {
        const cachedRiderId = await AsyncStorage.getItem(RIDER_ID_STORAGE_KEY);
        if (cachedRiderId) setDbRiderId(cachedRiderId);
      }

      await loadProfile(user.uid);
      setAuthLoading(false);
    });

    return unsub;
  }, []);

  const login = async ({ email, password }) => {
    setAuthBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      throw new Error("Invalid credentials.");
    } finally {
      setAuthBusy(false);
    }
  };

  const register = async ({ name, email, password }) => {
    setAuthBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await syncRiderAccount(cred.user);
    } catch (e) {
      throw new Error("Registration failed. Try a different email.");
    } finally {
      setAuthBusy(false);
    }
  };

  const forgotPassword = async (email) => {
    if (!email) {
      Alert.alert("Enter email", "Type your email first and try again.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert("Reset sent", "Check your inbox for the reset link.");
    } catch (e) {
      Alert.alert("Failed", "Could not send reset email.");
    }
  };

  const saveBasicInfo = async () => {
    if (!profile.name.trim() || !/^\d{10}$/.test(profile.phone) || !profile.zone.trim()) {
      Alert.alert("Missing details", "Please enter name, 10-digit phone, and zone.");
      return;
    }

    const next = { ...profile, ready: true };
    setProfile(next);
    await AsyncStorage.setItem(`${PROFILE_PREFIX}${currentUser.uid}`, JSON.stringify(next));
  };

  const startTracking = async () => {
    if (!dbRiderId) {
      Alert.alert("Connection required", "Could not find rider id from backend.");
      return;
    }

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      Alert.alert("Location denied", "Allow location to start shift tracking.");
      return;
    }

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = current.coords.latitude;
    const lng = current.coords.longitude;

    const ok = await sendPing(lat, lng, dbRiderId);
    if (ok) {
      setPingCount((p) => p + 1);
      setLastPing(new Date().toLocaleTimeString());
      setRiderLocation({ lat, lng });
    }

    await Location.requestBackgroundPermissionsAsync();
    await Location.startLocationUpdatesAsync(BG_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: PING_INTERVAL_SECONDS * 1000,
      distanceInterval: 50,
      foregroundService: {
        notificationTitle: "GigaChad tracking active",
        notificationBody: "Your shift protection is running",
        notificationColor: "#00d26a",
      },
    });

    setTracking(true);
  };

  const stopTracking = async () => {
    const hasTask = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME).catch(() => false);
    if (hasTask) {
      await Location.stopLocationUpdatesAsync(BG_TASK_NAME).catch(() => {});
    }
    setTracking(false);
    loadClaims();
  };

  const loadClaims = async () => {
    if (!dbRiderId) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/claims/rider/${dbRiderId}`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      if (!response.ok) return;
      const data = await response.json();
      setClaims(Array.isArray(data) ? data : []);
    } catch (e) {}
  };

  useEffect(() => {
    if (dbRiderId) {
      loadClaims();
    }
  }, [dbRiderId]);

  const LIVE_MSGS = [
    "Analysing your zone for disruptions...",
    "Monitoring rain & traffic conditions...",
    "Watching for flood alerts nearby...",
    "AI shield is active ✔ You're covered",
    "Checking road conditions ahead...",
    "Ride safe — GigaChad has your back 🛡️",
  ];

  useEffect(() => {
    if (!tracking) return;
    // Cycle messages every 4s
    const msgTimer = setInterval(() => {
      setLiveMsgIdx((i) => (i + 1) % LIVE_MSGS.length);
    }, 4000);
    // Pulse the dot continuously
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(liveDotAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      clearInterval(msgTimer);
      pulse.stop();
    };
  }, [tracking]);

  const totalPaid = useMemo(
    () => claims.filter((c) => c.status === "paid").reduce((sum, c) => sum + (c.total_payout || 0), 0),
    [claims]
  );

  const recentTransactions = useMemo(
    () =>
      claims
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((claim) => ({
          id: claim.id,
          label: `${claim.disruption_type || "Disruption"} claim`,
          amount: claim.status === "paid" ? Number(claim.total_payout || 0) : -39,
          date: new Date(claim.created_at).toLocaleDateString("en-IN"),
        })),
    [claims]
  );

  const logout = async () => {
    await stopTracking();
    await signOut(auth);
  };

  if (authLoading) {
    return (
      <SafeAreaView style={s.safeCenter}>
        <Text style={s.loading}>Loading app...</Text>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#050505" />
        <View style={s.authWrap}>
          <Text style={s.logo}>GigaChad Rider</Text>
          <Text style={s.subtitle}>Income protection with live telemetry</Text>
          <AuthPanel
            mode={authMode}
            loading={authBusy}
            onLogin={login}
            onRegister={register}
            onForgotPassword={forgotPassword}
            onSwitchMode={() => setAuthMode((m) => (m === "login" ? "register" : "login"))}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile.ready) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#050505" />
        <View style={s.authWrap}>
          <Text style={s.logo}>Rider Onboarding</Text>
          <BasicInfoGate
            profile={profile}
            onChange={(key, value) => setProfile((p) => ({ ...p, [key]: value }))}
            onSave={saveBasicInfo}
          />
          <TouchableOpacity style={s.logoutBtn} onPress={logout}>
            <Text style={s.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />

      {/* ── End-of-Shift Analysis Overlay ── */}
      {shiftSummary.visible && (
        <View style={s.overlay}>
          {!shiftSummary.done ? (
            <View style={s.analysisBox}>
              <View style={s.scanRing}>
                <Animated.View style={s.scanPulse} />
                <Text style={s.scanIcon}>🛡️</Text>
              </View>
              <Text style={s.analysisTitle}>Analysing your surroundings</Text>
              <Text style={s.analysisSubtitle}>Checking for any risks in your zone...</Text>

              <View style={s.stepList}>
                {[
                  "Scanning zone for disruptions",
                  "Checking rain & traffic telemetry",
                  "Reviewing ride patterns",
                  "Running fraud prevention",
                  "Calculating payout eligibility",
                  "All clear ✓",
                ].map((step, idx) => (
                  <View key={idx} style={s.stepRow}>
                    <Text style={[
                      s.stepDot,
                      shiftSummary.step >= idx && s.stepDotActive,
                      idx === shiftSummary.step && s.stepDotCurrent,
                    ]}>
                      {shiftSummary.step > idx ? "✓" : shiftSummary.step === idx ? "›" : "·"}
                    </Text>
                    <Text style={[
                      s.stepText,
                      shiftSummary.step >= idx && s.stepTextActive,
                    ]}>
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={s.summaryBox}>
              <Text style={s.summaryEmoji}>🏍️</Text>
              <Text style={s.summaryTitle}>Ride Safe!</Text>
              <Text style={s.summaryMsg}>
                Your shift data has been recorded. GigaChad AI is watching over your earnings 24/7.
              </Text>

              <View style={s.summaryStats}>
                <View style={s.statChip}>
                  <Text style={s.statNum}>{shiftSummary.pings}</Text>
                  <Text style={s.statLabel}>Pings Sent</Text>
                </View>
                <View style={s.statChip}>
                  <Text style={[s.statNum, { color: "#00d26a" }]}>✓ Clear</Text>
                  <Text style={s.statLabel}>Risk Status</Text>
                </View>
                <View style={s.statChip}>
                  <Text style={[s.statNum, { color: "#64b5f6" }]}>Active</Text>
                  <Text style={s.statLabel}>Protection</Text>
                </View>
              </View>

              <View style={s.safetyTip}>
                <Text style={s.safetyTipText}>
                  💡 Tip: Keep your app open during shifts for faster disruption detection.
                </Text>
              </View>

              <TouchableOpacity
                style={s.summaryClose}
                onPress={() => setShiftSummary({ visible: false, step: -1, label: "", done: false, pings: 0 })}
              >
                <Text style={s.summaryCloseText}>Got it, thanks ⚡</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Hi {profile.name.split(" ")[0]}</Text>
          <Text style={s.headerSub}>Zone: {profile.zone}</Text>
        </View>
        <TouchableOpacity onPress={logout}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {[
          { id: "home", label: "Shift" },
          { id: "wallet", label: "Wallet" },
          { id: "warnings", label: "Warnings" },
          { id: "claims", label: "Claims" },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[s.tabBtn, activeTab === tab.id && s.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.body}>
        {activeTab === "home" ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Live Shift Protection</Text>
            <Text style={s.meta}>{tracking ? "Broadcasting location" : "Tracking is paused"}</Text>
            <Text style={s.meta}>Pings sent: {pingCount}</Text>
            <Text style={s.meta}>Last ping: {lastPing || "No ping yet"}</Text>
            <Text style={s.meta}>
              Lat: {Number(riderLocation.lat).toFixed(5)} | Lng: {Number(riderLocation.lng).toFixed(5)}
            </Text>
            <TouchableOpacity style={[s.cta, tracking && s.ctaStop]} onPress={tracking ? stopTracking : startTracking}>
              <Text style={s.ctaText}>{tracking ? "Stop Shift" : "Start Shift"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Live AI Analysis Banner (only while tracking) ── */}
        {activeTab === "home" && tracking ? (
          <View style={s.liveCard}>
            <View style={s.liveCardRow}>
              <Animated.View style={[s.liveDot, { opacity: liveDotAnim }]} />
              <Text style={s.liveMsg}>{LIVE_MSGS[liveMsgIdx]}</Text>
            </View>
            <View style={s.liveBarTrack}>
              <Animated.View
                style={[
                  s.liveBarFill,
                  {
                    transform: [{
                      scaleX: liveDotAnim.interpolate({
                        inputRange: [0.3, 1],
                        outputRange: [0.3, 1],
                      }),
                    }],
                  },
                ]}
              />
            </View>
            <Text style={s.liveRideSafe}>🙏 Ride Safe — Your income is protected this shift</Text>
          </View>
        ) : null}

        {activeTab === "wallet" ? <WalletCard totalPaid={totalPaid} transactions={recentTransactions} /> : null}

        {activeTab === "warnings" ? <WarningsCard zones={RED_ZONES} riderLocation={riderLocation} /> : null}

        {activeTab === "claims" ? (
          <View style={[s.card, { gap: 0 }]}>
            {/* Header row with title + file-claim CTA */}
            <View style={s.claimsHeader}>
              <Text style={s.cardTitle}>My Claims</Text>
              <TouchableOpacity
                style={s.fileClaimBtn}
                onPress={() => setClaimModalVisible(true)}
              >
                <Text style={s.fileClaimBtnText}>+ File a Claim</Text>
              </TouchableOpacity>
            </View>

            {/* Status legend */}
            <View style={s.statusLegend}>
              {[
                { color: "#ffa726", label: "Pending" },
                { color: "#00d26a", label: "Paid" },
                { color: "#e57373", label: "Denied" },
                { color: "#64b5f6", label: "Approved" },
              ].map((l) => (
                <View key={l.label} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: l.color }]} />
                  <Text style={s.legendLabel}>{l.label}</Text>
                </View>
              ))}
            </View>

            <FlatList
              data={claims}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const statusColor =
                  item.status === "paid" ? "#00d26a"
                  : item.status === "approved" ? "#64b5f6"
                  : item.status === "denied" ? "#e57373"
                  : "#ffa726";
                return (
                  <View style={s.claimRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.claimType}>{item.disruption_type?.replace(/_/g, " ") || "Disruption"}</Text>
                      <Text style={s.claimMeta}>
                        {new Date(item.created_at).toLocaleDateString("en-IN")}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={[s.claimAmount, { color: statusColor }]}>
                        ₹{Number(item.total_payout || 0).toFixed(0)}
                      </Text>
                      <View style={[s.statusBadge, { backgroundColor: statusColor + "22" }]}>
                        <Text style={[s.statusBadgeText, { color: statusColor }]}>
                          {item.status?.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={s.emptyState}>
                  <Text style={s.emptyIcon}>📋</Text>
                  <Text style={s.emptyTitle}>No claims yet</Text>
                  <Text style={s.emptySubtitle}>
                    Tap "File a Claim" above if a disruption prevented you from working.
                  </Text>
                </View>
              }
              scrollEnabled={false}
            />
          </View>
        ) : null}

        {/* Claim Submission Modal */}
        <SubmitClaimModal
          visible={claimModalVisible}
          onClose={() => setClaimModalVisible(false)}
          onSubmitted={(claimId) => {
            Alert.alert(
              "Claim Submitted! 🎉",
              "Your claim is under review. If verified, you'll receive a UPI payout automatically.",
              [{ text: "Got it", onPress: () => loadClaims() }]
            );
          }}
          riderId={dbRiderId}
          backendUrl={BACKEND_URL}
          riderLocation={{ ...riderLocation, zone: profile.zone }}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#050505" },
  safeCenter: { flex: 1, backgroundColor: "#050505", justifyContent: "center", alignItems: "center" },
  loading: { color: "#fff" },
  authWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 18 },
  logo: { color: "#00d26a", fontSize: 28, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#8f8f8f", textAlign: "center", marginTop: 6, marginBottom: 16 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop : window.statusBarHeight + 15 || 50,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#202020",
  },
  headerTitle: { color: "#fff", fontWeight: "800", fontSize: 20 },
  headerSub: { color: "#8f8f8f", marginTop: 2 },
  logoutBtn: { marginTop: 14, alignSelf: "center" },
  logoutText: { color: "#ff7e7e", fontWeight: "600" },

  tabs: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#1a1a1a" },
  tabBtnActive: { backgroundColor: "#103325" },
  tabText: { color: "#9a9a9a", fontWeight: "600" },
  tabTextActive: { color: "#93f2c1" },

  body: { flex: 1, padding: 12 },
  card: { backgroundColor: "#121212", borderColor: "#252525", borderWidth: 1, borderRadius: 14, padding: 16, flex: 1 },
  cardTitle: { color: "#fff", fontWeight: "700", fontSize: 17, marginBottom: 8 },
  meta: { color: "#9a9a9a", marginBottom: 4 },

  cta: { marginTop: 12, backgroundColor: "#00d26a", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  ctaStop: { backgroundColor: "#ff7c7c" },
  ctaText: { color: "#071d12", fontWeight: "800" },

  // Live AI Analysis Banner
  liveCard: {
    marginTop: 10,
    backgroundColor: "#0a150f",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1a3325",
    padding: 14,
    gap: 10,
  },
  liveCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00d26a",
  },
  liveMsg: {
    color: "#a0e8c0",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  liveBarTrack: {
    height: 3,
    backgroundColor: "#1a2e20",
    borderRadius: 2,
    overflow: "hidden",
  },
  liveBarFill: {
    height: 3,
    width: "100%",
    backgroundColor: "#00d26a",
    borderRadius: 2,
    transformOrigin: "left",
  },
  liveRideSafe: {
    color: "#3a6e4e",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  claimsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  fileClaimBtn: {
    backgroundColor: "#00d26a",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  fileClaimBtnText: { color: "#071d12", fontWeight: "800", fontSize: 13 },

  statusLegend: { flexDirection: "row", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: "#666", fontSize: 11 },

  claimRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },
  claimType: { color: "#fff", fontWeight: "600", textTransform: "capitalize" },
  claimMeta: { color: "#8f8f8f", fontSize: 12, marginTop: 3 },
  claimAmount: { fontWeight: "800", fontSize: 16 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },

  emptyState: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: "#fff", fontWeight: "700", fontSize: 16 },
  emptySubtitle: { color: "#666", fontSize: 13, textAlign: "center", lineHeight: 20, maxWidth: 260 },

  // ── End-of-Shift Overlay ──────────────────────────────────
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(5,5,5,0.97)",
    zIndex: 999,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  // Scanning phase
  analysisBox: { alignItems: "center", width: "100%", maxWidth: 340 },
  scanRing: {
    width: 100, height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#00d26a44",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    backgroundColor: "#0a1f12",
  },
  scanPulse: {
    position: "absolute",
    width: 100, height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "#00d26a",
    opacity: 0.35,
  },
  scanIcon: { fontSize: 40 },
  analysisTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  analysisSubtitle: {
    color: "#666",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 28,
  },
  stepList: { width: "100%", gap: 10 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepDot: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: "#1a1a1a",
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "800",
    fontSize: 13,
  },
  stepDotActive: { backgroundColor: "#0e2a1a", color: "#00d26a" },
  stepDotCurrent: { backgroundColor: "#00d26a22", color: "#00d26a", borderWidth: 1, borderColor: "#00d26a" },
  stepText: { color: "#444", fontSize: 14, flex: 1 },
  stepTextActive: { color: "#ccc" },

  // Summary (done) phase
  summaryBox: {
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#0e0e0e",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#1e1e1e",
    padding: 28,
    gap: 0,
  },
  summaryEmoji: { fontSize: 52, marginBottom: 12 },
  summaryTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 10,
  },
  summaryMsg: {
    color: "#777",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
  },
  summaryStats: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statChip: {
    flex: 1,
    backgroundColor: "#151515",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#252525",
    paddingVertical: 12,
    alignItems: "center",
  },
  statNum: { color: "#fff", fontWeight: "800", fontSize: 16, marginBottom: 2 },
  statLabel: { color: "#555", fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
  safetyTip: {
    backgroundColor: "#0a1a10",
    borderLeftWidth: 3,
    borderLeftColor: "#00d26a",
    borderRadius: 8,
    padding: 12,
    marginBottom: 22,
    width: "100%",
  },
  safetyTipText: { color: "#7ecda0", fontSize: 12, lineHeight: 18 },
  summaryClose: {
    backgroundColor: "#00d26a",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
  },
  summaryCloseText: { color: "#071d12", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
});
