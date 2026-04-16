import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

const DISRUPTION_TYPES = [
  { id: "flood", label: "🌊 Flood / Waterlogging", desc: "Roads submerged, unable to ride" },
  { id: "traffic_gridlock", label: "🚗 Traffic Gridlock", desc: "VVIP movement or severe jam" },
  { id: "strike", label: "✊ Local Strike / Bandh", desc: "Shops closed, dark store shut" },
  { id: "digital_blackout", label: "📵 Digital Blackout", desc: "App/internet outage" },
  { id: "vvip_movement", label: "🚨 VVIP / Rally Block", desc: "Road barricade by authorities" },
];

export default function SubmitClaimModal({ visible, onClose, onSubmitted, riderId, backendUrl, riderLocation }) {
  const [step, setStep] = useState(1); // 1=type, 2=details, 3=evidence, 4=confirm
  const [selectedType, setSelectedType] = useState(null);
  const [description, setDescription] = useState("");
  const [evidenceUri, setEvidenceUri] = useState(null);
  const [evidenceMime, setEvidenceMime] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setSelectedType(null);
    setDescription("");
    setEvidenceUri(null);
    setEvidenceMime(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  /* ── Step 3: Pick evidence from camera or gallery ── */
  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to attach evidence.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // photo or video
      quality: 0.7,
      videoMaxDuration: 15,
    });
    if (!result.canceled && result.assets?.length) {
      setEvidenceUri(result.assets[0].uri);
      setEvidenceMime(result.assets[0].type === "video" ? "video/mp4" : "image/jpeg");
    }
  };

  const pickFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow camera access to capture evidence.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
      videoMaxDuration: 15,
    });
    if (!result.canceled && result.assets?.length) {
      setEvidenceUri(result.assets[0].uri);
      setEvidenceMime(result.assets[0].type === "video" ? "video/mp4" : "image/jpeg");
    }
  };

  /* ── Final Submit ── */
  const submitClaim = async () => {
    if (!riderId) {
      Alert.alert("Not connected", "Backend rider ID not found. Try restarting the app.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("rider_id", riderId);
      formData.append("disruption_type", selectedType.id);
      formData.append("description", description.trim());
      formData.append("zone", riderLocation?.zone || "");
      formData.append("lat", String(riderLocation?.lat || 0));
      formData.append("lng", String(riderLocation?.lng || 0));

      if (evidenceUri) {
        const ext = evidenceMime === "video/mp4" ? "mp4" : "jpg";
        formData.append("evidence", {
          uri: evidenceUri,
          name: `evidence_${Date.now()}.${ext}`,
          type: evidenceMime,
        });
      }

      const resp = await fetch(`${backendUrl}/api/claims/submit`, {
        method: "POST",
        headers: {
          "Bypass-Tunnel-Reminder": "true",
          // DO NOT set Content-Type — let React Native set multipart boundary
        },
        body: formData,
      });

      const payload = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(payload?.detail || "Submission failed");
      }

      onSubmitted(payload.claim_id);
      reset();
      onClose();
    } catch (e) {
      Alert.alert("Submission failed", e.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─────────── RENDER ─────────── */
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={handleClose} style={s.closeBtn}>
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>File a Claim</Text>
          <View style={s.stepDots}>
            {[1, 2, 3, 4].map((n) => (
              <View key={n} style={[s.dot, step >= n && s.dotActive]} />
            ))}
          </View>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* ────────── STEP 1: Disruption Type ────────── */}
          {step === 1 && (
            <View>
              <Text style={s.sectionTitle}>What disruption stopped your work?</Text>
              <Text style={s.sectionSub}>Select the type that best describes the situation</Text>
              {DISRUPTION_TYPES.map((dt) => (
                <TouchableOpacity
                  key={dt.id}
                  style={[s.typeCard, selectedType?.id === dt.id && s.typeCardActive]}
                  onPress={() => setSelectedType(dt)}
                >
                  <Text style={[s.typeLabel, selectedType?.id === dt.id && s.typeLabelActive]}>{dt.label}</Text>
                  <Text style={s.typeDesc}>{dt.desc}</Text>
                  {selectedType?.id === dt.id && <View style={s.checkMark}><Text style={s.checkText}>✓</Text></View>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ────────── STEP 2: Description ────────── */}
          {step === 2 && (
            <View>
              <Text style={s.sectionTitle}>Describe what happened</Text>
              <Text style={s.sectionSub}>A brief description helps us process your claim faster</Text>
              <View style={s.selectedTypePill}>
                <Text style={s.selectedTypePillText}>{selectedType?.label}</Text>
              </View>
              <TextInput
                style={s.textArea}
                placeholder="e.g. Velachery underpass was flooded. I was stuck for 3 hours and couldn't take any orders..."
                placeholderTextColor="#555"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
                maxLength={400}
              />
              <Text style={s.charCount}>{description.length}/400</Text>
              <View style={s.locationPill}>
                <Text style={s.locationPillLabel}>📍 Location auto-captured</Text>
                <Text style={s.locationPillValue}>
                  {riderLocation?.lat?.toFixed(4)}, {riderLocation?.lng?.toFixed(4)}
                </Text>
              </View>
            </View>
          )}

          {/* ────────── STEP 3: Evidence ────────── */}
          {step === 3 && (
            <View>
              <Text style={s.sectionTitle}>Add Evidence (Optional)</Text>
              <Text style={s.sectionSub}>
                A photo or short video (max 15s) of the disruption significantly boosts your claim approval speed
              </Text>

              {evidenceUri ? (
                <View style={s.evidencePreview}>
                  <Image source={{ uri: evidenceUri }} style={s.evidenceImage} resizeMode="cover" />
                  <View style={s.evidenceBadge}>
                    <Text style={s.evidenceBadgeText}>{evidenceMime === "video/mp4" ? "🎥 Video" : "📷 Photo"} attached</Text>
                  </View>
                  <TouchableOpacity style={s.removeEvidence} onPress={() => { setEvidenceUri(null); setEvidenceMime(null); }}>
                    <Text style={s.removeEvidenceText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.evidencePicker}>
                  <TouchableOpacity style={s.evidenceBtn} onPress={pickFromCamera}>
                    <Text style={s.evidenceBtnIcon}>📸</Text>
                    <Text style={s.evidenceBtnLabel}>Camera</Text>
                    <Text style={s.evidenceBtnSub}>Capture live evidence</Text>
                  </TouchableOpacity>
                  <View style={s.evidenceDivider} />
                  <TouchableOpacity style={s.evidenceBtn} onPress={pickFromGallery}>
                    <Text style={s.evidenceBtnIcon}>🖼️</Text>
                    <Text style={s.evidenceBtnLabel}>Gallery</Text>
                    <Text style={s.evidenceBtnSub}>Upload existing photo/video</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={s.tipBox}>
                <Text style={s.tipTitle}>💡 Pro Tip</Text>
                <Text style={s.tipText}>
                  A clear photo of flooded roads, barricades, or a 10-second video showing the situation auto-approves
                  your claim without manual review.
                </Text>
              </View>
            </View>
          )}

          {/* ────────── STEP 4: Confirm & Submit ────────── */}
          {step === 4 && (
            <View>
              <Text style={s.sectionTitle}>Review & Submit</Text>
              <Text style={s.sectionSub}>Confirm your claim details before submitting</Text>

              <View style={s.summaryCard}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Disruption Type</Text>
                  <Text style={s.summaryValue}>{selectedType?.label}</Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Description</Text>
                  <Text style={[s.summaryValue, { flex: 1, textAlign: "right" }]}>
                    {description.trim() || "No description provided"}
                  </Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Location</Text>
                  <Text style={s.summaryValue}>
                    {riderLocation?.lat?.toFixed(4)}, {riderLocation?.lng?.toFixed(4)}
                  </Text>
                </View>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Evidence</Text>
                  <Text style={s.summaryValue}>{evidenceUri ? (evidenceMime === "video/mp4" ? "Video attached" : "Photo attached") : "None"}</Text>
                </View>
              </View>

              <View style={s.disclaimerBox}>
                <Text style={s.disclaimerText}>
                  ⚠️ By submitting, you confirm this disruption genuinely prevented you from working. False claims will be
                  detected by our fraud engine and may result in account suspension.
                </Text>
              </View>

              <TouchableOpacity style={[s.submitBtn, submitting && s.submitBtnBusy]} onPress={submitClaim} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#071d12" />
                ) : (
                  <Text style={s.submitBtnText}>Submit Claim →</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Bottom Nav */}
        <View style={s.footer}>
          {step > 1 && (
            <TouchableOpacity style={s.backBtn} onPress={() => setStep((s) => s - 1)} disabled={submitting}>
              <Text style={s.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {step < 4 && (
            <TouchableOpacity
              style={[
                s.nextBtn,
                step === 1 && !selectedType && s.nextBtnDisabled,
              ]}
              disabled={(step === 1 && !selectedType) || submitting}
              onPress={() => {
                if (step === 1 && !selectedType) return;
                setStep((s) => s + 1);
              }}
            >
              <Text style={s.nextBtnText}>{step === 3 ? (evidenceUri ? "Next →" : "Skip →") : "Next →"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  closeText: { color: "#9a9a9a", fontSize: 14, fontWeight: "600" },
  headerTitle: { color: "#fff", fontWeight: "800", fontSize: 18, flex: 1 },
  stepDots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2a2a2a" },
  dotActive: { backgroundColor: "#00d26a" },

  scroll: { padding: 20, paddingBottom: 120 },

  sectionTitle: { color: "#fff", fontWeight: "800", fontSize: 20, marginBottom: 6 },
  sectionSub: { color: "#6b6b6b", fontSize: 14, marginBottom: 20, lineHeight: 20 },

  /* Type cards */
  typeCard: {
    backgroundColor: "#111",
    borderColor: "#252525",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    position: "relative",
  },
  typeCardActive: { borderColor: "#00d26a", backgroundColor: "#0a1f13" },
  typeLabel: { color: "#ccc", fontWeight: "700", fontSize: 15, marginBottom: 4 },
  typeLabelActive: { color: "#00d26a" },
  typeDesc: { color: "#6b6b6b", fontSize: 13 },
  checkMark: {
    position: "absolute",
    top: 12,
    right: 14,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#00d26a",
    justifyContent: "center",
    alignItems: "center",
  },
  checkText: { color: "#071d12", fontWeight: "900", fontSize: 12 },

  /* Step 2 */
  selectedTypePill: {
    backgroundColor: "#0a1f13",
    borderColor: "#00d26a",
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  selectedTypePillText: { color: "#00d26a", fontWeight: "700", fontSize: 13 },
  textArea: {
    backgroundColor: "#111",
    borderColor: "#282828",
    borderWidth: 1,
    borderRadius: 12,
    color: "#fff",
    padding: 14,
    fontSize: 14,
    minHeight: 120,
    lineHeight: 22,
  },
  charCount: { color: "#444", fontSize: 12, textAlign: "right", marginTop: 6 },
  locationPill: {
    marginTop: 16,
    backgroundColor: "#111720",
    borderColor: "#1e3a5f",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationPillLabel: { color: "#5a9fd4", fontWeight: "600", fontSize: 13 },
  locationPillValue: { color: "#aaa", fontSize: 12 },

  /* Step 3 */
  evidencePicker: {
    backgroundColor: "#111",
    borderColor: "#252525",
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: "row",
    overflow: "hidden",
    marginBottom: 20,
  },
  evidenceBtn: { flex: 1, padding: 20, alignItems: "center" },
  evidenceBtnIcon: { fontSize: 28, marginBottom: 6 },
  evidenceBtnLabel: { color: "#fff", fontWeight: "700", fontSize: 14 },
  evidenceBtnSub: { color: "#666", fontSize: 11, marginTop: 3, textAlign: "center" },
  evidenceDivider: { width: 1, backgroundColor: "#252525" },

  evidencePreview: { marginBottom: 20, borderRadius: 14, overflow: "hidden", position: "relative" },
  evidenceImage: { width: "100%", height: 220, borderRadius: 14 },
  evidenceBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  evidenceBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  removeEvidence: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(255,80,80,0.85)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeEvidenceText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  tipBox: {
    backgroundColor: "#131a10",
    borderColor: "#2d4a20",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  tipTitle: { color: "#7ed957", fontWeight: "700", marginBottom: 6 },
  tipText: { color: "#7a9a6a", fontSize: 13, lineHeight: 20 },

  /* Step 4 */
  summaryCard: {
    backgroundColor: "#111",
    borderColor: "#252525",
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 14,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  summaryLabel: { color: "#666", fontSize: 13, flex: 0 },
  summaryValue: { color: "#ddd", fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },

  disclaimerBox: {
    backgroundColor: "#1a1000",
    borderColor: "#4a3000",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  disclaimerText: { color: "#c8953a", fontSize: 12, lineHeight: 18 },

  submitBtn: {
    backgroundColor: "#00d26a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnBusy: { opacity: 0.6 },
  submitBtnText: { color: "#071d12", fontWeight: "900", fontSize: 16 },

  /* Footer nav */
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: "#050505",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    gap: 12,
  },
  backBtn: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  backBtnText: { color: "#9a9a9a", fontWeight: "700" },
  nextBtn: {
    flex: 2,
    backgroundColor: "#00d26a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  nextBtnDisabled: { backgroundColor: "#1e3325", opacity: 0.5 },
  nextBtnText: { color: "#071d12", fontWeight: "800", fontSize: 15 },
});
