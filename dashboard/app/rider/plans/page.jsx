"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../AuthContext";
import { useRouter } from "next/navigation";

export default function Plans() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState("giga_plus");
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    if (currentUser === undefined) return;
    if (!currentUser) router.push("/");
  }, [currentUser, router]);

  const handleOptIn = async () => {
    setActioning(true);
    // In a real app, this would route to a Razorpay checkout or save the policy to PostgreSQL
    alert(`Successfully opted into ${selectedPlan}!`);
    setActioning(false);
  };

  const handleRemindMe = () => {
    setActioning(true);
    // Mark as reminded in Postgres
    alert("We'll remind you later! Ensure you opt-in before shifts to stay protected.");
    setActioning(false);
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans">
      <header className="px-8 py-6 border-b border-[#1a1a1a] flex justify-between items-center">
        <h1 className="text-2xl font-black text-[#00e676] tracking-wider">⚡ GIGACHAD</h1>
        <button className="text-sm text-[#555] hover:text-white transition-colors" onClick={handleRemindMe}>
          Remind me later
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 max-w-5xl mx-auto w-full">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black mb-4">PROTECT YOUR INCOME</h2>
          <p className="text-[#888] max-w-2xl mx-auto">
            GigaChad uses AI to predict disruptions in your delivery zone. 
            Select a protection plan and get paid automatically if floods, traffic, or strikes stop you from earning.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {/* BASIC */}
          <div 
            onClick={() => setSelectedPlan("giga_basic")}
            className={`cursor-pointer rounded-2xl p-6 border-2 transition-all ${
              selectedPlan === "giga_basic" ? "border-[#00e676] bg-[#111] transform scale-105" : "border-[#1e1e1e] hover:border-[#333] bg-[#0f0f0f]"
            }`}
          >
            <div className="text-xs text-[#888] font-bold tracking-wider mb-2">BASIC</div>
            <div className="text-3xl font-black mb-4">₹49<span className="text-sm text-[#555] font-normal">/week</span></div>
            <ul className="space-y-3 text-sm text-[#ccc] mb-8">
              <li>Payout Cap: <strong className="text-white">₹300/day</strong></li>
              <li>Covers: Rain & Traffic</li>
            </ul>
          </div>

          {/* PLUS (Popular) */}
          <div 
            onClick={() => setSelectedPlan("giga_plus")}
            className={`cursor-pointer rounded-2xl p-6 border-2 transition-all relative ${
              selectedPlan === "giga_plus" ? "border-[#00e676] bg-[#111] transform scale-105" : "border-[#1e1e1e] hover:border-[#333] bg-[#0f0f0f]"
            }`}
          >
            <div className="absolute top-0 right-6 transform -translate-y-1/2 bg-[#00e676] text-black text-[10px] font-black px-2 py-1 rounded-full uppercase">
              Recommended
            </div>
            <div className="text-xs text-[#00e676] font-bold tracking-wider mb-2">PRO</div>
            <div className="text-3xl font-black mb-4">₹99<span className="text-sm text-[#555] font-normal">/week</span></div>
            <ul className="space-y-3 text-sm text-[#ccc] mb-8">
              <li>Payout Cap: <strong className="text-white">₹600/day</strong></li>
              <li>Covers: Rain, Traffic, Strikes</li>
              <li>Instant WhatsApp Alerts</li>
            </ul>
          </div>

          {/* PRO */}
          <div 
            onClick={() => setSelectedPlan("giga_pro")}
            className={`cursor-pointer rounded-2xl p-6 border-2 transition-all ${
              selectedPlan === "giga_pro" ? "border-[#00e676] bg-[#111] transform scale-105" : "border-[#1e1e1e] hover:border-[#333] bg-[#0f0f0f]"
            }`}
          >
            <div className="text-xs text-[#e91e63] font-bold tracking-wider mb-2">ULTRA</div>
            <div className="text-3xl font-black mb-4">₹149<span className="text-sm text-[#555] font-normal">/week</span></div>
            <ul className="space-y-3 text-sm text-[#ccc] mb-8">
              <li>Payout Cap: <strong className="text-white">₹1000/day</strong></li>
              <li>All Disruptions Covered</li>
              <li>Bonus Surge Payouts</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex gap-4 w-full max-w-md">
          <button 
            disabled={actioning}
            onClick={handleRemindMe}
            className="flex-1 py-4 rounded-xl border border-[#333] bg-transparent text-[#888] font-bold hover:bg-[#1a1a1a] transition-all"
          >
            REMIND ME
          </button>
          <button 
            disabled={actioning}
            onClick={handleOptIn}
            className="flex-[2] py-4 rounded-xl bg-[#00e676] text-black font-black hover:bg-[#00c853] transition-all transform hover:scale-105 active:scale-95"
          >
            PAY {"&"} SECURE SHIFT
          </button>
        </div>
      </main>
    </div>
  );
}
