"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "../../../firebase";
import Image from "next/image";
import dynamic from "next/dynamic";

// Dynamically import map to avoid SSR issues
const LiveMap = dynamic(() => import("../../../components/LiveMap"), { ssr: false });

// Mock data for demo
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
  { id: "giga_basic", name: "GIGA BASIC", price: 19, payout: 300, color: "#888", description: "Covers ~3 hours of lost base wages", target: "Part-time riders (evening shifts)" },
  { id: "giga_plus", name: "GIGA PLUS", price: 39, payout: 600, color: "#00e676", description: "Covers half-day + minor missed incentives", target: "Full-time riders (8-10 hr shifts)" },
  { id: "giga_pro", name: "GIGA PRO", price: 59, payout: 1000, color: "#ffd700", description: "Covers full-day + daily milestone bonuses", target: "Power-riders (14 hr shifts)" },
];

export default function RiderDashboard() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [riderLocation, setRiderLocation] = useState({ lat: 12.9789, lng: 80.218 });
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [mockUser, setMockUser] = useState(null);

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

  // Simulate moving location
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
    try {
      await signOut(auth);
    } catch (e) {}
    router.push("/");
  };

  const userEmail = currentUser?.email || mockUser?.email || MOCK_RIDER.name;
  const currentZone = CHENNAI_ZONES.find(z => z.name === "Velachery");

  // Wait for auth check
  if (!currentUser && !mockUser) {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem("mockUser") : null;
    if (!stored) return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[#1a1a1a] flex justify-between items-center sticky top-0 bg-[#0a0a0a]/95 backdrop-blur z-50">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="GigaChad" width={36} height={36} />
          <h1 className="text-xl font-black text-[#00e676] tracking-wider">GIGACHAD</h1>
          <span className="text-xs text-[#555] hidden md:block">| Rider Dashboard</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <div className="text-sm font-bold">{userEmail}</div>
            <div className="text-xs text-[#555]">{MOCK_RIDER.phone}</div>
          </div>
          <button onClick={handleLogout} className="text-xs text-[#888] hover:text-red-500 transition-colors">
            Logout
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="border-b border-[#1a1a1a] px-6 overflow-x-auto">
        <div className="flex gap-6">
          {["overview", "claims", "plans", "settings"].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab 
                  ? "border-[#00e676] text-[#00e676]" 
                  : "border-transparent text-[#555] hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </nav>

      <main className="p-6 max-w-7xl mx-auto">
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

      {/* Claim Detail Modal */}
      {showClaimModal && selectedClaim && (
        <ClaimDetailModal claim={selectedClaim} onClose={() => setShowClaimModal(false)} />
      )}
    </div>
  );
}

// ─── OVERVIEW TAB ────────────────────────────────────────────
function OverviewTab({ rider, weather, zones, location, currentZone }) {
  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Plan" value={rider.activePlan.replace("giga_", "").toUpperCase()} color="#00e676" />
        <StatCard label="Zone Risk" value={`${currentZone?.risk || 0}%`} color={currentZone?.risk > 70 ? "#f44336" : currentZone?.risk > 40 ? "#ff9800" : "#00e676"} />
        <StatCard label="Total Payouts" value={`₹${rider.totalEarnings}`} color="#00e676" />
        <StatCard label="Claims Made" value={rider.totalClaims} color="#00e676" />
      </div>

      {/* Live Location Map with OpenStreetMap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#111] border border-[#1e1e1e] rounded-2xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">📍 Live Location</h3>
            <span className="text-xs text-[#00e676] animate-pulse">● TRACKING ACTIVE</span>
          </div>
          <div className="relative h-72 rounded-xl overflow-hidden">
            <LiveMap 
              riderLocation={location} 
              zones={zones} 
            />
          </div>
          {/* Coordinates */}
          <div className="flex justify-between mt-3 text-xs">
            <span className="text-[#888]">LAT: {location.lat.toFixed(4)} | LNG: {location.lng.toFixed(4)}</span>
            <span className="text-[#888]">Zone: <span className="text-[#00e676]">Velachery</span></span>
          </div>
        </div>

        {/* Weather Widget */}
        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4">🌤️ Weather Now</h3>
          <div className="text-5xl font-black mb-2">{weather.temp}°C</div>
          <div className="text-[#888] mb-6">{weather.condition}</div>
          <div className="space-y-3">
            <WeatherRow label="Humidity" value={`${weather.humidity}%`} />
            <WeatherRow label="Rain (1hr)" value={`${weather.rain_mm}mm`} />
            <WeatherRow label="Disruption Risk" value={`${weather.risk}%`} color={weather.risk > 50 ? "#f44336" : "#00e676"} />
          </div>
        </div>
      </div>

      {/* Zone Risk Overview */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6">
        <h3 className="font-bold text-lg mb-4">🗺️ Chennai Zone Risk Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {zones.map(zone => (
            <div key={zone.name} className="bg-[#0a0a0a] rounded-xl p-4 text-center">
              <div className="text-xs text-[#888] mb-2">{zone.name}</div>
              <div className={`text-2xl font-black ${
                zone.risk > 70 ? "text-red-500" : zone.risk > 40 ? "text-yellow-500" : "text-green-500"
              }`}>
                {zone.risk}%
              </div>
              <div className={`text-xs mt-1 ${
                zone.status === "danger" ? "text-red-500" :
                zone.status === "warning" ? "text-yellow-500" : "text-green-500"
              }`}>
                {zone.status.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CLAIMS TAB ──────────────────────────────────────────────
function ClaimsTab({ claims, onViewClaim }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black">Your Claims</h2>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full text-xs">
            {claims.filter(c => c.status === "paid").length} Paid
          </span>
          <span className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full text-xs">
            {claims.filter(c => c.status === "pending").length} Pending
          </span>
        </div>
      </div>

      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-[#0a0a0a] border-b border-[#1e1e1e]">
            <tr>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4">Date</th>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4">Type</th>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4">Zone</th>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4">Hours</th>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4">Payout</th>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4">Status</th>
              <th className="text-left text-xs text-[#888] font-bold uppercase tracking-wider p-4"></th>
            </tr>
          </thead>
          <tbody>
            {claims.map(claim => (
              <tr key={claim.id} className="border-b border-[#1e1e1e] hover:bg-[#1a1a1a] transition-colors">
                <td className="p-4 text-sm">{claim.date}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    claim.type === "Flood" ? "bg-blue-500/20 text-blue-400" :
                    claim.type === "Strike" ? "bg-red-500/20 text-red-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {claim.type}
                  </span>
                </td>
                <td className="p-4 text-sm text-[#888]">{claim.zone}</td>
                <td className="p-4 text-sm">{claim.hours}h</td>
                <td className="p-4 text-sm font-bold text-[#00e676]">₹{claim.amount}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    claim.status === "paid" ? "bg-green-500/20 text-green-400" :
                    claim.status === "pending" ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-red-500/20 text-red-400"
                  }`}>
                    {claim.status.toUpperCase()}
                  </span>
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => onViewClaim(claim)}
                    className="text-xs text-[#00e676] hover:underline"
                  >
                    View →
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

// ─── PLANS TAB ───────────────────────────────────────────────
function PlansTab({ currentPlan }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-black">Insurance Plans</h2>
      <p className="text-[#888]">Your current plan is highlighted. Upgrade anytime for better coverage.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(plan => (
          <div 
            key={plan.id}
            className={`rounded-2xl p-6 border-2 transition-all ${
              currentPlan === plan.id 
                ? "border-[#00e676] bg-[#111] scale-105" 
                : "border-[#1e1e1e] bg-[#0f0f0f] hover:border-[#333]"
            }`}
          >
            {currentPlan === plan.id && (
              <div className="text-xs text-[#00e676] font-bold mb-2">✓ CURRENT PLAN</div>
            )}
            <div className="text-xs font-bold tracking-wider mb-2" style={{ color: plan.color }}>{plan.name}</div>
            <div className="text-4xl font-black mb-2">₹{plan.price}<span className="text-sm text-[#555] font-normal">/week</span></div>
            <div className="text-sm text-[#888] mb-2">Payout: ₹{plan.payout}/event max</div>
            <div className="text-xs text-[#555] mb-4">{plan.description}</div>
            <ul className="space-y-2 text-sm text-[#ccc] mb-6">
              <li>✓ Rain & Flood Coverage</li>
              <li>✓ Traffic Gridlock</li>
              {plan.id !== "giga_basic" && <li>✓ Strikes & Bandhs</li>}
              {plan.id === "giga_pro" && <li>✓ Bonus Surge Payouts</li>}
            </ul>
            {currentPlan !== plan.id && (
              <button className="w-full py-3 rounded-xl border border-[#333] text-sm font-bold hover:bg-[#1a1a1a] transition-all">
                {PLANS.findIndex(p => p.id === currentPlan) < PLANS.findIndex(p => p.id === plan.id) ? "UPGRADE" : "DOWNGRADE"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SETTINGS TAB ────────────────────────────────────────────
function SettingsTab({ rider }) {
  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-2xl font-black">Settings</h2>
      
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 space-y-4">
        <h3 className="font-bold mb-4">Profile Information</h3>
        <SettingRow label="Name" value={rider.name} />
        <SettingRow label="Phone" value={rider.phone} />
        <SettingRow label="Primary Zone" value={rider.zone} />
        <SettingRow label="Platform" value="Zepto" />
      </div>

      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 space-y-4">
        <h3 className="font-bold mb-4">KYC Status</h3>
        <SettingRow label="Aadhaar" value="Verified ✓" valueColor="#00e676" />
        <SettingRow label="UPI ID" value="hari@paytm ✓" valueColor="#00e676" />
        <SettingRow label="PAN" value="Not Required" valueColor="#888" />
      </div>

      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 space-y-4">
        <h3 className="font-bold mb-4">Notifications</h3>
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-[#888]">WhatsApp Alerts</span>
          <div className="w-12 h-6 bg-[#00e676] rounded-full relative cursor-pointer">
            <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
          </div>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-sm text-[#888]">Weather Warnings</span>
          <div className="w-12 h-6 bg-[#00e676] rounded-full relative cursor-pointer">
            <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CLAIM DETAIL MODAL ──────────────────────────────────────
function ClaimDetailModal({ claim, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-xl font-black">Claim #{claim.id}</h3>
            <p className="text-sm text-[#888]">{claim.date}</p>
          </div>
          <button onClick={onClose} className="text-[#888] hover:text-white text-2xl">&times;</button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex justify-between py-2 border-b border-[#1e1e1e]">
            <span className="text-[#888]">Disruption Type</span>
            <span className="font-bold">{claim.type}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#1e1e1e]">
            <span className="text-[#888]">Zone</span>
            <span>{claim.zone}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#1e1e1e]">
            <span className="text-[#888]">Idle Hours</span>
            <span>{claim.hours} hours</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#1e1e1e]">
            <span className="text-[#888]">Hourly Rate</span>
            <span>₹100/hr</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#888]">Total Payout</span>
            <span className="text-2xl font-black text-[#00e676]">₹{claim.amount}</span>
          </div>
        </div>

        <div className="bg-[#0a0a0a] rounded-xl p-4 mb-6">
          <div className="text-xs text-[#888] mb-2">VALIDATION</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span> GPS verified in disruption zone
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span> Weather trigger confirmed (Rain 45mm)
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span> Traffic velocity &lt; 5 km/h
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span> No fraud indicators detected
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-3 bg-[#00e676] text-black font-bold rounded-xl hover:bg-[#00c853] transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── HELPER COMPONENTS ───────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
      <div className="text-xs text-[#888] font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-black" style={{ color }}>{value}</div>
    </div>
  );
}

function WeatherRow({ label, value, color = "white" }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-[#888]">{label}</span>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  );
}

function SettingRow({ label, value, valueColor = "white" }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-[#1e1e1e]">
      <span className="text-sm text-[#888]">{label}</span>
      <span className="text-sm font-bold" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}
