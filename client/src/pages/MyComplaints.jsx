import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Clock, 
  AlertTriangle, 
  ArrowRight, 
  ShieldCheck, 
  Search, 
  Filter, 
  CheckCircle2, 
  PlusCircle, 
  Users,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';

export default function MyComplaints() {
  const { token } = useAuth();
  const { t, labelFor, formatDate } = useLanguage();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    fetch('/api/complaints/mine', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setComplaints(data.complaints || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Submitted': return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'Under Review': return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'Accepted': return 'bg-indigo-100 text-indigo-900 border-indigo-300';
      case 'In Progress': return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'Resolved': return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'Rejected': return 'bg-rose-100 text-rose-900 border-rose-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-rose-100 text-rose-900 border-rose-300';
      case 'High': return 'bg-amber-100 text-amber-900 border-amber-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  // Filter complaints
  const filtered = complaints.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchTrack = (c.trackingId || '').toLowerCase().includes(q);
      const matchTitle = (c.title || '').toLowerCase().includes(q);
      const matchCat = (c.category || '').toLowerCase().includes(q);
      const matchArea = (c.area || '').toLowerCase().includes(q);
      if (!matchTrack && !matchTitle && !matchCat && !matchArea) return false;
    }
    return true;
  });

  // Calculate summary stats
  const totalCount = complaints.length;
  const inProgressCount = complaints.filter((c) => ['Submitted', 'Under Review', 'Accepted', 'In Progress'].includes(c.status)).length;
  const resolvedCount = complaints.filter((c) => c.status === 'Resolved').length;
  const emergencyCount = complaints.filter((c) => c.isPossibleEmergency || c.isCriticalVerified).length;

  return (
    <div className="space-y-5 font-sans">
      {/* Header with Title & Action */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-[#0c2340] text-white rounded">
              <FileText className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-[#0c2340]">
              {t('complaint.myDashboardTitle')}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {t('complaint.myDashboardSubtitle')}
          </p>
        </div>
        <Link
          to="/report"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#c5221f] hover:bg-[#a91b19] text-white text-xs font-bold uppercase tracking-wider rounded transition shadow-2xs self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t('complaint.lodgeNew')}</span>
        </Link>
      </div>

      {/* Compact Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase text-slate-500 block">{t('complaint.totalFiled')}</span>
          <span className="text-2xl font-black text-[#0c2340] block mt-0.5">{totalCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase text-indigo-700 block">{t('complaint.inProgress')}</span>
          <span className="text-2xl font-black text-indigo-800 block mt-0.5">{inProgressCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase text-emerald-700 block">{t('complaint.resolved')}</span>
          <span className="text-2xl font-black text-emerald-800 block mt-0.5">{resolvedCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold uppercase text-rose-700 block">{t('complaint.emergencies')}</span>
          <span className="text-2xl font-black text-rose-800 block mt-0.5">{emergencyCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('complaint.searchFilterPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#0c2340] focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-1.5 border border-slate-300 rounded bg-white text-xs font-medium text-slate-700"
          >
            <option value="all">{t('map.allStatuses')}</option>
            <option value="Submitted">{labelFor('status', 'Submitted')}</option>
            <option value="Under Review">{labelFor('status', 'Under Review')}</option>
            <option value="Accepted">{labelFor('status', 'Accepted')}</option>
            <option value="In Progress">{labelFor('status', 'In Progress')}</option>
            <option value="Resolved">{labelFor('status', 'Resolved')}</option>
            <option value="Rejected">{labelFor('status', 'Rejected')}</option>
          </select>
        </div>
        <span className="text-[11px] text-slate-500">
          {t('complaint.showingGrievances', { shown: filtered.length, total: totalCount })}
        </span>
      </div>

      {/* Grievance Content Table / Cards */}
      {loading && (
        <div className="bg-white p-12 rounded-lg border border-slate-200 text-center text-xs text-slate-400 animate-pulse">
          {t('complaint.loadingRegistry')}
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-lg text-xs text-rose-800">
          {t('complaint.fetchFailed')}: {error}
        </div>
      )}

      {!loading && !error && complaints.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center shadow-xs space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">{t('complaint.noGrievancesYet')}</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {t('complaint.noGrievancesDesc')}
          </p>
          <Link
            to="/report"
            className="inline-block px-5 py-2.5 bg-[#c5221f] hover:bg-[#a91b19] text-white font-bold text-xs uppercase tracking-wider rounded transition shadow-2xs mt-2"
          >
            {t('complaint.lodgeFirst')}
          </Link>
        </div>
      )}

      {!loading && complaints.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-xs text-slate-500">
          {t('complaint.noMatchingGrievances')}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f0f4f8] text-slate-700 uppercase tracking-wider text-[11px] border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-3.5">{t('complaint.trackingId')}</th>
                  <th className="py-3 px-3.5">{t('complaint.categoryAndDetails')}</th>
                  <th className="py-3 px-3.5">{t('complaint.localityWard')}</th>
                  <th className="py-3 px-3.5">{t('complaint.filedOn')}</th>
                  <th className="py-3 px-3.5">{t('complaint.priority')}</th>
                  <th className="py-3 px-3.5">{t('complaint.status')}</th>
                  <th className="py-3 px-3.5 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const compId = c._id || c.id;
                  return (
                    <tr key={compId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 font-mono font-bold text-[#0c2340]">
                        <Link to={`/complaints/${compId}`} className="hover:underline text-indigo-700">
                          {c.trackingId}
                        </Link>
                      </td>
                      <td className="py-3 px-3.5 max-w-xs">
                        <p className="font-bold text-slate-900 truncate">
                          {labelFor('category', c.category, c.department)}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">{c.title || c.description}</p>
                        {c.isPossibleEmergency && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> {t('complaint.flaggedEmergency')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-slate-700">
                        <span className="font-medium">{c.area || 'Pune'}</span>
                        <span className="block text-[10px] text-slate-400">
                          👥 {t('common.supporters', { count: c.supportCount || 1, defaultValue: `${c.supportCount || 1} supporter(s)` })}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">
                        {formatDate(c.createdAt)}
                      </td>
                      <td className="py-3 px-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getPriorityColor(c.priority)}`}>
                          {labelFor('priority', c.priority)}
                        </span>
                      </td>
                      <td className="py-3 px-3.5">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase ${getStatusColor(c.status)}`}>
                          {labelFor('status', c.status)}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <Link
                          to={`/complaints/${compId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-[#0c2340] hover:text-white rounded text-slate-700 font-semibold transition"
                        >
                          <span>{t('complaint.track')}</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
