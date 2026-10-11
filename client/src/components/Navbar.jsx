import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Building2, 
  PlusCircle, 
  FileText, 
  MapPin, 
  LayoutDashboard, 
  LogIn, 
  UserPlus,
  Bell,
  Check,
  Menu,
  X,
  Search,
  Calendar,
  Eye,
  Shield,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

import { useCity } from '../context/CityContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { city } = useCity();
  const { user, token, logout, isAuthenticated } = useAuth();
  const { lang, t, labelFor, formatNotification, formatDate } = useLanguage();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

  // Search & Tracking Bar state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDept, setSearchDept] = useState('all');

  // Accessibility States
  const [fontSize, setFontSize] = useState('normal');
  const [highContrast, setHighContrast] = useState(false);

  // Format current live date using selected locale
  const [currentDateStr, setCurrentDateStr] = useState('');
  useEffect(() => {
    setCurrentDateStr(formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  }, [lang, formatDate]);

  // Adjust font size on html root
  const changeFontSize = (size) => {
    setFontSize(size);
    document.documentElement.dataset.fontSize = size;
  };

  // Toggle high contrast mode
  const toggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    document.documentElement.dataset.contrast = next ? 'high' : 'normal';
  };

  // Close notifications on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications if logged in
  useEffect(() => {
    if (isAuthenticated && token) {
      fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => (res.ok ? res.json() : { notifications: [] }))
        .then((data) => setNotifications(data.notifications || []))
        .catch(() => setNotifications([]));
    } else {
      setNotifications([]);
    }
  }, [isAuthenticated, token]);

  const markNotificationRead = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id || n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const isActive = (path) => {
    if (path === '/' && location.pathname !== '/') return false;
    return location.pathname.startsWith(path);
  };

  const handleHeaderSearch = (e) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (/^NS-\d{4}-\d+/i.test(q)) {
      navigate(`/complaints/${q.toUpperCase()}`);
    } else {
      navigate(`/public-map?q=${encodeURIComponent(q)}&dept=${searchDept}`);
    }
    setSearchQuery('');
  };

  const isOfficial = user && ['reviewer', 'officer', 'supervisor'].includes(user.role);

  const navLinks = [
    { to: '/', label: t('nav.home') },
    ...(!isOfficial
      ? [
          { to: '/report', label: t('nav.fileGrievance') },
          { to: '/my-complaints', label: t('nav.myGrievances') }
        ]
      : [
          { to: '/dashboard', label: t('nav.staff') }
        ]),
    { to: '/public-map', label: t('nav.publicMap') }
  ];

  const [trendingIssues, setTrendingIssues] = useState([]);

  useEffect(() => {
    fetch('/api/public/issues')
      .then((res) => (res.ok ? res.json() : { issues: [] }))
      .then((data) => {
        const issues = (data.issues || [])
          .filter((i) => (i.supportCount || 0) > 0)
          .sort((a, b) => (b.supportCount || 0) - (a.supportCount || 0))
          .slice(0, 4);
        setTrendingIssues(issues);
      })
      .catch(() => setTrendingIssues([]));
  }, []);

  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs font-sans">
      {/* 1. TOP UTILITY BAR */}
      <div className="bg-[#f0f4f8] border-b border-slate-200 text-slate-700 text-xs py-1 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Skip to Main */}
          <div className="flex items-center space-x-3 text-[11px] font-medium text-slate-600">
            <a 
              href="#main-content" 
              className="hover:underline focus:outline-none focus:ring-1 focus:ring-[#0c2340] px-1 py-0.5 rounded text-slate-700"
            >
              {t('nav.skipToContent')}
            </a>
          </div>

          {/* Right: Accessibility Font Size, Contrast, Language */}
          <div className="flex items-center space-x-3 text-[11px]">
            {/* Font Size Scaling Controls */}
            <div className="hidden md:flex items-center space-x-1 border-r border-slate-300 pr-3 font-semibold text-slate-600">
              <button 
                type="button" 
                onClick={() => changeFontSize('small')}
                className={`px-1.5 py-0.5 rounded transition ${fontSize === 'small' ? 'bg-[#0c2340] text-white' : 'hover:bg-slate-200'}`}
                title={t('nav.accessibility.fontSize')}
              >
                {t('nav.accessibility.normal')}-
              </button>
              <button 
                type="button" 
                onClick={() => changeFontSize('normal')}
                className={`px-1.5 py-0.5 rounded transition ${fontSize === 'normal' ? 'bg-[#0c2340] text-white' : 'hover:bg-slate-200'}`}
                title={t('nav.accessibility.fontSize')}
              >
                {t('nav.accessibility.normal')}
              </button>
              <button 
                type="button" 
                onClick={() => changeFontSize('large')}
                className={`px-1.5 py-0.5 rounded transition ${fontSize === 'large' ? 'bg-[#0c2340] text-white' : 'hover:bg-slate-200'}`}
                title={t('nav.accessibility.fontSize')}
              >
                {t('nav.accessibility.normal')}+
              </button>
            </div>

            {/* High Contrast Toggle */}
            <button
              type="button"
              onClick={toggleContrast}
              className="hidden lg:flex items-center gap-1 hover:text-slate-900 border-r border-slate-300 pr-3 font-medium"
              title="Toggle contrast"
            >
              <Eye className="w-3 h-3 text-slate-500" />
              <span>{highContrast ? t('nav.accessibility.standard') : t('nav.accessibility.highContrast')}</span>
            </button>

            {/* Language Toggle Component */}
            <LanguageToggle />
          </div>
        </div>
      </div>

      {/* 2. MAIN BRAND & SEARCH HEADER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Brand Logo & Title */}
          <div className="flex items-center space-x-3">
            <Link to="/" className="shrink-0 flex items-center">
              <img src="/icon.svg" alt="Nagar Setu" className="h-7 w-7 object-contain" />
            </Link>
            <div className="flex flex-col">
              <Link to="/" className="group">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl sm:text-2xl font-black text-[#0c2340] tracking-tight font-serif">
                    nagarsetu<span className="text-[#1E4FA3]">.demo</span>
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
                    {t('common.demoBadge')}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">
                  {t('common.demoTagline')}
                </p>
              </Link>
            </div>
          </div>

          {/* Integrated Portal Search Bar */}
          <div className="flex-1 max-w-xl mx-auto lg:mx-0 w-full">
            <form onSubmit={handleHeaderSearch} className="flex flex-col sm:flex-row items-stretch border border-slate-300 rounded-md overflow-hidden bg-white shadow-2xs focus-within:ring-2 focus-within:ring-[#0c2340]">
              <div className="relative flex-1 flex items-center">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nav.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
              </div>
              <select
                value={searchDept}
                onChange={(e) => setSearchDept(e.target.value)}
                className="bg-slate-50 border-t sm:border-t-0 sm:border-l border-slate-200 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none"
              >
                <option value="all">{t('nav.allDepartments')}</option>
                <option value="roads">{labelFor('department', 'roads')}</option>
                <option value="waste">{labelFor('department', 'waste')}</option>
                <option value="water">{labelFor('department', 'water')}</option>
                <option value="others">{labelFor('department', 'others')}</option>
              </select>
              <button
                type="submit"
                className="px-5 py-2 bg-[#c5221f] hover:bg-[#a91b19] text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{t('common.search')}</span>
              </button>
            </form>

            {/* Trending Searches Sub-strip (Shown only when trending issues exist) */}
            {trendingIssues.length > 0 && (
              <div className="hidden sm:flex items-center space-x-1.5 mt-1.5 text-[11px] text-slate-500 overflow-x-auto whitespace-nowrap">
                <span className="font-semibold text-slate-700 shrink-0">{t('nav.trending')}:</span>
                {trendingIssues.map((issue, i) => {
                  const label = issue.category || issue.title;
                  const query = issue.trackingId || issue.category || issue.title;
                  return (
                    <button
                      key={issue.id || i}
                      type="button"
                      onClick={() => {
                        setSearchQuery(query);
                        if (issue.trackingId) {
                          navigate(`/complaints/${issue.trackingId}`);
                        } else {
                          navigate(`/public-map?q=${encodeURIComponent(query)}`);
                        }
                      }}
                      className="text-slate-600 hover:text-[#0c2340] hover:underline"
                    >
                      {label} ({issue.supportCount || 1}){i < trendingIssues.length - 1 ? ' •' : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Account & Notification Area */}
          <div className="flex items-center justify-end space-x-2 shrink-0">
            {/* Notification Bell */}
            {isAuthenticated && (
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="p-2 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 relative border border-slate-200 transition"
                  title={t('nav.notifications')}
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#c5221f] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center shadow-xs">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 text-slate-800 z-50 overflow-hidden">
                    <div className="bg-[#0c2340] text-white px-3.5 py-2.5 flex items-center justify-between text-xs font-bold">
                      <span>{t('nav.notifications')} ({unreadCount})</span>
                      <span className="text-[10px] text-slate-300">{t('common.cityAuthority')}</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-slate-400">{t('nav.noNotifications')}</div>
                      ) : (
                        notifications.slice(0, 10).map((n) => {
                          const nid = n._id || n.id;
                          return (
                            <div key={nid} className={`p-3 text-xs ${n.isRead ? 'bg-white' : 'bg-blue-50/60 font-semibold'}`}>
                              <div className="flex justify-between items-start gap-1">
                                <p className="text-slate-800 leading-tight">{formatNotification(n)}</p>
                                {!n.isRead && (
                                  <button
                                    onClick={(e) => markNotificationRead(nid, e)}
                                    className="p-0.5 text-slate-400 hover:text-emerald-700"
                                    title="Mark as read"
                                  >
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  </button>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 mt-1 block">
                                {formatDate(n.createdAt, { hour: '2-digit', minute: '2-digit', year: undefined, month: undefined, day: undefined })}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auth Buttons */}
            {isAuthenticated ? (
              <div className="flex items-center space-x-2">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">{user?.name}</span>
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase">
                    {labelFor('role', user?.role)} {user?.department ? `(${labelFor('department', user.department)})` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-semibold rounded transition"
                >
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <Link
                  to="/login"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-bold rounded flex items-center gap-1 transition"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{t('nav.login')}</span>
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-1.5 bg-[#0c2340] hover:bg-[#16365c] text-white text-xs font-bold rounded flex items-center gap-1 transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{t('nav.register')}</span>
                </Link>
              </div>
            )}

            {/* Mobile Hamburger Button */}
            <div className="flex md:hidden ml-1">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded bg-slate-100 text-slate-700 border border-slate-300"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. PRIMARY FULL-WIDTH DEEP NAVY NAVIGATION BAR */}
      <nav className="bg-[#0c2340] text-white border-t border-[#1a385f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="hidden md:flex items-center justify-between h-11 text-xs font-bold tracking-wide uppercase">
            <div className="flex items-center space-x-1">
              {navLinks.map((item) => {
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`px-4 py-2.5 transition-colors relative border-b-2 ${
                      active
                        ? 'bg-[#16365c] text-white border-[#e05626]'
                        : 'border-transparent text-slate-200 hover:bg-[#16365c] hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Right: Emergency callout & Report Action in Nav */}
            <div className="flex items-center space-x-3 text-[11px] normal-case text-slate-300">
              <span className="hidden lg:inline text-amber-300 font-semibold">
                {t('common.emergencyAdvisory')}
              </span>
              <span className="hidden lg:inline text-slate-400">|</span>
              <Link 
                to="/report" 
                className="bg-[#c5221f] hover:bg-[#a91b19] text-white px-3 py-1 rounded text-xs font-bold uppercase transition"
              >
                + {t('nav.fileGrievance')}
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#07172b] border-t border-slate-800 px-4 py-3 space-y-1 text-xs font-semibold">
            {navLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-3 py-2 rounded ${
                  isActive(item.to) ? 'bg-[#16365c] text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-slate-800">
              <Link
                to="/report"
                onClick={() => setMobileMenuOpen(false)}
                className="block text-center bg-[#c5221f] text-white py-2 rounded font-bold uppercase tracking-wider"
              >
                + {t('nav.fileGrievance')}
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
