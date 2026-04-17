"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../../../firebase";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ShieldCheck, MapPin, CloudRain, Thermometer, Droplets, ArrowUpRight, ArrowDownRight, Activity, AlertTriangle, Check, CircleDollarSign, LogOut } from "lucide-react";

const LiveMap = dynamic(() => import("../../../components/LiveMap"), { ssr: false });

const MOCK_RIDER = {
  name: "Hari Kumar",
  phone: "+91 9876543210",
  zone: "Velachery",
  status: "active",
  totalEarnings: 330,
  totalClaims: 3,
  activePlan: "giga_plus",
};

const MOCK_CLAIMS = [
  { id: 1, date: "2026-04-02", type: "Flood", zone: "Velachery", amount: 300, status: "paid", hours: 3 },
  { id: 2, date: "2026-03-28", type: "Traffic Gridlock", zone: "OMR", amount: 200, status: "paid", hours: 2 },
  { id: 3, date: "2026-03-20", type: "Strike", zone: "T. Nagar", amount: 0, status: "pending", hours: 3 },
];

const MOCK_TRANSACTIONS = [
  { id: "t1", label: "Flood claim payout", date: "2026-04-02", amount: 300, status: "success" },
  { id: "t2", label: "Traffic claim payout", date: "2026-03-28", amount: 200, status: "success" },
  { id: "t3", label: "Weekly premium", date: "2026-03-25", amount: -39, status: "deducted" },
  { id: "t4", label: "Weekly premium", date: "2026-03-18", amount: -39, status: "deducted" },
];

const RED_ZONE_ALERTS = [
  { id: "z1", name: "Perungudi", note: "Waterlogging reported, claims spike zone" },
  { id: "z2", name: "Velachery Main Road", note: "Traffic gridlock, high idle-risk area" },
  { id: "z3", name: "T. Nagar Inner Loop", note: "Diversions active, avoid peak hours" },
];

const MOCK_WEATHER = {
  temp: 32,
  humidity: 78,
  rain_mm: 2.5,
  condition: "Partly Cloudy",
  risk: 35,
};

const CHENNAI_ZONES = [
  { name: "Velachery", lat: 12.9789, lng: 80.218, risk: 72, status: "warning" },
  { name: "OMR", lat: 12.901, lng: 80.2279, risk: 45, status: "normal" },
  { name: "T. Nagar", lat: 13.0418, lng: 80.2341, risk: 28, status: "normal" },
  { name: "Anna Nagar", lat: 13.0891, lng: 80.2152, risk: 15, status: "safe" },
  { name: "Perungudi", lat: 12.9653, lng: 80.2461, risk: 85, status: "danger" },
  { name: "Tambaram", lat: 12.9249, lng: 80.1, risk: 22, status: "safe" },
];

const PLANS = [
  { id: "giga_basic", name: "GIGA BASIC", price: 19, payout: 300, color: "#888888", description: "Covers ~3 hours of lost base wages", target: "Part-time riders (evening shifts)" },
  { id: "giga_plus", name: "GIGA PLUS", price: 39, payout: 600, color: "#00e676", description: "Covers half-day + minor missed incentives", target: "Full-time riders (8-10 hr shifts)" },
  { id: "giga_pro", name: "GIGA PRO", price: 59, payout: 1000, color: "#f59e0b", description: "Covers full-day + daily milestone bonuses", target: "Power-riders (14 hr shifts)" },
];

export default function RiderDashboard() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [riderLocation, setRiderLocation] = useState({ lat: 12.9789, lng: 80.218 });
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [mockUser, setMockUser] = useState(null);

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

  useEffect(() => {
    const interval = setInterval(() => {
      setRiderLocation(prev => ({
        lat: prev.lat + (Math.random() - 0.5) * 0.002,
        lng: prev.lng + (Math.random() - 0.5) * 0.002,
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    sessionStorage.removeItem("mockUser");
    try { await signOut(auth); } catch (e) { }
    router.push("/");
  };

  const userEmail = currentUser?.email || mockUser?.email || MOCK_RIDER.name;
  const currentZone = CHENNAI_ZONES.find(z => z.name === "Velachery");

  if (!currentUser && !mockUser) {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem("mockUser") : null;
    if (!stored) return null;
  }

  return (
    <div className="min-h-screen bg-background text-white font-body pb-16">
      <header className="px-6 lg:px-10 py-4 border-b border-surface-2 bg-background/80 backdrop-blur-md flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Image src="/logo.png" alt="GigaChad" width={36} height={36} className="rounded-xl" />
          <div>
            <h1 className="text-lg font-black text-white tracking-tight leading-none">GIGACHAD</h1>
            <p className="text-[11px] text-muted font-medium mt-0.5 uppercase tracking-wider">Rider Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold">{userEmail}</div>
            <div className="text-[11px] text-muted font-medium">{MOCK_RIDER.phone}</div>
          </div>
          <div className="w-px h-6 bg-surface-2 hidden md:block" />
          <button onClick={handleLogout} className="text-muted hover:text-red-400 transition-colors flex items-center gap-2 text-sm font-medium">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <nav className="border-b border-surface-2 px-6 lg:px-10 overflow-x-auto bg-surface/30">
        <div className="flex gap-8 min-w-max">
          {["overview", "claims", "plans", "settings"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-white"
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      <main className="p-6 lg:p-10 max-w-7xl mx-auto">
        {activeTab === "overview" && (
          <OverviewTab
            rider={MOCK_RIDER}
            weather={MOCK_WEATHER}
            zones={CHENNAI_ZONES}
            location={riderLocation}
            currentZone={currentZone}
          />
        )}
        {activeTab === "claims" && (
          <ClaimsTab
            claims={MOCK_CLAIMS}
            onViewClaim={(claim) => { setSelectedClaim(claim); setShowClaimModal(true); }}
          />
        )}
        {activeTab === "plans" && <PlansTab currentPlan={MOCK_RIDER.activePlan} />}
        {activeTab === "settings" && <SettingsTab rider={MOCK_RIDER} />}
      </main>

      {showClaimModal && selectedClaim && (
        <ClaimDetailModal claim={selectedClaim} onClose={() => setShowClaimModal(false)} />
      )}
    </div>
  );
}

function OverviewTab({ rider, weather, zones, location, currentZone }) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Plan" value={rider.activePlan.replace("giga_", "").toUpperCase()} color="#00e676" />
        <StatCard label="Zone Risk" value={`${currentZone?.risk || 0}%`} color={currentZone?.risk > 70 ? "#ef4444" : currentZone?.risk > 40 ? "#f59e0b" : "#00e676"} />
        <StatCard label="Total Payouts" value={`₹${rider.totalEarnings}`} color="#00e676" />
        <StatCard label="Claims Made" value={rider.totalClaims} color="#00e676" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-surface-2 rounded-xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm tracking-wide">Live Location Coverage</h3>
            </div>
            <span className="text-[11px] text-primary font-bold uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              Tracking Active
            </span>
          </div>
          <div className="relative h-[300px] rounded-lg overflow-hidden border border-surface-2">
            <LiveMap riderLocation={location} zones={zones} />
          </div>
          <div className="flex justify-between mt-4 text-[11px] font-medium text-muted uppercase tracking-wider">
            <span>LAT: {location.lat.toFixed(4)} | LNG: {location.lng.toFixed(4)}</span>
            <span>Zone: <span className="text-primary font-bold">Velachery</span></span>
          </div>
        </div>

        <div className="bg-surface border border-surface-2 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <CloudRain className="w-4 h-4 text-blue-400" />
              <h3 className="font-semibold text-sm tracking-wide">Weather Parameters</h3>
            </div>
            <div className="mb-8">
              <div className="text-4xl font-black text-white">{weather.temp}°C</div>
              <div className="text-sm font-medium text-muted mt-1">{weather.condition}</div>
            </div>
            <div className="space-y-4">
              <WeatherRow label="Humidity" value={`${weather.humidity}%`} icon={Droplets} />
              <WeatherRow label="Rain (1hr)" value={`${weather.rain_mm}mm`} icon={CloudRain} />
              <WeatherRow label="Disruption Risk" value={`${weather.risk}%`} color={weather.risk > 50 ? "#ef4444" : "#00e676"} icon={Activity} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold text-sm tracking-wide mb-5">Chennai Zone Risk Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {zones.map(zone => (
            <div key={zone.name} className="bg-surface-2 rounded-lg p-4 text-center border border-transparent hover:border-surface-2 transition-colors">
              <div className="text-xs font-semibold text-muted mb-2 truncate">{zone.name}</div>
              <div className={`text-xl font-black ${zone.risk > 70 ? "text-red-500" : zone.risk > 40 ? "text-yellow-500" : "text-green-500"
                }`}>
                {zone.risk}%
              </div>
              <div className={`text-[10px] uppercase font-bold tracking-wider mt-1 ${zone.status === "danger" ? "text-red-500" :
                  zone.status === "warning" ? "text-yellow-500" : "text-green-500"
                }`}>
                {zone.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-surface-2 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <CircleDollarSign className="w-4 h-4 text-muted" />
            <h3 className="font-semibold text-sm tracking-wide">Recent Transactions</h3>
          </div>
          <div className="space-y-3">
            {MOCK_TRANSACTIONS.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-lg bg-surface-2 p-4 border border-transparent hover:border-surface-2 transition-colors">
                <div className="flex items-center gap-3">
                  {tx.amount >= 0 ? <ArrowDownRight className="w-4 h-4 text-primary" /> : <ArrowUpRight className="w-4 h-4 text-muted" />}
                  <div>
                    <div className="text-sm font-semibold text-white">{tx.label}</div>
                    <div className="text-[11px] text-muted font-medium uppercase tracking-wider">{tx.date}</div>
                  </div>
                </div>
                <div className={`text-sm font-bold ${tx.amount >= 0 ? "text-primary" : "text-white"}`}>
                  {tx.amount >= 0 ? "+" : "-"}₹{Math.abs(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-surface-2 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="font-semibold text-sm tracking-wide text-white">Red Zone Warnings</h3>
          </div>
          <p className="text-sm text-muted mb-5 leading-relaxed">Active disruptions impacting delivery volumes.</p>
          <div className="space-y-3">
            {RED_ZONE_ALERTS.map((zone) => (
              <div key={zone.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-red-400">{zone.name}</div>
                  <div className="text-xs text-red-300/80 mt-1">{zone.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimsTab({ claims, onViewClaim }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-surface border border-surface-2 rounded-xl p-6">
        <h2 className="text-lg font-black text-white">Claim History</h2>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-primary/10 border border-primary/20 text-primary rounded-full text-[11px] font-bold uppercase tracking-wider">
            {claims.filter(c => c.status === "paid").length} Paid
          </span>
          <span className="px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-full text-[11px] font-bold uppercase tracking-wider">
            {claims.filter(c => c.status === "pending").length} Pending
          </span>
        </div>
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-surface-2/30 border-b border-surface-2 text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left font-semibold p-5">Date</th>
              <th className="text-left font-semibold p-5">Type</th>
              <th className="text-left font-semibold p-5">Zone</th>
              <th className="text-left font-semibold p-5">Hours Delay</th>
              <th className="text-left font-semibold p-5">Payout</th>
              <th className="text-left font-semibold p-5">Status</th>
              <th className="text-right font-semibold p-5">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-2">
            {claims.map(claim => (
              <tr key={claim.id} className="hover:bg-surface-2/30 transition-colors">
                <td className="p-5 font-medium text-white">{claim.date}</td>
                <td className="p-5">
                  <span className={`px-2.5 py-1 rounded border text-[11px] font-bold uppercase tracking-wider ${claim.type === "Flood" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                      claim.type === "Strike" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                        "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                    }`}>
                    {claim.type}
                  </span>
                </td>
                <td className="p-5 font-medium text-muted">{claim.zone}</td>
                <td className="p-5 text-muted">{claim.hours}h</td>
                <td className="p-5 font-bold text-primary">₹{claim.amount}</td>
                <td className="p-5">
                  <span className={`px-2.5 py-1 rounded border text-[11px] font-bold uppercase tracking-wider ${claim.status === "paid" ? "bg-green-500/10 border-green-500/20 text-green-400" :
                      claim.status === "pending" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" :
                        "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}>
                    {claim.status}
                  </span>
                </td>
                <td className="p-5 text-right">
                  <button
                    onClick={() => onViewClaim(claim)}
                    className="text-[11px] font-bold text-primary uppercase tracking-wider hover:underline"
                  >
                    Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlansTab({ currentPlan }) {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center md:text-left bg-surface border border-surface-2 rounded-xl p-6">
        <h2 className="text-xl font-black text-white">Coverage Plans</h2>
        <p className="text-sm text-muted mt-2">Active plan is highlighted. Upgrade parameters apply dynamically to next cycle.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(plan => (
          <div
            key={plan.id}
            className={`rounded-xl p-6 border-2 flex flex-col transition-all ${currentPlan === plan.id
                ? "border-primary bg-surface shadow-lg shadow-primary/5"
                : "border-surface-2 bg-surface/50 hover:border-surface-2/80"
              }`}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: plan.color }}>{plan.name}</div>
              {currentPlan === plan.id && (
                <span className="bg-primary text-inverse text-[10px] font-black uppercase px-2 py-0.5 rounded-sm">Current</span>
              )}
            </div>
            <div className="text-4xl font-black text-white mb-1">₹{plan.price}<span className="text-sm text-muted font-medium">/wk</span></div>
            <div className="text-xs font-semibold text-muted mb-5">Max Payout: ₹{plan.payout}</div>
            <div className="text-sm text-muted leading-relaxed mb-6 flex-1">{plan.description}</div>

            <ul className="space-y-3 mb-8">
              <ListItem text="Rain & Flood Coverage" />
              <ListItem text="Traffic Gridlock Guarantee" />
              {plan.id !== "giga_basic" ? <ListItem text="Strikes & Bandhs" /> : <ListItem text="Strikes & Bandhs" disabled />}
              {plan.id === "giga_pro" ? <ListItem text="Bonus Surge Payouts" /> : <ListItem text="Bonus Surge Payouts" disabled />}
            </ul>

            <button className={`w-full py-3.5 rounded-lg text-sm font-bold transition-colors ${currentPlan === plan.id
                ? "bg-surface-2 text-muted cursor-not-allowed"
                : "bg-surface-2 text-white hover:bg-surface-2/80 hover:text-white border border-surface-2"
              }`}>
              {currentPlan === plan.id ? "Active Plan" : PLANS.findIndex(p => p.id === currentPlan) < PLANS.findIndex(p => p.id === plan.id) ? "Upgrade" : "Downgrade"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListItem({ text, disabled }) {
  return (
    <li className={`flex items-start gap-3 text-sm font-medium ${disabled ? 'text-muted/40' : 'text-white'}`}>
      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${disabled ? 'text-surface-2' : 'text-primary'}`} />
      {text}
    </li>
  );
}

function SettingsTab({ rider }) {
  return (
    <div className="max-w-2xl space-y-6 mx-auto">
      <div className="bg-surface border border-surface-2 rounded-xl p-6 space-y-5">
        <h3 className="font-semibold text-sm tracking-wide text-white border-b border-surface-2 pb-4">Identity Overview</h3>
        <SettingRow label="Legal Name" value={rider.name} />
        <SettingRow label="Registered Phone" value={rider.phone} />
        <SettingRow label="Home Zone" value={rider.zone} />
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl p-6 space-y-5">
        <h3 className="font-semibold text-sm tracking-wide text-white border-b border-surface-2 pb-4">Compliance Status</h3>
        <SettingRow label="Aadhaar" status="pass" value="Verified" />
        <SettingRow label="UPI Endpoint" status="pass" value="hari@paytm" />
        <SettingRow label="PAN Check" status="neutral" value="Not Required" />
        <div className="pt-2">
          <button className="w-full py-3 rounded-lg border border-surface-2 bg-surface-2/30 text-sm font-semibold hover:bg-surface-2 transition-colors">
            Update Registration Details
          </button>
        </div>
      </div>
    </div>
  );
}

function ClaimDetailModal({ claim, onClose }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-surface border border-surface-2 rounded-xl p-8 max-w-lg w-full shadow-2xl relative">
        <button onClick={onClose} className="absolute top-6 right-6 text-muted hover:text-white transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div className="mb-8">
          <div className="text-[11px] text-primary font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" /> Parametric Claim
          </div>
          <h3 className="text-2xl font-black text-white">ID: #{claim.id}</h3>
          <p className="text-sm text-muted font-medium mt-1">{claim.date}</p>
        </div>

        <div className="space-y-4 mb-8">
          <Row label="Event Classification" value={claim.type} />
          <Row label="Incident Zone" value={claim.zone} />
          <Row label="Calculated Impact" value={`${claim.hours} hours`} />
          <Row label="Disbursed Value" value={`₹${claim.amount}`} highlight />
        </div>

        <div className="bg-surface-2 rounded-lg p-5 border border-surface-2 mb-8">
          <div className="text-[11px] text-muted font-bold uppercase tracking-wider mb-4 border-b border-surface/50 pb-2">Verification Constraints</div>
          <div className="space-y-3">
            <ChecklistItem text="Location established inside parameter" />
            <ChecklistItem text="External hazard API synchronization" />
            <ChecklistItem text="Anomalous behavior scan cleared" />
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 bg-primary text-inverse font-bold rounded-lg hover:bg-[#00c853] transition-colors text-sm"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex justify-between py-2 border-b border-surface-2 last:border-0">
      <span className="text-sm text-muted font-medium">{label}</span>
      <span className={`text-sm font-bold ${highlight ? "text-primary text-lg" : "text-white"}`}>{value}</span>
    </div>
  );
}

function ChecklistItem({ text }) {
  return (
    <div className="flex items-center gap-3 text-sm font-medium text-white">
      <Check className="w-4 h-4 text-primary shrink-0" />
      {text}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-surface border border-surface-2 rounded-xl p-5 shadow-sm">
      <div className="text-[10px] text-muted font-bold uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function WeatherRow({ label, value, icon: Icon, color = "white" }) {
  return (
    <div className="flex justify-between items-center py-1">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted" />}
        <span className="text-sm text-muted font-medium">{label}</span>
      </div>
      <span className="text-sm font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function SettingRow({ label, value, status }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-surface-2 last:border-0">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className={`text-sm font-bold ${status === 'pass' ? 'text-primary' : status === 'neutral' ? 'text-muted' : 'text-white'}`}>{value}</span>
    </div>
  );
}
