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

export interface ForecastPoint {
  timestamp: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
}

export interface GasReadings {
  no2: number | null;
  o3: number | null;
  so2: number | null;
  co: number | null;
  timestamp: string | null;
}

export interface WeatherDrivers {
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  visibilityKm: number | null;
  pressureHpa: number | null;
  trapRisk: 'low' | 'moderate' | 'high';
  trapReason: string;
}

export interface ProactiveInsights {
  generatedAt: string;
  source: string;
  forecast: ForecastPoint[];
  gases: GasReadings;
  weather: WeatherDrivers;
}

interface OpenMeteoAirQualityPayload {
  error?: boolean;
  reason?: string;
  hourly?: {
    time?: string[];
    us_aqi?: Array<number | null>;
    pm2_5?: Array<number | null>;
    pm10?: Array<number | null>;
    nitrogen_dioxide?: Array<number | null>;
    ozone?: Array<number | null>;
    sulphur_dioxide?: Array<number | null>;
    carbon_monoxide?: Array<number | null>;
  };
}

interface OpenMeteoWeatherPayload {
  error?: boolean;
  reason?: string;
  current?: {
    time?: string;
    temperature_2m?: number | null;
    relative_humidity_2m?: number | null;
    wind_speed_10m?: number | null;
    visibility?: number | null;
    surface_pressure?: number | null;
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

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function roundOneDecimal(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 10) / 10;
}

function computeTrapRisk(params: {
  windSpeedKmh: number | null;
  humidityPct: number | null;
  visibilityKm: number | null;
  pressureHpa: number | null;
}): { trapRisk: 'low' | 'moderate' | 'high'; trapReason: string } {
  const { windSpeedKmh, humidityPct, visibilityKm, pressureHpa } = params;

  const isCalm = windSpeedKmh !== null && windSpeedKmh < 7;
  const isVeryCalm = windSpeedKmh !== null && windSpeedKmh < 5;
  const isLightWind = windSpeedKmh !== null && windSpeedKmh < 14;
  const isHumid = humidityPct !== null && humidityPct >= 70;
  const isLowVis = visibilityKm !== null && visibilityKm < 5;
  const isVeryLowVis = visibilityKm !== null && visibilityKm < 3;
  const isHighPressure = pressureHpa !== null && pressureHpa >= 1018;

  if (
    isVeryCalm ||
    (isCalm && (isHumid || isLowVis || isHighPressure)) ||
    (isVeryLowVis && isLightWind)
  ) {
    const drivers: string[] = [];
    if (windSpeedKmh !== null) drivers.push(`calm winds (${windSpeedKmh.toFixed(1)} km/h)`);
    if (isHumid && humidityPct !== null) drivers.push(`high humidity (${Math.round(humidityPct)}%)`);
    if (isLowVis && visibilityKm !== null) drivers.push(`low visibility (${visibilityKm.toFixed(1)} km)`);
    if (isHighPressure && pressureHpa !== null) drivers.push(`high pressure (${Math.round(pressureHpa)} hPa)`);
    const detail = drivers.length > 0 ? drivers.join(' and ') : 'weak atmospheric mixing';
    return {
      trapRisk: 'high',
      trapReason: `Stagnant boundary layer with ${detail} traps surface pollutants.`,
    };
  }

  if (isLightWind || isHumid || (visibilityKm !== null && visibilityKm < 8)) {
    const drivers: string[] = [];
    if (isLightWind && windSpeedKmh !== null) drivers.push(`light winds (${windSpeedKmh.toFixed(1)} km/h)`);
    if (isHumid && humidityPct !== null) drivers.push(`elevated humidity (${Math.round(humidityPct)}%)`);
    if (visibilityKm !== null && visibilityKm < 8) drivers.push(`hazy visibility (${visibilityKm.toFixed(1)} km)`);
    const detail = drivers.length > 0 ? drivers.join(' and ') : 'moderate atmospheric stability';
    return {
      trapRisk: 'moderate',
      trapReason: `Limited dispersion due to ${detail} may slow smog clearance.`,
    };
  }

  const windNote =
    windSpeedKmh !== null ? `steady winds (${windSpeedKmh.toFixed(1)} km/h)` : 'active air movement';
  const visNote =
    visibilityKm !== null ? ` and clear visibility (${visibilityKm.toFixed(1)} km)` : '';
  return {
    trapRisk: 'low',
    trapReason: `Favorable dispersion with ${windNote}${visNote} keeps surface buildup low.`,
  };
}

export async function fetchProactiveInsights(
  latitude: number,
  longitude: number,
): Promise<ProactiveInsights> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Invalid coordinates for proactive insights request.');
  }

  const aqUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  aqUrl.searchParams.set('latitude', String(latitude));
  aqUrl.searchParams.set('longitude', String(longitude));
  aqUrl.searchParams.set(
    'hourly',
    'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide',
  );
  aqUrl.searchParams.set('forecast_days', '3');
  aqUrl.searchParams.set('timezone', 'GMT');

  const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
  weatherUrl.searchParams.set('latitude', String(latitude));
  weatherUrl.searchParams.set('longitude', String(longitude));
  weatherUrl.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,wind_speed_10m,visibility,surface_pressure',
  );
  weatherUrl.searchParams.set('timezone', 'GMT');

  const [aqRes, weatherRes] = await Promise.all([
    fetch(aqUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    }),
    fetch(weatherUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    }),
  ]);

  if (!aqRes.ok) {
    throw new Error(`Open-Meteo air quality forecast failed (${aqRes.status}).`);
  }
  if (!weatherRes.ok) {
    throw new Error(`Open-Meteo weather request failed (${weatherRes.status}).`);
  }

  const [aqPayload, weatherPayload] = (await Promise.all([
    aqRes.json(),
    weatherRes.json(),
  ])) as [OpenMeteoAirQualityPayload, OpenMeteoWeatherPayload];

  if (aqPayload.error) {
    throw new Error(aqPayload.reason || 'Open-Meteo air quality forecast returned an error.');
  }
  if (weatherPayload.error) {
    throw new Error(weatherPayload.reason || 'Open-Meteo weather API returned an error.');
  }

  const hourly = aqPayload.hourly ?? {};
  const times = hourly.time ?? [];
  const aqiValues = hourly.us_aqi ?? [];
  const pm25Values = hourly.pm2_5 ?? [];
  const pm10Values = hourly.pm10 ?? [];
  const no2Values = hourly.nitrogen_dioxide ?? [];
  const o3Values = hourly.ozone ?? [];
  const so2Values = hourly.sulphur_dioxide ?? [];
  const coValues = hourly.carbon_monoxide ?? [];

  const nowMs = Date.now();
  const forecastMap = new Map<string, ForecastPoint>();
  const gases: GasReadings = {
    no2: null,
    o3: null,
    so2: null,
    co: null,
    timestamp: null,
  };

  for (let i = 0; i < times.length; i += 1) {
    const iso = parseGmtHourToIso(times[i]);
    if (!iso) continue;
    const ms = Date.parse(iso);

    if (ms <= nowMs) {
      const no2 = finiteNonNegative(no2Values[i]);
      const o3 = finiteNonNegative(o3Values[i]);
      const so2 = finiteNonNegative(so2Values[i]);
      const co = finiteNonNegative(coValues[i]);
      if (no2 !== null) gases.no2 = no2;
      if (o3 !== null) gases.o3 = o3;
      if (so2 !== null) gases.so2 = so2;
      if (co !== null) gases.co = co;
      if (no2 !== null || o3 !== null || so2 !== null || co !== null) {
        gases.timestamp = iso;
      }
      continue;
    }

    const aqi = finiteNonNegative(aqiValues[i]);
    const pm25 = finiteNonNegative(pm25Values[i]);
    const pm10 = finiteNonNegative(pm10Values[i]);
    if (aqi === null && pm25 === null && pm10 === null) continue;

    forecastMap.set(iso, {
      timestamp: iso,
      aqi,
      pm25,
      pm10,
    });
  }

  const forecast = Array.from(forecastMap.values())
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(0, 72);

  const current = weatherPayload.current ?? {};
  const temperatureC = roundOneDecimal(finiteNumber(current.temperature_2m));
  const humidityPct = roundOneDecimal(finiteNonNegative(current.relative_humidity_2m));
  const windSpeedKmh = roundOneDecimal(finiteNonNegative(current.wind_speed_10m));
  const visibilityMeters = finiteNonNegative(current.visibility);
  const visibilityKm =
    visibilityMeters !== null ? roundOneDecimal(visibilityMeters / 1000) : null;
  const pressureHpa = roundOneDecimal(finiteNonNegative(current.surface_pressure));

  const { trapRisk, trapReason } = computeTrapRisk({
    windSpeedKmh,
    humidityPct,
    visibilityKm,
    pressureHpa,
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    source: OPEN_METEO_SOURCE,
    forecast,
    gases,
    weather: {
      temperatureC,
      humidityPct,
      windSpeedKmh,
      visibilityKm,
      pressureHpa,
      trapRisk,
      trapReason,
    },
  };
}
