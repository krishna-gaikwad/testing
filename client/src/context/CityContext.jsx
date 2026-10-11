import React, { createContext, useContext, useEffect, useState } from 'react';

const CityContext = createContext(null);

export const defaultCityConfig = {
  cityName: "Pune",
  state: "Maharashtra",
  country: "India",
  authorityName: "Pune Municipal Corporation (PMC)",
  timezone: "Asia/Kolkata",
  map: {
    center: { lat: 18.5204, lng: 73.8567 },
    defaultZoom: 12,
    minZoom: 10,
    maxZoom: 18
  },
  bounds: {
    south: 18.40,
    west: 73.72,
    north: 18.66,
    east: 74.02
  },
  areas: [
    { name: "Shivajinagar", lat: 18.5308, lng: 73.8475, note: "approximate demo centroid" },
    { name: "Kothrud", lat: 18.5074, lng: 73.8077, note: "approximate demo centroid" },
    { name: "Hadapsar", lat: 18.5089, lng: 73.9260, note: "approximate demo centroid" },
    { name: "Katraj", lat: 18.4575, lng: 73.8677, note: "approximate demo centroid" },
    { name: "Viman Nagar", lat: 18.5679, lng: 73.9143, note: "approximate demo centroid" },
    { name: "Baner", lat: 18.5590, lng: 73.7868, note: "approximate demo centroid" },
    { name: "Swargate", lat: 18.5018, lng: 73.8636, note: "approximate demo centroid" },
    { name: "Aundh", lat: 18.5580, lng: 73.8075, note: "approximate demo centroid" },
    { name: "Kasba Peth", lat: 18.5195, lng: 73.8553, note: "approximate demo centroid" },
    { name: "Wakad", lat: 18.5975, lng: 73.7600, note: "approximate demo centroid" }
  ],
  emergencyNote: "If someone is in immediate danger, call 112."
};

/**
 * Utility to format dates in configured timezone
 */
export function formatCityDate(dateInput, timezone = 'Asia/Kolkata', options = {}) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const defaultOpts = {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options
  };

  return new Intl.DateTimeFormat('en-IN', defaultOpts).format(date);
}

export function CityProvider({ children }) {
  const [city, setCity] = useState(defaultCityConfig);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/config/city')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setCity(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Could not load remote city config, using fallback:', err.message);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const formatDate = (dateInput, options) => {
    return formatCityDate(dateInput, city.timezone || 'Asia/Kolkata', options);
  };

  return (
    <CityContext.Provider value={{ city, loading, error, formatDate }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCity() {
  const context = useContext(CityContext);
  if (!context) {
    throw new Error('useCity must be used within a CityProvider');
  }
  return context;
}
