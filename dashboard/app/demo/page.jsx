"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// ─── DEMO STEPS CONFIGURATION ────────────────────────────────
const DEMO_STEPS = [
  {
    id: "intro",
    title: "Welcome to GigaChad",
    subtitle: "AI-Powered Parametric Micro-Insurance for Gig Workers",
    icon: "⚡",
    duration: 4000,
    content: "intro",
  },
  {
    id: "problem",
    title: "The Problem",
    subtitle: "Chennai Q-Commerce Delivery Partners Face Income Volatility",
    icon: "😰",
    duration: 5000,
    content: "problem",
  },
  {
    id: "onboarding",
    title: "30-Second Onboarding",
    subtitle: "WhatsApp-first KYC via DigiLocker",
    icon: "📱",
    duration: 6000,
    content: "onboarding",
  },
  {
    id: "monitoring",
    title: "Real-Time Monitoring",
    subtitle: "AI watches 10 Chennai zones 24/7",
    icon: "🛰️",
    duration: 6000,
    content: "monitoring",
  },
  {
    id: "disruption",
    title: "Disruption Detected!",
    subtitle: "Flood warning in Velachery zone",
    icon: "🌧️",
    duration: 5000,
    content: "disruption",
  },
  {
    id: "claim",
    title: "Auto-Claim Creation",
    subtitle: "No paperwork, no phone calls",
    icon: "📋",
    duration: 5000,
    content: "claim",
  },
  {
    id: "fraud",
    title: "AI Fraud Detection",
    subtitle: "Graph Neural Network validates claims",
    icon: "🔍",
    duration: 6000,
    content: "fraud",
  },
  {
    id: "whatsapp",
    title: "WhatsApp Bot Notification",
    subtitle: "Rider informed instantly",
    icon: "💬",
    duration: 5000,
    content: "whatsapp",
  },
  {
    id: "payout",
    title: "Instant UPI Payout",
    subtitle: "Money in account within minutes",
    icon: "💸",
    duration: 5000,
    content: "payout",
  },
  {
    id: "novelty",
    title: "Key Innovations",
    subtitle: "What makes GigaChad unique",
    icon: "🏆",
    duration: 8000,
    content: "novelty",
  },
  {
    id: "end",
    title: "Try It Yourself",
    subtitle: "Log in to explore the full platform",
    icon: "🚀",
    duration: 5000,
    content: "end",
  },
];

// ─── MAIN DEMO COMPONENT ─────────────────────────────────────
export default function DemoPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const progressRef = useRef(null);

  const step = DEMO_STEPS[currentStep];

  // Auto-advance logic
  useEffect(() => {
    if (!isPlaying) return;

    const stepDuration = step.duration;
    const startTime = Date.now();

    // Progress bar animation
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min((elapsed / stepDuration) * 100, 100));
    }, 50);

    // Auto-advance timer
    timerRef.current = setTimeout(() => {
      if (currentStep < DEMO_STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
        setProgress(0);
      } else {
        setIsPlaying(false);
      }
    }, stepDuration);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(progressRef.current);
    };
  }, [currentStep, isPlaying, step.duration]);

  const handlePlay = () => {
    setIsPlaying(true);
    setCurrentStep(0);
    setProgress(0);
  };

  const handlePause = () => {
    setIsPlaying(false);
    clearTimeout(timerRef.current);
    clearInterval(progressRef.current);
  };

  const handleNext = () => {
    if (currentStep < DEMO_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setProgress(0);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setProgress(0);
    }
  };

  const handleStepClick = (index) => {
    setCurrentStep(index);
    setProgress(0);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Header */}
      <header className="px-6 py-4 border-b border-[#1a1a1a] flex justify-between items-center relative z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-black text-[#00e676] tracking-wider">⚡ GIGACHAD</h1>
          <span className="px-3 py-1 bg-[#00e676]/20 text-[#00e676] text-xs font-bold rounded-full animate-pulse">
            DEMO MODE
          </span>
        </div>
        <button
          onClick={() => router.push("/")}
          className="text-sm text-[#888] hover:text-white transition-colors"
        >
          ← Back to Login
        </button>
      </header>

      {/* Progress Steps */}
      <div className="px-6 py-3 border-b border-[#1a1a1a] overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {DEMO_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => handleStepClick(i)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                i === currentStep
                  ? "bg-[#00e676] text-black"
                  : i < currentStep
                  ? "bg-[#00e676]/20 text-[#00e676]"
                  : "bg-[#1a1a1a] text-[#555] hover:text-white"
              }`}
            >
              {s.icon} {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-6xl mx-auto">
        {/* Step Header */}
        <div className="text-center mb-8 animate-fadeIn">
          <div className="text-6xl mb-4">{step.icon}</div>
          <h2 className="text-3xl md:text-4xl font-black mb-2">{step.title}</h2>
          <p className="text-[#888] text-lg">{step.subtitle}</p>
        </div>

        {/* Step Content */}
        <div className="mb-8">
          <StepContent step={step} />
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-[#1a1a1a] rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-[#00e676] transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="px-6 py-3 rounded-xl border border-[#333] text-sm font-bold disabled:opacity-30 hover:bg-[#1a1a1a] transition-all"
          >
            ← Previous
          </button>

          {!isPlaying ? (
            <button
              onClick={handlePlay}
              className="px-8 py-3 rounded-xl bg-[#00e676] text-black font-bold hover:bg-[#00c853] transition-all flex items-center gap-2"
            >
              <span>▶</span> {currentStep === DEMO_STEPS.length - 1 ? "Replay" : "Play"}
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="px-8 py-3 rounded-xl bg-[#ff9800] text-black font-bold hover:bg-[#f57c00] transition-all flex items-center gap-2"
            >
              <span>⏸</span> Pause
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={currentStep === DEMO_STEPS.length - 1}
            className="px-6 py-3 rounded-xl border border-[#333] text-sm font-bold disabled:opacity-30 hover:bg-[#1a1a1a] transition-all"
          >
            Next →
          </button>
        </div>
      </main>

      {/* Animations CSS */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        @keyframes typewriter {
          from { width: 0; }
          to { width: 100%; }
        }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-float { animation: float 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// ─── STEP CONTENT COMPONENTS ─────────────────────────────────
function StepContent({ step }) {
  switch (step.content) {
    case "intro":
      return <IntroContent />;
    case "problem":
      return <ProblemContent />;
    case "onboarding":
      return <OnboardingContent />;
    case "monitoring":
      return <MonitoringContent />;
    case "disruption":
      return <DisruptionContent />;
    case "claim":
      return <ClaimContent />;
    case "fraud":
      return <FraudContent />;
    case "whatsapp":
      return <WhatsAppContent />;
    case "payout":
      return <PayoutContent />;
    case "novelty":
      return <NoveltyContent />;
    case "end":
      return <EndContent />;
    default:
      return null;
  }
}

// ─── INTRO CONTENT ───────────────────────────────────────────
function IntroContent() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
      <FeatureCard icon="🛡️" title="Parametric Insurance" desc="Auto-triggers on weather events" />
      <FeatureCard icon="🤖" title="AI-Powered" desc="CrewAI agents & Graph Neural Networks" />
      <FeatureCard icon="⚡" title="Instant Payouts" desc="UPI money in minutes, not weeks" />
    </div>
  );
}

// ─── PROBLEM CONTENT ─────────────────────────────────────────
function ProblemContent() {
  const stats = [
    { value: "₹800-1200", label: "Daily earnings at risk" },
    { value: "15-20", label: "Rainy days per monsoon" },
    { value: "72hrs", label: "Avg claim settlement time" },
    { value: "40%", label: "Income lost during floods" },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-[#111] border border-red-500/30 rounded-xl p-4 text-center">
            <div className="text-2xl md:text-3xl font-black text-red-500">{stat.value}</div>
            <div className="text-xs text-[#888] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6">
        <div className="text-sm text-[#888] leading-relaxed">
          <strong className="text-red-500">Chennai delivery partners</strong> face unique challenges:
          waterlogging in Velachery, traffic gridlock on OMR, frequent strikes, and unpredictable VVIP movements.
          When disruptions hit, riders lose income with <strong className="text-red-500">no safety net</strong>.
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING CONTENT ──────────────────────────────────────
function OnboardingContent() {
  const [animStep, setAnimStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimStep((prev) => (prev + 1) % 4);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    { icon: "💬", text: "Send 'Hi' to WhatsApp bot" },
    { icon: "🪪", text: "DigiLocker Aadhaar verification" },
    { icon: "💳", text: "UPI ID confirmation" },
    { icon: "✅", text: "KYC Complete - Start earning!" },
  ];

  return (
    <div className="flex flex-col items-center animate-fadeIn">
      {/* Phone Mockup */}
      <div className="relative w-72 h-[500px] bg-[#111] border-4 border-[#333] rounded-[40px] overflow-hidden shadow-2xl">
        {/* Phone Notch */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10" />

        {/* WhatsApp Header */}
        <div className="bg-[#075E54] px-4 py-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00e676] rounded-full flex items-center justify-center text-black font-bold">
            G
          </div>
          <div>
            <div className="font-bold text-sm">GigaChad Bot</div>
            <div className="text-xs text-[#ccc]">online</div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-[#0b141a] h-full p-4 space-y-4">
          {steps.slice(0, animStep + 1).map((s, i) => (
            <div
              key={i}
              className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"} animate-slideIn`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-xl text-sm ${
                  i % 2 === 0 ? "bg-[#005C4B] text-white" : "bg-[#1f2c34] text-white"
                }`}
              >
                <span className="mr-2">{s.icon}</span>
                {s.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-center">
        <div className="text-2xl font-black text-[#00e676]">30 Seconds</div>
        <div className="text-sm text-[#888]">Complete KYC via WhatsApp</div>
      </div>
    </div>
  );
}

// ─── MONITORING CONTENT ──────────────────────────────────────
function MonitoringContent() {
  const zones = [
    { name: "Velachery", risk: 72, status: "warning" },
    { name: "OMR", risk: 45, status: "normal" },
    { name: "T. Nagar", risk: 28, status: "safe" },
    { name: "Perungudi", risk: 85, status: "danger" },
    { name: "Anna Nagar", risk: 15, status: "safe" },
    { name: "Tambaram", risk: 22, status: "safe" },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Data Sources */}
      <div className="flex flex-wrap justify-center gap-4 mb-6">
        {["🌤️ Weather APIs", "📰 Tamil News", "🐦 Twitter/X", "🚗 Traffic Data", "📍 GPS Tracking"].map(
          (source, i) => (
            <div
              key={i}
              className="px-4 py-2 bg-[#111] border border-[#1e1e1e] rounded-full text-sm animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            >
              {source}
            </div>
          )
        )}
      </div>

      {/* Zone Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {zones.map((zone, i) => (
          <div
            key={zone.name}
            className={`p-4 rounded-xl border-2 transition-all ${
              zone.status === "danger"
                ? "border-red-500 bg-red-500/10"
                : zone.status === "warning"
                ? "border-yellow-500 bg-yellow-500/10"
                : "border-green-500/30 bg-[#111]"
            }`}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="text-sm text-[#888] mb-1">{zone.name}</div>
            <div
              className={`text-3xl font-black ${
                zone.risk > 70 ? "text-red-500" : zone.risk > 40 ? "text-yellow-500" : "text-green-500"
              }`}
            >
              {zone.risk}%
            </div>
            <div className="text-xs mt-1 uppercase font-bold text-[#888]">{zone.status}</div>
          </div>
        ))}
      </div>

      <div className="text-center text-sm text-[#888]">
        H3 hexagonal grid • 0.1 km² resolution • Updates every 5 minutes
      </div>
    </div>
  );
}

// ─── DISRUPTION CONTENT ──────────────────────────────────────
function DisruptionContent() {
  const [alertVisible, setAlertVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setAlertVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Alert Box */}
      {alertVisible && (
        <div className="bg-red-500/20 border-2 border-red-500 rounded-2xl p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="text-5xl">🚨</div>
            <div>
              <div className="text-xl font-black text-red-500">FLOOD ALERT - VELACHERY</div>
              <div className="text-sm text-[#888]">Risk Level: 85% • Rainfall: 45mm/hr</div>
            </div>
          </div>
        </div>
      )}

      {/* Trigger Data */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <DataCard label="Rainfall" value="45mm" threshold=">30mm triggers" color="#3b82f6" />
        <DataCard label="Traffic Speed" value="4 km/h" threshold="<10 km/h triggers" color="#f59e0b" />
        <DataCard label="Water Level" value="18 cm" threshold=">15cm triggers" color="#ef4444" />
      </div>

      <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 text-center">
        <div className="text-sm text-[#888]">
          <strong className="text-red-500">Parametric Trigger:</strong> All conditions met for Velachery zone.
          Insurance automatically activates - <strong className="text-white">no claim filing needed!</strong>
        </div>
      </div>
    </div>
  );
}

// ─── CLAIM CONTENT ───────────────────────────────────────────
function ClaimContent() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % 5);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    { icon: "📍", text: "GPS location verified in disruption zone" },
    { icon: "⏰", text: "Idle time calculated: 2.5 hours" },
    { icon: "📊", text: "Payout calculated: ₹250" },
    { icon: "✅", text: "Claim auto-created" },
    { icon: "🚀", text: "Sent for instant processing" },
  ];

  return (
    <div className="max-w-md mx-auto animate-fadeIn">
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6 space-y-4">
        <div className="text-center mb-6">
          <div className="text-xs text-[#00e676] font-bold">AUTO-CLAIM #1847</div>
          <div className="text-2xl font-black mt-2">₹250 Payout</div>
        </div>

        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
              i <= step ? "bg-[#00e676]/10 border border-[#00e676]/30" : "bg-[#0a0a0a]"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                i <= step ? "bg-[#00e676] text-black" : "bg-[#1a1a1a] text-[#555]"
              }`}
            >
              {i < step ? "✓" : s.icon}
            </div>
            <div className={`text-sm ${i <= step ? "text-white" : "text-[#555]"}`}>{s.text}</div>
          </div>
        ))}
      </div>

      <div className="text-center mt-6 text-sm text-[#888]">
        Zero paperwork • Zero phone calls • Zero waiting
      </div>
    </div>
  );
}

// ─── FRAUD CONTENT ───────────────────────────────────────────
function FraudContent() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* GNN Visualization */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-6">
        <div className="text-center mb-4">
          <div className="text-xs text-[#888] font-bold uppercase tracking-wider">
            Graph Neural Network Analysis
          </div>
        </div>

        {/* Animated Network Graph */}
        <div className="relative h-48 bg-[#0a0a0a] rounded-xl overflow-hidden">
          {/* Nodes */}
          {[
            { x: "20%", y: "30%", label: "Rider", color: "#00e676" },
            { x: "50%", y: "20%", label: "GPS", color: "#3b82f6" },
            { x: "80%", y: "30%", label: "Weather", color: "#f59e0b" },
            { x: "35%", y: "60%", label: "History", color: "#8b5cf6" },
            { x: "65%", y: "60%", label: "Claim", color: "#00e676" },
            { x: "50%", y: "85%", label: "Score", color: "#00e676" },
          ].map((node, i) => (
            <div
              key={i}
              className="absolute animate-float"
              style={{
                left: node.x,
                top: node.y,
                transform: "translate(-50%, -50%)",
                animationDelay: `${i * 0.3}s`,
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold text-black"
                style={{ backgroundColor: node.color }}
              >
                {node.label.slice(0, 2)}
              </div>
            </div>
          ))}

          {/* Connection lines (simplified) */}
          <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
            <line x1="20%" y1="30%" x2="50%" y2="20%" stroke="#333" strokeWidth="2" />
            <line x1="50%" y1="20%" x2="80%" y2="30%" stroke="#333" strokeWidth="2" />
            <line x1="20%" y1="30%" x2="35%" y2="60%" stroke="#333" strokeWidth="2" />
            <line x1="80%" y1="30%" x2="65%" y2="60%" stroke="#333" strokeWidth="2" />
            <line x1="35%" y1="60%" x2="50%" y2="85%" stroke="#333" strokeWidth="2" />
            <line x1="65%" y1="60%" x2="50%" y2="85%" stroke="#333" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* Fraud Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { check: "GPS velocity anomaly", status: "pass", detail: "Normal movement pattern" },
          { check: "Historical claim frequency", status: "pass", detail: "Within normal range" },
          { check: "Device fingerprint", status: "pass", detail: "Consistent device" },
          { check: "Social graph analysis", status: "pass", detail: "No collusion detected" },
        ].map((item, i) => (
          <div key={i} className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black font-bold">
              ✓
            </div>
            <div>
              <div className="text-sm font-bold">{item.check}</div>
              <div className="text-xs text-[#888]">{item.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center">
        <div className="inline-block bg-green-500/20 text-green-500 px-6 py-2 rounded-full text-sm font-bold">
          Fraud Score: 0.02 (VERY LOW RISK)
        </div>
      </div>
    </div>
  );
}

// ─── WHATSAPP CONTENT ────────────────────────────────────────
function WhatsAppContent() {
  const [messages, setMessages] = useState([]);

  const allMessages = [
    { type: "bot", text: "🎉 Good news! Your claim has been approved." },
    { type: "bot", text: "Disruption: Flood in Velachery\nIdle Time: 2.5 hours\nPayout: ₹250" },
    { type: "bot", text: "💸 Money will be sent to your UPI: hari@paytm" },
    { type: "user", text: "Thanks! When will I receive it?" },
    { type: "bot", text: "⚡ Already processed! Check your account in 2-3 minutes." },
  ];

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < allMessages.length) {
        setMessages((prev) => [...prev, allMessages[i]]);
        i++;
      }
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-center animate-fadeIn">
      {/* Phone Mockup */}
      <div className="relative w-72 h-[520px] bg-[#111] border-4 border-[#333] rounded-[40px] overflow-hidden shadow-2xl">
        {/* Phone Notch */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10" />

        {/* WhatsApp Header */}
        <div className="bg-[#075E54] px-4 py-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00e676] rounded-full flex items-center justify-center text-black font-bold">
            G
          </div>
          <div>
            <div className="font-bold text-sm">GigaChad Bot</div>
            <div className="text-xs text-[#ccc]">online</div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-[#0b141a] h-full p-4 space-y-3 overflow-y-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.type === "user" ? "justify-end" : "justify-start"} animate-slideIn`}
            >
              <div
                className={`max-w-[85%] px-4 py-2 rounded-xl text-sm whitespace-pre-line ${
                  msg.type === "user" ? "bg-[#005C4B] text-white" : "bg-[#1f2c34] text-white"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PAYOUT CONTENT ──────────────────────────────────────────
function PayoutContent() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStage((prev) => (prev + 1) % 5);
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  const stages = [
    { icon: "🏦", label: "Processing", color: "#f59e0b" },
    { icon: "📤", label: "Sending", color: "#3b82f6" },
    { icon: "🔄", label: "Transferring", color: "#8b5cf6" },
    { icon: "✅", label: "Completed", color: "#00e676" },
    { icon: "💰", label: "Received!", color: "#00e676" },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Amount Display */}
      <div className="text-center">
        <div className="text-6xl font-black text-[#00e676] animate-pulse">₹250</div>
        <div className="text-[#888] mt-2">to hari@paytm via UPI</div>
      </div>

      {/* Progress Steps */}
      <div className="flex justify-center items-center gap-2 md:gap-4">
        {stages.map((s, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`w-12 h-12 md:w-16 md:h-16 rounded-full flex flex-col items-center justify-center transition-all ${
                i <= stage ? `bg-opacity-100` : "bg-[#1a1a1a]"
              }`}
              style={{ backgroundColor: i <= stage ? s.color : undefined }}
            >
              <span className="text-lg md:text-2xl">{s.icon}</span>
            </div>
            {i < stages.length - 1 && (
              <div
                className={`w-4 md:w-8 h-1 mx-1 rounded ${
                  i < stage ? "bg-[#00e676]" : "bg-[#333]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Current Status */}
      <div className="text-center">
        <div
          className="inline-block px-6 py-3 rounded-xl text-lg font-bold"
          style={{ backgroundColor: stages[stage].color + "20", color: stages[stage].color }}
        >
          {stages[stage].label}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
        <div className="bg-[#111] rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-[#00e676]">&lt;3</div>
          <div className="text-xs text-[#888]">Minutes</div>
        </div>
        <div className="bg-[#111] rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-[#00e676]">₹0</div>
          <div className="text-xs text-[#888]">Fees</div>
        </div>
        <div className="bg-[#111] rounded-xl p-4 text-center">
          <div className="text-2xl font-black text-[#00e676]">24/7</div>
          <div className="text-xs text-[#888]">Availability</div>
        </div>
      </div>
    </div>
  );
}

// ─── NOVELTY CONTENT ─────────────────────────────────────────
function NoveltyContent() {
  const innovations = [
    {
      icon: "🎯",
      title: "Parametric Insurance",
      desc: "First for Indian gig workers - auto-triggers on verifiable events",
    },
    {
      icon: "🧠",
      title: "CrewAI Multi-Agent",
      desc: "4 specialized AI agents collaborate for monitoring, claims, fraud, pricing",
    },
    {
      icon: "🕸️",
      title: "GNN Fraud Detection",
      desc: "Graph Neural Network analyzes rider behavior patterns",
    },
    {
      icon: "📍",
      title: "H3 Hyper-Local",
      desc: "0.1 km² precision using Uber's H3 hexagonal grid",
    },
    {
      icon: "💬",
      title: "WhatsApp-First",
      desc: "Complete KYC and claims via familiar interface",
    },
    {
      icon: "⚡",
      title: "Instant UPI",
      desc: "No NEFT delays - money in minutes via UPI 2.0",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fadeIn">
      {innovations.map((item, i) => (
        <div
          key={i}
          className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 hover:border-[#00e676]/50 transition-all"
        >
          <div className="text-3xl mb-3">{item.icon}</div>
          <div className="font-bold text-[#00e676] mb-2">{item.title}</div>
          <div className="text-sm text-[#888]">{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ─── END CONTENT ─────────────────────────────────────────────
function EndContent() {
  const router = useRouter();

  return (
    <div className="text-center space-y-8 animate-fadeIn">
      <div className="text-6xl animate-float">🚀</div>

      <div className="max-w-md mx-auto">
        <p className="text-[#888] mb-6">
          GigaChad is built to protect the income of{" "}
          <strong className="text-white">2.5 lakh+ Chennai delivery partners</strong> from unpredictable
          disruptions.
        </p>
      </div>

      <div className="flex flex-col md:flex-row justify-center gap-4">
        <button
          onClick={() => router.push("/register")}
          className="px-8 py-4 bg-[#00e676] text-black font-bold rounded-xl hover:bg-[#00c853] transition-all"
        >
          Create Account
        </button>
        <button
          onClick={() => router.push("/")}
          className="px-8 py-4 border border-[#333] text-white font-bold rounded-xl hover:bg-[#1a1a1a] transition-all"
        >
          Sign In
        </button>
      </div>

      <div className="pt-8 border-t border-[#1e1e1e]">
        <div className="text-xs text-[#555]">
          Built for DevTrails Hackathon 2026 • Team GigaChad
        </div>
      </div>
    </div>
  );
}

// ─── HELPER COMPONENTS ───────────────────────────────────────
function FeatureCard({ icon, title, desc }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-6 text-center hover:border-[#00e676]/50 transition-all">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-bold mb-1">{title}</div>
      <div className="text-sm text-[#888]">{desc}</div>
    </div>
  );
}

function DataCard({ label, value, threshold, color }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4 text-center">
      <div className="text-xs text-[#888] mb-1">{label}</div>
      <div className="text-3xl font-black" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-[#555] mt-1">{threshold}</div>
    </div>
  );
}
