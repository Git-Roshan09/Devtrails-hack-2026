"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "./AuthContext";
import Image from "next/image";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [mockLoading, setMockLoading] = useState(null);
  const router = useRouter();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      if (currentUser.email === "admin@gigachad.com") {
        router.push("/admin/dashboard");
      } else {
        router.push("/rider/plans");
      }
    }
  }, [currentUser, router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError("Invalid credentials. Try again.");
    }
  };

  // Mock login for evaluators - bypasses Firebase auth
  const handleMockLogin = async (role) => {
    setMockLoading(role);
    // Simulate a brief loading state for realism
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (role === "admin") {
      // Store mock session
      sessionStorage.setItem("mockUser", JSON.stringify({ email: "admin@gigachad.com", role: "admin" }));
      router.push("/admin/dashboard");
    } else {
      sessionStorage.setItem("mockUser", JSON.stringify({ email: "rider@gigachad.com", role: "rider" }));
      router.push("/rider/plans");
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setMessage("Password reset email sent! Check your inbox.");
      setTimeout(() => {
        setShowResetModal(false);
        setMessage("");
      }, 3000);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else {
        setError("Failed to send reset email. Try again.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center font-sans tracking-wide p-4">
      <div className="flex items-center gap-6">
        {/* Login Box */}
        <div className="max-w-md w-full bg-[#111] border border-[#1e1e1e] p-8 rounded-2xl shadow-xl">
          {/* Logo and Title */}
          <div className="flex flex-col items-center mb-6">
            <Image src="/logo.png" alt="GigaChad" width={80} height={80} />
            <h1 className="text-3xl font-black text-[#00e676] tracking-wider text-center mt-3">GIGACHAD</h1>
            <p className="text-[#555] text-sm text-center mt-1">AI-Powered Income Protection</p>
          </div>

          {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
          {message && <p className="text-green-500 text-sm mb-4 text-center">{message}</p>}

          {/* Quick Login for Evaluators */}
          <div className="mb-6">
            <p className="text-xs text-[#888] font-bold mb-3 text-center uppercase tracking-wider">🎯 Quick Login for Evaluators</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleMockLogin("admin")}
                disabled={mockLoading}
                className="flex flex-col items-center gap-2 p-4 bg-[#1a1a1a] border border-[#333] rounded-xl hover:border-[#00e676] hover:bg-[#001a0d] transition-all group"
              >
                <span className="text-2xl">👨‍💼</span>
                <span className="text-sm font-bold text-[#888] group-hover:text-[#00e676]">
                  {mockLoading === "admin" ? "Loading..." : "Admin View"}
              </span>
              <span className="text-[10px] text-[#555]">Insurer Dashboard</span>
            </button>
            <button
              onClick={() => handleMockLogin("rider")}
              disabled={mockLoading}
              className="flex flex-col items-center gap-2 p-4 bg-[#1a1a1a] border border-[#333] rounded-xl hover:border-[#00e676] hover:bg-[#001a0d] transition-all group"
            >
              <span className="text-2xl">🛵</span>
              <span className="text-sm font-bold text-[#888] group-hover:text-[#00e676]">
                {mockLoading === "rider" ? "Loading..." : "Rider View"}
              </span>
              <span className="text-[10px] text-[#555]">Delivery Partner</span>
            </button>
          </div>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#333]"></div></div>
          <div className="relative flex justify-center text-xs"><span className="bg-[#111] px-3 text-[#555]">or sign in with credentials</span></div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-[#888] font-bold mb-1 block">EMAIL</label>
            <input 
              type="email" 
              className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00e676] transition-colors"
              placeholder="rider@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-[#888] font-bold mb-1 block">PASSWORD</label>
            <input 
              type="password" 
              className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00e676] transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="w-full bg-[#00e676] text-black font-bold py-3 rounded-xl hover:bg-[#00c853] transition-colors mt-6">
            SIGN IN
          </button>
        </form>

        <div className="mt-4 text-center">
          <button 
            onClick={() => { setShowResetModal(true); setResetEmail(email); setError(""); }}
            className="text-sm text-[#888] hover:text-[#00e676] transition-colors"
          >
            Forgot Password?
          </button>
        </div>

        <div className="mt-4 text-center text-sm text-[#555]">
          New Rider? <a href="/register" className="text-[#00e676] hover:underline">Create an Account</a>
        </div>
      </div>

      {/* Demo Mode Button - Right Side */}
      <div className="hidden md:flex flex-col items-center justify-center">
        <button 
          onClick={() => router.push("/demo")}
          className="w-48 h-48 rounded-2xl border-2 border-dashed border-[#00e676] text-[#00e676] font-bold hover:bg-[#00e676]/10 transition-all group flex flex-col items-center justify-center gap-3"
        >
          <span className="text-5xl">🎬</span>
          <span className="text-sm text-center px-2">WATCH<br/>PRODUCT DEMO</span>
        </button>
        <p className="text-[#555] text-xs mt-3 text-center">See the full workflow<br/>in action</p>
      </div>

      {/* Demo Button for Mobile - shown below login */}
      <div className="md:hidden mt-6 w-full max-w-md">
        <button 
          onClick={() => router.push("/demo")}
          className="w-full py-4 rounded-xl border-2 border-dashed border-[#00e676] text-[#00e676] font-bold hover:bg-[#00e676]/10 transition-all"
        >
          <span className="flex items-center justify-center gap-2">
            <span className="text-xl">🎬</span>
            <span>WATCH PRODUCT DEMO</span>
          </span>
        </button>
      </div>
    </div>

      {/* Password Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#111] border border-[#1e1e1e] p-6 rounded-2xl w-full max-w-sm mx-4">
            <h2 className="text-xl font-bold text-[#00e676] mb-4">Reset Password</h2>
            <p className="text-sm text-[#888] mb-4">Enter your email to receive a password reset link.</p>
            
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            {message && <p className="text-green-500 text-sm mb-4">{message}</p>}
            
            <form onSubmit={handlePasswordReset}>
              <input 
                type="email" 
                className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 mb-4 focus:outline-none focus:border-[#00e676]"
                placeholder="rider@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => { setShowResetModal(false); setError(""); setMessage(""); }}
                  className="flex-1 bg-[#1a1a1a] text-white py-3 rounded-xl hover:bg-[#2a2a2a] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#00e676] text-black font-bold py-3 rounded-xl hover:bg-[#00c853] transition-colors"
                >
                  Send Reset Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
