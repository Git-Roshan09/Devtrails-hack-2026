"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";

export default function Register() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. Register with Firebase
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const idToken = await user.getIdToken();

      // 2. Sync with our Postgres Backend
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${backendUrl}/api/auth/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firebase_token: idToken,
          name: name,
          phone: phone,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to sync with GigaChad servers");
      }

      // 3. Success! Move to plans
      router.push("/rider/plans");

    } catch (err) {
      console.error(err);
      setError(err.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center font-sans tracking-wide py-12">
      <div className="max-w-md w-full bg-[#111] border border-[#1e1e1e] p-8 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-black text-[#00e676] tracking-wider text-center mb-6">START YOUR SHIFT SAFE</h1>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-xs text-[#888] font-bold mb-1 block">FULL NAME</label>
            <input 
              type="text" 
              className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00e676]"
              placeholder="Ravi Shankar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-[#888] font-bold mb-1 block">PHONE NUMBER</label>
            <input 
              type="tel" 
              className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00e676]"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-[#888] font-bold mb-1 block">EMAIL</label>
            <input 
              type="email" 
              className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00e676]"
              placeholder="rider@gigachad.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-[#888] font-bold mb-1 block">PASSWORD</label>
            <input 
              type="password" 
              className="w-full bg-[#1a1a1a] text-white border border-[#333] rounded-lg px-4 py-3 focus:outline-none focus:border-[#00e676]"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#00e676] text-black font-bold py-3 rounded-xl hover:bg-[#00c853] transition-colors mt-6 disabled:opacity-50"
          >
            {loading ? "CREATING ACCOUNT..." : "REGISTER NOW"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#555]">
          Already registered? <a href="/" className="text-[#00e676] hover:underline">Sign In</a>
        </div>
      </div>
    </div>
  );
}
