import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus, User, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { t, formatError } = useLanguage();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t('errors.FIELD_REQUIRED', { field: t('auth.password') }));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.invalidCredentials'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatError(data) || t('auth.invalidCredentials'));
      }

      login(data.user, data.token);
      navigate('/report');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-7 sm:p-8 space-y-6">
        {/* Register Header */}
        <div className="flex flex-col items-center text-center border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">
            {t('auth.registerTitle')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {t('auth.registerSubtitle')}
          </p>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-rose-800 text-xs bg-rose-50 p-3 rounded-lg border border-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('auth.fullName')} *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('auth.fullNamePlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0c2340] focus:border-[#0c2340] bg-slate-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('auth.email')} *
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="citizen@example.in"
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
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0c2340] focus:border-[#0c2340] bg-slate-50/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {t('auth.password')} ({t('common.confirm')}) *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
            <UserPlus className="w-3.5 h-3.5" />
            <span>{loading ? t('common.submitting') : t('auth.registerButton')}</span>
          </button>
        </form>

        <div className="text-center pt-2 text-xs text-slate-600">
          <span>{t('auth.alreadyHaveAccount')} </span>
          <Link to="/login" className="font-bold text-[#0c2340] hover:underline">
            {t('auth.loginLink')}
          </Link>
        </div>
      </div>
    </div>
  );
}
