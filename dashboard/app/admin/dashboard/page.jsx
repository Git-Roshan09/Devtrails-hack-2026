"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "../../AuthContext";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../../../firebase";
import Image from "next/image";

const Map = dynamic(() => import("../../../components/HexMap"), { ssr: false });

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const ZONES = ["velachery", "omr", "t_nagar", "anna_nagar", "tambaram"];

export default function Dashboard() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [mockUser, setMockUser] = useState(null);

  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [disruptions, setDisruptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [selectedZone, setSelectedZone] = useState("velachery");
  const [toast, setToast] = useState(null);

  // Check for mock user session
  useEffect(() => {
    const stored = sessionStorage.getItem("mockUser");
    if (stored) {
      setMockUser(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    if (currentUser === undefined) return;
    // Allow access if either Firebase user or mock user exists
    if (!currentUser && !mockUser) {
      const stored = sessionStorage.getItem("mockUser");
      if (!stored) router.push("/");
    }
  }, [currentUser, mockUser, router]);

  const fetchAll = useCallback(async () => {
    try {
      const [s, c, d] = await Promise.all([
        fetch(`${BACKEND}/api/admin/stats`).then(r => r.json()),
        fetch(`${BACKEND}/api/claims?limit=20`).then(r => r.json()),
        fetch(`${BACKEND}/api/disruptions/active`).then(r => r.json()),
      ]);
      setStats(s);
      setClaims(Array.isArray(c) ? c : []);
      setDisruptions(Array.isArray(d) ? d : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 10_000); 
    return () => clearInterval(timer);
  }, [fetchAll]);

  async function simulateDisruption() {
    setSimulating(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/simulate-disruption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: selectedZone, event_type: "flood", rain_mm: 38, traffic_kmh: 2.5 }),
      });
      const data = await res.json();
      showToast(`🌊 Disruption fired in ${selectedZone}! Event ID: ${data.event_id?.slice(0, 8)}`);
      setTimeout(fetchAll, 2000);
    } catch (e) {
      showToast("❌ Failed to simulate disruption");
    } finally {
      setSimulating(false);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  const getStatusColor = (status) => ({
    paid: "#00e676", approved: "#00e676",
    pending: "#ff9800", soft_flagged: "#ff9800",
    denied: "#f44336",
  }[status] || "#888");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="GigaChad" width={48} height={48} />
          <div className="text-[#00e676] text-2xl font-bold animate-pulse">Loading GigaChad Dashboard...</div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    sessionStorage.removeItem("mockUser");
    try {
      await signOut(auth);
    } catch (e) {}
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[#1a2a1a] border border-[#00e676] rounded-xl px-5 py-3 text-sm text-[#00e676] shadow-2xl animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-[#1a1a1a] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="GigaChad" width={40} height={40} />
          <div>
            <h1 className="text-2xl font-black text-[#00e676] tracking-wider">GIGACHAD ADMIN</h1>
            <p className="text-xs text-[#555] mt-0.5">AI-Powered Parametric Micro-Insurance — Insurer Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleLogout} 
            className="text-xs border text-red-500 border-red-500/20 px-3 py-1 rounded hover:bg-red-500/10 transition-colors"
          >
            Logout
          </button>
          <span className="w-2 h-2 bg-[#00e676] rounded-full animate-pulse" />
          <span className="text-xs text-[#555]">Live · Polling every 10s</span>
        </div>
      </header>

      <main className="px-8 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Riders", value: stats?.total_riders ?? 0, color: "#00e676", icon: "👥" },
            { label: "Active Policies", value: stats?.active_policies ?? 0, color: "#2196f3", icon: "🛡️" },
            { label: "Active Disruptions", value: stats?.active_disruptions ?? 0, color: "#ff9800", icon: "🚨" },
            { label: "Total Paid Out", value: `₹${(stats?.total_paid_out_inr ?? 0).toFixed(0)}`, color: "#e91e63", icon: "💸" },
            { label: "Total Claims", value: stats?.total_claims ?? 0, color: "#9c27b0", icon: "📋" },
            { label: "Paid Claims", value: stats?.paid_claims ?? 0, color: "#00e676", icon: "✅" },
            { label: "Fraud Flagged", value: stats?.fraud_flagged ?? 0, color: "#f44336", icon: "🚨" },
            { label: "Payout Rate", value: stats?.total_claims ? `${Math.round((stats.paid_claims / stats.total_claims) * 100)}%` : "—", color: "#00bcd4", icon: "📈" },
          ].map(kpi => (
            <div key={kpi.label} className="bg-[#111] rounded-2xl p-5 border border-[#1e1e1e] hover:border-[#2a2a2a] transition-all">
              <div className="text-xl mb-2">{kpi.icon}</div>
              <div className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</div>
              <div className="text-xs text-[#555] mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Map + Simulate */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1e1e1e] flex items-center justify-between">
              <h2 className="font-bold text-sm">🗺️ Chennai Hex-Grid Live Map</h2>
              <span className="text-xs text-[#555]">{disruptions.length} active disruption zone(s)</span>
            </div>
            <Map disruptions={disruptions} />
          </div>

          <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-5 space-y-4">
            <h2 className="font-bold text-sm">🚨 Simulate Disruption</h2>
            <p className="text-xs text-[#555]">Fire a test disruption to trigger the auto-claim flow end-to-end.</p>

            <div>
              <label className="text-xs text-[#888] block mb-2">Select Zone</label>
              <div className="space-y-2">
                {ZONES.map(zone => (
                  <button
                    key={zone}
                    onClick={() => setSelectedZone(zone)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedZone === zone
                        ? "bg-[#00e676] text-black"
                        : "bg-[#1a1a1a] text-[#888] hover:bg-[#222]"
                    }`}
                  >
                    📍 {zone.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={simulateDisruption}
              disabled={simulating}
              className="w-full bg-[#ff3b3b] hover:bg-[#ff5555] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all text-sm"
            >
              {simulating ? "⏳ Triggering..." : "🌊 Simulate Flood Disruption"}
            </button>

            {/* Active Disruptions */}
            <div>
              <h3 className="text-xs text-[#888] font-bold mb-2">ACTIVE DISRUPTIONS</h3>
              {disruptions.length === 0 ? (
                <p className="text-xs text-[#444]">All clear in Chennai ☀️</p>
              ) : (
                disruptions.map(d => (
                  <div key={d.id} className="bg-[#1a0a0a] border border-[#ff3b3b33] rounded-lg p-3 mb-2">
                    <div className="text-xs font-bold text-[#ff9800]">⚡ {d.zone_name}</div>
                    <div className="text-xs text-[#666] mt-1">{d.event_type} · Rain: {d.rain_mm}mm · Traffic: {d.traffic_kmh}km/h</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Claims Table */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1e1e1e]">
            <h2 className="font-bold text-sm">📋 Recent Claims</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e1e] text-[#555] text-xs">
                  <th className="text-left px-5 py-3">CLAIM ID</th>
                  <th className="text-left px-5 py-3">RIDER</th>
                  <th className="text-left px-5 py-3">PAYOUT</th>
                  <th className="text-left px-5 py-3">FRAUD SCORE</th>
                  <th className="text-left px-5 py-3">STATUS</th>
                  <th className="text-left px-5 py-3">FLAGS</th>
                  <th className="text-left px-5 py-3">TIME</th>
                </tr>
              </thead>
              <tbody>
                {claims.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-[#444]">No claims yet — simulate a disruption to see the magic!</td></tr>
                ) : (
                  claims.map(c => (
                    <tr key={c.id} className="border-b border-[#0e0e0e] hover:bg-[#141414] transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-[#555]">{c.id?.slice(0, 8)}</td>
                      <td className="px-5 py-3 text-xs text-[#888]">{c.rider_id?.slice(0, 8)}</td>
                      <td className="px-5 py-3 font-bold text-[#00e676]">₹{c.total_payout || 0}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(c.fraud_score || 0) * 100}%`, backgroundColor: c.fraud_score > 0.6 ? "#f44336" : c.fraud_score > 0.3 ? "#ff9800" : "#00e676" }}
                            />
                          </div>
                          <span className="text-xs text-[#666]">{((c.fraud_score || 0) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: getStatusColor(c.status) + "22", color: getStatusColor(c.status) }}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-[#f44336]">{c.fraud_flags?.join(", ") || "—"}</td>
                      <td className="px-5 py-3 text-xs text-[#555]">{c.created_at?.replace("T", " ").slice(0, 16)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
