"use client";
import React, { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts';
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Download, Navigation, CloudLightning, Activity, AlertTriangle, Check, MapPin, Drop, LayoutDashboard, Users, ShieldAlert, FileText, Settings, Search, Bell, ShieldCheck, Shield, ChevronDown, Filter, MoveRight } from "lucide-react";
import Image from "next/image";

// ─── MOCK DATA STREAMS ───────────────────────────────────────────
const CHART_DATA = [
  { time: "00:00", payout: 4000, risk: 20 },
  { time: "04:00", payout: 3000, risk: 10 },
  { time: "08:00", payout: 2000, risk: 40 },
  { time: "12:00", payout: 2780, risk: 50 },
  { time: "16:00", payout: 1890, risk: 30 },
  { time: "20:00", payout: 2390, risk: 80 },
  { time: "24:00", payout: 3490, risk: 60 },
];

const SPARK_DATA = Array.from({ length: 15 }, () => ({ val: Math.floor(Math.random() * 100) }));

const MOCK_CLAIMS = [
  { id: "GC-0921A", rider: "K. Ravi", zone: "Velachery", event: "Flood Detection", amount: "₹300", status: "Verified", time: "2m ago" },
  { id: "GC-0922B", rider: "S. Arjun", zone: "OMR", event: "Traffic Gridlock", amount: "₹250", status: "Verified", time: "5m ago" },
  { id: "GC-0923C", rider: "M. Deepika", zone: "T. Nagar", event: "Strike Disturbance", amount: "₹400", status: "Flagged", time: "12m ago" },
  { id: "GC-0924D", rider: "V. Sharma", zone: "Perungudi", event: "Flood Detection", amount: "₹300", status: "Verified", time: "15m ago" },
  { id: "GC-0925E", rider: "N. Kumar", zone: "Anna Nagar", event: "API Trigger", amount: "₹0", status: "Pending", time: "18m ago" },
];

const DISRUPTION_FEED = [
  { id: 1, type: "Heavy Rain", zone: "Velachery", severity: "High", time: "Just now" },
  { id: 2, type: "Traffic Spike", zone: "OMR IT Expr", severity: "Medium", time: "10m ago" },
  { id: 3, type: "Waterlogging", zone: "Guindy", severity: "Warning", time: "34m ago" },
];

// ─── COMPONENTS ──────────────────────────────────────────────────
export default function ProductionAdminDashboard() {
  const [mounted, setMounted] = useState(false);
  const [liveClaims, setLiveClaims] = useState(MOCK_CLAIMS);

  useEffect(() => {
    setMounted(true);
    // Simulate incoming claims for dynamic effect
    const timer = setInterval(() => {
      setLiveClaims(prev => {
        const newClaim = {
          id: `GC-${Math.floor(Math.random() * 10000)}X`,
          rider: "Simulated",
          zone: ["Velachery", "OMR", "Tambaram"][Math.floor(Math.random() * 3)],
          event: "Automated API Trigger",
          amount: `₹${Math.floor(Math.random() * 500)}`,
          status: Math.random() > 0.8 ? "Flagged" : "Verified",
          time: "Just now"
        };
        return [newClaim, ...prev.slice(0, 4)];
      });
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  if (!mounted) return <div className="min-h-screen bg-background" />;

  return (
    <div className="flex h-screen bg-background text-white font-body overflow-hidden selection:bg-primary/30">

      {/* ─── SIDEBAR SHELL ─── */}
      <aside className="w-64 border-r border-surface-2 bg-background flex flex-col justify-between shrink-0 hidden md:flex">
        <div>
          <div className="h-16 flex items-center px-6 border-b border-surface-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-surface-2">
                <Image src="/logo.png" alt="Logo" width={20} height={20} />
              </div>
              <span className="font-black tracking-tight text-lg">GIGACHAD</span>
            </div>
          </div>
          <div className="p-4 space-y-1 mt-2">
            <NavItem icon={LayoutDashboard} label="Overview" active />
            <NavItem icon={ShieldCheck} label="Policy Engine" />
            <NavItem icon={Users} label="Riders Network" badge="Live" />
            <NavItem icon={ShieldAlert} label="Fraud Intelligence" />
            <NavItem icon={FileText} label="Reconciliation" />
          </div>
        </div>
        <div className="p-4">
          <div className="bg-surface border border-surface-2 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-bold text-muted uppercase tracking-wider">System Status</span>
            </div>
            <div className="text-sm font-semibold">All nodes operational</div>
            <div className="text-xs text-muted mt-1">Kafka Stream Connected</div>
          </div>
          <NavItem icon={Settings} label="Settings" />
        </div>
      </aside>

      {/* ─── MAIN CONTENT BLOCK ─── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">

        {/* Top Header */}
        <header className="h-16 border-b border-surface-2 flex items-center justify-between px-8 bg-background/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className="md:hidden">
              <Menu className="w-5 h-5 text-muted" />
            </div>
            <div className="hidden lg:flex items-center bg-surface border border-surface-2 rounded-lg px-4 py-2 w-96 transition-colors focus-within:border-primary/50">
              <Search className="w-4 h-4 text-muted mr-2" />
              <input
                type="text"
                placeholder="Search claims, riders, or tx hashes..."
                className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="relative">
              <Bell className="w-5 h-5 text-muted hover:text-white transition-colors" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-bounce" />
            </button>
            <div className="flex items-center gap-3 border-l border-surface-2 pl-6">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold leading-none">System Admin</div>
                <div className="text-[11px] text-muted font-medium mt-1 uppercase tracking-wider">GigaChad Ops</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-surface-2 border border-surface flex items-center justify-center font-bold text-primary">
                SA
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-[1600px] mx-auto space-y-6">

            {/* Page Title Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
              <div>
                <h1 className="text-2xl font-black tracking-tight">Parametric Platform Control</h1>
                <p className="text-sm text-muted mt-1">Live streaming telemetry and automated liability processing.</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 bg-surface border border-surface-2 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-surface-2 transition-colors">
                  <Filter className="w-4 h-4 text-muted" /> Filter View
                </button>
                <button className="flex items-center gap-2 bg-primary text-black px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#00c853] transition-colors shadow-[0_0_20px_rgba(0,230,118,0.3)]">
                  <Download className="w-4 h-4" /> Export Report
                </button>
              </div>
            </div>

            {/* KPI ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard title="Total Liability Payouts" value="₹1.42M" change="+12.5%" />
              <KPICard title="Active Covered Riders" value="12,491" change="+4.2%" color="#3b82f6" />
              <KPICard title="Disruptions Tracking" value="14 Zones" change="Critical" isWarning color="#ef4444" />
              <KPICard title="Fraud Rejection Rate" value="3.8%" change="-0.5%" color="#f59e0b" />
            </div>

            {/* CHART ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto min-h-[400px]">
              {/* Complex Area Chart */}
              <div className="lg:col-span-2 bg-surface border border-surface-2 rounded-2xl p-6 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="font-bold text-base">Claim Volume vs Geo-Risk Indices</h2>
                    <p className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">Last 24 Hours • Live Feed</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /> Payouts</span>
                    <span className="flex items-center gap-1.5 ml-4"><div className="w-2 h-2 rounded-full bg-surface-2" /> Risk</span>
                  </div>
                </div>
                <div className="flex-1 min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={CHART_DATA} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPayout" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                      <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#888" }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#888" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px', color: '#fff' }}
                        itemStyle={{ color: '#00e676', fontWeight: 'bold' }}
                      />
                      <Area type="monotone" dataKey="payout" stroke="#00e676" strokeWidth={3} fillOpacity={1} fill="url(#colorPayout)" />
                      <Area type="monotone" dataKey="risk" stroke="#555" strokeWidth={2} fill="none" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Live Alerts Feed */}
              <div className="bg-surface border border-surface-2 rounded-2xl p-0 flex flex-col shadow-sm overflow-hidden">
                <div className="p-6 border-b border-surface-2">
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" /> Live Intelligence Feed
                  </h2>
                </div>
                <div className="flex-1 p-4 space-y-3 overflow-auto">
                  <AnimatePresence>
                    {DISRUPTION_FEED.map((feed, i) => (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={feed.id}
                        className="bg-surface-2 border border-surface-2 rounded-xl p-4"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-sm ${feed.severity === "High" ? "bg-red-500/20 text-red-400" :
                              feed.severity === "Medium" ? "bg-yellow-500/20 text-yellow-500" :
                                "bg-blue-500/20 text-blue-400"
                            }`}>
                            {feed.severity} ALERT
                          </div>
                          <span className="text-[10px] uppercase font-bold text-muted tracking-wider">{feed.time}</span>
                        </div>
                        <div className="text-sm font-semibold text-white">{feed.type} detected</div>
                        <div className="text-xs text-muted flex items-center gap-1.5 mt-1">
                          <MapPin className="w-3 h-3" /> Zone: {feed.zone}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="p-4 border-t border-surface-2">
                  <button className="w-full text-xs font-bold text-primary uppercase tracking-wider flex justify-center items-center gap-1 hover:underline">
                    View Network Grid <MoveRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* DATA TABLE ROW */}
            <div className="bg-surface border border-surface-2 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-surface-2 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base">Automated Ledger Transactions</h2>
                  <p className="text-xs text-muted mt-1 font-medium">Auto-disbursed parametric claims via smart contracts.</p>
                </div>
                <button className="p-2 border border-surface-2 rounded-lg hover:bg-surface-2 transition-colors">
                  <Filter className="w-4 h-4 text-muted" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#151515] text-xs uppercase tracking-wider font-bold text-muted border-b border-surface-2">
                    <tr>
                      <th className="px-6 py-4 text-left">Transaction ID</th>
                      <th className="px-6 py-4 text-left">Beneficiary</th>
                      <th className="px-6 py-4 text-left">Trigger Event</th>
                      <th className="px-6 py-4 text-left">Value Disbursed</th>
                      <th className="px-6 py-4 text-left">Status</th>
                      <th className="px-6 py-4 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-2">
                    <AnimatePresence>
                      {liveClaims.map((claim, idx) => (
                        <motion.tr
                          initial={{ opacity: 0, backgroundColor: 'rgba(0,230,118,0.2)' }}
                          animate={{ opacity: 1, backgroundColor: 'transparent' }}
                          transition={{ duration: 1 }}
                          key={claim.id + idx}
                          className="hover:bg-surface-2/30 transition-colors group cursor-pointer"
                        >
                          <td className="px-6 py-4 font-mono text-xs text-muted group-hover:text-primary transition-colors">{claim.id}</td>
                          <td className="px-6 py-4 font-semibold flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center text-[10px] font-black">{claim.rider.charAt(0)}</div>
                            {claim.rider}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold">
                            <span className="flex items-center gap-1.5">
                              {claim.zone} <span className="text-muted font-normal text-[10px] uppercase">({claim.event})</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-white">{claim.amount}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-black rounded-sm border ${claim.status === "Verified"
                                ? "bg-primary/10 text-primary border-primary/20"
                                : claim.status === "Flagged"
                                  ? "bg-red-500/10 text-red-500 border-red-500/20"
                                  : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                              }`}>
                              {claim.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-xs text-muted font-medium">{claim.time}</td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

// ─── HELPER COMPONENTS ───────────────────────────────────────────
function NavItem({ icon: Icon, label, active, badge }) {
  return (
    <button className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${active ? "bg-surface-2 text-white" : "text-muted hover:bg-surface-2/50 hover:text-white"
      }`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted"}`} />
        {label}
      </div>
      {badge && (
        <span className="text-[10px] font-black uppercase tracking-wider bg-primary/20 text-primary px-2 py-0.5 rounded-sm">
          {badge}
        </span>
      )}
    </button>
  );
}

function KPICard({ title, value, change, color = "#00e676", isWarning }) {
  return (
    <div className="bg-surface border border-surface-2 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-10 transition-transform group-hover:scale-150 blur-xl" style={{ backgroundColor: color }} />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-muted w-2/3">{title}</h3>
        <div className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${isWarning ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-surface-2 text-white border-surface-2"
          }`}>
          {change}
        </div>
      </div>
      <div className="flex items-end justify-between relative z-10">
        <div className="text-3xl font-black text-white">{value}</div>
        <div className="w-16 h-8 opacity-50">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SPARK_DATA}>
              <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
