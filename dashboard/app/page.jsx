"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "./AuthContext";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Let the useEffect handle the routing
    } catch (err) {
      setError("Invalid credentials. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center font-sans tracking-wide">
      <div className="max-w-md w-full bg-[#111] border border-[#1e1e1e] p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-black text-[#00e676] tracking-wider text-center mb-2">⚡ GIGACHAD</h1>
        <p className="text-[#555] text-sm text-center mb-8">AI-Powered Income Protection</p>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

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

        <div className="mt-6 text-center text-sm text-[#555]">
          New Rider? <a href="/register" className="text-[#00e676] hover:underline">Create an Account</a>
        </div>
      </div>
    </div>
  );
}
