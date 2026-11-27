export type Area = { id: number; docId?: string; name: string; latitude: number; longitude: number; active: boolean; customLocation: boolean; isStarter?: boolean; lastError: string | null }
export type Reading = { id: number; areaId: number; aqi: number | null; pm25: number | null; pm10: number | null; source: string; providerLocation?: string | null; timestamp: string }
export type AreaData = { area: Area; reading: Reading | null; stale: boolean }
export type Preference = { id: number; docId?: string; areaId: number; aqiThreshold: number; enabled: boolean; systemRule: boolean; emailNotify?: boolean }
export type Alert = { id: number; docId?: string; areaId: number; message: string; status: string; createdAt: string; emailSent?: boolean }
export type HealthProfile = 'general' | 'respiratory' | 'sensitive' | 'athlete'
export type ForecastPoint = { timestamp: string; aqi: number | null; pm25: number | null; pm10: number | null }
export type GasReadings = { no2: number | null; o3: number | null; so2: number | null; co: number | null; timestamp: string | null }
export type WeatherDrivers = {
  temperatureC: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  visibilityKm: number | null
  pressureHpa: number | null
  trapRisk: 'low' | 'moderate' | 'high'
  trapReason: string
}
export type ProactiveInsights = {
  generatedAt?: string
  source: string
  forecast: ForecastPoint[]
  gases: GasReadings
  weather: WeatherDrivers
}

function finiteVal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function anyFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function computeClientTrapRisk(params: {
  windSpeedKmh: number | null
  humidityPct: number | null
  visibilityKm: number | null
  pressureHpa: number | null
}): { trapRisk: 'low' | 'moderate' | 'high'; trapReason: string } {
  const { windSpeedKmh, humidityPct, visibilityKm, pressureHpa } = params
  const isCalm = windSpeedKmh !== null && windSpeedKmh < 7
  const isVeryCalm = windSpeedKmh !== null && windSpeedKmh < 5
  const isLightWind = windSpeedKmh !== null && windSpeedKmh < 14
  const isHumid = humidityPct !== null && humidityPct >= 70
  const isLowVis = visibilityKm !== null && visibilityKm < 5
  const isVeryLowVis = visibilityKm !== null && visibilityKm < 3
  const isHighPressure = pressureHpa !== null && pressureHpa >= 1018

  if (isVeryCalm || (isCalm && (isHumid || isLowVis || isHighPressure)) || (isVeryLowVis && isLightWind)) {
    const drivers: string[] = []
    if (windSpeedKmh !== null) drivers.push(`calm winds (${windSpeedKmh.toFixed(1)} km/h)`)
    if (isHumid && humidityPct !== null) drivers.push(`high humidity (${Math.round(humidityPct)}%)`)
    if (isLowVis && visibilityKm !== null) drivers.push(`low visibility (${visibilityKm.toFixed(1)} km)`)
    if (isHighPressure && pressureHpa !== null) drivers.push(`high pressure (${Math.round(pressureHpa)} hPa)`)
    return {
      trapRisk: 'high',
      trapReason: `Stagnant boundary layer with ${drivers.join(' and ') || 'weak atmospheric mixing'} traps surface pollutants.`,
    }
  }

  if (isLightWind || isHumid || (visibilityKm !== null && visibilityKm < 8)) {
    const drivers: string[] = []
    if (isLightWind && windSpeedKmh !== null) drivers.push(`light winds (${windSpeedKmh.toFixed(1)} km/h)`)
    if (isHumid && humidityPct !== null) drivers.push(`elevated humidity (${Math.round(humidityPct)}%)`)
    if (visibilityKm !== null && visibilityKm < 8) drivers.push(`hazy visibility (${visibilityKm.toFixed(1)} km)`)
    return {
      trapRisk: 'moderate',
      trapReason: `Limited dispersion due to ${drivers.join(' and ') || 'moderate atmospheric stability'} may slow smog clearance.`,
    }
  }

  const windNote = windSpeedKmh !== null ? `steady winds (${windSpeedKmh.toFixed(1)} km/h)` : 'active air movement'
  const visNote = visibilityKm !== null ? ` and clear visibility (${visibilityKm.toFixed(1)} km)` : ''
  return {
    trapRisk: 'low',
    trapReason: `Favorable dispersion with ${windNote}${visNote} keeps surface buildup low.`,
  }
}

export async function fetchProactiveInsights(
  cityId: string,
  latitude: number,
  longitude: number,
  idToken?: string | null,
): Promise<ProactiveInsights> {
  const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude) })
  let authFailure: Error | null = null
  try {
    const apiRes = await fetch(`/api/cities/${encodeURIComponent(cityId)}/forecast?${params}`, {
      headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
    })
    if (apiRes.ok) {
      const payload = (await apiRes.json()) as ProactiveInsights
      if (payload && Array.isArray(payload.forecast)) return payload
    } else if (apiRes.status === 401 || apiRes.status === 403) {
      const detail = await apiRes.json().catch(() => null)
      authFailure = new Error(detail?.message || 'Sign in to access live forecast and weather insights')
    }
  } catch {
    // Fall through to direct public Open-Meteo browser fetch when local API route is unavailable
  }
  if (authFailure) throw authFailure

  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&forecast_days=3&timezone=GMT`
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,visibility,surface_pressure&timezone=GMT`

  const [aqRes, wxRes] = await Promise.all([fetch(aqUrl), fetch(wxUrl)])
  if (!aqRes.ok) throw new Error(`Forecast request failed (${aqRes.status})`)
  if (!wxRes.ok) throw new Error(`Weather request failed (${wxRes.status})`)

  const [aqJson, wxJson] = await Promise.all([aqRes.json(), wxRes.json()])
  const hourly = aqJson?.hourly ?? {}
  const times: string[] = Array.isArray(hourly.time) ? hourly.time : []
  const nowMs = Date.now()
  const forecast: ForecastPoint[] = []
  const gases: GasReadings = { no2: null, o3: null, so2: null, co: null, timestamp: null }

  for (let i = 0; i < times.length; i += 1) {
    const iso = times[i].endsWith('Z') ? times[i] : `${times[i]}:00Z`
    const parsed = Date.parse(iso.length === 17 ? `${times[i]}:00Z` : iso)
    const timestamp = Number.isNaN(parsed) ? times[i] : new Date(parsed).toISOString()
    const ms = Date.parse(timestamp)
    if (Number.isNaN(ms)) continue

    if (ms <= nowMs) {
      const no2 = finiteVal(hourly.nitrogen_dioxide?.[i])
      const o3 = finiteVal(hourly.ozone?.[i])
      const so2 = finiteVal(hourly.sulphur_dioxide?.[i])
      const co = finiteVal(hourly.carbon_monoxide?.[i])
      if (no2 !== null) gases.no2 = no2
      if (o3 !== null) gases.o3 = o3
      if (so2 !== null) gases.so2 = so2
      if (co !== null) gases.co = co
      if (no2 !== null || o3 !== null || so2 !== null || co !== null) gases.timestamp = timestamp
      continue
    }

    if (forecast.length < 72) {
      const aqi = finiteVal(hourly.us_aqi?.[i])
      const pm25 = finiteVal(hourly.pm2_5?.[i])
      const pm10 = finiteVal(hourly.pm10?.[i])
      if (aqi !== null || pm25 !== null || pm10 !== null) {
        forecast.push({ timestamp, aqi, pm25, pm10 })
      }
    }
  }

  const cur = wxJson?.current ?? {}
  const temperatureC = anyFinite(cur.temperature_2m)
  const humidityPct = finiteVal(cur.relative_humidity_2m)
  const windSpeedKmh = finiteVal(cur.wind_speed_10m)
  const rawVis = finiteVal(cur.visibility)
  const visibilityKm = rawVis !== null ? Math.round((rawVis / 1000) * 10) / 10 : null
  const pressureHpa = finiteVal(cur.surface_pressure)
  const trap = computeClientTrapRisk({ windSpeedKmh, humidityPct, visibilityKm, pressureHpa })

  return {
    generatedAt: new Date().toISOString(),
    source: 'Open-Meteo / CAMS model estimate',
    forecast,
    gases,
    weather: {
      temperatureC,
      humidityPct,
      windSpeedKmh,
      visibilityKm,
      pressureHpa,
      ...trap,
    },
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Admin-Token': token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.message || `Request failed (${response.status}). Check that the Java backend is running.`)
  }
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}
export function category(aqi: number | null | undefined) {
  if (aqi == null) return { label: 'Unavailable', style: 'unknown' }
  if (aqi <= 50) return { label: 'Good', style: 'good' }
  if (aqi <= 100) return { label: 'Moderate', style: 'moderate' }
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', style: 'sensitive' }
  if (aqi <= 200) return { label: 'Unhealthy', style: 'unhealthy' }
  if (aqi <= 300) return { label: 'Very unhealthy', style: 'very-unhealthy' }
  return { label: 'Hazardous', style: 'hazardous' }
}
