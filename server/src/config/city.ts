export interface PuneArea {
  name: string;
  lat: number;
  lng: number;
  distanceKm?: number;
}

export interface CityConfig {
  name: string;
  center: { lat: number; lng: number };
  bounds: { south: number; west: number; north: number; east: number };
  areas: PuneArea[];
}

export const cityConfig: CityConfig = {
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

export function isInsideServiceArea(lat: number | string, lng: number | string): boolean {
  const numericLat = typeof lat === 'string' ? parseFloat(lat) : lat;
  const numericLng = typeof lng === 'string' ? parseFloat(lng) : lng;
  if (isNaN(numericLat) || isNaN(numericLng)) return false;

  const { south, north, west, east } = cityConfig.bounds;
  return (
    numericLat >= south &&
    numericLat <= north &&
    numericLng >= west &&
    numericLng <= east
  );
}

export function isInsideBounds(lat: number | string, lng: number | string): boolean {
  return isInsideServiceArea(lat, lng);
}

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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

export function nearestArea(lat: number | string, lng: number | string): PuneArea | null {
  const numericLat = typeof lat === 'string' ? parseFloat(lat) : lat;
  const numericLng = typeof lng === 'string' ? parseFloat(lng) : lng;
  if (isNaN(numericLat) || isNaN(numericLng)) return null;

  let closest: PuneArea | null = null;
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
