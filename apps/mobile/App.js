/**
 * GigaChad Telemetry App
 * ──────────────────────
 * Expo Go compatible — no custom native build needed.
 * Features:
 * - GPS tracking (real or simulated)
 * - Claims history with status
 * - Video appeal for soft-flagged claims
 * - Tab navigation
 */

import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Platform,
  Alert,
  StatusBar,
  Animated,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "./firebase";


const BACKEND_URL = "https://neat-tires-glow.loca.lt"; 
// Note: We now fetch rider id from Postgres via Firebase UID, 
// so hardcoded RIDER_ID is no longer strictly used, but we keep the var for API calls if needed.

const BG_TASK_NAME = "GIGACHAD_GPS_TASK";
const PING_INTERVAL_SECONDS = 10;
const RIDER_ID_STORAGE_KEY = "gc_rider_id";
const KYC_STORAGE_PREFIX = "gc_kyc_";
const MOCK_LOCATION_BLOCK_KEY = "gc_mock_location_block";


TaskManager.defineTask(BG_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.log("[BG Task] Error:", error.message);
    return;
  }
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    if (loc) {
      if (Platform.OS === "android" && loc.mocked) {
        await AsyncStorage.setItem(MOCK_LOCATION_BLOCK_KEY, "true");
        return;
      }
      const riderId = await AsyncStorage.getItem(RIDER_ID_STORAGE_KEY);
      if (!riderId) return;
      await sendPing(loc.coords.latitude, loc.coords.longitude, false, riderId);
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
  const [activeTab, setActiveTab] = useState("tracking"); // "tracking" or "claims"

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Tracking state
  const [isTracking, setIsTracking] = useState(false);
  const [lastPing, setLastPing] = useState(null);
  const [pingCount, setPingCount] = useState(0);
  const [status, setStatus] = useState("idle");
  const [mockLocationDetected, setMockLocationDetected] = useState(false);
  const [kycLoading, setKycLoading] = useState(true);
  const [kycVerified, setKycVerified] = useState(false);
  const [kycName, setKycName] = useState("");
  const [kycAadhaarLast4, setKycAadhaarLast4] = useState("");
  const [kycConsent, setKycConsent] = useState(false);
  const [kycError, setKycError] = useState("");

  // Claims state
  const [claims, setClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsRefreshing, setClaimsRefreshing] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimStats, setClaimStats] = useState({ total: 0, paid: 0, pending: 0 });
  const [currentCoords, setCurrentCoords] = useState(null);

  const dotAnim = useRef(new Animated.Value(1)).current;

  async function syncRiderAccount(user) {
    const token = await user.getIdToken();
    const res = await fetch(`${BACKEND_URL}/api/auth/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Bypass-Tunnel-Reminder": "true" },
      body: JSON.stringify({ firebase_token: token, name: user.email, phone: "mobile" }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.id) {
      throw new Error(payload?.detail || "Account sync failed");
    }

    setDbRiderId(payload.id);
    await AsyncStorage.setItem(RIDER_ID_STORAGE_KEY, payload.id);
    return payload.id;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        setKycLoading(true);
        // Sync with backend to get postgres Rider ID
        try {
          await syncRiderAccount(user);
        } catch(e) {
          console.error("Backend auth sync failed:", e);
          const cachedRiderId = await AsyncStorage.getItem(RIDER_ID_STORAGE_KEY);
          if (cachedRiderId) setDbRiderId(cachedRiderId);
        }
        try {
          const kycValue = await AsyncStorage.getItem(`${KYC_STORAGE_PREFIX}${user.uid}`);
          setKycVerified(kycValue === "verified");
        } catch (e) {
          setKycVerified(false);
        } finally {
          setKycLoading(false);
        }
      } else {
        setDbRiderId(null);
        setKycVerified(false);
        setKycLoading(false);
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

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert("Email Required", "Please enter your email address first.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      Alert.alert("Password Reset", "A password reset link has been sent to your email.", [{ text: "OK" }]);
    } catch(err) {
      if (err.code === "auth/user-not-found") {
        Alert.alert("Error", "No account found with this email.");
      } else {
        Alert.alert("Error", "Failed to send reset email. Try again.");
      }
    }
  };

  const handleCompleteKyc = async () => {
    setKycError("");
    if (!currentUser) return;
    if (!kycName.trim()) {
      setKycError("Please enter your full name.");
      return;
    }
    if (!/^\d{4}$/.test(kycAadhaarLast4)) {
      setKycError("Enter valid Aadhaar last 4 digits.");
      return;
    }
    if (!kycConsent) {
      setKycError("Please accept consent to continue.");
      return;
    }

    try {
      let riderId = dbRiderId;
      if (!riderId) {
        riderId = await syncRiderAccount(currentUser);
      }

      const response = await fetch(`${BACKEND_URL}/api/kyc/mock-verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Bypass-Tunnel-Reminder": "true",
        },
        body: JSON.stringify({
          rider_id: riderId,
          full_name: kycName.trim(),
          aadhaar_last4: kycAadhaarLast4,
          consent: kycConsent,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setKycError(payload.detail || "KYC verification failed. Try again.");
        return;
      }

      await AsyncStorage.setItem(`${KYC_STORAGE_PREFIX}${currentUser.uid}`, "verified");
      setKycVerified(true);
      Alert.alert("KYC Verified", payload.message || "Your KYC is verified. You can now start background protection.");
    } catch (e) {
      setKycError(e?.message || "Failed to verify KYC. Please try again.");
    }
  };

  const handleLogout = async () => {
    await stopTracking();
    await AsyncStorage.removeItem(RIDER_ID_STORAGE_KEY);
    await AsyncStorage.removeItem(MOCK_LOCATION_BLOCK_KEY);
    await signOut(auth);
  };

  // ─── CLAIMS FUNCTIONS ─────────────────────────────────────────
  const fetchClaims = useCallback(async () => {
    if (!dbRiderId) return;
    setClaimsLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/claims/rider/${dbRiderId}`, {
        headers: { "Bypass-Tunnel-Reminder": "true" },
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data);
        
        const totalPaid = data
          .filter((c) => c.status === "paid")
          .reduce((sum, c) => sum + (c.total_payout || 0), 0);
        const pendingCount = data.filter(
          (c) => c.status === "pending" || c.status === "approved"
        ).length;
        
        setClaimStats({ total: data.length, paid: totalPaid, pending: pendingCount });
      }
    } catch (e) {
      console.error("Failed to fetch claims:", e);
    } finally {
      setClaimsLoading(false);
      setClaimsRefreshing(false);
    }
  }, [dbRiderId]);

  useEffect(() => {
    if (activeTab === "claims" && dbRiderId) {
      fetchClaims();
    }
  }, [activeTab, dbRiderId, fetchClaims]);

  const handleVideoAppeal = async (claim) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "We need access to your photos to upload the appeal video.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 0.5,
      videoMaxDuration: 15,
    });

    if (!result.canceled && result.assets[0]) {
      Alert.alert("Uploading Video", "Your appeal video is being uploaded. You'll receive a WhatsApp notification once reviewed.", [{ text: "OK" }]);
      
      try {
        const formData = new FormData();
        formData.append("video", {
          uri: result.assets[0].uri,
          type: "video/mp4",
          name: "appeal.mp4",
        });

        await fetch(`${BACKEND_URL}/api/claims/${claim.id}/appeal`, {
          method: "POST",
          headers: { "Bypass-Tunnel-Reminder": "true" },
          body: formData,
        });
        Alert.alert("Success", "Appeal submitted! We'll review within 2 hours.");
        fetchClaims();
      } catch (e) {
        Alert.alert("Error", "Failed to upload video. Please try WhatsApp.");
      }
    }
  };

  // ─── FILE NEW CLAIM WITH PROOF ────────────────────────────────
  const [showNewClaimModal, setShowNewClaimModal] = useState(false);
  const [newClaimType, setNewClaimType] = useState("flood");
  const [newClaimDescription, setNewClaimDescription] = useState("");
  const [newClaimEvidence, setNewClaimEvidence] = useState(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);

  const handlePickEvidence = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "We need access to your photos to upload evidence.");
      return;
    }

    Alert.alert(
      "Select Evidence Type",
      "Choose how you want to provide proof",
      [
        {
          text: "📷 Take Photo",
          onPress: async () => {
            const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
            if (camStatus !== "granted") {
              Alert.alert("Permission Required", "Camera access is needed.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.7,
            });
            if (!result.canceled && result.assets[0]) {
              setNewClaimEvidence({ type: "photo", uri: result.assets[0].uri });
            }
          }
        },
        {
          text: "🖼️ Choose Photo",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.7,
            });
            if (!result.canceled && result.assets[0]) {
              setNewClaimEvidence({ type: "photo", uri: result.assets[0].uri });
            }
          }
        },
        {
          text: "🎥 Record Video",
          onPress: async () => {
            const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
            if (camStatus !== "granted") {
              Alert.alert("Permission Required", "Camera access is needed.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              allowsEditing: true,
              quality: 0.5,
              videoMaxDuration: 30,
            });
            if (!result.canceled && result.assets[0]) {
              setNewClaimEvidence({ type: "video", uri: result.assets[0].uri });
            }
          }
        },
        { text: "Cancel", style: "cancel" }
      ]
    );
  };

  const handleSubmitNewClaim = async () => {
    if (!dbRiderId) {
      Alert.alert("Error", "Not connected to backend. Please check your connection.");
      return;
    }
    
    setSubmittingClaim(true);
    try {
      // Prepare form data
      const formData = new FormData();
      formData.append("rider_id", dbRiderId);
      formData.append("disruption_type", newClaimType);
      formData.append("description", newClaimDescription);
      formData.append("zone", "detected");
      
      if (currentCoords) {
        formData.append("lat", currentCoords.lat);
        formData.append("lng", currentCoords.lng);
      }
      
      if (newClaimEvidence) {
        formData.append("evidence", {
          uri: newClaimEvidence.uri,
          type: newClaimEvidence.type === "video" ? "video/mp4" : "image/jpeg",
          name: newClaimEvidence.type === "video" ? "evidence.mp4" : "evidence.jpg",
        });
      }

      const response = await fetch(`${BACKEND_URL}/api/claims/submit`, {
        method: "POST",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
        },
        body: formData,
      });

      if (response.ok) {
        Alert.alert(
          "✅ Claim Submitted!",
          "Your claim is being processed. You'll receive a WhatsApp notification once approved.",
          [{ text: "OK" }]
        );
        setShowNewClaimModal(false);
        setNewClaimType("flood");
        setNewClaimDescription("");
        setNewClaimEvidence(null);
        fetchClaims();
      } else {
        const errorData = await response.json();
        Alert.alert("Error", errorData.detail || "Failed to submit claim. Try again.");
      }
    } catch (e) {
      console.error("Claim submission error:", e);
      Alert.alert("Error", "Network error. Please check your connection.");
    } finally {
      setSubmittingClaim(false);
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
    if (!kycVerified) {
      Alert.alert("KYC Required", "Complete KYC verification to start live background protection.");
      return;
    }
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

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (Platform.OS === "android" && current.mocked) {
      setMockLocationDetected(true);
      setStatus("error");
      Alert.alert(
        "Mock Location Detected",
        "Turn off mock location in Android developer settings to continue using GigaChad."
      );
      return;
    }
    const nowOk = await sendPing(current.coords.latitude, current.coords.longitude, false, dbRiderId);
    if (nowOk) {
      setCurrentCoords({ lat: current.coords.latitude.toFixed(5), lng: current.coords.longitude.toFixed(5) });
      setLastPing(new Date().toLocaleTimeString());
      setPingCount((c) => c + 1);
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      Alert.alert(
        "Background Location",
        "Background location permission is needed to protect you while your screen is off. Grant it in Settings.",
        [{ text: "OK" }]
      );
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

    setIsTracking(true);
    setMockLocationDetected(false);
    setStatus("tracking");
  }

  async function stopTracking() {
    // Stop real background task if running
    const hasTask = await TaskManager.isTaskRegisteredAsync(BG_TASK_NAME).catch(() => false);
    if (hasTask) {
      await Location.stopLocationUpdatesAsync(BG_TASK_NAME).catch(() => {});
    }

    setIsTracking(false);
    setStatus("idle");
  }

  

  useEffect(() => {
    (async () => {
      const flagged = await AsyncStorage.getItem(MOCK_LOCATION_BLOCK_KEY);
      if (flagged === "true") {
        setMockLocationDetected(true);
        setStatus("error");
      }
    })();
  }, []);

  const statusColor = { idle: "#555", tracking: "#00e676", error: "#f44336" }[status];
  const statusLabel = mockLocationDetected
    ? "● Mock GPS Detected"
    : { idle: "● Idle", tracking: "● Broadcasting", error: "● Error" }[status];

  // ── Render Loading or Login screen if not auth'd ─────────
  if (authLoading) return <View style={[s.safe, {justifyContent: 'center', alignItems: 'center'}]}><Text style={{color:'#fff', textAlign:'center'}}>Loading...</Text></View>;
  
  if (!currentUser) {
    return (
      <SafeAreaView style={[s.safe, {justifyContent: 'center', padding: 20}]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={[s.logo, {textAlign:'center', marginBottom: 10}]}>🛡️ GigaChad</Text>
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
          <TouchableOpacity onPress={handleForgotPassword} style={{marginTop: 12, alignItems: 'center'}}>
            <Text style={{color: '#888', fontSize: 13}}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.info}>* If you haven't registered, create an account on the GigaChad Web Platform first.</Text>
      </SafeAreaView>
    );
  }

  if (kycLoading) {
    return (
      <SafeAreaView style={[s.safe, { justifyContent: "center", padding: 20 }]}>
        <Text style={[s.logo, { textAlign: "center", marginBottom: 10 }]}>🛡️ GigaChad</Text>
        <Text style={[s.sub, { textAlign: "center" }]}>Checking KYC status...</Text>
      </SafeAreaView>
    );
  }

  if (!kycVerified) {
    return (
      <SafeAreaView style={[s.safe, { justifyContent: "center", padding: 20 }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={[s.logo, { textAlign: "center", marginBottom: 8 }]}>🛡️ GigaChad</Text>
        <Text style={[s.sub, { textAlign: "center", marginBottom: 26 }]}>Complete KYC to activate protection</Text>
        <View style={s.card}>
          {kycError ? <Text style={{ color: "#f44336", marginBottom: 10 }}>{kycError}</Text> : null}
          <Text style={s.cardTitle}>FULL NAME</Text>
          <TextInput
            style={s.input}
            placeholder="Hari Kumar"
            placeholderTextColor="#555"
            value={kycName}
            onChangeText={setKycName}
          />
          <Text style={[s.cardTitle, { marginTop: 14 }]}>AADHAAR LAST 4 DIGITS (MOCK)</Text>
          <TextInput
            style={s.input}
            placeholder="1234"
            placeholderTextColor="#555"
            keyboardType="numeric"
            maxLength={4}
            value={kycAadhaarLast4}
            onChangeText={setKycAadhaarLast4}
          />
          <TouchableOpacity style={s.checkboxRow} onPress={() => setKycConsent((v) => !v)}>
            <View style={[s.checkbox, kycConsent && s.checkboxActive]} />
            <Text style={s.checkboxText}>I consent to KYC verification and shift-only location tracking.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ctaBtn} onPress={handleCompleteKyc}>
            <Text style={s.ctaTxt}>VERIFY KYC</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── TRACKING SCREEN ───────────────────────────────────────────
  const renderTrackingScreen = () => {
    return (
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Status Pill ────────────────────── */}
        <View style={[s.pill, { borderColor: statusColor + "55" }]}>
          <Animated.View style={[s.dot, { backgroundColor: statusColor, opacity: isTracking ? dotAnim : 1 }]} />
          <Text style={[s.pillText, { color: statusColor }]}>{statusLabel}</Text>
          {isTracking && (
            <Text style={s.pillCount}>{pingCount} pings sent</Text>
          )}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>TRACKING MODE</Text>
          <Text style={{ color: "#00e676", fontSize: 14, fontWeight: "700" }}>🛰️ Real GPS + Background Protection</Text>
          <Text style={[s.info, { textAlign: "left", marginBottom: 0, marginTop: 8 }]}>
            Live location is sent every {PING_INTERVAL_SECONDS}s during active shifts, even with screen off.
          </Text>
        </View>

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
            <Text style={s.pingZone}>Zone: Live Location</Text>
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
          {`Broadcasting real GPS to backend every ${PING_INTERVAL_SECONDS}s (works in background)`}
        </Text>
        {mockLocationDetected && (
          <Text style={[s.info, { color: "#f44336", marginTop: -4 }]}>
            Turn off Android mock location (Developer Options) and restart shift tracking.
          </Text>
        )}

        <Text style={s.legal}>
          GigaChad monitors your location only during active shifts to validate income protection claims.
        </Text>

      </ScrollView>
    );
  };

  // ─── CLAIMS SCREEN ─────────────────────────────────────────────
  const STATUS_COLORS = {
    pending: { bg: "#FFA500", text: "#000" },
    approved: { bg: "#00e676", text: "#000" },
    soft_flagged: { bg: "#FF6B6B", text: "#fff" },
    denied: { bg: "#f44336", text: "#fff" },
    paid: { bg: "#4CAF50", text: "#fff" },
  };
  const STATUS_EMOJI = { pending: "⏳", approved: "✅", soft_flagged: "🚩", denied: "❌", paid: "💰" };

  const renderClaimItem = ({ item }) => {
    const statusStyle = STATUS_COLORS[item.status] || STATUS_COLORS.pending;
    const emoji = STATUS_EMOJI[item.status] || "•";
    const date = new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    return (
      <TouchableOpacity style={s.claimCard} onPress={() => setSelectedClaim(item)} activeOpacity={0.7}>
        <View style={s.claimHeader}>
          <Text style={s.claimDate}>{date}</Text>
          <View style={[s.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[s.statusText, { color: statusStyle.text }]}>{emoji} {item.status.replace("_", " ").toUpperCase()}</Text>
          </View>
        </View>
        <View style={s.claimBody}>
          <Text style={s.claimZone}>📍 {item.zone || item.disruption_type || "Chennai"}</Text>
          <Text style={s.claimAmount}>₹{item.total_payout?.toFixed(0) || 0}</Text>
        </View>
        <View style={s.claimFooter}>
          <Text style={s.claimType}>{item.disruption_type === "flood" ? "🌊" : "🚧"} {item.disruption_type?.replace("_", " ") || "Disruption"}</Text>
          <Text style={s.claimHours}>⏱️ {item.idle_hours?.toFixed(1) || 0}h idle</Text>
        </View>
        {item.status === "soft_flagged" && (
          <TouchableOpacity style={s.appealBtn} onPress={() => handleVideoAppeal(item)}>
            <Text style={s.appealBtnText}>📹 Submit Video Appeal</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const renderClaimsScreen = () => (
    <View style={{ flex: 1 }}>
      {/* Stats Cards */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statValue}>₹{claimStats.paid.toFixed(0)}</Text>
          <Text style={s.statLabel}>Total Received</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statValue}>{claimStats.total}</Text>
          <Text style={s.statLabel}>Total Claims</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statValue, { color: "#FFA500" }]}>{claimStats.pending}</Text>
          <Text style={s.statLabel}>Pending</Text>
        </View>
      </View>

      {/* New Claim Button */}
      <TouchableOpacity style={s.newClaimBtn} onPress={() => setShowNewClaimModal(true)}>
        <Text style={s.newClaimBtnIcon}>📝</Text>
        <Text style={s.newClaimBtnText}>File New Claim</Text>
      </TouchableOpacity>

      {/* Claims List */}
      <FlatList
        data={claims}
        keyExtractor={(item) => item.id}
        renderItem={renderClaimItem}
        contentContainerStyle={s.listContent}
        ListEmptyComponent={!claimsLoading && (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>🛡️</Text>
            <Text style={s.emptyTitle}>No Claims Yet</Text>
            <Text style={s.emptyText}>When you're affected by a disruption, your claim will appear here automatically!</Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={claimsRefreshing} onRefresh={() => { setClaimsRefreshing(true); fetchClaims(); }} tintColor="#00e676" />
        }
      />

      {/* Claim Detail Modal */}
      <Modal visible={!!selectedClaim} animationType="slide" transparent onRequestClose={() => setSelectedClaim(null)}>
        {selectedClaim && (
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Claim Details</Text>
                <TouchableOpacity onPress={() => setSelectedClaim(null)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
              </View>
              <View style={s.modalBody}>
                <View style={s.detailRow}><Text style={s.detailLabel}>Status</Text>
                  <View style={[s.statusBadge, { backgroundColor: STATUS_COLORS[selectedClaim.status]?.bg || "#555" }]}>
                    <Text style={{ color: STATUS_COLORS[selectedClaim.status]?.text || "#fff", fontWeight: "700" }}>{STATUS_EMOJI[selectedClaim.status]} {selectedClaim.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={s.detailRow}><Text style={s.detailLabel}>Payout Amount</Text><Text style={s.detailValue}>₹{selectedClaim.total_payout?.toFixed(0) || 0}</Text></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>Idle Hours</Text><Text style={s.detailValue}>{selectedClaim.idle_hours?.toFixed(1) || 0} hours</Text></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>Fraud Score</Text><Text style={[s.detailValue, { color: selectedClaim.fraud_score > 0.5 ? "#FF6B6B" : "#00e676" }]}>{((1 - (selectedClaim.fraud_score || 0)) * 100).toFixed(0)}% trustworthy</Text></View>
                <View style={s.detailRow}><Text style={s.detailLabel}>Created</Text><Text style={s.detailValue}>{new Date(selectedClaim.created_at).toLocaleString("en-IN")}</Text></View>
                {selectedClaim.razorpay_payout_id && <View style={s.detailRow}><Text style={s.detailLabel}>Payout ID</Text><Text style={[s.detailValue, { fontSize: 11 }]}>{selectedClaim.razorpay_payout_id}</Text></View>}
              </View>
              {selectedClaim.status === "soft_flagged" && (
                <TouchableOpacity style={[s.appealBtn, { marginTop: 15 }]} onPress={() => { setSelectedClaim(null); handleVideoAppeal(selectedClaim); }}>
                  <Text style={s.appealBtnText}>📹 Submit Video Appeal</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedClaim(null)}><Text style={s.closeBtnText}>Close</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>

      {/* New Claim Modal */}
      <Modal visible={showNewClaimModal} animationType="slide" transparent onRequestClose={() => setShowNewClaimModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: "85%" }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>📝 File New Claim</Text>
              <TouchableOpacity onPress={() => setShowNewClaimModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Disruption Type */}
              <Text style={[s.cardTitle, { marginTop: 10 }]}>DISRUPTION TYPE</Text>
              <View style={s.typeRow}>
                {[
                  { id: "flood", icon: "🌊", label: "Flood" },
                  { id: "traffic", icon: "🚗", label: "Traffic" },
                  { id: "strike", icon: "✊", label: "Strike" },
                  { id: "vvip", icon: "🚔", label: "VVIP" },
                ].map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[s.typeBtn, newClaimType === type.id && s.typeBtnActive]}
                    onPress={() => setNewClaimType(type.id)}
                  >
                    <Text style={s.typeIcon}>{type.icon}</Text>
                    <Text style={[s.typeLabel, newClaimType === type.id && s.typeLabelActive]}>{type.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={[s.cardTitle, { marginTop: 20 }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[s.input, { height: 80, textAlignVertical: "top" }]}
                placeholder="Describe what happened..."
                placeholderTextColor="#555"
                multiline
                value={newClaimDescription}
                onChangeText={setNewClaimDescription}
              />

              {/* Evidence Upload */}
              <Text style={[s.cardTitle, { marginTop: 20 }]}>PROOF / EVIDENCE</Text>
              <TouchableOpacity style={s.evidenceBtn} onPress={handlePickEvidence}>
                {newClaimEvidence ? (
                  <View style={s.evidencePreview}>
                    <Text style={s.evidenceIcon}>{newClaimEvidence.type === "video" ? "🎥" : "📷"}</Text>
                    <Text style={s.evidenceText}>
                      {newClaimEvidence.type === "video" ? "Video attached" : "Photo attached"} ✓
                    </Text>
                    <TouchableOpacity onPress={() => setNewClaimEvidence(null)}>
                      <Text style={{ color: "#f44336", marginLeft: 10 }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.evidenceEmpty}>
                    <Text style={s.evidenceIcon}>📎</Text>
                    <Text style={s.evidenceText}>Tap to add photo/video proof</Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[s.info, { marginTop: 8, textAlign: "left" }]}>
                Adding evidence speeds up claim approval. You can capture: flooded roads, traffic jams, protest images, etc.
              </Text>

              {/* Location Info */}
              <View style={[s.card, { marginTop: 20, backgroundColor: "#0a0a0a" }]}>
                <Text style={s.cardTitle}>📍 YOUR LOCATION</Text>
                <Text style={{ color: "#00e676", fontSize: 13 }}>
                  Auto-detected from live GPS
                </Text>
                {currentCoords && (
                  <Text style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
                    Lat: {currentCoords.lat} · Lng: {currentCoords.lng}
                  </Text>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[s.ctaBtn, submittingClaim && { opacity: 0.6 }]}
                onPress={handleSubmitNewClaim}
                disabled={submittingClaim}
              >
                <Text style={s.ctaTxt}>{submittingClaim ? "Submitting..." : "SUBMIT CLAIM"}</Text>
              </TouchableOpacity>

              <Text style={[s.info, { marginTop: 8 }]}>
                Claims are verified automatically using GPS, weather data, and AI analysis.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ─── MAIN RENDER ───────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleLogout} style={{position: 'absolute', right: 16, top: 12, zIndex: 10}}>
          <Text style={{color: '#f44336', fontSize: 12}}>Logout</Text>
        </TouchableOpacity>
        <Text style={s.logo}>⚡ GigaChad</Text>
        <Text style={s.sub}>{activeTab === "tracking" ? "Income Shield · Telemetry" : "My Claims"}</Text>
      </View>

      {/* Tab Content */}
      {activeTab === "tracking" ? renderTrackingScreen() : renderClaimsScreen()}

      {/* Bottom Tab Bar */}
      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabItem, activeTab === "tracking" && s.tabItemActive]} onPress={() => setActiveTab("tracking")}>
          <Text style={s.tabIcon}>🛰️</Text>
          <Text style={[s.tabLabel, activeTab === "tracking" && s.tabLabelActive]}>Tracking</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabItem, activeTab === "claims" && s.tabItemActive]} onPress={() => setActiveTab("claims")}>
          <Text style={s.tabIcon}>📋</Text>
          <Text style={[s.tabLabel, activeTab === "claims" && s.tabLabelActive]}>Claims</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#0a0a0a", paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 35 : 0 },
  scroll: { padding: 20, paddingBottom: 48 },

  header: { alignItems: "center", marginBottom: 24, paddingTop: 10 },
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
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#555",
    backgroundColor: "#161616",
  },
  checkboxActive: {
    borderColor: "#00e676",
    backgroundColor: "#00e676",
  },
  checkboxText: {
    flex: 1,
    color: "#888",
    fontSize: 12,
    lineHeight: 18,
  },

  // Tab Bar Styles
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderTopWidth: 1,
    borderTopColor: "#1e1e1e",
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
    paddingTop: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  tabItemActive: {},
  tabIcon: { fontSize: 20, marginBottom: 4 },
  tabLabel: { fontSize: 11, color: "#555", fontWeight: "600" },
  tabLabelActive: { color: "#00e676" },

  // Claims Screen Styles
  statsRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e1e1e",
  },
  statValue: { color: "#00e676", fontSize: 18, fontWeight: "900" },
  statLabel: { color: "#555", fontSize: 9, marginTop: 4, textTransform: "uppercase" },
  listContent: { padding: 12, paddingBottom: 20 },
  claimCard: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1e1e1e",
  },
  claimHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  claimDate: { color: "#555", fontSize: 12, fontWeight: "600" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 9, fontWeight: "800" },
  claimBody: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  claimZone: { color: "#fff", fontSize: 14, fontWeight: "600" },
  claimAmount: { color: "#00e676", fontSize: 20, fontWeight: "900" },
  claimFooter: { flexDirection: "row", gap: 16 },
  claimType: { color: "#666", fontSize: 11 },
  claimHours: { color: "#666", fontSize: 11 },
  appealBtn: {
    backgroundColor: "#FF6B6B",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
    alignItems: "center",
  },
  appealBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  emptyState: { alignItems: "center", paddingTop: 50, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 45, marginBottom: 14 },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "700", marginBottom: 6 },
  emptyText: { color: "#555", fontSize: 13, textAlign: "center", lineHeight: 18 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "#111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "75%",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalClose: { color: "#555", fontSize: 18, padding: 5 },
  modalBody: { gap: 10 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },
  detailLabel: { color: "#666", fontSize: 12 },
  detailValue: { color: "#fff", fontSize: 13, fontWeight: "600" },
  closeBtn: {
    backgroundColor: "#1e1e1e",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
    alignItems: "center",
  },
  closeBtnText: { color: "#fff", fontWeight: "700" },

  // New Claim Styles
  newClaimBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#001a0d",
    borderWidth: 1,
    borderColor: "#00e676",
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginBottom: 12,
    gap: 8,
  },
  newClaimBtnIcon: { fontSize: 18 },
  newClaimBtnText: { color: "#00e676", fontWeight: "700", fontSize: 14 },
  
  typeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  typeBtn: {
    flex: 1,
    minWidth: "22%",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    backgroundColor: "#161616",
  },
  typeBtnActive: { backgroundColor: "#001a0d", borderColor: "#00e676" },
  typeIcon: { fontSize: 24, marginBottom: 4 },
  typeLabel: { color: "#555", fontSize: 11, fontWeight: "600" },
  typeLabelActive: { color: "#00e676" },
  
  evidenceBtn: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 20,
  },
  evidencePreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceEmpty: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  evidenceIcon: { fontSize: 24, marginRight: 10 },
  evidenceText: { color: "#888", fontSize: 14 },
});
