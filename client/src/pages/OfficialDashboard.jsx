import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  ChevronRight, 
  Filter, 
  UserCheck, 
  Eye, 
  FileCheck,
  RotateCcw,
  MapPin, 
  Users, 
  Shield, 
  ArrowLeft,
  Send,
  FileText,
  RefreshCw,
  Layers,
  ChevronDown,
  ChevronUp,
  Calendar,
  Paperclip,
  Check,
  ExternalLink,
  Flame
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';

function formatIST(dateString) {
  if (!dateString) return '—';
  try {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }) + ' IST';
  } catch (e) {
    return dateString;
  }
}

function getCountdown(deadline) {
  if (!deadline) return { text: '—', isOverdue: false, diffHours: 0 };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) {
    const overdueHrs = Math.abs(Math.floor(diff / 3600000));
    return {
      text: overdueHrs > 24 ? `${Math.floor(overdueHrs / 24)}d overdue` : `${overdueHrs}h overdue`,
      isOverdue: true,
      diffHours: Math.floor(diff / 3600000)
    };
  }
  const diffHours = Math.floor(diff / 3600000);
  if (diffHours >= 24) {
    const days = Math.floor(diffHours / 24);
    const hrs = diffHours % 24;
    return { text: `${days}d ${hrs}h left`, isOverdue: false, diffHours };
  }
  const mins = Math.floor((diff % 3600000) / 60000);
  return { text: `${diffHours}h ${mins}m left`, isOverdue: false, diffHours };
}

function formatHistorySentence(ev) {
  const actorName = ev.actorName || ev.actor || 'Official';
  const role = ev.actorRole ? `(${ev.actorRole})` : '';
  const action = ev.action || 'updated';

  if (ev.outcome === 'system' || ev.actorRole === 'system') {
    return `System: ${action} — ${ev.reason || 'Automated rule triggered'}`;
  }
  if (ev.outcome === 'refused') {
    return `${actorName} ${role} attempted "${action}" (Refused: ${ev.refusalReason || ev.reason || 'Not allowed'})`;
  }
  if (action === 'Submit' || action === 'Complaint Submitted') {
    return `Citizen submitted this grievance`;
  }
  if (action === 'Start Review') {
    return `${actorName} ${role} started reviewing this ticket`;
  }
  if (action === 'Accept') {
    return `${actorName} ${role} accepted this ticket`;
  }
  if (action === 'Reject') {
    return `${actorName} ${role} rejected this ticket`;
  }
  if (action === 'Self Assign') {
    return `${actorName} (Field Officer) took this ticket (self-assigned)`;
  }
  if (action === 'Assign Staff' || action === 'Assign Officer') {
    return `${actorName} ${role} assigned this ticket`;
  }
  if (action === 'Start Work') {
    return `${actorName} ${role} started work on-site`;
  }
  if (action === 'Resolve' || action === 'Mark Resolved') {
    return `${actorName} ${role} resolved this grievance`;
  }
  if (action === 'Close Ticket' || action === 'Close') {
    return `${actorName} ${role} verified and closed this ticket`;
  }
  if (action === 'Add Note') {
    return `${actorName} ${role} added a note`;
  }
  if (action === 'Reroute Issue') {
    return `${actorName} ${role} rerouted this ticket`;
  }
  if (action === 'Override Priority') {
    return `${actorName} ${role} updated priority`;
  }
  if (action === 'Change Deadline') {
    return `${actorName} ${role} adjusted SLA deadline`;
  }
  if (action === 'Verify Emergency') {
    return `${actorName} ${role} verified emergency flag`;
  }
  if (action === 'Dismiss Emergency') {
    return `${actorName} ${role} dismissed emergency flag`;
  }
  return `${actorName} ${role} performed ${action}`;
}

export default function OfficialDashboard() {
  const { user, token } = useAuth();
  const { city } = useCity();
  const { t, labelFor, formatError, formatDate } = useLanguage();

  const [complaints, setComplaints] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [ticketDetails, setTicketDetails] = useState(null);
  const [allowedActions, setAllowedActions] = useState(null);
  const [history, setHistory] = useState([]);
  const [evidenceList, setEvidenceList] = useState([]);
  const [notesList, setNotesList] = useState([]);
  const [reportsList, setReportsList] = useState([]);
  const [duplicatesList, setDuplicatesList] = useState([]);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [staleVersionError, setStaleVersionError] = useState(false);

  // Queue Tabs: 'needs_action', 'unassigned', 'mine', 'overdue', 'emergencies', 'all'
  const defaultTab = useMemo(() => {
    try {
      const saved = localStorage.getItem(`ns_queue_tab_${user?.id || user?._id || 'anon'}`);
      if (saved) return saved;
    } catch (e) {}
    return user?.role === 'officer' ? 'mine' : 'needs_action';
  }, [user]);

  const [activeQueueTab, setActiveQueueTab] = useState(defaultTab);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Pagination (50 rows per page)
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // Workspace Tabs: 'overview', 'evidence', 'reports', 'notes', 'history'
  const [workspaceTab, setWorkspaceTab] = useState('overview');

  // Supervisor Audit View
  const [auditTab, setAuditTab] = useState(false);
  const [auditOutcome, setAuditOutcome] = useState('all');
  const [auditEvents, setAuditEvents] = useState([]);
  const [showRefusedOnly, setShowRefusedOnly] = useState(false);

  // Heartbeat
  const [heartbeat, setHeartbeat] = useState(null);

  // Modals & Drawers
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRejectChip, setSelectedRejectChip] = useState('');

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [afterRepairPhoto, setAfterRepairPhoto] = useState(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignedOfficerId, setAssignedOfficerId] = useState('');
  const [assignReason, setAssignReason] = useState('');

  const [showProgressNoteModal, setShowProgressNoteModal] = useState(false);
  const [progressNoteText, setProgressNoteText] = useState('');

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  // Supervisor tools accordion
  const [supervisorToolsOpen, setSupervisorToolsOpen] = useState(false);
  const [supPriority, setSupPriority] = useState('High');
  const [supPriorityReason, setSupPriorityReason] = useState('');
  const [supRerouteDept, setSupRerouteDept] = useState('roads');
  const [supRerouteCat, setSupRerouteCat] = useState('Potholes or damaged roads');
  const [supRerouteReason, setSupRerouteReason] = useState('');
  const [supDeadlineDays, setSupDeadlineDays] = useState('3');
  const [supDeadlineReason, setSupDeadlineReason] = useState('');
  const [supReassignOfficer, setSupReassignOfficer] = useState('');
  const [supReassignReason, setSupReassignReason] = useState('');
  const [supUnlinkReportId, setSupUnlinkReportId] = useState('');
  const [supUnlinkReason, setSupUnlinkReason] = useState('');

  // Add Note Form
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newNoteVisibility, setNewNoteVisibility] = useState('INTERNAL');

  // Emergency verify action state
  const [emergencyReason, setEmergencyReason] = useState('');

  const saveTabPreference = (tab) => {
    setActiveQueueTab(tab);
    setCurrentPage(1);
    try {
      localStorage.setItem(`ns_queue_tab_${user?.id || user?._id || 'anon'}`, tab);
    } catch (e) {}
  };

  const fetchHeartbeat = () => {
    fetch('/api/dev/heartbeat')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.heartbeat) setHeartbeat(d.heartbeat);
      })
      .catch(() => {});
  };

  const fetchComplaints = useCallback(() => {
    setLoading(true);
    let url = `/api/official/complaints?`;
    if (statusFilter) url += `status=${encodeURIComponent(statusFilter)}&`;
    if (priorityFilter) url += `priority=${encodeURIComponent(priorityFilter)}&`;
    if (deptFilter) url += `department=${encodeURIComponent(deptFilter)}&`;

    fetch(url, {
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
  }, [token, statusFilter, priorityFilter, deptFilter]);

  const fetchAuditEvents = useCallback(() => {
    if (user?.role !== 'supervisor') return;
    fetch(`/api/official/audit?outcome=${auditOutcome}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setAuditEvents(data.audit || []))
      .catch((err) => console.error('Audit fetch error:', err));
  }, [token, user, auditOutcome]);

  useEffect(() => {
    fetchHeartbeat();
  }, []);

  useEffect(() => {
    if (token && ['reviewer', 'officer', 'supervisor', 'admin'].includes(user?.role)) {
      if (auditTab) {
        fetchAuditEvents();
      } else {
        fetchComplaints();
      }
    }
  }, [token, user, auditTab, fetchComplaints, fetchAuditEvents]);

  // Load single ticket details and allowed actions
  const selectComplaint = useCallback(async (comp) => {
    setSelectedComplaint(comp);
    setDetailLoading(true);
    setMessage(null);
    setError(null);
    setStaleVersionError(false);

    const compId = comp._id || comp.id;

    // Set advisory review lock
    fetch(`/api/official/complaints/${compId}/review-lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      }
    }).catch(() => {});

    try {
      const [issueRes, actionsRes, notesRes] = await Promise.all([
        fetch(`/api/issues/${compId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/issues/${compId}/allowed-actions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/issues/${compId}/notes`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const issueData = await issueRes.json();
      const actionsData = await actionsRes.json();
      const notesData = await notesRes.json();

      if (issueData.ok && issueData.issue) {
        setTicketDetails(issueData.issue);
        setSelectedComplaint(issueData.issue);
        setHistory(issueData.history || []);
        setEvidenceList(issueData.evidence || []);
        setReportsList(issueData.reports || []);
        setDuplicatesList(issueData.possibleDuplicates || []);
      }
      if (actionsData.ok) {
        setAllowedActions(actionsData);
      }
      if (notesData.ok) {
        setNotesList(notesData.notes || []);
      }
    } catch (err) {
      console.error('Error loading ticket details:', err);
    } finally {
      setDetailLoading(false);
    }
  }, [token]);

  // Execute action with optimistic locking expectedVersion
  const executeAction = async (endpoint, payload = {}, customUrl = null) => {
    if (!selectedComplaint) return;
    setActionLoading(true);
    setMessage(null);
    setError(null);
    setStaleVersionError(false);

    const compId = selectedComplaint._id || selectedComplaint.id;
    const currentVersion = Number(selectedComplaint.version || 1);
    const bodyPayload = {
      ...payload,
      expectedVersion: currentVersion
    };

    const targetUrl = customUrl || `/api/official/complaints/${compId}/${endpoint}`;

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();

      if (res.status === 409 || data.errorCode === 'TICKET_CHANGED') {
        setStaleVersionError(true);
        setError(t('official.ticketChangedWarning'));
        fetchComplaints();
        return;
      }

      if (!res.ok) {
        throw new Error(formatError(data) || data.message || data.error || 'Action failed.');
      }

      setMessage(data.message || t('common.success'));
      fetchComplaints();

      // Refresh ticket details
      selectComplaint(data.complaint || data.issue || selectedComplaint);
      setShowRejectModal(false);
      setShowResolveModal(false);
      setShowAssignModal(false);
      setShowProgressNoteModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Resolve with optional photo upload
  const handleConfirmResolve = async () => {
    if (!resolutionNote.trim()) {
      setError(t('official.resolutionNoteLabel') + ' is required.');
      return;
    }
    setActionLoading(true);
    setMessage(null);
    setError(null);

    const compId = selectedComplaint._id || selectedComplaint.id;
    const formData = new FormData();
    formData.append('resolutionNote', resolutionNote.trim());
    formData.append('expectedVersion', String(selectedComplaint.version || 1));
    if (afterRepairPhoto) {
      formData.append('afterRepairPhoto', afterRepairPhoto);
    }

    try {
      const res = await fetch(`/api/official/complaints/${compId}/resolve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (res.status === 409 || data.errorCode === 'TICKET_CHANGED') {
        setStaleVersionError(true);
        setError(t('official.ticketChangedWarning'));
        return;
      }
      if (!res.ok) {
        throw new Error(formatError(data) || data.message || data.error || 'Failed to resolve.');
      }

      setMessage(data.message || 'Complaint resolved successfully.');
      setShowResolveModal(false);
      setResolutionNote('');
      setAfterRepairPhoto(null);
      fetchComplaints();
      selectComplaint(data.complaint || selectedComplaint);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Add Note
  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteBody.trim() || !selectedComplaint) return;
    setActionLoading(true);

    const compId = selectedComplaint._id || selectedComplaint.id;
    try {
      const res = await fetch(`/api/official/complaints/${compId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          body: newNoteBody.trim(),
          visibility: newNoteVisibility
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add note');

      setNewNoteBody('');
      // Reload notes and history
      const [notesRes, histRes] = await Promise.all([
        fetch(`/api/official/complaints/${compId}/notes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/official/complaints/${compId}/history`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const nData = await notesRes.json();
      const hData = await histRes.json();
      if (nData.ok) setNotesList(nData.notes || []);
      if (hData.history) setHistory(hData.history || []);
      setMessage('Note added successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Unlink secondary report
  const handleUnlinkReport = async (reportId) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: supUnlinkReason || 'Unlinked into independent grievance by supervisor' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to unlink');
      setMessage(data.message || 'Report unlinked.');
      fetchComplaints();
      if (selectedComplaint) selectComplaint(selectedComplaint);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Categorize queues for the 6 Inbox Tabs
  const categorizedQueues = useMemo(() => {
    const userId = (user?.id || user?._id || '').toString();

    const needsActionList = complaints.filter((c) => {
      if (user?.role === 'reviewer' && ['Submitted', 'Under Review'].includes(c.status)) return true;
      if (user?.role === 'officer') {
        const isAssigned = (c.assignedTo === userId || c.assignedToId === userId || c.assignedToName === user?.name);
        return isAssigned && ['Accepted', 'In Progress'].includes(c.status);
      }
      if (['supervisor', 'admin'].includes(user?.role)) {
        if (c.status === 'Accepted' && !c.assignedTo && !c.assignedToId) return true;
        if (c.status === 'Resolved') return true;
      }
      return false;
    });

    const unassignedList = complaints.filter((c) => c.status === 'Accepted' && !c.assignedTo && !c.assignedToId);

    const mineList = complaints.filter((c) => {
      return (c.assignedTo === userId || c.assignedToId === userId || c.assignedToName === user?.name);
    });

    const overdueList = complaints.filter((c) => c.isOverdue === true);

    const emergenciesList = complaints.filter((c) => c.isPossibleEmergency || c.isCriticalVerified);

    return {
      needs_action: needsActionList,
      unassigned: unassignedList,
      mine: mineList,
      overdue: overdueList,
      emergencies: emergenciesList,
      all: complaints
    };
  }, [complaints, user]);

  const activeQueueItems = useMemo(() => {
    let items = categorizedQueues[activeQueueTab] || complaints;
    if (areaFilter) {
      items = items.filter((c) => (c.area || '').toLowerCase() === areaFilter.toLowerCase());
    }
    return items;
  }, [categorizedQueues, activeQueueTab, areaFilter, complaints]);

  // Paginated queue rows
  const paginatedQueue = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return activeQueueItems.slice(start, start + PAGE_SIZE);
  }, [activeQueueItems, currentPage]);

  const totalPages = Math.ceil(activeQueueItems.length / PAGE_SIZE) || 1;

  // Desktop Keyboard Shortcuts: J, K, A, R
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Disable shortcuts while typing in form fields
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }

      if (e.key === 'j' || e.key === 'J') {
        // Move selection down
        if (activeQueueItems.length === 0) return;
        const currentIndex = activeQueueItems.findIndex(
          (c) => (c._id || c.id) === (selectedComplaint?._id || selectedComplaint?.id)
        );
        const nextIndex = currentIndex < activeQueueItems.length - 1 ? currentIndex + 1 : 0;
        selectComplaint(activeQueueItems[nextIndex]);
      } else if (e.key === 'k' || e.key === 'K') {
        // Move selection up
        if (activeQueueItems.length === 0) return;
        const currentIndex = activeQueueItems.findIndex(
          (c) => (c._id || c.id) === (selectedComplaint?._id || selectedComplaint?.id)
        );
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : activeQueueItems.length - 1;
        selectComplaint(activeQueueItems[prevIndex]);
      } else if (e.key === 'a' || e.key === 'A') {
        // Accept shortcut if primaryAction is accept
        if (allowedActions?.primaryAction?.id === 'accept') {
          e.preventDefault();
          executeAction('accept');
        }
      } else if (e.key === 'r' || e.key === 'R') {
        // Reject shortcut
        const canReject = allowedActions?.secondaryActions?.some((a) => a.id === 'reject');
        if (canReject) {
          e.preventDefault();
          setShowRejectModal(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeQueueItems, selectedComplaint, allowedActions, selectComplaint]);

  if (!user || !['reviewer', 'officer', 'supervisor', 'admin'].includes(user?.role)) {
    return (
      <div className="max-w-md mx-auto text-center py-12 bg-white rounded-xl border border-slate-200 p-8">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">{t('official.accessRequired')}</h2>
        <p className="text-xs text-slate-500 mt-2">{t('official.accessDesc')}</p>
        <p className="text-xs text-indigo-600 font-semibold mt-4">{t('official.loginHint')}</p>
      </div>
    );
  }

  const isMobileDetailOpen = Boolean(selectedComplaint);

  return (
    <div className="w-full max-w-full overflow-x-hidden space-y-4 my-2">
      {/* COMPACT PAGE HEADER STRIP */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                {user.role === 'reviewer' && t('official.reviewerTitle')}
                {user.role === 'officer' && t('official.officerTitle', { department: labelFor('department', user.department) })}
                {['supervisor', 'admin'].includes(user.role) && t('official.supervisorTitle')}
              </h1>
              <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wide">
                {labelFor('role', user.role)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {user.name} ({user.email}) • {t('complaint.department')}: <span className="font-semibold text-slate-700">{user.department ? labelFor('department', user.department) : t('official.allDepartments')}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {heartbeat && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded">
                <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{t('official.monitorLastRan')}: <strong className="text-slate-800">{formatDate(heartbeat.lastRanAt)}</strong></span>
              </div>
            )}
            {user.role === 'supervisor' && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-xs font-semibold border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAuditTab(false)}
                  className={`px-3 py-1 rounded transition ${!auditTab ? 'bg-[#0c2340] text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('official.grievanceQueue')}
                </button>
                <button
                  type="button"
                  onClick={() => setAuditTab(true)}
                  className={`px-3 py-1 rounded transition ${auditTab ? 'bg-[#0c2340] text-white font-bold' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {t('official.systemAuditTrail')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUPERVISOR AUDIT TRAIL TAB */}
      {auditTab && user.role === 'supervisor' ? (
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>{t('official.auditTitle')}</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{t('official.auditDesc')}</p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              {['all', 'accepted', 'refused', 'system'].map((out) => (
                <button
                  key={out}
                  onClick={() => setAuditOutcome(out)}
                  className={`px-3 py-1 rounded capitalize font-medium transition ${
                    auditOutcome === out ? 'bg-[#0c2340] text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {labelFor('outcome', out) || out}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">{t('official.labels.timestamp')}</th>
                  <th className="py-2.5 px-3">{t('official.labels.outcome')}</th>
                  <th className="py-2.5 px-3">{t('official.labels.action')}</th>
                  <th className="py-2.5 px-3">{t('official.labels.actor')}</th>
                  <th className="py-2.5 px-3">{t('official.labels.fromStatus')} → {t('official.labels.toStatus')}</th>
                  <th className="py-2.5 px-3">{t('official.labels.reason')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditEvents.map((ev, i) => (
                  <tr key={ev._id || i} className={ev.outcome === 'refused' ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{formatIST(ev.createdAt)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 font-bold rounded text-[11px] uppercase ${
                        ev.outcome === 'refused' ? 'bg-rose-100 text-rose-700' :
                        ev.outcome === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {labelFor('outcome', ev.outcome)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{labelFor('action', ev.action)}</td>
                    <td className="py-2.5 px-3 capitalize font-mono text-slate-600">{labelFor('role', ev.actorRole)}</td>
                    <td className="py-2.5 px-3 text-slate-600">{labelFor('status', ev.fromStatus)} → {labelFor('status', ev.toStatus)}</td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {ev.refusalReason ? <span className="text-rose-700 font-medium">⚠️ {ev.refusalReason}</span> : (ev.reason || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* MAIN WORKSPACE 2-PANE (Desktop) / FULL-PAGE (Mobile) */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* LEFT PANE: QUEUE / INBOX (Hidden on mobile if ticket selected) */}
          <div className={`md:col-span-5 bg-white rounded-lg border border-slate-200 p-4 shadow-2xs space-y-3 ${
            isMobileDetailOpen ? 'hidden md:block' : 'block'
          }`}>
            {/* 6 Queue Tabs */}
            <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-2.5">
              {[
                { id: 'needs_action', label: t('official.tabNeedsAction'), count: categorizedQueues.needs_action.length },
                { id: 'unassigned', label: t('official.tabUnassigned'), count: categorizedQueues.unassigned.length },
                { id: 'mine', label: t('official.tabMine'), count: categorizedQueues.mine.length },
                { id: 'overdue', label: t('official.tabOverdue'), count: categorizedQueues.overdue.length, alert: true },
                { id: 'emergencies', label: t('official.tabEmergencies'), count: categorizedQueues.emergencies.length, alert: true },
                { id: 'all', label: t('official.tabAll'), count: categorizedQueues.all.length }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => saveTabPreference(tab.id)}
                  className={`px-2.5 py-1 text-xs rounded font-medium flex items-center gap-1 transition ${
                    activeQueueTab === tab.id
                      ? 'bg-[#0c2340] text-white font-bold shadow-2xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeQueueTab === tab.id
                      ? 'bg-white/20 text-white'
                      : tab.alert && tab.count > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-800'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="p-1 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs"
              >
                <option value="">{t('map.allStatuses')}</option>
                {['Submitted', 'Under Review', 'Accepted', 'In Progress', 'Resolved', 'Closed', 'Rejected'].map((s) => (
                  <option key={s} value={s}>{labelFor('status', s)}</option>
                ))}
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
                className="p-1 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs"
              >
                <option value="">{t('complaint.allPriorities')}</option>
                {['Critical', 'High', 'Normal'].map((p) => (
                  <option key={p} value={p}>{labelFor('priority', p)}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder={t('common.filter') + ' ' + t('complaint.area')}
                value={areaFilter}
                onChange={(e) => { setAreaFilter(e.target.value); setCurrentPage(1); }}
                className="p-1 bg-slate-50 border border-slate-200 rounded text-slate-700 text-xs w-28"
              />
            </div>

            {/* Queue List */}
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
                {t('official.loadingQueue')}
              </div>
            ) : paginatedQueue.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 border border-dashed rounded-lg">
                {t('official.noComplaintsMatch')}
              </div>
            ) : (
              <div className="space-y-1.5 divide-y divide-slate-100">
                {paginatedQueue.map((c) => {
                  const isSelected = (c._id || c.id) === (selectedComplaint?._id || selectedComplaint?.id);
                  const isUnderReview = ['Submitted', 'Under Review'].includes(c.status);
                  const targetDeadline = isUnderReview ? (c.initialResponseDue || c.responseDeadline) : c.resolutionDue;
                  const countdown = getCountdown(targetDeadline);

                  const assigneeInitials = c.assignedToName
                    ? c.assignedToName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                    : (c.assignedTo ? 'FO' : null);

                  return (
                    <div
                      key={c._id || c.id}
                      onClick={() => selectComplaint(c)}
                      className={`p-2.5 rounded-lg cursor-pointer transition text-xs border ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-400 shadow-2xs ring-1 ring-blue-300'
                          : 'bg-white hover:bg-slate-50/80 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono font-bold text-slate-800 text-[11px] truncate">
                            {c.trackingId || c.publicRef}
                          </span>
                          {c.isCriticalVerified && (
                            <span className="px-1 py-0.2 bg-rose-600 text-white font-extrabold text-[9px] rounded uppercase">
                              CRITICAL
                            </span>
                          )}
                          {c.isPossibleEmergency && !c.isCriticalVerified && (
                            <span className="px-1 py-0.2 bg-amber-500 text-white font-bold text-[9px] rounded uppercase">
                              EMERGENCY
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                          {c.area || 'Pune'}
                        </span>
                      </div>

                      <h4 className="font-semibold text-slate-900 text-xs line-clamp-1">
                        {c.title}
                      </h4>

                      <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 font-medium rounded text-[10px]">
                            {labelFor('status', c.status)}
                          </span>
                          <span className={`px-1.5 py-0.5 font-bold rounded text-[10px] uppercase ${
                            c.priority === 'Critical' ? 'bg-rose-100 text-rose-700' :
                            c.priority === 'High' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {labelFor('priority', c.priority)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono font-semibold ${
                            countdown.isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500'
                          }`}>
                            ⏱ {countdown.text}
                          </span>
                          {assigneeInitials ? (
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[9px] flex items-center justify-center border border-slate-300" title={c.assignedToName || 'Assigned Officer'}>
                              {assigneeInitials}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded bg-slate-100 text-slate-700 disabled:opacity-40"
                >
                  ← {t('common.prev')}
                </button>
                <span className="text-slate-500 text-[11px]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded bg-slate-100 text-slate-700 disabled:opacity-40"
                >
                  {t('common.next')} →
                </button>
              </div>
            )}

            {/* Keyboard Shortcuts Hint */}
            <div className="text-[10px] text-slate-400 pt-1 text-center font-mono">
              {t('official.shortcutsHint')}
            </div>
          </div>

          {/* RIGHT PANE: TICKET WORKSPACE (Full page on mobile when ticket selected) */}
          <div className={`md:col-span-7 bg-white rounded-lg border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 ${
            isMobileDetailOpen ? 'block' : 'hidden md:block'
          }`}>
            {selectedComplaint ? (
              <div className="space-y-4">
                {/* Mobile Back Button */}
                <div className="block md:hidden pb-1 border-b border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSelectedComplaint(null)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 py-1"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-500" />
                    <span>{t('official.backToQueue')}</span>
                  </button>
                </div>

                {/* Advisory Review Banner */}
                {selectedComplaint.reviewingBy && new Date(selectedComplaint.reviewingUntil) > new Date() && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{t('official.beingReviewed', { name: selectedComplaint.reviewingBy })}</span>
                  </div>
                )}

                {/* Stale Version 409 Warning Banner */}
                {staleVersionError && (
                  <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs rounded-lg flex items-center justify-between gap-2 animate-pulse">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{t('official.ticketChangedWarning')}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectComplaint(selectedComplaint)}
                      className="px-3 py-1 bg-rose-600 text-white font-bold rounded text-xs hover:bg-rose-700"
                    >
                      {t('official.reloadTicket')}
                    </button>
                  </div>
                )}

                {/* Notifications Messages */}
                {message && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{message}</span>
                  </div>
                )}
                {error && !staleVersionError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* TICKET HEADER */}
                <div className="border-b border-slate-100 pb-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">
                        {selectedComplaint.trackingId || selectedComplaint.publicRef}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                        {labelFor('status', selectedComplaint.status)}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                        selectedComplaint.priority === 'Critical' ? 'bg-rose-100 text-rose-700' :
                        selectedComplaint.priority === 'High' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {labelFor('priority', selectedComplaint.priority)}
                      </span>
                      {selectedComplaint.isOverdue && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-600 text-white">
                          OVERDUE SLA
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500">
                      v{selectedComplaint.version || 1}
                    </div>
                  </div>

                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {selectedComplaint.title}
                  </h2>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                      📍 {selectedComplaint.area || 'Pune'}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded capitalize font-medium">
                      🏢 {labelFor('department', selectedComplaint.department)}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                      🏷️ {selectedComplaint.category}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                      👤 {selectedComplaint.assignedToName || 'Unassigned'}
                    </span>
                  </div>

                  {/* Dual SLA Countdown Bar */}
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      {['Submitted', 'Under Review'].includes(selectedComplaint.status) ? (
                        <div>
                          <span className="text-slate-500 block text-[11px]">{t('official.responseSla')}:</span>
                          <strong className="text-slate-800">{formatIST(selectedComplaint.initialResponseDue || selectedComplaint.responseDeadline)}</strong>
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-500 block text-[11px]">{t('official.resolutionSla')}:</span>
                          <strong className="text-slate-800">{formatIST(selectedComplaint.resolutionDue)}</strong>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block text-[11px]">{t('official.lastUpdated', { user: selectedComplaint.lastUpdatedBy || 'Staff', time: '' })}:</span>
                      <span className="font-mono text-slate-700">{formatIST(selectedComplaint.updatedAt || selectedComplaint.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* PROGRESS STEPPER (True-to-state with Rejected/Reopened branches) */}
                <div className="py-2 overflow-x-auto">
                  <div className="flex items-center min-w-[500px] text-xs">
                    {['Submitted', 'Under Review', 'Accepted', 'In Progress', 'Resolved', 'Closed'].map((st, idx) => {
                      const allSteps = ['Submitted', 'Under Review', 'Accepted', 'In Progress', 'Resolved', 'Closed'];
                      const currentIdx = allSteps.indexOf(selectedComplaint.status);
                      const isCompleted = currentIdx >= idx && selectedComplaint.status !== 'Rejected';
                      const isCurrent = selectedComplaint.status === st;

                      return (
                        <React.Fragment key={st}>
                          <div className="flex flex-col items-center flex-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                              isCurrent ? 'bg-[#0c2340] text-white ring-2 ring-blue-400' :
                              isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {idx + 1}
                            </div>
                            <span className={`text-[10px] mt-1 text-center font-medium ${isCurrent ? 'text-slate-900 font-bold' : 'text-slate-500'}`}>
                              {labelFor('status', st)}
                            </span>
                          </div>
                          {idx < allSteps.length - 1 && (
                            <div className={`h-0.5 flex-1 ${currentIdx > idx ? 'bg-emerald-600' : 'bg-slate-200'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {/* Branch states */}
                  {selectedComplaint.status === 'Rejected' && (
                    <div className="mt-2 text-center text-xs font-bold text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                      🚫 Branch State: Rejected ({selectedComplaint.rejectionReason || 'Non-actionable'})
                    </div>
                  )}
                  {selectedComplaint.reopenRequest?.decision === 'approved' && (
                    <div className="mt-2 text-center text-xs font-bold text-purple-700 bg-purple-50 p-1.5 rounded border border-purple-200">
                      🔄 Branch State: Reopened by Citizen
                    </div>
                  )}
                </div>

                {/* BACKEND-DRIVEN NEXT STEP ACTION BAR */}
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-2">
                  <div className="text-xs font-medium text-slate-700">
                    {allowedActions?.primaryAction?.summary ? (
                      <span className="text-blue-900 font-semibold">{allowedActions.primaryAction.summary}</span>
                    ) : allowedActions?.noActionReason ? (
                      <span className="text-slate-600 italic">ℹ️ {allowedActions.noActionReason}</span>
                    ) : null}
                  </div>

                  {/* Primary & Secondary Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {allowedActions?.primaryAction && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          const actId = allowedActions.primaryAction.id;
                          if (actId === 'accept') executeAction('accept');
                          else if (actId === 'take_ticket') executeAction('self-assign');
                          else if (actId === 'start_work') executeAction('start-work');
                          else if (actId === 'resolve') setShowResolveModal(true);
                          else if (actId === 'close') executeAction('close');
                          else if (actId === 'assign_officer') setShowAssignModal(true);
                        }}
                        className="px-4 py-2 bg-[#0c2340] hover:bg-slate-800 text-white font-bold rounded text-xs transition shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{allowedActions.primaryAction.label}</span>
                      </button>
                    )}

                    {allowedActions?.secondaryActions?.map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          if (sec.id === 'reject') setShowRejectModal(true);
                          else if (sec.id === 'assign_officer' || sec.id === 'reassign') setShowAssignModal(true);
                          else if (sec.id === 'add_note') setShowProgressNoteModal(true);
                          else if (sec.id === 'approve_reopen') executeAction('reopen-decision', { decision: 'approved', reason: 'Reviewer approved reopening request.' });
                          else if (sec.id === 'reject_reopen') executeAction('reopen-decision', { decision: 'rejected', reason: 'Reviewer rejected reopening request.' });
                        }}
                        className={`px-3 py-2 rounded text-xs font-semibold transition border disabled:opacity-50 ${
                          sec.id === 'reject'
                            ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5 WORKSPACE TABS */}
                <div className="space-y-3">
                  <div className="flex border-b border-slate-200 text-xs font-semibold">
                    {[
                      { id: 'overview', label: t('official.tabOverview') },
                      { id: 'evidence', label: `${t('official.tabEvidence')} (${evidenceList.length})` },
                      { id: 'reports', label: `${t('official.tabReports')} (${reportsList.length || 1})` },
                      { id: 'notes', label: `${t('official.tabNotes')} (${notesList.length})` },
                      { id: 'history', label: t('official.tabHistory') }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setWorkspaceTab(tab.id)}
                        className={`py-2 px-3 border-b-2 transition ${
                          workspaceTab === tab.id
                            ? 'border-[#0c2340] text-[#0c2340] font-bold'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* TAB 1: OVERVIEW (Review Checklist) */}
                  {workspaceTab === 'overview' && (
                    <div className="space-y-3 text-xs">
                      {/* Description Card */}
                      <div className="bg-slate-50/60 p-3 rounded border border-slate-200 space-y-1">
                        <span className="font-bold text-slate-700 uppercase tracking-wide text-[10px] block">
                          {t('complaint.description')}:
                        </span>
                        <p className="text-slate-800 leading-relaxed text-xs">
                          {selectedComplaint.description}
                        </p>
                      </div>

                      {/* Possible Duplicate Banner */}
                      {duplicatesList.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <div>
                              <strong className="text-amber-900 block">{t('official.possibleDuplicate')}</strong>
                              <span className="text-[11px] text-amber-800">
                                Match detected with existing ticket. Similarity: {Math.round(duplicatesList[0].similarity * 100)}%
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCandidate(duplicatesList[0]);
                              setShowCompareModal(true);
                            }}
                            className="px-2.5 py-1 bg-amber-600 text-white font-bold rounded text-xs hover:bg-amber-700"
                          >
                            {t('official.compareDuplicates')}
                          </button>
                        </div>
                      )}

                      {/* Review Checklist Items */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Evidence Thumbnail with Unverified Metadata Badge */}
                        <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                            <span>{t('official.tabEvidence')}</span>
                          </span>

                          {evidenceList.length > 0 ? (
                            <div className="space-y-1.5">
                              <a
                                href={evidenceList[0].downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block p-2 bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 text-blue-700 font-medium truncate"
                              >
                                📎 {evidenceList[0].mimeType} ({evidenceList[0].kind || 'INITIAL'})
                              </a>
                              <span className="inline-block text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded">
                                ⚠️ {t('official.unverifiedMetadata')}
                              </span>
                              <p className="text-[10px] text-slate-500 italic">
                                {t('official.photoDateWarning', { date: formatDate(selectedComplaint.createdAt) })}
                              </p>
                            </div>
                          ) : (
                            <p className="text-slate-400 italic text-[11px]">{t('complaint.noEvidence')}</p>
                          )}
                        </div>

                        {/* Precise Pin Map & Service Area Check */}
                        <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{t('complaint.location')}</span>
                          </span>
                          <div className="space-y-1">
                            <p className="font-mono text-slate-700 text-[11px]">
                              Coords: {selectedComplaint.location?.lat?.toFixed(5) || selectedComplaint.lat || '18.5204'}, {selectedComplaint.location?.lng?.toFixed(5) || selectedComplaint.lng || '73.8567'}
                            </p>
                            <p className="text-slate-600 text-[11px]">
                              {selectedComplaint.location?.address || `${selectedComplaint.area || 'Pune'}, Maharashtra`}
                            </p>
                            <div className="inline-flex items-center gap-1 text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{t('official.serviceAreaOk')}</span>
                            </div>
                          </div>
                        </div>

                        {/* Category Check with Reroute Link */}
                        <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{t('complaint.category')}</span>
                            {['supervisor', 'admin'].includes(user.role) && (
                              <button
                                type="button"
                                onClick={() => setSupervisorToolsOpen(true)}
                                className="text-blue-600 hover:underline text-[11px] font-semibold"
                              >
                                {t('official.wrongCategoryReroute')}
                              </button>
                            )}
                          </div>
                          <p className="text-slate-700 font-medium">
                            {selectedComplaint.category} ({labelFor('department', selectedComplaint.department)})
                          </p>
                        </div>

                        {/* Linked Reports Summary */}
                        <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                          <span className="font-bold text-slate-800">
                            {t('official.linkedReportsCount', { count: reportsList.length || 1 })}
                          </span>
                          <p className="text-slate-500 text-[11px]">
                            {reportsList.length > 1
                              ? `${reportsList.length} citizen submissions aggregated into this master ticket.`
                              : '1 primary citizen submission.'}
                          </p>
                        </div>
                      </div>

                      {/* Emergency Verification Console */}
                      {selectedComplaint.isPossibleEmergency && ['reviewer', 'supervisor'].includes(user.role) && (
                        <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span>{t('official.citizenFlaggedEmergency')}</span>
                          </div>
                          <p className="text-amber-800 text-[11px]">{t('official.emergencyExplanation')}</p>
                          <input
                            type="text"
                            placeholder={t('official.labels.reason')}
                            value={emergencyReason}
                            onChange={(e) => setEmergencyReason(e.target.value)}
                            className="w-full p-2 bg-white border border-amber-300 rounded text-xs"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => executeAction('emergency-verify', { action: 'verify', reason: emergencyReason || 'Verified on checklist' })}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-xs"
                            >
                              {t('official.verifyCritical')}
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => executeAction('emergency-verify', { action: 'dismiss', reason: emergencyReason || 'Non-critical after inspection' })}
                              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-semibold rounded text-xs"
                            >
                              {t('official.dismiss')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: EVIDENCE */}
                  {workspaceTab === 'evidence' && (
                    <div className="space-y-3 text-xs">
                      {evidenceList.length === 0 ? (
                        <p className="text-slate-400 italic py-6 text-center">{t('complaint.noEvidence')}</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {evidenceList.map((ev) => (
                            <div key={ev.id} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800 uppercase text-[10px]">
                                  {ev.kind === 'RESOLUTION' || ev.kind === 'after_repair' ? 'Resolution Photo' : 'Initial Evidence'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">{ev.mimeType}</span>
                              </div>
                              <p className="text-[11px] text-slate-500">{formatIST(ev.createdAt)}</p>
                              <a
                                href={ev.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold text-xs pt-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{t('official.viewPhoto', { mime: ev.mimeType })}</span>
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: REPORTS */}
                  {workspaceTab === 'reports' && (
                    <div className="space-y-2 text-xs">
                      {reportsList.length === 0 ? (
                        <div className="p-3 bg-slate-50 rounded border border-slate-200">
                          <p className="font-semibold text-slate-800">{selectedComplaint.trackingId}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">Primary submission by reporting citizen.</p>
                        </div>
                      ) : (
                        reportsList.map((rep) => (
                          <div key={rep.id} className="p-3 bg-slate-50 rounded border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <strong className="text-slate-800 block">{rep.referenceId || rep.id}</strong>
                              <p className="text-slate-600 text-[11px]">{rep.title || selectedComplaint.title}</p>
                              <span className="text-[10px] text-slate-400">{formatIST(rep.createdAt)}</span>
                            </div>
                            {['supervisor', 'admin'].includes(user.role) && reportsList.length > 1 && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleUnlinkReport(rep.id)}
                                className="px-2.5 py-1 bg-white border border-rose-300 text-rose-700 font-semibold rounded text-xs hover:bg-rose-50"
                              >
                                {t('official.unlinkToolTitle')}
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* TAB 4: NOTES */}
                  {workspaceTab === 'notes' && (
                    <div className="space-y-3 text-xs">
                      {/* Add Note Form */}
                      <form onSubmit={handleAddNote} className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                        <label className="font-bold text-slate-700 block">{t('official.addNote')}</label>
                        <textarea
                          rows={2}
                          placeholder={t('official.noteBodyPlaceholder')}
                          value={newNoteBody}
                          onChange={(e) => setNewNoteBody(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                          required
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                              <input
                                type="radio"
                                name="noteVisibility"
                                value="INTERNAL"
                                checked={newNoteVisibility === 'INTERNAL'}
                                onChange={() => setNewNoteVisibility('INTERNAL')}
                              />
                              <span>{t('official.internalNote')}</span>
                            </label>
                            <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                              <input
                                type="radio"
                                name="noteVisibility"
                                value="CITIZEN_UPDATE"
                                checked={newNoteVisibility === 'CITIZEN_UPDATE'}
                                onChange={() => setNewNoteVisibility('CITIZEN_UPDATE')}
                              />
                              <span className="text-blue-700 font-medium">{t('official.citizenUpdateNote')}</span>
                            </label>
                          </div>
                          <button
                            type="submit"
                            disabled={actionLoading || !newNoteBody.trim()}
                            className="px-3 py-1 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
                          >
                            {t('official.saveNote')}
                          </button>
                        </div>
                      </form>

                      {/* Notes List */}
                      {notesList.length === 0 ? (
                        <p className="text-slate-400 italic py-4 text-center">No notes added yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {notesList.map((n) => (
                            <div key={n.id} className="p-3 bg-white border border-slate-200 rounded space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-slate-800">
                                  {n.authorName || 'Staff'} ({n.authorRole || 'Official'})
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    n.visibility === 'CITIZEN_UPDATE' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {n.visibility === 'CITIZEN_UPDATE' ? 'Citizen Update' : 'Internal'}
                                  </span>
                                  <span className="text-slate-400 font-mono">{formatIST(n.createdAt)}</span>
                                </div>
                              </div>
                              <p className="text-slate-800 text-xs">{n.body}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 5: HISTORY */}
                  {workspaceTab === 'history' && (
                    <div className="space-y-3 text-xs">
                      {['supervisor', 'admin'].includes(user.role) && (
                        <div className="flex items-center justify-end">
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showRefusedOnly}
                              onChange={(e) => setShowRefusedOnly(e.target.checked)}
                              className="rounded border-slate-300 text-rose-600"
                            />
                            <span>{t('official.showRefusedAttempts')}</span>
                          </label>
                        </div>
                      )}

                      <div className="space-y-2 border-l-2 border-slate-200 pl-3">
                        {history
                          .filter((ev) => {
                            if (showRefusedOnly) return ev.outcome === 'refused';
                            if (user.role === 'officer' && ev.outcome === 'refused') return false;
                            return true;
                          })
                          .map((ev, idx) => (
                            <div
                              key={ev._id || idx}
                              className={`p-2.5 rounded border text-xs space-y-0.5 ${
                                ev.outcome === 'refused'
                                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                                  : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-slate-900">
                                  {formatHistorySentence(ev)}
                                </span>
                                <span className="font-mono text-slate-400 shrink-0">
                                  {formatIST(ev.createdAt)}
                                </span>
                              </div>
                              {ev.reason && (
                                <p className="text-[11px] text-slate-600 italic">
                                  "{ev.reason}"
                                </p>
                              )}
                              {ev.refusalReason && (
                                <p className="text-[11px] text-rose-700 font-medium">
                                  ⚠️ {ev.refusalReason}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SUPERVISOR TOOLS DRAWER (Only when allowed-actions says so) */}
                {allowedActions?.supervisorTools?.allowed && (
                  <div className="border border-slate-300 rounded-lg overflow-hidden bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setSupervisorToolsOpen(!supervisorToolsOpen)}
                      className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200/80 font-bold text-xs text-slate-800 flex items-center justify-between transition"
                    >
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-blue-900" />
                        <span>{t('official.supervisorToolsTitle')}</span>
                      </div>
                      {supervisorToolsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {supervisorToolsOpen && (
                      <div className="p-4 space-y-4 text-xs divide-y divide-slate-200">
                        {/* 1. Priority Override */}
                        <div className="space-y-1.5 pt-1">
                          <strong className="text-slate-800 block">{t('official.priorityToolTitle')}</strong>
                          <p className="text-[11px] text-slate-500">{t('official.priorityToolEffect')}</p>
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={supPriority}
                              onChange={(e) => setSupPriority(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs"
                            >
                              <option value="Normal">Normal</option>
                              <option value="High">High</option>
                              <option value="Critical">Critical</option>
                            </select>
                            <input
                              type="text"
                              placeholder={t('official.labels.priorityReasonPlaceholder')}
                              value={supPriorityReason}
                              onChange={(e) => setSupPriorityReason(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1 min-w-[200px]"
                            />
                            <button
                              type="button"
                              disabled={actionLoading || !supPriorityReason.trim()}
                              onClick={() => executeAction('priority', { priority: supPriority, reason: supPriorityReason })}
                              className="px-3 py-1.5 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
                            >
                              {t('official.overridePriorityBtn')}
                            </button>
                          </div>
                        </div>

                        {/* 2. Reroute */}
                        <div className="space-y-1.5 pt-3">
                          <strong className="text-slate-800 block">{t('official.rerouteToolTitle')}</strong>
                          <p className="text-[11px] text-slate-500">{t('official.rerouteToolEffect')}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <select
                              value={supRerouteDept}
                              onChange={(e) => setSupRerouteDept(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs"
                            >
                              <option value="roads">{labelFor('department', 'roads')}</option>
                              <option value="waste">{labelFor('department', 'waste')}</option>
                              <option value="water">{labelFor('department', 'water')}</option>
                            </select>
                            <input
                              type="text"
                              placeholder="New Category"
                              value={supRerouteCat}
                              onChange={(e) => setSupRerouteCat(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs"
                            />
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Reason for rerouting (mandatory)..."
                              value={supRerouteReason}
                              onChange={(e) => setSupRerouteReason(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1"
                            />
                            <button
                              type="button"
                              disabled={actionLoading || !supRerouteReason.trim()}
                              onClick={() => executeAction('reroute', { department: supRerouteDept, category: supRerouteCat, reason: supRerouteReason })}
                              className="px-3 py-1.5 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
                            >
                              {t('official.rerouteToolTitle')}
                            </button>
                          </div>
                        </div>

                        {/* 3. Reassign */}
                        <div className="space-y-1.5 pt-3">
                          <strong className="text-slate-800 block">{t('official.reassignToolTitle')}</strong>
                          <p className="text-[11px] text-slate-500">{t('official.reassignToolEffect')}</p>
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={supReassignOfficer}
                              onChange={(e) => setSupReassignOfficer(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1 min-w-[200px]"
                            >
                              <option value="">Select Officer</option>
                              {allowedActions?.officers?.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name} ({o.openCount} open, {o.overdueCount} overdue)
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              placeholder="Reassignment reason..."
                              value={supReassignReason}
                              onChange={(e) => setSupReassignReason(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1 min-w-[150px]"
                            />
                            <button
                              type="button"
                              disabled={actionLoading || !supReassignOfficer}
                              onClick={() => executeAction('assign', { assignedToOfficerId: supReassignOfficer, reason: supReassignReason })}
                              className="px-3 py-1.5 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
                            >
                              {t('official.reassignToolTitle')}
                            </button>
                          </div>
                        </div>

                        {/* 4. Change Deadline */}
                        <div className="space-y-1.5 pt-3">
                          <strong className="text-slate-800 block">{t('official.deadlineToolTitle')}</strong>
                          <p className="text-[11px] text-slate-500">{t('official.deadlineToolEffect')}</p>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="number"
                              min="1"
                              max="30"
                              value={supDeadlineDays}
                              onChange={(e) => setSupDeadlineDays(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs w-24"
                              placeholder="Days"
                            />
                            <input
                              type="text"
                              placeholder="Mandatory justification..."
                              value={supDeadlineReason}
                              onChange={(e) => setSupDeadlineReason(e.target.value)}
                              className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1 min-w-[150px]"
                            />
                            <button
                              type="button"
                              disabled={actionLoading || !supDeadlineReason.trim()}
                              onClick={() => executeAction('deadline', { days: supDeadlineDays, reason: supDeadlineReason })}
                              className="px-3 py-1.5 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
                            >
                              {t('official.deadlineToolTitle')}
                            </button>
                          </div>
                        </div>

                        {/* 5. Unlink Report */}
                        {reportsList.length > 1 && (
                          <div className="space-y-1.5 pt-3">
                            <strong className="text-slate-800 block">{t('official.unlinkToolTitle')}</strong>
                            <p className="text-[11px] text-slate-500">{t('official.unlinkToolEffect')}</p>
                            <div className="flex flex-wrap gap-2">
                              <select
                                value={supUnlinkReportId}
                                onChange={(e) => setSupUnlinkReportId(e.target.value)}
                                className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1"
                              >
                                <option value="">Select report to unlink...</option>
                                {reportsList.map((r) => (
                                  <option key={r.id} value={r.id}>{r.referenceId || r.id}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                placeholder="Reason for unlinking..."
                                value={supUnlinkReason}
                                onChange={(e) => setSupUnlinkReason(e.target.value)}
                                className="p-1.5 bg-white border border-slate-300 rounded text-xs flex-1"
                              />
                              <button
                                type="button"
                                disabled={actionLoading || !supUnlinkReportId}
                                onClick={() => handleUnlinkReport(supUnlinkReportId)}
                                className="px-3 py-1.5 bg-rose-600 text-white font-bold rounded text-xs disabled:opacity-50"
                              >
                                {t('official.unlinkToolTitle')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-slate-400 space-y-2">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="font-medium text-slate-600">{t('official.selectTicketPrompt')}</p>
                <p className="text-[11px] text-slate-400">{t('official.selectFromQueue')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REJECT MODAL (Quick-pick chips & free-text) */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-slate-900 text-base">{t('official.rejectTitle')}</h3>
            <p className="text-xs text-slate-500">
              {t('official.labels.rejectionReasonPlaceholder')}
            </p>

            {/* Quick Pick Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-slate-600 uppercase">Quick-Pick Reasons:</span>
              <div className="flex flex-wrap gap-1.5">
                {(allowedActions?.rejectReasonsConfig || [
                  'Duplicate of an existing ticket',
                  'Outside the Pune service area',
                  'Not a municipal issue',
                  'Insufficient evidence',
                  'Other'
                ]).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setSelectedRejectChip(chip);
                      setRejectReason((prev) => (prev ? `${prev} - ${chip}` : chip));
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold border transition ${
                      selectedRejectChip === chip
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={3}
              placeholder={t('official.rejectReasonPlaceholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs"
              required
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={actionLoading || !rejectReason.trim()}
                onClick={() => executeAction('reject', { reason: rejectReason.trim() })}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs disabled:opacity-50"
              >
                {t('official.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE MODAL (Mandatory resolutionNote, optional afterRepairPhoto) */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-slate-900 text-base">{t('official.resolveTitle')}</h3>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">{t('official.resolutionNoteLabel')} *</label>
              <textarea
                rows={3}
                placeholder={t('official.labels.resolutionNotePlaceholder')}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">{t('official.afterRepairPhotoLabel')}</label>
              <input
                type="file"
                accept="image/*,video/mp4"
                onChange={(e) => setAfterRepairPhoto(e.target.files[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-100 file:text-xs file:font-semibold"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={actionLoading || !resolutionNote.trim()}
                onClick={handleConfirmResolve}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs disabled:opacity-50"
              >
                {t('official.confirmResolve')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN OFFICER MODAL */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-slate-900 text-base">{t('official.assignOfficer')}</h3>
            <p className="text-xs text-slate-500">
              Department: <strong className="capitalize">{selectedComplaint.department}</strong>
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Select Officer *</label>
              <select
                value={assignedOfficerId}
                onChange={(e) => setAssignedOfficerId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs"
              >
                <option value="">-- Choose Field Officer --</option>
                {allowedActions?.officers?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.openCount} open, {o.overdueCount} overdue)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Assignment Note (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Assigned for urgent on-site compaction"
                value={assignReason}
                onChange={(e) => setAssignReason(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={actionLoading || !assignedOfficerId}
                onClick={() => executeAction('assign', { assignedToOfficerId: assignedOfficerId, reason: assignReason })}
                className="px-4 py-1.5 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
              >
                {t('official.actions.assignStaff')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROGRESS NOTE MODAL */}
      {showProgressNoteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <h3 className="font-bold text-slate-900 text-base">{t('official.progressNoteModalTitle')}</h3>
            <textarea
              rows={3}
              placeholder="Describe on-site progress, materials deployed..."
              value={progressNoteText}
              onChange={(e) => setProgressNoteText(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded text-xs"
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProgressNoteModal(false)}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={actionLoading || !progressNoteText.trim()}
                onClick={() => {
                  executeAction('progress', { note: progressNoteText.trim() });
                  setProgressNoteText('');
                }}
                className="px-4 py-1.5 bg-[#0c2340] text-white font-bold rounded text-xs disabled:opacity-50"
              >
                {t('official.actions.addProgressNote')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPARE DUPLICATES MODAL */}
      {showCompareModal && selectedCandidate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-slate-900 text-base">{t('official.compareModalTitle')}</h3>
            <p className="text-xs text-slate-500">{t('official.compareModalDesc')}</p>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-800 block uppercase text-[10px]">{t('official.currentTicket')}</span>
                <p className="font-semibold text-slate-900">{selectedComplaint.title}</p>
                <p className="text-slate-600 text-[11px]">{selectedComplaint.description}</p>
                <p className="text-slate-400 text-[10px]">📍 {selectedComplaint.area} • {formatIST(selectedComplaint.createdAt)}</p>
              </div>

              <div className="p-3 bg-amber-50/50 rounded border border-amber-200 space-y-1.5">
                <span className="font-bold text-amber-900 block uppercase text-[10px]">{t('official.candidateDuplicate')}</span>
                <p className="font-semibold text-slate-900">ID: {selectedCandidate.issueBId || selectedCandidate.issueAId}</p>
                <p className="text-[11px] text-slate-600">Similarity: {Math.round(selectedCandidate.similarity * 100)}%</p>
                <p className="text-[11px] text-slate-600">Distance: {Math.round(selectedCandidate.distanceMeters || 45)} meters</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
