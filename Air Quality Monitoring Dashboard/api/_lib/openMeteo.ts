export const OPEN_METEO_SOURCE = 'Open-Meteo / CAMS model estimate';

export interface AirQualityReading {
  timestamp: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  source: string;
}

export interface AirQualityFetchResult {
  latest: AirQualityReading | null;
  readings: AirQualityReading[];
}

export interface GeocodingPlace {
  id: number;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface OpenMeteoAirQualityPayload {
  error?: boolean;
  reason?: string;
  hourly?: {
    time?: string[];
    us_aqi?: Array<number | null>;
    pm2_5?: Array<number | null>;
    pm10?: Array<number | null>;
  };
}

interface OpenMeteoGeocodingPayload {
  error?: boolean;
  reason?: string;
  results?: Array<{
    id?: number;
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }>;
}

function finiteNonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function parseGmtHourToIso(rawTime: unknown): string | null {
  if (typeof rawTime !== 'string' || !rawTime.trim()) return null;
  const trimmed = rawTime.trim();
  const normalized = trimmed.endsWith('Z')
    ? trimmed
    : trimmed.length === 16
      ? `${trimmed}:00.000Z`
      : `${trimmed}Z`;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function readingDocId(timestampIso: string): string {
  return timestampIso.replace(/[:.]/g, '-');
}

export async function fetchAirQuality(
  lat: number,
  lon: number,
  pastDays = 7,
): Promise<AirQualityFetchResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Invalid coordinates for Open-Meteo air quality request.');
  }

  const clampedDays = Math.max(1, Math.min(92, Math.ceil(pastDays)));
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('hourly', 'us_aqi,pm2_5,pm10');
  url.searchParams.set('past_days', String(clampedDays));
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'GMT');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo air quality request failed (${response.status}).`);
  }

  const payload = (await response.json()) as OpenMeteoAirQualityPayload;
  if (payload.error) {
    throw new Error(payload.reason || 'Open-Meteo returned an error response.');
  }

  const times = payload.hourly?.time ?? [];
  const aqiValues = payload.hourly?.us_aqi ?? [];
  const pm25Values = payload.hourly?.pm2_5 ?? [];
  const pm10Values = payload.hourly?.pm10 ?? [];
  const nowMs = Date.now();

  const deduped = new Map<string, AirQualityReading>();
  for (let i = 0; i < times.length; i += 1) {
    const iso = parseGmtHourToIso(times[i]);
    if (!iso) continue;
    if (Date.parse(iso) > nowMs) continue;

    const aqi = finiteNonNegative(aqiValues[i]);
    const pm25 = finiteNonNegative(pm25Values[i]);
    const pm10 = finiteNonNegative(pm10Values[i]);
    if (aqi === null && pm25 === null && pm10 === null) continue;

    deduped.set(iso, {
      timestamp: iso,
      aqi,
      pm25,
      pm10,
      source: OPEN_METEO_SOURCE,
    });
  }

  const readings = Array.from(deduped.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;

  return { latest, readings };
}

export async function searchLocations(
  q: string,
  country?: string,
): Promise<GeocodingPlace[]> {
  const query = q.trim();
  if (query.length < 2) {
    return [];
  }

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'en');

  const countryCode = country?.trim().toUpperCase();
  if (countryCode && /^[A-Z]{2}$/.test(countryCode)) {
    url.searchParams.set('countryCode', countryCode);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo geocoding request failed (${response.status}).`);
  }

  const payload = (await response.json()) as OpenMeteoGeocodingPayload;
  if (payload.error) {
    throw new Error(payload.reason || 'Location search is unavailable.');
  }

  const places: GeocodingPlace[] = [];
  for (const item of payload.results ?? []) {
    if (
      typeof item.id !== 'number' ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      typeof item.latitude !== 'number' ||
      typeof item.longitude !== 'number'
    ) {
      continue;
    }
    places.push({
      id: item.id,
      name: item.name.trim(),
      region: typeof item.admin1 === 'string' ? item.admin1.trim() : '',
      country: typeof item.country === 'string' ? item.country.trim() : '',
      latitude: item.latitude,
      longitude: item.longitude,
    });
  }

  return places;
}
