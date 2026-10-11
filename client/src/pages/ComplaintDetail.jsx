import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  MapPin, 
  Eye, 
  FileCheck, 
  ShieldCheck, 
  Send,
  XCircle,
  Users,
  ThumbsUp,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

import { useAuth } from '../context/AuthContext';
import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';

const pinIcon = L.divIcon({
  className: 'custom-pin',
  html: `<div style="background-color: #c5221f; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

export default function ComplaintDetail() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const { city } = useCity();
  const { t, labelFor, formatError, formatDate } = useLanguage();

  const [supportNotice, setSupportNotice] = useState(null);
  const [complaint, setComplaint] = useState(null);
  const [evidenceList, setEvidenceList] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reopen Request State
  const [reopenReason, setReopenReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenMsg, setReopenMsg] = useState(null);
  const [reopenError, setReopenError] = useState(null);
  const [showReopenModal, setShowReopenModal] = useState(false);

  // Satisfaction Rating State
  const [ratingVal, setRatingVal] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSuccess, setRatingSuccess] = useState(null);
  const [ratingError, setRatingError] = useState(null);

  const fetchDetail = () => {
    setLoading(true);
    fetch(`/api/complaints/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setComplaint(data.complaint);
        setEvidenceList(data.evidence || []);
        setHistory(data.history || []);
        if (data.complaint?.satisfactionRating?.rating) {
          setRatingVal(data.complaint.satisfactionRating.rating);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  const handleRatingSubmit = async (stars) => {
    setRatingLoading(true);
    setRatingError(null);
    setRatingSuccess(null);
    const compId = complaint._id || complaint.id;
    try {
      const res = await fetch(`/api/issues/${compId}/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rating: stars, comment: ratingComment })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to submit rating');
      setRatingVal(stars);
      setRatingSuccess(data.message || 'Thank you for your rating!');
    } catch (err) {
      setRatingError(err.message);
    } finally {
      setRatingLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id, token]);

  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setReopenError(t('errors.REOPEN_REASON_REQUIRED'));
      return;
    }

    setReopenLoading(true);
    setReopenMsg(null);
    setReopenError(null);

    try {
      const res = await fetch(`/api/complaints/${id}/reopen-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: reopenReason })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatError(data) || 'Failed to submit reopen request.');
      }

      setReopenMsg(t('complaint.reopenPending'));
      setShowReopenModal(false);
      fetchDetail();
    } catch (err) {
      setReopenError(err.message);
    } finally {
      setReopenLoading(false);
    }
  };

  const handleSupportComplaint = async () => {
    if (!token) {
      setSupportNotice({ type: 'warning', text: t('common.error') });
      return;
    }

    try {
      const res = await fetch(`/api/complaints/${complaint._id || complaint.id}/support`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setSupportNotice({
          type: 'success',
          text: t('community.supportCount', { count: data.supportCount })
        });
        fetchDetail();
      } else if (res.status === 409) {
        setSupportNotice({ type: 'info', text: formatError(data) || t('errors.ALREADY_SUPPORTED') });
      } else {
        setSupportNotice({ type: 'error', text: formatError(data) || t('common.error') });
      }
    } catch (err) {
      setSupportNotice({ type: 'error', text: t('errors.NETWORK_ERROR') });
    }
  };

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

  // Determine can reopen within 7 days of resolvedAt
  const isResolved = complaint?.status === 'Resolved';
  const resolvedDate = complaint?.resolvedAt ? new Date(complaint.resolvedAt) : null;
  const daysSinceResolution = resolvedDate ? (Date.now() - resolvedDate.getTime()) / (1000 * 3600 * 24) : 999;
  const canReopen = isResolved && daysSinceResolution <= 7;

  // Workflow Timeline steps
  const steps = ['Submitted', 'Under Review', 'Accepted', 'In Progress', 'Resolved'];
  const currentStepIdx = complaint ? steps.indexOf(complaint.status) : 0;

  if (loading) {
    return (
      <div className="bg-white p-12 rounded-lg border border-slate-200 text-center text-xs text-slate-400 animate-pulse font-sans">
        {t('complaint.loadingRecords')}
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="bg-white p-8 rounded-lg border border-slate-200 text-center space-y-3 font-sans">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-800">{t('complaint.notFound')}</h2>
        <p className="text-xs text-slate-500">{error || t('complaint.unableToRetrieve')}</p>
        <Link to="/my-complaints" className="inline-block px-4 py-2 bg-[#0c2340] text-white rounded text-xs font-semibold">
          ← {t('complaint.backToGrievances')}
        </Link>
      </div>
    );
  }

  const compLat = complaint.location?.lat || complaint.lat;
  const compLng = complaint.location?.lng || complaint.lng;

  return (
    <div className="space-y-6 font-sans">
      {/* 1. TOP HEADER & BACK NAVIGATION */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              to="/my-complaints"
              className="text-xs font-semibold text-slate-500 hover:text-[#0c2340] flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('complaint.backToGrievances')}</span>
            </Link>
            <span className="text-slate-300">/</span>
            <span className="font-mono text-xs font-bold text-slate-700">{complaint.trackingId}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-[#0c2340]">{complaint.title || labelFor('category', complaint.category, complaint.department)}</h1>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getPriorityColor(complaint.priority)}`}>
              {labelFor('priority', complaint.priority)} {t('complaint.priority')}
            </span>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase ${getStatusColor(complaint.status)}`}>
              {labelFor('status', complaint.status)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {t('complaint.filedOn')} {formatDate(complaint.createdAt)} • {complaint.area || 'Pune'}
          </p>
        </div>

        {/* Action Controls: Live Support + Reopen (if eligible) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSupportComplaint}
            className="px-3.5 py-2 bg-[#0c2340] hover:bg-[#16365c] text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-2xs transition"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span>{t('community.supportThisIssue')} ({complaint.supportCount || 1})</span>
          </button>

          {canReopen && (
            <button
              type="button"
              onClick={() => setShowReopenModal(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-2xs transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('complaint.reopenButton')}</span>
            </button>
          )}
        </div>
      </div>

      {supportNotice && (
        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
          supportNotice.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' :
          supportNotice.type === 'info' ? 'bg-blue-50 border border-blue-200 text-blue-900' :
          'bg-amber-50 border border-amber-200 text-amber-900'
        }`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{supportNotice.text}</span>
        </div>
      )}

      {/* Citizen Satisfaction Rating Card (Resolved or Closed Grievances) */}
      {(complaint.status === 'Resolved' || complaint.status === 'Closed') && user?.role === 'citizen' && (
        <div className="bg-white p-5 rounded-lg border border-amber-300 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
              <span>⭐</span>
              <span>{t('complaint.ratingTitle', { defaultValue: 'Citizen Satisfaction Rating' })}</span>
            </h3>
            {ratingVal > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Rated {ratingVal} / 5
              </span>
            )}
          </div>

          <p className="text-xs text-slate-600">
            {t('complaint.ratingPrompt', { defaultValue: 'Please rate your satisfaction with Pune Municipal Corporation’s resolution of this grievance:' })}
          </p>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                disabled={ratingLoading || !!ratingSuccess}
                onClick={() => handleRatingSubmit(star)}
                className={`text-2xl transition hover:scale-125 focus:outline-none ${
                  star <= ratingVal ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'
                }`}
                title={`Rate ${star} star${star > 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
            <span className="text-xs text-slate-400 ml-2">
              {ratingVal === 5 ? 'Excellent' : ratingVal === 4 ? 'Good' : ratingVal === 3 ? 'Average' : ratingVal > 0 ? 'Needs Improvement' : 'Click a star to submit rating'}
            </span>
          </div>

          {ratingSuccess && (
            <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{ratingSuccess}</span>
            </div>
          )}

          {ratingError && (
            <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{ratingError}</span>
            </div>
          )}
        </div>
      )}

      {/* 2. OFFICIAL WORKFLOW PROGRESS TIMELINE */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs">
        <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider mb-4 border-b pb-2">
          {t('complaint.slaLifecycle')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          {steps.map((st, idx) => {
            const isCompleted = currentStepIdx >= idx && complaint.status !== 'Rejected';
            const isCurrent = complaint.status === st;
            return (
              <div 
                key={st}
                className={`p-2.5 rounded border transition-all ${
                  isCurrent
                    ? 'bg-[#0c2340] text-white border-[#0c2340] font-bold shadow-xs'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200 font-semibold'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}
              >
                <div className="text-[10px] uppercase tracking-tight">{t('wizard.step', { defaultValue: 'Step' })} {idx + 1}</div>
                <div className="text-xs mt-0.5">{labelFor('status', st)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. DETAILS, LOCATION & EVIDENCE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Grievance Details & Evidence */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider border-b pb-2">
              {t('complaint.particulars')}
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">{t('complaint.department')}:</span>
                <span className="font-bold capitalize text-slate-800">{labelFor('department', complaint.department)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">{t('complaint.category')}:</span>
                <span className="font-bold text-slate-800">{labelFor('category', complaint.category, complaint.department)}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">{t('complaint.localityWard')}:</span>
                <span className="font-bold text-slate-800">{complaint.area || 'Pune'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">{t('complaint.locationSource')}:</span>
                <span className="font-mono uppercase font-bold text-indigo-700">{complaint.location?.source || 'MANUAL'}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-500 block text-[11px] mb-1">{t('report.descriptionLabel')}:</span>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded border border-slate-200">
                {complaint.description}
              </p>
            </div>

            {complaint.resolutionNote && (
              <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded">
                <span className="text-[11px] font-bold text-emerald-900 block">
                  {t('complaint.resolutionNoteOfficial')}:
                </span>
                <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                  {complaint.resolutionNote}
                </p>
              </div>
            )}
          </div>

          {/* Evidence Attachments */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider border-b pb-2">
              {t('complaint.evidenceSection')} ({evidenceList.length})
            </h3>
            {evidenceList.length === 0 ? (
              <p className="text-xs text-slate-400 italic">{t('complaint.noEvidence')}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {evidenceList.map((ev, i) => (
                  <div key={i} className="border border-slate-200 rounded p-1.5 bg-slate-50">
                    <img
                      src={`/api/evidence/${ev._id || ev.id}`}
                      alt="Grievance Evidence"
                      className="h-28 w-full object-cover rounded"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = `<div class="h-28 flex items-center justify-center text-[10px] text-slate-400 font-semibold bg-slate-100 rounded">Evidence File ${i+1}</div>`;
                      }}
                    />
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="capitalize">{ev.kind || 'initial'}</span>
                      <a
                        href={`/api/evidence/${ev._id || ev.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {t('complaint.viewFull')}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Location Map & SLA Target */}
        <div className="lg:col-span-5 space-y-5">
          {/* Location Map Pin */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider border-b pb-2 flex items-center justify-between">
              <span>{t('complaint.incidentPin')}</span>
              <span className="font-mono text-[10px] text-slate-400">[{compLat?.toFixed?.(4) || compLat}, {compLng?.toFixed?.(4) || compLng}]</span>
            </h3>

            <p className="text-xs text-slate-600">
              {complaint.location?.address || `${complaint.area || 'Pune'}, Maharashtra`}
            </p>

            {compLat && compLng && (
              <div className="h-56 w-full rounded border border-slate-200 overflow-hidden relative isolate z-0">
                <MapContainer
                  center={[parseFloat(compLat), parseFloat(compLng)]}
                  zoom={15}
                  scrollWheelZoom={false}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[parseFloat(compLat), parseFloat(compLng)]} icon={pinIcon}>
                    <Popup>
                      <div className="text-xs">
                        <strong>{labelFor('category', complaint.category, complaint.department)}</strong>
                        <p>{complaint.location?.address}</p>
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>
            )}
          </div>

          {/* SLA Deadlines Card */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3 text-xs">
            <h3 className="font-bold text-[#0c2340] uppercase tracking-wider border-b pb-2 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#0c2340]" />
              <span>{t('complaint.targetResolution')}</span>
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('complaint.initialInspectionTarget')}:</span>
                <span className="font-medium text-slate-800">
                  {formatDate(complaint.initialResponseDue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('complaint.resolutionDue')}:</span>
                <span className="font-medium text-slate-800">
                  {formatDate(complaint.resolutionDue)}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-100">
                <span className="text-slate-500">{t('complaint.overdueStatus')}:</span>
                <span className={`font-bold ${complaint.isOverdue ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {complaint.isOverdue ? t('complaint.slaBreached') : t('complaint.withinSla')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. TRANSPARENT APPEND-ONLY AUDIT HISTORY TABLE */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-[#f0f4f8] border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[#0c2340] text-xs uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#0c2340]" />
              <span>{t('complaint.auditTrailTitle')}</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t('complaint.auditTrailSubtitle')}
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
            {t('complaint.eventsCount', { count: history.length })}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px] border-b border-slate-200 font-bold">
              <tr>
                <th className="py-2.5 px-3.5">{t('official.labels.timestamp')} ({city.timezone})</th>
                <th className="py-2.5 px-3.5">{t('official.labels.outcome')}</th>
                <th className="py-2.5 px-3.5">{t('official.labels.action')}</th>
                <th className="py-2.5 px-3.5">{t('official.labels.actor')}</th>
                <th className="py-2.5 px-3.5">{t('official.labels.fromStatus')} → {t('official.labels.toStatus')}</th>
                <th className="py-2.5 px-3.5">{t('official.labels.reason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((ev, i) => (
                <tr key={ev._id || i} className={ev.outcome === 'refused' ? 'bg-rose-50/50' : 'hover:bg-slate-50/50'}>
                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-500">
                    {formatDate(ev.createdAt)}
                  </td>
                  <td className="py-2.5 px-3.5">
                    <span className={`text-[10px] font-bold px-2 py-0.2 rounded uppercase ${
                      ev.outcome === 'refused' ? 'bg-rose-100 text-rose-800' :
                      ev.outcome === 'accepted' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {labelFor('outcome', ev.outcome)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 font-semibold text-slate-800">{labelFor('action', ev.action)}</td>
                  <td className="py-2.5 px-3.5 capitalize font-mono text-slate-600">{labelFor('role', ev.actorRole)}</td>
                  <td className="py-2.5 px-3.5 text-slate-600">
                    {labelFor('status', ev.fromStatus)} {ev.toStatus ? `→ ${labelFor('status', ev.toStatus)}` : ''}
                  </td>
                  <td className="py-2.5 px-3.5 text-slate-700">
                    {ev.refusalReason ? (
                      <span className="text-rose-700 font-medium">⚠️ {ev.refusalReason}</span>
                    ) : (
                      ev.reason || '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* REOPEN MODAL */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-base text-[#0c2340]">{t('complaint.reopenModalTitle')}</h3>
            <p className="text-xs text-slate-600">
              {t('complaint.reopenDescription')}
            </p>

            {reopenError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                {reopenError}
              </div>
            )}

            <form onSubmit={handleReopenSubmit} className="space-y-3">
              <textarea
                rows={4}
                required
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder={t('complaint.reopenExplanationPlaceholder')}
                className="w-full p-2.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-[#0c2340] focus:outline-none"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReopenModal(false)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={reopenLoading}
                  className="px-4 py-1.5 text-xs font-bold bg-[#c5221f] hover:bg-[#a91b19] text-white rounded transition disabled:opacity-50"
                >
                  {reopenLoading ? t('common.submitting') : t('complaint.submitReopenRequest')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
