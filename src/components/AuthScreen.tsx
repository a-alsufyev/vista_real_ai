import React from "react";
import { motion } from "motion/react";
import { Mail, Lock, User, ArrowRight, ShieldCheck, Zap, Loader2, Globe } from "lucide-react";

interface AuthScreenProps {
  onSuccess: (token: string, user: any) => void;
}

const COUNTRIES = ["Georgia", "Armenia", "Kazakhstan"];

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isLogin, setIsLogin] = React.useState(true);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [country, setCountry] = React.useState("Georgia");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!validateEmail(email)) {
      setError("Please enter a valid email address (name@domain.com)");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
      const payload = isLogin ? { email, password } : { email, password, name, country };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      
      onSuccess(data.token, data.user);
    } catch (err: any) {
      console.error("Auth error:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col lg:flex-row">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#111827] p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#10B981] rounded-full blur-[120px] opacity-20 -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-600 rounded-full blur-[120px] opacity-10 translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="text-2xl font-bold text-[#10B981] mb-12">VistaReal<span className="text-white">AI</span></div>
          <h1 className="text-6xl font-bold text-white leading-tight tracking-tight mb-6">
            The Future of <br />
            <span className="text-[#10B981]">Real Estate</span> <br />
            Management.
          </h1>
          <p className="text-[#9CA3AF] text-lg max-w-md leading-relaxed">
            Empower your agency with AI-driven lead management, automated property tracking, and intelligent analytics.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-8">
          <div className="space-y-2">
            <div className="text-white font-bold flex items-center gap-2">
              <ShieldCheck className="text-[#10B981]" size={20} />
              Secure SaaS
            </div>
            <p className="text-[#6B7280] text-sm">Enterprise-grade security for your agency data.</p>
          </div>
          <div className="space-y-2">
            <div className="text-white font-bold flex items-center gap-2">
              <Zap className="text-[#10B981]" size={20} />
              AI Powered
            </div>
            <p className="text-[#6B7280] text-sm">Automate repetitive tasks with our smart assistant.</p>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8"
        >
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-[#111827] mb-2">
              {isLogin ? "Welcome back" : "Create an account"}
            </h2>
            <p className="text-[#6B7280] font-medium">
              {isLogin ? "Sign in to access your dashboard" : "Join VistaRealAI today"}
            </p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <Zap size={14} className="text-[#10B981] fill-[#10B981] animate-pulse" />
              Demo Access Mode
            </div>
            <p className="text-xs text-emerald-700 leading-normal">
              Quick testing? Instantly access pre-seeded CRM database with the official demo account.
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail("demo@vistareal.ai");
                setPassword("password");
                setIsLogin(true);
                setError("");
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl text-xs font-semibold select-none cursor-pointer transition-colors duration-200 flex items-center justify-center gap-2 shadow-sm"
            >
              Fill Demo Credentials
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#374151]">Country</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={20} />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all outline-none appearance-none"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#374151]">Full Name (Optional)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={20} />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#374151]">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={20} />
                <input
                  type="email"
                  required
                  placeholder="name@domain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-[#374151]">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={20} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all outline-none"
                />
              </div>
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[#374151]">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={20} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="text-rose-600 text-xs font-bold bg-rose-50 p-3 rounded-lg border border-rose-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#111827] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-4 hover:bg-black transition-all shadow-xl shadow-gray-200 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {isLogin ? "Sign In" : "Create Account"}
                  <ArrowRight size={20} />
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                }}
                className="text-sm font-semibold text-[#10B981] hover:underline"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
            By continuing, you agree to our Terms of Service and Privacy Policy. 
          </p>
        </motion.div>
      </div>
    </div>
  );
}
