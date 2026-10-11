import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPin, 
  Filter, 
  AlertTriangle, 
  RotateCcw, 
  CheckCircle2, 
  Users, 
  ShieldAlert, 
  Info,
  Calendar,
  Layers
} from 'lucide-react';

import { useCity } from '../context/CityContext';
import { useLanguage } from '../context/LanguageContext';

// Controller to smoothly fit map view to Pune bounds
function MapBoundsController({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
    }
  }, [bounds, map]);
  return null;
}

// Marker icon generator for different categories and hazard flags
function createCategoryMarkerIcon(issue) {
  let color = '#0c2340'; // Default navy
  let ringColor = 'rgba(12, 35, 64, 0.3)';

  if (issue.department === 'roads') {
    color = '#e05626'; // Saffron orange
    ringColor = 'rgba(224, 86, 38, 0.4)';
  } else if (issue.department === 'waste') {
    color = '#138808'; // Green
    ringColor = 'rgba(19, 136, 8, 0.4)';
  } else if (issue.department === 'water') {
    color = '#0284c7'; // Blue
    ringColor = 'rgba(2, 132, 199, 0.4)';
  }

  // Highlight emergencies
  if (issue.isCriticalVerified) {
    color = '#b91c1c'; // Deep Red
    ringColor = 'rgba(185, 28, 28, 0.6)';
  } else if (issue.isPossibleEmergency) {
    color = '#d97706'; // Amber
    ringColor = 'rgba(217, 119, 6, 0.5)';
  }

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 0 4px ${ringColor}, 0 2px 4px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10]
  });
}

export default function PublicMap() {
  const { city } = useCity();
  const { t, labelFor, formatDate, formatNumber } = useLanguage();

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tileError, setTileError] = useState(false);

  // Filters
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedArea, setSelectedArea] = useState('all');

  // Fetch Public Issues List
  useEffect(() => {
    setLoading(true);
    fetch('/api/public/issues')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setIssues(data.issues || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load public map issues:', err);
        setLoading(false);
      });
  }, []);

  // Filter issues
  const filteredIssues = issues.filter((issue) => {
    if (selectedDepartment !== 'all' && issue.department !== selectedDepartment) {
      return false;
    }
    if (selectedPriority !== 'all' && issue.priority !== selectedPriority) {
      return false;
    }
    if (selectedStatus === 'emergency') {
      if (!issue.isPossibleEmergency) return false;
    } else if (selectedStatus === 'critical') {
      if (!issue.isCriticalVerified) return false;
    } else if (selectedStatus !== 'all' && issue.status !== selectedStatus) {
      return false;
    }
    if (selectedArea !== 'all' && issue.area !== selectedArea) {
      return false;
    }
    return true;
  });

  const center = [city.map.center.lat, city.map.center.lng];
  const maxBounds = [
    [city.bounds.south, city.bounds.west],
    [city.bounds.north, city.bounds.east]
  ];

  const resetFilters = () => {
    setSelectedDepartment('all');
    setSelectedPriority('all');
    setSelectedStatus('all');
    setSelectedArea('all');
  };

  return (
    <div className="space-y-4 my-2">
      {/* Compact Page Header Strip */}
      <div className="bg-white rounded-lg border border-slate-200 px-5 py-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
              {t('map.pageTitle')}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {t('map.pageSubtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md border border-slate-200 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              <span>{t('map.issuesFound', { count: formatNumber(filteredIssues.length) })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white p-4.5 rounded-xl border border-slate-300 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-[#0c2340]" />
            <span className="uppercase tracking-wider">{t('common.filter')}</span>
          </div>
          {(selectedDepartment !== 'all' || selectedPriority !== 'all' || selectedStatus !== 'all' || selectedArea !== 'all') && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-[#c5221f] hover:text-[#a51b18] font-bold flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('common.cancel')}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Department Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('map.filterDepartment')}</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0c2340] font-medium outline-none"
            >
              <option value="all">{t('common.all')}</option>
              <option value="roads">{labelFor('department', 'roads')}</option>
              <option value="waste">{labelFor('department', 'waste')}</option>
              <option value="water">{labelFor('department', 'water')}</option>
              <option value="others">{labelFor('department', 'others')}</option>
            </select>
          </div>

          {/* Locality / Area Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('map.filterWard')}</label>
            <select
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0c2340] font-medium outline-none"
            >
              <option value="all">{t('map.allWards')}</option>
              {city.areas?.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('map.filterStatus')}</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0c2340] font-medium outline-none"
            >
              <option value="all">{t('map.allStatuses')}</option>
              <option value="Submitted">{t('map.statusSubmitted')}</option>
              <option value="Accepted">{t('map.statusAccepted')}</option>
              <option value="In Progress">{t('map.statusInProgress')}</option>
              <option value="Resolved">{t('map.statusResolved')}</option>
              <option value="emergency">{t('map.filterEmergency')}</option>
              <option value="critical">{t('map.filterCritical')}</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">{t('map.filterPriority')}</label>
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#0c2340] font-medium outline-none"
            >
              <option value="all">{t('map.allPriorities')}</option>
              <option value="Normal">{labelFor('priority', 'Normal')}</option>
              <option value="High">{labelFor('priority', 'High')}</option>
              <option value="Critical">{labelFor('priority', 'Critical')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Map View Container */}
      <div className="bg-white p-2 rounded-xl border border-slate-300 shadow-sm h-[580px] relative overflow-hidden isolate z-0">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center z-10 text-xs font-bold text-[#0c2340] animate-pulse">
            {t('common.loading')}
          </div>
        )}

        {tileError && (
          <div className="absolute top-4 left-4 right-4 bg-amber-500/95 text-slate-950 p-2.5 rounded-lg shadow-lg z-20 text-xs text-center font-bold flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t('map.tileErrorNotice')}</span>
          </div>
        )}

        <MapContainer
          key={`${city.map.center.lat}-${city.map.center.lng}`}
          center={center}
          zoom={city.map.defaultZoom || 12}
          minZoom={city.map.minZoom || 10}
          maxZoom={city.map.maxZoom || 18}
          maxBounds={maxBounds}
          maxBoundsViscosity={1.0}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', borderRadius: '0.5rem' }}
        >
          <MapBoundsController bounds={maxBounds} />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            eventHandlers={{
              tileerror: () => setTileError(true),
              tileload: () => setTileError(false)
            }}
          />

          {/* Pune Demo Municipal Boundary Rectangle */}
          <Rectangle
            bounds={maxBounds}
            pathOptions={{ color: '#0c2340', weight: 1.5, fillOpacity: 0.03, dashArray: '5, 5' }}
          />

          {/* Render Filtered Issues */}
          {filteredIssues.map((issue) => {
            if (!issue.lat || !issue.lng) return null;
            return (
              <Marker
                key={issue.id}
                position={[issue.lat, issue.lng]}
                icon={createCategoryMarkerIcon(issue)}
              >
                <Popup className="custom-popup" minWidth={240}>
                  <div className="p-1 space-y-2 text-xs">
                    {/* Status Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        issue.isCriticalVerified
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : issue.isPossibleEmergency
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : issue.status === 'Resolved'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : issue.status === 'In Progress'
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-slate-100 text-slate-800 border border-slate-300'
                      }`}>
                        {labelFor('status', issue.status)}
                      </span>
                      <span className="font-bold text-slate-600 text-[10px] uppercase">
                        {labelFor('priority', issue.priority)}
                      </span>
                    </div>

                    {/* Category & Area */}
                    <div>
                      <h4 className="font-bold text-[#0c2340] text-sm leading-snug">
                        {labelFor('category', issue.category, issue.department)}
                      </h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{issue.area || 'Pune'}</span>
                        <span className="font-mono text-[10px]">[{issue.lat}, {issue.lng}]</span>
                      </p>
                    </div>

                    {/* Short Description */}
                    <p className="text-slate-700 text-xs bg-slate-50 p-2 rounded-md border border-slate-200">
                      {issue.description}
                    </p>

                    {/* Supporter Count & Updated Date */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                      <span className="flex items-center gap-1 font-bold text-emerald-700">
                        <Users className="w-3.5 h-3.5" />
                        <span>{t('community.supportCount', { count: formatNumber(issue.supportCount || 0) })}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatDate(issue.updatedAt)}
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Map Legend */}
      <div className="bg-white p-4 rounded-xl border border-slate-300 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="font-bold text-[#0c2340] uppercase tracking-wide">{t('map.legendTitle')}:</div>
        <div className="flex flex-wrap items-center gap-4 text-slate-700 font-medium">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-600 inline-block ring-1 ring-orange-300"></span> {t('map.legendRoads')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-600 inline-block ring-1 ring-emerald-300"></span> {t('map.legendWaste')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-cyan-600 inline-block ring-1 ring-cyan-300"></span> {t('map.legendWater')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-600 inline-block ring-1 ring-amber-300"></span> {t('map.legendEmergency')}</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-700 inline-block ring-1 ring-rose-400"></span> {t('map.legendCritical')}</span>
        </div>
      </div>
    </div>
  );
}
