"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "./AuthContext";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const router = useRouter();
  const { currentUser } = useAuth();

  useEffect(() => {
    // If already logged in, route them based on a hacky admin check or just send to plans for now
    // Actually we will route them after fetching their postgres DB record.
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
      // Let the useEffect handle the routing
    } catch (err) {
      setError("Invalid credentials. Try again.");
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center font-sans tracking-wide">
      <div className="max-w-md w-full bg-[#111] border border-[#1e1e1e] p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-black text-[#00e676] tracking-wider text-center mb-2">⚡ GIGACHAD</h1>
        <p className="text-[#555] text-sm text-center mb-8">AI-Powered Income Protection</p>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        {message && <p className="text-green-500 text-sm mb-4 text-center">{message}</p>}

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
