/**
 * Pune Municipal Service Area Configuration
 * Official Demo Parameters
 */

const cityConfig = {
  name: 'Pune',
  center: { lat: 18.5204, lng: 73.8567 },
  bounds: {
    south: 18.40,
    west: 73.72,
    north: 18.66,
    east: 74.02
  },
  areas: [
    { name: 'Kothrud', lat: 18.5074, lng: 73.8077 },
    { name: 'Hadapsar', lat: 18.5089, lng: 73.9259 },
    { name: 'Shivajinagar', lat: 18.5314, lng: 73.8446 },
    { name: 'Baner', lat: 18.5590, lng: 73.7868 },
    { name: 'Viman Nagar', lat: 18.5679, lng: 73.9143 },
    { name: 'Kharadi', lat: 18.5516, lng: 73.9348 },
    { name: 'Swargate', lat: 18.5018, lng: 73.8636 },
    { name: 'Katraj', lat: 18.4575, lng: 73.8677 },
    { name: 'Aundh', lat: 18.5626, lng: 73.8087 },
    { name: 'Wakad', lat: 18.5987, lng: 73.7688 }
  ]
};

/**
 * Checks whether coordinates lie strictly within Pune service area bounds.
 */
function isInsideServiceArea(lat, lng) {
  const numericLat = parseFloat(lat);
  const numericLng = parseFloat(lng);
  if (isNaN(numericLat) || isNaN(numericLng)) return false;

  const { south, north, west, east } = cityConfig.bounds;
  return (
    numericLat >= south &&
    numericLat <= north &&
    numericLng >= west &&
    numericLng <= east
  );
}

/**
 * Alias for backward compatibility
 */
function isInsideBounds(lat, lng) {
  return isInsideServiceArea(lat, lng);
}

/**
 * Great-circle distance between two GPS coordinates in kilometers.
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Finds the nearest Pune locality centroid to the given coordinates.
 */
function nearestArea(lat, lng) {
  const numericLat = parseFloat(lat);
  const numericLng = parseFloat(lng);
  if (isNaN(numericLat) || isNaN(numericLng)) return null;

  let closest = null;
  let minDistance = Infinity;

  for (const area of cityConfig.areas) {
    const dist = haversineDistanceKm(numericLat, numericLng, area.lat, area.lng);
    if (dist < minDistance) {
      minDistance = dist;
      closest = { ...area, distanceKm: Math.round(dist * 100) / 100 };
    }
  }

  return closest;
}

module.exports = {
  cityConfig,
  isInsideServiceArea,
  isInsideBounds,
  nearestArea,
  haversineDistanceKm
};
