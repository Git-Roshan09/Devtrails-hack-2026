"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
    <div className="min-h-screen bg-background text-white font-body py-12 p-4 flex flex-col items-center justify-center">
      <div className="max-w-md w-full bg-surface border border-surface-2 p-8 rounded-xl shadow-2xl">
        <div className="flex flex-col items-start mb-8 text-left border-b border-surface-2 pb-6">
          <Image src="/logo.png" alt="GigaChad" width={48} height={48} className="mb-4 rounded-xl" />
          <h1 className="text-2xl lg:text-3xl font-display font-black text-white tracking-tight">Create Account</h1>
          <p className="text-muted text-sm mt-1">Start your shift safe with automated parametric coverage.</p>
        </div>

        {error && <p className="text-red-500 text-sm mb-6 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="text-xs text-muted font-semibold tracking-wide mb-2 block">FULL NAME</label>
            <input
              type="text"
              className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="Ravi Shankar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted font-semibold tracking-wide mb-2 block">PHONE NUMBER</label>
            <input
              type="tel"
              className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted font-semibold tracking-wide mb-2 block">EMAIL ADDRESS</label>
            <input
              type="email"
              className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="rider@gigachad.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted font-semibold tracking-wide mb-2 block">PASSWORD</label>
            <input
              type="password"
              className="w-full bg-surface-2 text-white border border-surface-2 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-inverse font-semibold text-sm py-3 rounded-lg hover:bg-[#00c853] transition-colors mt-4 disabled:opacity-50"
          >
            {loading ? "Creating Profile..." : "Register Now"}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-muted">
          Already registered? <a href="/" className="text-primary hover:underline font-medium">Sign In</a>
        </div>
      </div>
    </div>
  );
}
