const express = require('express');
const router = express.Router();
const { cityConfig, isInsideBounds, nearestArea } = require('../config/city.config');

// In-memory cache with simple TTL (1 hour)
const geoCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

// Rate-limiting queue: Nominatim requires at most 1 request per second
let lastRequestTimestamp = 0;
async function throttleNominatim() {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTimestamp;
  if (timeSinceLast < 1050) {
    const waitMs = 1050 - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestTimestamp = Date.now();
}

const NOMINATIM_USER_AGENT = 'NagarSetuDemo/1.0 (Pune Municipal Corporation Demo; contact@nagarsetu.pune.demo)';

/**
 * GET /api/geo/search?q=&lang=
 * Searches for places within Pune bounding box using Nominatim
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const lang = req.query.lang === 'mr' ? 'mr' : 'en';
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    }

    const cacheKey = `search:${lang}:${q.toLowerCase()}`;
    const cached = geoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.status(200).json({ results: cached.data, cached: true });
    }

    await throttleNominatim();

    // Bounded viewbox for Pune: west,north,east,south
    const { west, north, east, south } = cityConfig.bounds;
    const viewboxStr = `${west},${north},${east},${south}`;
    const acceptLang = lang === 'mr' ? 'mr,hi;q=0.9,en;q=0.8' : 'en-IN,en;q=0.9';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      q
    )}&format=json&addressdetails=1&countrycodes=in&viewbox=${viewboxStr}&bounded=1&limit=6&accept-language=${encodeURIComponent(
      acceptLang
    )}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(url, {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        'Accept-Language': acceptLang,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim error HTTP ${response.status}`);
    }

    const rawResults = await response.json();
    const sanitized = (rawResults || [])
      .map((item) => {
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        return {
          displayName: item.display_name,
          lat,
          lng,
          insidePune: isInsideBounds(lat, lng),
          nearestArea: nearestArea(lat, lng)?.name
        };
      })
      .filter((item) => item.insidePune);

    geoCache.set(cacheKey, { timestamp: Date.now(), data: sanitized });

    res.status(200).json({ results: sanitized });
  } catch (error) {
    console.warn('Geocoding search failed, providing fallback:', error.message);
    res.status(503).json({
      error: 'Geocoding service currently unavailable. Please enter address or landmark manually.',
      errorCode: 'NETWORK_ERROR',
      fallback: true
    });
  }
});

/**
 * GET /api/geo/reverse?lat=&lng=&lang=
 * Reverse-geocodes coordinates within Pune to an address
 */
router.get('/reverse', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const lang = req.query.lang === 'mr' ? 'mr' : 'en';

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid numeric lat and lng required.' });
    }

    const inside = isInsideBounds(lat, lng);
    const nearest = nearestArea(lat, lng);

    if (!inside) {
      return res.status(400).json({
        error: 'Location is outside Pune municipal bounds.',
        errorCode: 'OUTSIDE_PUNE_BOUNDS',
        outsideBounds: true,
        bounds: cityConfig.bounds
      });
    }

    const cacheKey = `rev:${lang}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const cached = geoCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.status(200).json({ ...cached.data, cached: true });
    }

    await throttleNominatim();

    const acceptLang = lang === 'mr' ? 'mr,hi;q=0.9,en;q=0.8' : 'en-IN,en;q=0.9';
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=${encodeURIComponent(
      acceptLang
    )}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(url, {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        'Accept-Language': acceptLang,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Nominatim error HTTP ${response.status}`);
    }

    const data = await response.json();
    const fallbackName = lang === 'mr'
      ? `${nearest?.name || 'पुणे'}, महाराष्ट्र`
      : `${nearest?.name || 'Pune'}, Maharashtra`;

    const result = {
      displayName: data.display_name || fallbackName,
      address: data.address || {},
      area: nearest?.name || (lang === 'mr' ? 'पुणे' : 'Pune'),
      lat,
      lng,
      insidePune: true
    };

    geoCache.set(cacheKey, { timestamp: Date.now(), data: result });
    res.status(200).json(result);
  } catch (error) {
    console.warn('Reverse geocoding failed, using area fallback:', error.message);
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const lang = req.query.lang === 'mr' ? 'mr' : 'en';
    const nearest = !isNaN(lat) && !isNaN(lng) ? nearestArea(lat, lng) : null;

    res.status(200).json({
      displayName: lang === 'mr'
        ? (nearest ? `${nearest.name} जवळ, पुणे` : 'पुणे, महाराष्ट्र')
        : (nearest ? `Near ${nearest.name}, Pune` : 'Pune, Maharashtra'),
      area: nearest?.name || (lang === 'mr' ? 'पुणे' : 'Pune'),
      lat,
      lng,
      fallback: true
    });
  }
});

module.exports = router;
