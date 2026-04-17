"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "../../AuthContext";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../../../firebase";
import Image from "next/image";
import { Users, ShieldCheck, AlertTriangle, CircleDollarSign, ClipboardList, CheckCircle2, TrendingUp, Map, BellDot, MapPin, Activity } from "lucide-react";

const HexMap = dynamic(() => import("../../../components/HexMap"), { ssr: false });

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

  useEffect(() => {
    const stored = sessionStorage.getItem("mockUser");
    if (stored) setMockUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (currentUser === undefined) return;
    if (!currentUser && !mockUser) {
      if (!sessionStorage.getItem("mockUser")) router.push("/");
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
      showToast(`Disruption fired in ${selectedZone}! Event ID: ${data.event_id?.slice(0, 8)}`);
      setTimeout(fetchAll, 2000);
    } catch (e) {
      showToast("Failed to simulate disruption");
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
  }[status] || "#888888");

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="GigaChad" width={48} height={48} className="rounded-xl" />
          <div className="text-primary text-xl font-bold animate-pulse">Loading Admin Overview...</div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    sessionStorage.removeItem("mockUser");
    try { await signOut(auth); } catch (e) { }
    router.push("/");
  };

  const kpiData = [
    { label: "Active Riders", value: stats?.total_riders ?? 0, highlight: false, icon: Users },
    { label: "Active Policies", value: stats?.active_policies ?? 0, highlight: false, icon: ShieldCheck },
    { label: "Active Disruptions", value: stats?.active_disruptions ?? 0, highlight: true, icon: AlertTriangle },
    { label: "Total Paid Out", value: `₹${(stats?.total_paid_out_inr ?? 0).toFixed(0)}`, highlight: false, icon: CircleDollarSign },
    { label: "Total Claims", value: stats?.total_claims ?? 0, highlight: false, icon: ClipboardList },
    { label: "Paid Claims", value: stats?.paid_claims ?? 0, highlight: false, icon: CheckCircle2 },
    { label: "Fraud Flagged", value: stats?.fraud_flagged ?? 0, highlight: true, icon: AlertTriangle },
    { label: "Payout Rate", value: stats?.total_claims ? `${Math.round((stats.paid_claims / stats.total_claims) * 100)}%` : "—", highlight: false, icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background text-white font-body selection:bg-primary/30 pb-16">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-surface-2 border border-primary rounded-lg px-5 py-3 text-sm font-medium text-primary shadow-xl animate-fade-in flex items-center gap-2">
          <BellDot className="w-4 h-4" />
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-surface-2 bg-background/80 backdrop-blur-md sticky top-0 z-40 px-6 lg:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 overflow-hidden rounded-xl border border-surface-2">
            <Image src="/logo.png" alt="G" width={40} height={40} />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">ADMINISTRATOR</h1>
            <p className="text-[11px] text-muted font-medium mt-1 uppercase tracking-wider">Parametric Insurance Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden lg:flex items-center gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-[11px] text-muted font-medium uppercase tracking-wider">Live System Sync</span>
          </div>
          <div className="w-px h-6 bg-surface-2 hidden lg:block" />
          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-red-600 hover:text-red-400 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="px-6 lg:px-10 py-8 space-y-8 max-w-[1600px] mx-auto">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiData.map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <div key={idx} className={`rounded-xl p-5 border transition-all ${kpi.highlight && kpi.value > 0 ? "bg-red-500/5 border-red-500/20" : "bg-surface border-surface-2"}`}>
                <div className="flex items-center justify-between mb-3 text-muted">
                  <Icon className={`w-5 h-5 ${kpi.highlight && kpi.value > 0 ? "text-red-500" : "text-muted"}`} />
                </div>
                <div className={`text-3xl font-black ${kpi.highlight && kpi.value > 0 ? "text-red-500" : "text-white"}`}>{kpi.value}</div>
                <div className="text-xs text-muted font-medium uppercase tracking-wider mt-1">{kpi.label}</div>
              </div>
            );
          })}
        </div>

        {/* Action & Map Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-surface rounded-xl border border-surface-2 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-surface-2 flex items-center justify-between bg-surface-2/30">
              <div className="flex items-center gap-2">
                <Map className="w-4 h-4 text-muted" />
                <h2 className="font-semibold text-sm tracking-wide">Hex-Grid Live Network</h2>
              </div>
              <span className={`text-xs font-semibold ${disruptions.length > 0 ? "text-red-400 animate-pulse" : "text-muted"}`}>
                {disruptions.length} ACTIVE ZONES
              </span>
            </div>
            <div className="relative h-[450px]">
              <HexMap disruptions={disruptions} />
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-surface-2 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-base">Simulate Disruption</h2>
            </div>
            <p className="text-sm text-muted mb-6 leading-relaxed">
              Trigger a controlled weather/traffic event to observe the end-to-end automated claim and payout pipeline.
            </p>

            <div className="flex-1 space-y-5">
              <div>
                <label className="text-xs text-muted font-bold uppercase tracking-wider mb-3 block">Target Hex Zone</label>
                <div className="space-y-2">
                  {ZONES.map(zone => (
                    <button
                      key={zone}
                      onClick={() => setSelectedZone(zone)}
                      className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-3 ${selectedZone === zone
                        ? "bg-primary text-inverse"
                        : "bg-surface-2 text-muted hover:bg-surface-2/80 hover:text-white border border-transparent hover:border-surface-2"
                        }`}
                    >
                      <MapPin className="w-4 h-4" />
                      {zone.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={simulateDisruption}
                disabled={simulating}
                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 disabled:opacity-50 font-bold py-3.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-4 h-4" />
                {simulating ? "TRIGGERING EVENT..." : "INITIATE FLOOD DISRUPTION"}
              </button>
            </div>
          </div>
        </div>

        {/* Claims Table */}
        <div className="bg-surface rounded-xl border border-surface-2 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-surface-2 bg-surface-2/30">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-muted" />
              <h2 className="font-semibold text-sm tracking-wide">Recent Claims Register</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-2 bg-background text-muted text-xs uppercase tracking-wider">
                  <th className="text-left font-semibold px-6 py-4">Claim ID</th>
                  <th className="text-left font-semibold px-6 py-4">Rider</th>
                  <th className="text-left font-semibold px-6 py-4">Payout</th>
                  <th className="text-left font-semibold px-6 py-4">Fraud Score</th>
                  <th className="text-left font-semibold px-6 py-4">Status</th>
                  <th className="text-left font-semibold px-6 py-4">Flags</th>
                  <th className="text-left font-semibold px-6 py-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-2">
                {claims.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted italic">
                      Systems quiet. Awaiting disruption triggers to generate automated payouts.
                    </td>
                  </tr>
                ) : (
                  claims.map(c => (
                    <tr key={c.id} className="hover:bg-surface-2/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-muted">{c.id?.slice(0, 8)}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-white">{c.rider_id?.slice(0, 8)}</td>
                      <td className="px-6 py-4 font-bold text-primary">₹{c.total_payout || 0}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(c.fraud_score || 0) * 100}%`, backgroundColor: c.fraud_score > 0.6 ? "#ef4444" : c.fraud_score > 0.3 ? "#f59e0b" : "#00e676" }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted">{((c.fraud_score || 0) * 100).toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="px-2.5 py-1 rounded border text-xs font-semibold uppercase tracking-wider inline-block"
                          style={{ backgroundColor: getStatusColor(c.status) + "10", borderColor: getStatusColor(c.status) + "30", color: getStatusColor(c.status) }}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-red-400 font-medium">{c.fraud_flags?.join(", ") || "—"}</td>
                      <td className="px-6 py-4 text-xs text-muted">{c.created_at?.replace("T", " ").slice(0, 16)}</td>
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
