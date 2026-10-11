import React, { useState, useEffect, useRef } from 'react';
import { 
  PlusCircle, 
  Sparkles, 
  AlertTriangle, 
  Camera, 
  MapPin, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  FileText, 
  X, 
  HelpCircle,
  ShieldCheck,
  AlertCircle,
  Navigation,
  Search,
  ThumbsUp,
  Check,
  Compass,
  Layers,
  Printer,
  Building2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import exifr from 'exifr';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';

import { useAuth } from '../context/AuthContext';
import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';
import { getKeywordSuggestion } from '../utils/keywordMatcher';

// Custom vector pin icon for crisp, reliable rendering
const draggablePinIcon = L.divIcon({
  className: 'custom-draggable-pin',
  html: `<div style="background-color: #c5221f; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; margin-top: -22px; margin-left: -11px;"><div style="width: 7px; height: 7px; background: white; border-radius: 50%; transform: rotate(45deg);"></div></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22]
});

// Helper component for Leaflet map click, pan, and size invalidation
function LeafletPinPicker({ position, onPinChange }) {
  const map = useMap();

  useMapEvents({
    click(e) {
      onPinChange(e.latlng.lat, e.latlng.lng);
      map.panTo([e.latlng.lat, e.latlng.lng]);
    }
  });

  useEffect(() => {
    if (position) {
      map.panTo(position);
    }
  }, [position, map]);

  // Ensure map size is properly invalidated on layout paint and window resize
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
  }, [map]);

  return position ? (
    <Marker
      position={position}
      draggable={true}
      icon={draggablePinIcon}
      eventHandlers={{
        dragend(e) {
          const latlng = e.target.getLatLng();
          onPinChange(latlng.lat, latlng.lng);
        }
      }}
    />
  ) : null;
}

export default function Report() {
  const { token } = useAuth();
  const { city } = useCity();
  const { t, lang, labelFor, formatError, formatDate } = useLanguage();
  const navigate = useNavigate();

  // Mode: 'quick' or 'guided'
  const [activeTab, setActiveTab] = useState('quick');
  const [guidedStep, setGuidedStep] = useState(1);

  // Categories loaded from server /api/categories
  const [categoriesMap, setCategoriesMap] = useState({
    waste: ['Missed garbage collection', 'Overflowing public dustbins', 'Dead animal removal', 'Public toilet maintenance', 'Others'],
    roads: ['Potholes or damaged roads', 'Broken or flickering streetlights', 'Damaged footpaths or sidewalks', 'Others'],
    water: ['Contaminated or muddy water supply', 'Major pipe leaks or bursts', 'Overflowing sewage or blocked storm drains', 'Others'],
    others: ['Others']
  });

  // Form State
  const [department, setDepartment] = useState('roads');
  const [category, setCategory] = useState('Potholes or damaged roads');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedArea, setSelectedArea] = useState('Shivajinagar');
  const [lat, setLat] = useState('18.5308');
  const [lng, setLng] = useState('73.8475');
  const [address, setAddress] = useState('Near Shivajinagar Station, Pune');
  const [locationSource, setLocationSource] = useState('manual'); // 'exif' | 'device' | 'map' | 'manual'
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyConcern, setEmergencyConcern] = useState('');
  const [pinConfirmed, setPinConfirmed] = useState(false);

  // Evidence Files
  const [evidenceFiles, setEvidenceFiles] = useState([]);
  const [evidencePreviews, setEvidencePreviews] = useState([]);

  // Geocoding & GPS State
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [gpsNotice, setGpsNotice] = useState(null);

  // AI & Keyword Suggestions
  const [suggestion, setSuggestion] = useState(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCitizenSuggestion, setAiCitizenSuggestion] = useState(null);

  // Nearby Duplicates Prevention
  const [checkingNearby, setCheckingNearby] = useState(false);
  const [nearbyIssues, setNearbyIssues] = useState([]);
  const [dismissedNearby, setDismissedNearby] = useState(false);

  // Submission Status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  // Pune bounding box
  const puneBounds = [
    [city.bounds.south, city.bounds.west],
    [city.bounds.north, city.bounds.east]
  ];

  const isInsidePune = (latitude, longitude) => {
    const la = parseFloat(latitude);
    const lo = parseFloat(longitude);
    return (
      la >= city.bounds.south &&
      la <= city.bounds.north &&
      lo >= city.bounds.west &&
      lo <= city.bounds.east
    );
  };

  // Fetch official categories
  useEffect(() => {
    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCategoriesMap(data);
      })
      .catch((err) => console.warn('Could not load remote categories:', err));
  }, []);

  // Update categories dropdown when department changes
  useEffect(() => {
    const list = categoriesMap[department] || [];
    if (list.length > 0 && !list.includes(category)) {
      setCategory(list[0]);
    }
  }, [department, categoriesMap]);

  // Keyword suggestion matcher (English + Marathi Roman & Devanagari)
  useEffect(() => {
    if (suggestionDismissed) return;
    const combinedText = `${title} ${description}`;
    const matched = getKeywordSuggestion(combinedText);
    if (matched) {
      setSuggestion(matched);
    } else {
      setSuggestion(null);
    }
  }, [title, description, suggestionDismissed]);

  // Check nearby duplicates whenever category, location, or pin confirmation changes
  useEffect(() => {
    if (!token || !pinConfirmed || !lat || !lng || !category) return;

    const fetchNearby = async () => {
      setCheckingNearby(true);
      try {
        const queryParams = new URLSearchParams({
          lat,
          lng,
          category,
          description: description || title || ''
        });
        const res = await fetch(`/api/complaints/nearby?${queryParams.toString()}`, {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Accept-Language': lang === 'mr' ? 'mr,hi;q=0.9,en;q=0.8' : 'en,en-IN;q=0.9'
          }
        });
        if (res.ok) {
          const data = await res.json();
          setNearbyIssues(data.suggestions || []);
        }
      } catch (err) {
        console.warn('Error fetching nearby complaints:', err);
      } finally {
        setCheckingNearby(false);
      }
    };

    fetchNearby();
  }, [pinConfirmed, lat, lng, category, token, lang]);

  // Reverse geocode coordinate via backend Nominatim proxy with language preference
  const reverseGeocode = async (latitude, longitude) => {
    try {
      const res = await fetch(`/api/geo/reverse?lat=${latitude}&lng=${longitude}&lang=${lang}`, {
        headers: { 'Accept-Language': lang === 'mr' ? 'mr,hi;q=0.9,en;q=0.8' : 'en,en-IN;q=0.9' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.displayName) {
          setAddress(data.displayName);
        }
        if (data.area) {
          setSelectedArea(data.area);
        }
      }
    } catch (err) {
      console.warn('Reverse geocode failed:', err);
    }
  };

  // SMART PHOTO LOCATION: 1) Photo GPS (EXIF)
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setEvidenceFiles((prev) => [...prev, ...files]);

    const newPreviews = files.map((file) => ({
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2),
      type: file.type,
      url: URL.createObjectURL(file)
    }));
    setEvidencePreviews((prev) => [...prev, ...newPreviews]);

    // Inspect first image file for EXIF GPS metadata
    const firstImage = files.find((f) => f.type.startsWith('image'));
    if (firstImage) {
      try {
        const gps = await exifr.gps(firstImage);
        if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
          const photoLat = gps.latitude;
          const photoLng = gps.longitude;

          if (isInsidePune(photoLat, photoLng)) {
            setLat(photoLat.toFixed(4));
            setLng(photoLng.toFixed(4));
            setLocationSource('exif');
            setPinConfirmed(false); // Citizen must confirm
            setGpsNotice({
              type: 'success',
              text: `${t('report.sourceExif')}: [${photoLat.toFixed(4)}, ${photoLng.toFixed(4)}]`
            });
            reverseGeocode(photoLat, photoLng);
          } else {
            setGpsNotice({
              type: 'warning',
              text: t('errors.OUTSIDE_PUNE_BOUNDS')
            });
          }
        } else {
          setGpsNotice({
            type: 'info',
            text: t('report.deviceLocationNote')
          });
        }
      } catch (err) {
        console.warn('EXIF read warning:', err);
        setGpsNotice({
          type: 'info',
          text: t('report.deviceLocationNote')
        });
      }
    }
  };

  // SMART PHOTO LOCATION: 2) Device location
  const handleUseDeviceLocation = () => {
    if (!navigator.geolocation) {
      alert(t('errors.GENERIC_ERROR'));
      return;
    }

    setLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingDevice(false);
        const curLat = pos.coords.latitude;
        const curLng = pos.coords.longitude;

        if (isInsidePune(curLat, curLng)) {
          setLat(curLat.toFixed(4));
          setLng(curLng.toFixed(4));
          setLocationSource('device');
          setPinConfirmed(false); // Citizen must confirm
          setGpsNotice({
            type: 'success',
            text: `${t('report.sourceDevice')}: [${curLat.toFixed(4)}, ${curLng.toFixed(4)}]`
          });
          reverseGeocode(curLat, curLng);
        } else {
          setGpsNotice({
            type: 'warning',
            text: t('errors.OUTSIDE_PUNE_BOUNDS')
          });
        }
      },
      (err) => {
        setLocatingDevice(false);
        setGpsNotice({
          type: 'info',
          text: `${t('errors.GENERIC_ERROR')}: ${err.message}`
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // SMART PHOTO LOCATION: 3) Pune Place Search
  const handlePlaceSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;

    setSearchingPlaces(true);
    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(searchQuery.trim())}&lang=${lang}`, {
        headers: { 'Accept-Language': lang === 'mr' ? 'mr,hi;q=0.9,en;q=0.8' : 'en,en-IN;q=0.9' }
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setSearchResults(data.results);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.warn('Place search failed:', err);
      setSearchResults([]);
    } finally {
      setSearchingPlaces(false);
    }
  };

  const selectSearchResult = (item) => {
    setLat(item.lat.toFixed(4));
    setLng(item.lng.toFixed(4));
    setAddress(item.displayName);
    if (item.nearestArea) {
      setSelectedArea(item.nearestArea);
    }
    setLocationSource('map');
    setSearchResults([]);
    setSearchQuery('');
    setPinConfirmed(true);
  };

  // Map pin drag/click handler
  const handleMapPinChange = (newLat, newLng) => {
    setLat(newLat.toFixed(4));
    setLng(newLng.toFixed(4));
    setLocationSource('map');
    setPinConfirmed(false);
    reverseGeocode(newLat, newLng);
  };

  // Ward dropdown handler
  const handleAreaSelect = (areaName) => {
    setSelectedArea(areaName);
    const found = city.areas?.find((a) => a.name === areaName);
    if (found) {
      setLat(found.lat.toFixed(4));
      setLng(found.lng.toFixed(4));
      setLocationSource('manual');
      setAddress(`Near ${found.name}, Pune`);
      setPinConfirmed(true);
    }
  };

  const removeEvidence = (index) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index));
    setEvidencePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    setDepartment(suggestion.department);
    setCategory(suggestion.category);
    setSuggestion(null);
    setSuggestionDismissed(true);
  };

  // Support nearby issue
  const handleSupportNearby = async (issueId) => {
    try {
      const res = await fetch(`/api/complaints/${issueId}/support`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        }
      });
      const data = await res.json();
      if (res.ok) {
        setNearbyIssues((prev) =>
          prev.map((iss) => (iss.id === issueId ? { ...iss, hasSupported: true, supportCount: data.supportCount } : iss))
        );
      } else {
        alert(formatError(data));
      }
    } catch (err) {
      console.error('Failed to support:', err);
    }
  };

  // Fetch AI Suggestion with selected language
  const fetchAiSuggestion = async () => {
    if (!description.trim()) {
      setError(t('errors.FIELD_REQUIRED', { field: t('report.description') }));
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept-Language': lang === 'mr' ? 'mr,hi;q=0.9,en;q=0.8' : 'en,en-IN;q=0.9'
        },
        body: JSON.stringify({ description: description.trim(), language: lang })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.suggestion) {
          setAiCitizenSuggestion(data.suggestion);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(formatError(data) || t('errors.GENERIC_ERROR'));
      }
    } catch (err) {
      console.warn('AI suggestion fetch error:', err);
      setError(t('errors.NETWORK_ERROR'));
    } finally {
      setAiLoading(false);
    }
  };

  // Form Submission
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    // Frontend validations
    if (evidenceFiles.length === 0) {
      setError(t('errors.EVIDENCE_REQUIRED'));
      return;
    }

    if (!pinConfirmed) {
      setError(t('report.confirmPinPrompt'));
      return;
    }

    if (!isInsidePune(lat, lng)) {
      setError(t('errors.OUTSIDE_PUNE_BOUNDS'));
      return;
    }

    if (category.toLowerCase() === 'others') {
      if (!title || title.trim().length < 3) {
        setError(t('errors.OTHERS_TITLE_REQUIRED'));
        return;
      }
      if (!description || description.trim().length < 10) {
        setError(t('errors.OTHERS_DESCRIPTION_REQUIRED'));
        return;
      }
    }

    if (isEmergency && (!emergencyConcern || !emergencyConcern.trim())) {
      setError(t('errors.EMERGENCY_CONCERN_REQUIRED'));
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('department', department);
      formData.append('category', category);
      formData.append('title', title.trim() || category);
      formData.append('description', description.trim());
      formData.append('lat', lat);
      formData.append('lng', lng);
      formData.append('address', address.trim());
      formData.append('area', selectedArea);
      formData.append('locationSource', locationSource);
      formData.append('isPossibleEmergency', isEmergency ? 'true' : 'false');
      formData.append('emergencyConcern', isEmergency ? emergencyConcern.trim() : '');

      for (const file of evidenceFiles) {
        formData.append('evidence', file);
      }

      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatError(data) || t('errors.GENERIC_ERROR'));
      }

      setSuccessData(data.complaint);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Success Confirmation Screen
  if (successData) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden text-center my-6">
        <div className="p-6 sm:p-8 space-y-6">
          {/* Receipt Header */}
          <div className="flex flex-col items-center border-b border-slate-200 pb-5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{t('common.success')}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              {t('common.success')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('common.demoTagline')}
            </p>
          </div>

          {/* Acknowledgement Particulars Slip */}
          <div className="bg-slate-50 border border-slate-300 rounded-lg p-5 text-left text-xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-slate-600 font-semibold">{t('complaint.trackingId')}:</span>
              <span className="font-mono font-extrabold text-base text-[#0c2340] tracking-wide bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                {successData.trackingId}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('complaint.department')}:</span>
              <span className="font-bold capitalize text-slate-900">{labelFor('department', successData.department)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('complaint.category')}:</span>
              <span className="font-bold text-slate-900">{labelFor('category', successData.category, successData.department)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('report.localityLabel')}:</span>
              <span className="font-semibold text-slate-900">{successData.area || 'Pune'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('report.locationSource')}:</span>
              <span className="font-mono text-indigo-800 font-bold uppercase bg-indigo-50 px-1.5 py-0.5 rounded text-[11px]">
                {locationSource}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-600">{t('complaint.targetResolution')}:</span>
              <span className="font-bold text-slate-900">
                {formatDate(successData.initialResponseDue)}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 italic pt-1">
              * {t('common.demoDisclaimer')}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>{t('common.save')}</span>
            </button>
            <button
              onClick={() => navigate('/my-complaints')}
              className="flex-1 py-2.5 bg-[#c5221f] hover:bg-[#a51b18] text-white font-bold rounded-lg text-xs transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>{t('nav.myGrievances')}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setSuccessData(null);
                setTitle('');
                setDescription('');
                setEvidenceFiles([]);
                setEvidencePreviews([]);
                setPinConfirmed(false);
                setGuidedStep(1);
              }}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
            >
              {t('nav.fileGrievance')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 my-2">
      {/* Compact Page Header Strip */}
      <div className="bg-white rounded-lg border border-slate-200 px-5 py-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
              {t('report.pageTitle')}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {t('report.pageSubtitle')}
            </p>
          </div>

          {/* Tab Switcher: Quick Form vs Guided Help */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('quick')}
              className={`px-4 py-2 rounded-md transition font-bold flex items-center gap-1.5 ${
                activeTab === 'quick' 
                  ? 'bg-[#0c2340] text-white shadow-xs' 
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('report.tabQuick')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guided')}
              className={`px-4 py-2 rounded-md flex items-center gap-1.5 transition font-bold ${
                activeTab === 'guided' 
                  ? 'bg-[#0c2340] text-white shadow-xs' 
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('report.tabGuided')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Safety Warning Banner */}
      <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded-r-lg border-y border-r border-amber-300 flex items-start gap-3 text-xs text-amber-950">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-extrabold uppercase tracking-wide text-amber-900 block">
            {t('report.emergencyBannerTitle')}:
          </span>
          <p className="text-amber-900 leading-relaxed">
            {t('report.emergencyBannerWarning')} {t('report.emergencyBannerCall')}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border-l-4 border-rose-600 border-y border-r border-rose-200 text-rose-900 text-xs rounded-r-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* AI / Keyword Suggestion Banner */}
      {suggestion && (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex items-start justify-between gap-3 text-xs text-indigo-900 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-indigo-950">
                {t('wizard.suggestionBadge')}
              </span>
              <p className="text-[11px] text-indigo-700 mt-0.5">
                {labelFor('department', suggestion.department)} → {labelFor('category', suggestion.category, suggestion.department)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={applySuggestion}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition"
            >
              {t('wizard.acceptSuggestion')}
            </button>
            <button
              type="button"
              onClick={() => setSuggestionDismissed(true)}
              className="p-1 hover:bg-indigo-100 rounded text-indigo-500"
              title={t('common.cancel')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB A: QUICK FORM */}
      {activeTab === 'quick' && (
        <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-7 rounded-xl border border-slate-300 shadow-xs space-y-6">
          {/* Section 1: Department & Category */}
          <div className="space-y-3">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span>{t('report.deptSelectTitle')}</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">{t('department')} *</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] focus:border-[#0c2340] outline-none"
                >
                  <option value="roads">{labelFor('department', 'roads')}</option>
                  <option value="waste">{labelFor('department', 'waste')}</option>
                  <option value="water">{labelFor('department', 'water')}</option>
                  <option value="others">{labelFor('department', 'others')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t('report.categoryTitle')} *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] focus:border-[#0c2340] outline-none"
                >
                  {(categoriesMap[department] || []).map((c) => (
                    <option key={c} value={c}>{labelFor('category', c, department)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: MANDATORY EVIDENCE BLOCK */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-slate-500" />
                <span>{t('report.evidenceTitle')}</span>
                <span className="text-rose-600 font-bold">*</span>
              </h3>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-lg p-5 text-center bg-slate-50/50 hover:bg-slate-50 transition">
              <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-800">{t('report.uploadBoxPrompt')}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{t('report.uploadBoxLimits')}</p>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4"
                onChange={handleFileChange}
                className="mt-3 text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-[#0c2340] file:text-white hover:file:bg-[#1a365d] cursor-pointer"
              />
            </div>

            {/* GPS Feedback message */}
            {gpsNotice && (
              <div className={`p-3 rounded-lg text-xs flex items-start gap-2.5 ${
                gpsNotice.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-950 font-medium'
                  : gpsNotice.type === 'warning'
                  ? 'bg-amber-50 border border-amber-300 text-amber-950 font-medium'
                  : 'bg-slate-100 border border-slate-300 text-slate-800 font-medium'
              }`}>
                {gpsNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                )}
                <span>{gpsNotice.text}</span>
              </div>
            )}

            {/* Thumbnail Previews */}
            {evidencePreviews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {evidencePreviews.map((prev, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-300 bg-slate-50 p-1">
                    {prev.type.startsWith('image') ? (
                      <img src={prev.url} alt="Evidence Preview" className="h-20 w-full object-cover rounded" />
                    ) : (
                      <div className="h-20 w-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-bold rounded">
                        {t('report.videoBadge')}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeEvidence(idx)}
                      className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-full opacity-90 hover:opacity-100 shadow-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <p className="text-[10px] text-slate-700 font-medium truncate mt-1">{prev.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: SMART PHOTO LOCATION BLOCK */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-300 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-700" />
                  <span>{t('report.locationSectionTitle')}</span>
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {t('report.locationSource')}: <strong className="uppercase text-[#0c2340] font-mono bg-white px-1 py-0.2 rounded border border-slate-200">{locationSource}</strong> • [{lat}, {lng}]
                </p>
              </div>

              {/* Pin Confirmation Button */}
              <button
                type="button"
                onClick={() => setPinConfirmed(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto ${
                  pinConfirmed
                    ? 'bg-[#059669] text-white shadow-xs'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 animate-pulse font-extrabold'
                }`}
              >
                {pinConfirmed ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('report.pinConfirmedBadge')} ✓</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('report.confirmPinPrompt')} *</span>
                  </>
                )}
              </button>
            </div>

            {/* Smart Location Secondary Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseDeviceLocation}
                disabled={locatingDevice}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
              >
                <Navigation className="w-3.5 h-3.5 text-[#0c2340]" />
                <span>{locatingDevice ? t('report.acquiringGps') : t('report.useDeviceLocation')}</span>
              </button>

              <span className="text-[10px] text-slate-500 italic">
                {t('report.deviceLocationNote')}
              </span>
            </div>

            {/* Pune Place Search Box */}
            <div className="relative z-10">
              <form onSubmit={handlePlaceSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('report.searchPlacePlaceholder')}
                    className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0c2340] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searchingPlaces}
                  className="px-3.5 py-2 bg-[#0c2340] hover:bg-[#1a365d] text-white rounded-lg text-xs font-bold disabled:opacity-50 transition"
                >
                  {searchingPlaces ? t('report.searching') : t('report.searchButton')}
                </button>
              </form>

              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectSearchResult(item)}
                      className="p-2.5 hover:bg-slate-50 cursor-pointer text-xs text-slate-800 transition"
                    >
                      <p className="font-bold truncate text-[#0c2340]">{item.displayName}</p>
                      <span className="text-[10px] text-slate-500">
                        [{item.lat.toFixed(4)}, {item.lng.toFixed(4)}]
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Leaflet Pin Picker Map */}
            <div className="relative w-full h-[280px] sm:h-[300px] md:h-[320px] rounded-lg overflow-hidden border border-slate-300 shadow-2xs isolate z-0">
              <MapContainer
                center={[parseFloat(lat) || city.map.center.lat, parseFloat(lng) || city.map.center.lng]}
                zoom={14}
                minZoom={10}
                maxZoom={18}
                maxBounds={puneBounds}
                maxBoundsViscosity={1.0}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LeafletPinPicker
                  position={[parseFloat(lat) || city.map.center.lat, parseFloat(lng) || city.map.center.lng]}
                  onPinChange={handleMapPinChange}
                />
              </MapContainer>
              <div className="absolute bottom-2 left-2 bg-[#0c2340]/90 backdrop-blur-xs text-white text-[10px] px-2.5 py-1 rounded shadow-xs z-10 font-semibold pointer-events-none">
                {t('report.mapInstruction')}
              </div>
            </div>

            {/* Address & Locality Text Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {t('report.localityLabel')} *
                </label>
                <select
                  value={selectedArea}
                  onChange={(e) => handleAreaSelect(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                >
                  {(city.areas || []).map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {t('report.landmarkLabel')} *
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('report.landmarkPlaceholder')}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                />
              </div>
            </div>
          </div>

          {/* NEARBY SUGGESTIONS CARD BLOCK */}
          {nearbyIssues.length > 0 && !dismissedNearby && (
            <div className="bg-amber-50/90 border-2 border-amber-400 rounded-xl p-5 space-y-3 animate-fadeIn">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 bg-amber-500 text-slate-950 rounded-lg">
                    <ThumbsUp className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-xs font-extrabold text-amber-950 uppercase tracking-wide">
                      {t('community.title')}
                    </h4>
                    <p className="text-[11px] text-amber-900 mt-0.5">
                      {t('community.supportPrompt')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedNearby(true)}
                  className="text-amber-800 hover:text-amber-950 p-1 rounded"
                  title={t('common.cancel')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                {nearbyIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold border border-slate-200">
                          {issue.trackingId}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {labelFor('status', issue.status)}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase">
                          {labelFor('priority', issue.priority)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          ~{issue.distanceMeters}m
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900">{issue.title}</p>
                      <p className="text-[11px] text-slate-600">{issue.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={issue.hasSupported}
                        onClick={() => handleSupportNearby(issue.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          issue.hasSupported
                            ? 'bg-emerald-100 text-emerald-800 cursor-default'
                            : 'bg-[#059669] hover:bg-[#047857] text-white shadow-2xs'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>
                          {issue.hasSupported 
                            ? `${t('community.alreadySupported')} (${issue.supportCount})` 
                            : `${t('community.supportThisIssue')} (${issue.supportCount})`}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Title & Description */}
          <div className="space-y-3">
            <div className="border-b border-slate-200 pb-2">
              <h3 className="text-xs font-bold text-[#0c2340] uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-500" />
                <span>{t('report.description')}</span>
              </h3>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {t('title')} {category === 'Others' ? <span className="text-rose-600 font-bold">*</span> : ''}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('report.issueTitlePlaceholder')}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700">{t('description')} *</label>
                <button
                  type="button"
                  onClick={fetchAiSuggestion}
                  disabled={aiLoading || !description.trim()}
                  className="text-xs text-[#0c2340] hover:text-[#1a365d] font-bold flex items-center gap-1 disabled:opacity-40 transition bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-300"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>{aiLoading ? t('common.loading') : t('complaint.aiPanelTitle')}</span>
                </button>
              </div>
              <textarea
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('report.descriptionPlaceholder')}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
              />
            </div>
          </div>

          {/* Quick Form AI Suggestion Panel */}
          {aiCitizenSuggestion && (
            <div className="bg-slate-50 border border-slate-300 p-4 rounded-lg space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#0c2340] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  {t('wizard.suggestionBadge')}
                </span>
              </div>

              <div className="text-xs text-slate-800 bg-white p-3 rounded-md border border-slate-300 space-y-1">
                <p>
                  {t('department')}: <strong className="capitalize text-[#0c2340]">{labelFor('department', aiCitizenSuggestion.suggestedDepartment)}</strong>
                </p>
                <p>
                  {t('category')}: <strong className="text-[#0c2340]">{labelFor('category', aiCitizenSuggestion.suggestedCategory, aiCitizenSuggestion.suggestedDepartment)}</strong>
                </p>
                {aiCitizenSuggestion.shortSummary && (
                  <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                    {aiCitizenSuggestion.shortSummary}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDepartment(aiCitizenSuggestion.suggestedDepartment);
                    setCategory(aiCitizenSuggestion.suggestedCategory);
                    setAiCitizenSuggestion(null);
                  }}
                  className="px-3.5 py-1.5 bg-[#0c2340] hover:bg-[#1a365d] text-white font-bold rounded-lg text-xs shadow-xs transition"
                >
                  {t('wizard.acceptSuggestion')}
                </button>
                <button
                  type="button"
                  onClick={() => setAiCitizenSuggestion(null)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-300 transition"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Section 5: Emergency Checkbox */}
          <div className="bg-rose-50/60 p-4 rounded-lg border border-rose-200 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
              <input
                type="checkbox"
                checked={isEmergency}
                onChange={(e) => setIsEmergency(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
              />
              <span className="text-rose-800 font-bold">{t('report.possibleEmergencyLabel')}</span>
            </label>

            {isEmergency && (
              <div>
                <label className="block text-[11px] font-bold text-rose-900 mb-1">
                  {t('report.emergencyConcernLabel')} *
                </label>
                <input
                  type="text"
                  required
                  value={emergencyConcern}
                  onChange={(e) => setEmergencyConcern(e.target.value)}
                  placeholder={t('report.emergencyConcernPlaceholder')}
                  className="w-full p-2 bg-white border border-rose-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-[#c5221f] hover:bg-[#a51b18] text-white font-bold rounded-lg shadow-sm transition disabled:opacity-50 text-sm uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{submitting ? t('common.submitting') : t('report.submitGrievance')}</span>
          </button>
        </form>
      )}

      {/* TAB B: GUIDED HELP WIZARD (One Question Per Screen) */}
      {activeTab === 'guided' && (
        <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-xs space-y-6">
          {/* Official Wizard Step Indicator */}
          <div className="border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#0c2340] uppercase tracking-wider">
                {t('wizard.title')}
              </span>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
                {t('wizard.step', { current: guidedStep, total: 5 })}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2 text-center">
              {[
                { s: 1, label: t('wizard.step1Nav') },
                { s: 2, label: t('wizard.step2Nav') },
                { s: 3, label: t('wizard.step3Nav') },
                { s: 4, label: t('wizard.step4Nav') },
                { s: 5, label: t('wizard.step5Nav') }
              ].map((item) => (
                <div key={item.s} className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${
                      guidedStep === item.s
                        ? 'bg-[#0c2340] text-white ring-4 ring-slate-100'
                        : guidedStep > item.s
                        ? 'bg-[#059669] text-white'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {guidedStep > item.s ? '✓' : item.s}
                  </div>
                  <span className={`text-[10px] mt-1 hidden sm:block ${
                    guidedStep === item.s ? 'font-bold text-[#0c2340]' : 'text-slate-500'
                  }`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* STEP 1: ISSUE TYPE */}
          {guidedStep === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
                  {t('wizard.step1Title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('wizard.step1Subtitle')}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: 'roads', label: labelFor('department', 'roads'), sub: t('home.roadsDesc') },
                  { id: 'waste', label: labelFor('department', 'waste'), sub: t('home.solidWasteDesc') },
                  { id: 'water', label: labelFor('department', 'water'), sub: t('home.waterDesc') },
                  { id: 'others', label: labelFor('department', 'others'), sub: t('home.othersDesc') }
                ].map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setDepartment(d.id)}
                    className={`p-4 rounded-lg border text-left transition ${
                      department === d.id
                        ? 'border-[#0c2340] bg-slate-50 ring-2 ring-[#0c2340]'
                        : 'border-slate-300 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <p className="font-bold text-[#0c2340] text-xs">{d.label}</p>
                    <p className="text-[11px] text-slate-600 mt-1 leading-snug">{d.sub}</p>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t('report.categoryTitle')} *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                >
                  {(categoriesMap[department] || []).map((c) => (
                    <option key={c} value={c}>{labelFor('category', c, department)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* STEP 2: LOCATION */}
          {guidedStep === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
                  {t('wizard.step2Title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('wizard.step2Subtitle')}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleUseDeviceLocation}
                  disabled={locatingDevice}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
                >
                  <Navigation className="w-3.5 h-3.5 text-[#0c2340]" />
                  <span>{locatingDevice ? t('report.acquiringGps') : t('report.useDeviceLocation')}</span>
                </button>
                <span className="text-[10px] text-slate-500 italic self-center">
                  {t('report.deviceLocationNote')}
                </span>
              </div>

              {gpsNotice && (
                <div className={`p-3 rounded-lg text-xs font-medium ${
                  gpsNotice.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border border-amber-300 text-amber-950'
                }`}>
                  {gpsNotice.text}
                </div>
              )}

              {/* Interactive Mini Map */}
              <div className="relative w-full h-[280px] sm:h-[300px] md:h-[320px] rounded-lg overflow-hidden border border-slate-300 shadow-2xs isolate z-0">
                <MapContainer
                  center={[parseFloat(lat) || city.map.center.lat, parseFloat(lng) || city.map.center.lng]}
                  zoom={14}
                  minZoom={10}
                  maxZoom={18}
                  maxBounds={puneBounds}
                  maxBoundsViscosity={1.0}
                  scrollWheelZoom={true}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <LeafletPinPicker
                    position={[parseFloat(lat) || city.map.center.lat, parseFloat(lng) || city.map.center.lng]}
                    onPinChange={handleMapPinChange}
                  />
                </MapContainer>
                <div className="absolute bottom-2 left-2 bg-[#0c2340]/90 backdrop-blur-xs text-white text-[10px] px-2.5 py-1 rounded shadow-xs z-10 font-semibold pointer-events-none">
                  {t('report.mapInstruction')}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('report.localityLabel')} *</label>
                  <select
                    value={selectedArea}
                    onChange={(e) => handleAreaSelect(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                  >
                    {(city.areas || []).map((a) => (
                      <option key={a.name} value={a.name}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t('report.landmarkLabel')} *</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={t('report.landmarkPlaceholder')}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                  />
                </div>
              </div>

              {/* Pin Confirmation Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setPinConfirmed(true)}
                  className={`w-full py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    pinConfirmed
                      ? 'bg-[#059669] text-white shadow-xs'
                      : 'bg-amber-500 hover:bg-amber-600 text-slate-950 animate-pulse font-extrabold'
                  }`}
                >
                  {pinConfirmed ? `${t('report.pinConfirmedBadge')} ✓` : `${t('report.confirmPinPrompt')} *`}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DETAILS */}
          {guidedStep === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
                  {t('wizard.step3Title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('wizard.step3Subtitle')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t('title')} {category === 'Others' ? <span className="text-rose-600 font-bold">*</span> : ''}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('report.issueTitlePlaceholder')}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">{t('description')} *</label>
                  <button
                    type="button"
                    onClick={fetchAiSuggestion}
                    disabled={aiLoading || !description.trim()}
                    className="text-xs text-[#0c2340] hover:text-[#1a365d] font-bold flex items-center gap-1 disabled:opacity-40 transition bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-300"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>{aiLoading ? t('common.loading') : t('complaint.aiPanelTitle')}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('report.descriptionPlaceholder')}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#0c2340] outline-none"
                />
              </div>

              {/* Guided Help AI Suggestion Panel */}
              {aiCitizenSuggestion && (
                <div className="bg-slate-50 border border-slate-300 p-4 rounded-lg space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#0c2340] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      {t('wizard.suggestionBadge')}
                    </span>
                  </div>

                  <div className="text-xs text-slate-800 bg-white p-3 rounded-md border border-slate-300 space-y-1">
                    <p>
                      {t('department')}: <strong className="capitalize text-[#0c2340]">{labelFor('department', aiCitizenSuggestion.suggestedDepartment)}</strong>
                    </p>
                    <p>
                      {t('category')}: <strong className="text-[#0c2340]">{labelFor('category', aiCitizenSuggestion.suggestedCategory, aiCitizenSuggestion.suggestedDepartment)}</strong>
                    </p>
                    {aiCitizenSuggestion.shortSummary && (
                      <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                        {aiCitizenSuggestion.shortSummary}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDepartment(aiCitizenSuggestion.suggestedDepartment);
                        setCategory(aiCitizenSuggestion.suggestedCategory);
                        setAiCitizenSuggestion(null);
                      }}
                      className="px-3.5 py-1.5 bg-[#0c2340] hover:bg-[#1a365d] text-white font-bold rounded-lg text-xs shadow-xs transition"
                    >
                      {t('wizard.acceptSuggestion')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiCitizenSuggestion(null)}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs border border-slate-300 transition"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-rose-50/60 p-4 rounded-lg border border-rose-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEmergency}
                    onChange={(e) => setIsEmergency(e.target.checked)}
                    className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4"
                  />
                  <span className="text-rose-800 font-bold">{t('report.possibleEmergencyLabel')}</span>
                </label>

                {isEmergency && (
                  <input
                    type="text"
                    value={emergencyConcern}
                    onChange={(e) => setEmergencyConcern(e.target.value)}
                    placeholder={t('report.emergencyConcernPlaceholder')}
                    className="w-full p-2.5 bg-white border border-rose-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                )}
              </div>
            </div>
          )}

          {/* STEP 4: EVIDENCE */}
          {guidedStep === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
                  {t('wizard.step4Title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('wizard.step4Subtitle')}
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-lg p-7 text-center bg-slate-50/50 hover:bg-slate-50 transition">
                <Camera className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-800">{t('report.uploadBoxPrompt')}</p>
                <p className="text-[11px] text-slate-500 mt-1">{t('report.uploadBoxLimits')}</p>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4"
                  onChange={handleFileChange}
                  className="mt-3 text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-[#0c2340] file:text-white hover:file:bg-[#1a365d] cursor-pointer"
                />
              </div>

              {evidencePreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {evidencePreviews.map((prev, idx) => (
                    <div key={idx} className="relative rounded-lg overflow-hidden border border-slate-300 p-1.5 bg-slate-50 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-800">{prev.name}</span>
                      <button
                        type="button"
                        onClick={() => removeEvidence(idx)}
                        className="text-rose-600 font-bold hover:text-rose-800 p-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 5: REVIEW & CONFIRM */}
          {guidedStep === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-[#0c2340] uppercase tracking-wide">
                  {t('wizard.step5Title')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('wizard.step5Subtitle')}
                </p>
              </div>
              
              {/* Nearby duplicate notice in step 5 if available */}
              {nearbyIssues.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg text-xs text-amber-950 flex items-center justify-between">
                  <span>{t('community.title')}: {nearbyIssues.length}</span>
                  <button
                    type="button"
                    onClick={() => handleSupportNearby(nearbyIssues[0].id)}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded font-bold"
                  >
                    {t('community.supportThisIssue')}
                  </button>
                </div>
              )}

              <div className="bg-slate-50 p-5 rounded-lg border border-slate-300 text-xs space-y-2.5">
                <div className="flex justify-between pb-1 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewDept')}:</span>
                  <span className="font-bold text-[#0c2340] capitalize">{labelFor('department', department)}</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewCategory')}:</span>
                  <span className="font-bold text-slate-900">{labelFor('category', category, department)}</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewTitle')}:</span>
                  <span className="font-semibold text-slate-900">{title || category}</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewDescription')}:</span>
                  <span className="text-slate-800 text-right max-w-xs">{description}</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewLocation')}:</span>
                  <span className="font-semibold text-slate-900">{selectedArea} ({address})</span>
                </div>
                <div className="flex justify-between pb-1 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewCoordinates')}:</span>
                  <span className="uppercase font-mono text-[#0c2340] font-bold bg-white px-1 py-0.5 rounded border border-slate-200 text-[10px]">
                    [{lat}, {lng}]
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-semibold">{t('wizard.reviewEvidence')}:</span>
                  <span className="font-bold text-slate-900">{evidenceFiles.length}</span>
                </div>
                {isEmergency && (
                  <p className="text-rose-800 font-bold pt-1 border-t border-rose-200">
                    ⚠️ {t('wizard.emergencyYes')}: "{emergencyConcern}"
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Wizard Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            {guidedStep > 1 ? (
              <button
                type="button"
                onClick={() => setGuidedStep(guidedStep - 1)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 border border-slate-300 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> {t('wizard.previousStep')}
              </button>
            ) : <div />}

            {guidedStep < 5 ? (
              <button
                type="button"
                onClick={() => setGuidedStep(guidedStep + 1)}
                className="px-5 py-2.5 bg-[#0c2340] hover:bg-[#1a365d] text-white font-bold rounded-lg text-xs flex items-center gap-1.5 transition shadow-xs"
              >
                {t('wizard.nextStep')} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-[#c5221f] hover:bg-[#a51b18] text-white font-bold rounded-lg text-xs uppercase tracking-wider shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? t('common.submitting') : t('wizard.confirmAndSubmit')}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
