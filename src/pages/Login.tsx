import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, BrainCircuit, ShieldCheck } from "lucide-react";

const TEST_ACCOUNTS = [
  { label: "Government Admin",    email: "admin@cgdisaster.gov.in",  password: "Admin@123",    role: "Admin — sees all facilities" },
  { label: "Borsi School",        email: "borsi.school@durg.edu",    password: "School@123",   role: "School user — sees only Borsi" },
  { label: "JLN Hospital",        email: "jln.hospital@durg.health", password: "Hospital@123", role: "Hospital user — sees only JLN" },
  { label: "CCM Hospital",        email: "ccm.hospital@durg.health", password: "CCMH@123",     role: "Hospital user — sees only CCM" },
];

export default function Login() {
  const { login } = useAuth();
  const [, navigate] = useLocation();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate("/");
    } else {
      setError(result.error ?? "Login failed.");
    }
  }

  function fillAccount(email: string, password: string) {
    setEmail(email);
    setPassword(password);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-2 gap-8 items-start">

        {/* ── Left: Branding ── */}
        <div className="text-white pt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <BrainCircuit className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="font-black text-xl tracking-tight">CG State</div>
              <div className="text-xs font-semibold text-orange-400 tracking-widest">DISASTER RISK ENGINE</div>
            </div>
          </div>

          <h1 className="text-4xl font-black mb-3 leading-tight">
            ML-Powered<br />Risk Intelligence
          </h1>
          <p className="text-indigo-300 text-sm mb-8 leading-relaxed">
            Live weather telemetry feeds ML models that predict 30, 60, and 90-day disaster risk
            for schools and hospitals across Chhattisgarh.
          </p>

          <div className="space-y-3">
            {[
              "Real-time weather from Open-Meteo API",
              "Prophet & Random Forest ML forecasts",
              "Role-based access — admins vs. facility staff",
              "Facility-level risk projections + map",
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2.5 text-sm text-indigo-200">
                <ShieldCheck className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                {feat}
              </div>
            ))}
          </div>

          <div className="mt-8 text-xs text-indigo-500">
            NIT Raipur · Government of Chhattisgarh · UNICEF
          </div>
        </div>

        {/* ── Right: Login form + test accounts ── */}
        <div className="space-y-4">

          {/* Login card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Sign in</h2>
            <p className="text-sm text-gray-500 mb-6">Use your government or facility credentials.</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.gov.in"
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          {/* Test accounts */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
            <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">
              Test accounts — click to fill
            </p>
            <div className="space-y-2">
              {TEST_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => fillAccount(acc.email, acc.password)}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/15 transition-colors border border-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white text-xs font-semibold">{acc.label}</span>
                    <span className="text-indigo-300 font-mono text-[10px]">{acc.password}</span>
                  </div>
                  <div className="text-indigo-400 text-[10px] mt-0.5">{acc.role}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}