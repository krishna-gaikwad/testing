import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Building2, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  MapPin, 
  ShieldCheck, 
  Truck, 
  Droplets, 
  Construction, 
  HelpCircle, 
  Activity, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Users
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';

// Helper for minimal pin icon in map preview
function createMiniPinIcon(department) {
  let color = '#1a365d';
  if (department === 'roads') color = '#e05626';
  if (department === 'waste') color = '#138808';
  if (department === 'water') color = '#0284c7';

  return L.divIcon({
    className: 'mini-pin-marker',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

export default function Home() {
  const navigate = useNavigate();
  const { city } = useCity();
  const { t, lang, labelFor, formatNumber } = useLanguage();

  const [healthStatus, setHealthStatus] = useState({ loading: true, data: null, error: null });
  const [issuesData, setIssuesData] = useState({ loading: true, issues: [], stats: null });
  const [trackIdInput, setTrackIdInput] = useState('');

  // 1. Fetch Backend Health
  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setHealthStatus({ loading: false, data, error: null }))
      .catch((err) => setHealthStatus({ loading: false, data: null, error: err.message }));
  }, []);

  // 2. Fetch Public Real Issues from Backend
  useEffect(() => {
    fetch('/api/public/issues')
      .then((res) => (res.ok ? res.json() : { issues: [] }))
      .then((data) => {
        const issues = data.issues || [];
        const resolved = issues.filter((i) => i.status === 'Resolved').length;
        const inProgress = issues.filter((i) => i.status === 'In Progress').length;
        const emergencies = issues.filter((i) => i.isPossibleEmergency || i.isCriticalVerified).length;
        setIssuesData({
          loading: false,
          issues,
          stats: {
            total: issues.length,
            resolved,
            inProgress,
            emergencies
          }
        });
      })
      .catch((err) => {
        console.warn('Could not load public issues for home page:', err);
        setIssuesData({ loading: false, issues: [], stats: null });
      });
  }, []);

  // Handle direct tracking submission
  const handleTrackSubmit = (e) => {
    e.preventDefault();
    const id = trackIdInput.trim();
    if (!id) return;
    navigate(`/complaints/${id}`);
  };

  // Pune bounding box for Leaflet map preview
  const puneCenter = [city?.map?.center?.lat || 18.5204, city?.map?.center?.lng || 73.8567];

  return (
    <div className="space-y-6">
      {/* 1. COMPACT PAGE HEADER STRIP */}
      <section className="bg-white rounded-lg border border-slate-200 px-5 py-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                {t('home.heroTitle')}
              </h1>
              <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
                {t('common.demoBadge')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t('home.heroDescription')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              to="/report"
              className="inline-flex items-center justify-center px-4 py-2 bg-[#c5221f] hover:bg-[#a91b19] text-white text-xs font-bold uppercase tracking-wider rounded transition-colors shadow-2xs"
            >
              <span>{t('home.raiseGrievance')}</span>
              <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
            </Link>

            <form onSubmit={handleTrackSubmit} className="flex items-stretch border border-slate-300 rounded overflow-hidden">
              <input
                type="text"
                value={trackIdInput}
                onChange={(e) => setTrackIdInput(e.target.value)}
                placeholder={t('home.trackPlaceholder')}
                className="px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none w-36 sm:w-44"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-[#0c2340] hover:bg-[#16365c] text-white font-bold text-xs uppercase tracking-wider transition-colors shrink-0"
              >
                {t('home.trackButton')}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* 2. RESTRAINED STATISTICS STRIP */}
      <section className="bg-white rounded-lg border border-slate-200 p-4 sm:p-5 shadow-xs">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100 text-center">
          {/* Stat 1: Registered Complaints */}
          <div className="pt-2 md:pt-0 px-2 space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-[#0c2340]">
              {issuesData.stats ? formatNumber(issuesData.stats.total) : '12+'}
            </div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
              {t('home.statsRegistered')}
            </div>
            <div className="text-[10px] text-slate-400">{t('home.statsLive')}</div>
          </div>

          {/* Stat 2: Resolved Grievances */}
          <div className="pt-2 md:pt-0 px-2 space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-emerald-700">
              {issuesData.stats ? formatNumber(issuesData.stats.resolved) : '4'}
            </div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
              {t('home.statsResolved')}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">{t('home.statsPhotoProof')}</div>
          </div>

          {/* Stat 3: In Progress Active SLA */}
          <div className="pt-2 md:pt-0 px-2 space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-[#e05626]">
              {issuesData.stats ? formatNumber(issuesData.stats.inProgress) : '5'}
            </div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
              {t('home.statsUnderRepair')}
            </div>
            <div className="text-[10px] text-slate-400">{t('home.statsTeams')}</div>
          </div>

          {/* Stat 4: SLA Compliance Rate */}
          <div className="pt-2 md:pt-0 px-2 space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-[#0c2340]">
              98.2%
            </div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
              {t('home.statsSlaAdherence')}
            </div>
            <div className="text-[10px] text-slate-400">{t('home.statsEscalation')}</div>
          </div>

          {/* Stat 5: Pune Municipal Localities */}
          <div className="pt-2 md:pt-0 px-2 space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-[#0c2340]">
              {formatNumber(city.areas?.length || 15)}
            </div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
              {t('home.statsWards')}
            </div>
            <div className="text-[10px] text-slate-400">{t('home.statsGeofenced')}</div>
          </div>

          {/* Stat 6: Emergency Response Target */}
          <div className="pt-2 md:pt-0 px-2 space-y-0.5">
            <div className="text-xl sm:text-2xl font-black text-[#c5221f]">
              ≤ 2 {t('common.hours')}
            </div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">
              {t('home.statsEmergencySla')}
            </div>
            <div className="text-[10px] text-rose-600 font-medium">{t('home.statsCritical')}</div>
          </div>
        </div>
      </section>

      {/* 3. ONLINE MUNICIPAL SERVICES SECTION */}
      <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-5 items-stretch">
          {/* Left Red Anchor Card */}
          <div className="lg:w-72 bg-[#c5221f] text-white rounded-md p-6 flex flex-col justify-between shrink-0 shadow-sm">
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 bg-black/20 px-2 py-0.5 rounded">
                {t('home.charterTag')}
              </span>
              <h2 className="text-2xl font-black font-serif leading-tight">
                {t('home.servicesTitle')}
              </h2>
              <p className="text-xs text-white/90 leading-relaxed font-medium">
                {t('home.servicesSubtitle')}
              </p>
            </div>
            <div className="pt-6 border-t border-white/20 flex items-center justify-between">
              <span className="text-xs font-semibold">{t('home.deptsCount')}</span>
              <Link 
                to="/report"
                className="text-xs font-bold bg-white text-[#c5221f] hover:bg-slate-100 px-3 py-1.5 rounded transition shadow-2xs"
              >
                {t('home.reportNow')} →
              </Link>
            </div>
          </div>

          {/* Right 4 Municipal Service Department Cards */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Service 1: Solid Waste */}
            <div className="bg-[#f8fafc] border border-slate-200 rounded-md p-4 flex flex-col justify-between hover:border-slate-300 transition">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded">
                    <Truck className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    SLA: 12h - 48h
                  </span>
                </div>
                <h3 className="font-bold text-[#0c2340] text-sm">{labelFor('department', 'waste')}</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('home.solidWasteDesc')}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-200 mt-3 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400">{t('home.charterTag')}</span>
                <Link
                  to="/report?dept=waste"
                  className="font-bold text-[#c5221f] hover:underline flex items-center gap-1"
                >
                  <span>{t('home.reportNow')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Service 2: Roads & Streetlights */}
            <div className="bg-[#f8fafc] border border-slate-200 rounded-md p-4 flex flex-col justify-between hover:border-slate-300 transition">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-orange-100 text-orange-800 rounded">
                    <Construction className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                    SLA: 24h - 72h
                  </span>
                </div>
                <h3 className="font-bold text-[#0c2340] text-sm">{labelFor('department', 'roads')}</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('home.roadsDesc')}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-200 mt-3 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400">{t('home.charterTag')}</span>
                <Link
                  to="/report?dept=roads"
                  className="font-bold text-[#c5221f] hover:underline flex items-center gap-1"
                >
                  <span>{t('home.reportNow')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Service 3: Water Supply & Drainage */}
            <div className="bg-[#f8fafc] border border-slate-200 rounded-md p-4 flex flex-col justify-between hover:border-slate-300 transition">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-cyan-100 text-cyan-800 rounded">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                    SLA: 6h - 24h
                  </span>
                </div>
                <h3 className="font-bold text-[#0c2340] text-sm">{labelFor('department', 'water')}</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('home.waterDesc')}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-200 mt-3 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400">{t('home.charterTag')}</span>
                <Link
                  to="/report?dept=water"
                  className="font-bold text-[#c5221f] hover:underline flex items-center gap-1"
                >
                  <span>{t('home.reportNow')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Service 4: Other Municipal Complaints */}
            <div className="bg-[#f8fafc] border border-slate-200 rounded-md p-4 flex flex-col justify-between hover:border-slate-300 transition">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-indigo-100 text-indigo-800 rounded">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    SLA: 48h - 96h
                  </span>
                </div>
                <h3 className="font-bold text-[#0c2340] text-sm">{labelFor('department', 'others')}</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {t('home.othersDesc')}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-200 mt-3 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400">{t('home.charterTag')}</span>
                <Link
                  to="/report?dept=others"
                  className="font-bold text-[#c5221f] hover:underline flex items-center gap-1"
                >
                  <span>{t('home.reportNow')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PUBLIC CIVIC MAP PREVIEW & RECENT GRIEVANCES (2-Column Grid) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Cols: Interactive Public Map Preview */}
        <div className="lg:col-span-6 bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="font-bold text-[#0c2340] text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#c5221f]" />
                <span>{t('home.mapPreviewTitle')}</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {t('home.mapPreviewSubtitle')}
              </p>
            </div>
            <Link
              to="/public-map"
              className="text-xs font-bold text-[#c5221f] hover:underline flex items-center gap-1"
            >
              <span>{t('home.fullMap')}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Leaflet Map Preview Container */}
          <div className="h-64 w-full rounded border border-slate-200 overflow-hidden relative isolate z-0">
            <MapContainer
              center={puneCenter}
              zoom={12}
              minZoom={10}
              maxZoom={18}
              scrollWheelZoom={false}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {issuesData.issues.slice(0, 15).map((iss) => {
                const la = iss.lat || iss.location?.lat;
                const lo = iss.lng || iss.location?.lng;
                if (!la || !lo) return null;
                return (
                  <Marker
                    key={iss.id || iss._id}
                    position={[la, lo]}
                    icon={createMiniPinIcon(iss.department)}
                  >
                    <Popup>
                      <div className="text-xs">
                        <strong className="block text-slate-800">{labelFor('category', iss.category, iss.department)}</strong>
                        <span className="text-slate-500 font-mono text-[10px]">{iss.trackingId}</span>
                        <div className="mt-1 font-semibold text-emerald-700">{labelFor('status', iss.status)}</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
            <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded shadow z-10 pointer-events-none">
              {t('home.activeIssuesPune')}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#138808] inline-block"></span> {labelFor('department', 'waste')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#e05626] inline-block"></span> {labelFor('department', 'roads')}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] inline-block"></span> {labelFor('department', 'water')}
              </span>
            </div>
            <Link to="/public-map" className="text-[#0c2340] font-bold hover:underline">
              {t('home.detailedPins')} →
            </Link>
          </div>
        </div>

        {/* Right 6 Cols: Recent Public Grievances Feed */}
        <div className="lg:col-span-6 bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="font-bold text-[#0c2340] text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>{t('home.recentTitle')}</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {t('home.recentSubtitle')}
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {t('home.liveFeed')}
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {issuesData.issues.slice(0, 5).map((issue) => (
              <div key={issue.id || issue._id} className="pt-2 first:pt-0 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[10px] font-bold text-[#0c2340] bg-slate-100 px-1.5 py-0.2 rounded">
                    {issue.trackingId}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {issue.isPossibleEmergency && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 rounded">
                        {t('home.urgent')}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                      issue.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      issue.status === 'In Progress' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      issue.status === 'Accepted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {labelFor('status', issue.status)}
                    </span>
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-800 truncate">
                  {labelFor('category', issue.category, issue.department)} • {issue.title || issue.description}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{labelFor('department', issue.department)}</span>
                  <span className="text-slate-400">{t('home.supportersCount', { count: formatNumber(issue.supportCount || 1) })}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">{t('home.zeroPii')}</span>
            <Link to="/public-map" className="text-xs font-bold text-[#c5221f] hover:underline">
              {t('home.viewAllGrievances')} →
            </Link>
          </div>
        </div>
      </section>

      {/* 5. SYSTEM TRANSPARENCY & BACKEND HEALTH STRIP */}
      <section className="bg-slate-100 rounded-lg p-3.5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            <strong>{t('home.systemStatus')}:</strong> {t('home.operational')}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          {t('home.municipality')}: <strong>{city.cityName}</strong> ({city.timezone})
        </div>
      </section>
    </div>
  );
}
