import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, AlertCircle, Shield, User, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t, formatError } = useLanguage();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatError(data) || t('auth.invalidCredentials'));
      }

      login(data.user, data.token);

      // Route officials directly to the Official Dashboard; citizens to My Complaints or Home
      if (['reviewer', 'officer', 'supervisor'].includes(data.user.role)) {
        navigate('/dashboard');
      } else {
        navigate('/my-complaints');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('Demo@1234');
  };

  return (
    <div className="max-w-md mx-auto my-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-7 sm:p-8 space-y-6">
        {/* Login Header */}
        <div className="flex flex-col items-center text-center border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">
            {t('auth.loginTitle')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('auth.loginSubtitle')}
          </p>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-rose-800 text-xs bg-rose-50 p-3 rounded-lg border border-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('auth.email')} *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0c2340] focus:border-[#0c2340] bg-slate-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('auth.password')} *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0c2340] focus:border-[#0c2340] bg-slate-50/50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-[#0c2340] hover:bg-[#1a365d] text-white font-bold text-xs rounded-lg shadow-xs transition disabled:opacity-50 uppercase tracking-wider flex items-center justify-center gap-1.5"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{loading ? t('common.processing') : t('auth.signInButton')}</span>
          </button>
        </form>

        {/* Quick Demo Credentials Picker */}
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-2.5">
            <Shield className="w-3.5 h-3.5 text-[#0c2340]" />
            <span>{t('auth.demoAccountsTitle')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickDemo('reviewer@pmc.demo.local')}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 text-left transition font-semibold"
            >
              📋 {t('auth.demoReviewer')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('supervisor@pmc.demo.local')}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 text-left transition font-semibold"
            >
              🛡️ {t('auth.demoSupervisor')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('officer.roads@pmc.demo.local')}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 text-left transition font-semibold"
            >
              🚧 {t('auth.demoRoads')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('officer.waste@pmc.demo.local')}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 text-left transition font-semibold"
            >
              ♻️ {t('auth.demoWaste')}
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('pooja.citizen@demo.in')}
              className="col-span-2 p-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-950 text-left transition font-bold"
            >
              👤 {t('auth.demoCitizen')}
            </button>
          </div>
        </div>

        <div className="text-center pt-2 text-xs text-slate-600">
          <span>{t('auth.dontHaveAccount')} </span>
          <Link to="/register" className="font-bold text-[#0c2340] hover:underline">
            {t('auth.registerLink')}
          </Link>
        </div>
      </div>
    </div>
  );
}
