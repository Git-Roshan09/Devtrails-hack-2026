"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "./AuthContext";
import Image from "next/image";
import { Target, Building2, Bike, Clapperboard, ChevronRight } from "lucide-react";

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

  const handleMockLogin = async (role) => {
    setMockLoading(role);
    await new Promise(resolve => setTimeout(resolve, 800));

    if (role === "admin") {
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
    <>
      <div className="min-h-screen bg-background text-white font-body p-4 md:p-8 flex items-center justify-center">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-16 items-center">

          {/* Left Hero / Demo Section (Replaces centered landing pattern) */}
          <div className="flex flex-col items-start text-left space-y-6 order-2 md:order-1">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="GigaChad" width={64} height={64} className="rounded-xl" />
              <div>
                <h1 className="text-3xl lg:text-5xl font-black text-primary tracking-tight">GIGACHAD</h1>
                <p className="text-muted text-sm lg:text-base font-medium">AI-Powered Income Protection</p>
              </div>
            </div>

            <h2 className="text-2xl lg:text-4xl font-display font-medium leading-tight max-w-xl text-white mt-4">
              Providing frictionless micro-insurance for Q-Commerce delivery partners.
            </h2>

            <p className="text-muted text-base max-w-lg leading-relaxed">
              No forms, no waiting, no hassle. Payouts triggered automatically based on accurate local weather and traffic parameters.
            </p>

          </div>

          {/* Right Login Section */}
          <div className="w-full max-w-md mx-auto bg-surface border border-surface-2 p-8 rounded-xl shadow-2xl order-1 md:order-2">
            {error && <p className="text-red-500 text-sm mb-4 bg-red-500/10 p-3 rounded-lg">{error}</p>}
            {message && <p className="text-primary text-sm mb-4 bg-primary/10 p-3 rounded-lg">{message}</p>}

            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted font-semibold uppercase tracking-wider">Quick Evaluator Access</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleMockLogin("admin")}
                  disabled={mockLoading}
                  className="flex flex-col items-start gap-3 p-4 bg-surface-2 border border-surface-2 rounded-lg hover:border-primary/50 transition-colors text-left"
                >
                  <Building2 className={`w-6 h-6 ${mockLoading === "admin" ? "animate-pulse text-primary" : "text-white"}`} />
                  <div>
                    <span className="block text-sm font-semibold text-white">
                      {mockLoading === "admin" ? "Loading..." : "Insurer"}
                    </span>
                    <span className="block text-xs text-muted mt-1">Admin Panel</span>
                  </div>
                </button>
                <button
                  onClick={() => handleMockLogin("rider")}
                  disabled={mockLoading}
                  className="flex flex-col items-start gap-3 p-4 bg-surface-2 border border-surface-2 rounded-lg hover:border-primary/50 transition-colors text-left"
                >
                  <Bike className={`w-6 h-6 ${mockLoading === "rider" ? "animate-pulse text-primary" : "text-white"}`} />
                  <div>
                    <span className="block text-sm font-semibold text-white">
                      {mockLoading === "rider" ? "Loading..." : "Rider"}
                    </span>
                    <span className="block text-xs text-muted mt-1">Partner App</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex items-center mb-8">
              <div className="flex-1 border-t border-surface-2"></div>
              <span className="bg-surface px-4 text-xs text-muted font-medium">or login manually</span>
              <div className="flex-1 border-t border-surface-2"></div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="text-xs text-muted font-semibold mb-2 block tracking-wide">EMAIL ADDRESS</label>
                <input
                  type="email"
                  className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted font-semibold tracking-wide">PASSWORD</label>
                  <button
                    type="button"
                    onClick={() => { setShowResetModal(true); setResetEmail(email); setError(""); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Reset
                  </button>
                </div>
                <input
                  type="password"
                  className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="w-full bg-primary text-inverse font-semibold text-sm py-3 rounded-lg hover:bg-[#00c853] transition-colors mt-2">
                Sign into Account
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-surface-2 text-center text-sm text-muted">
              New to GigaChad? <a href="/register" className="text-primary hover:underline font-medium">Create an Account</a>
            </div>
          </div>
        </div>
      </div>

      {showResetModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-surface-2 p-6 rounded-xl w-full max-w-sm">
            <h2 className="text-xl font-display font-semibold text-white mb-2">Reset Password</h2>
            <p className="text-sm text-muted mb-6">Enter your email to receive a password reset link.</p>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            {message && <p className="text-primary text-sm mb-4">{message}</p>}

            <form onSubmit={handlePasswordReset}>
              <input
                type="email"
                className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 mb-6 text-sm focus:outline-none focus:border-primary"
                placeholder="name@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowResetModal(false); setError(""); setMessage(""); }}
                  className="flex-1 bg-surface-2 text-white text-sm py-2.5 rounded-lg hover:bg-[#2a2a2a] transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary text-inverse text-sm font-semibold py-2.5 rounded-lg hover:bg-[#00c853] transition-colors"
                >
                  Send Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
