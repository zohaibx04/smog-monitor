export type Area = { id: number; docId?: string; name: string; latitude: number; longitude: number; active: boolean; customLocation: boolean; isStarter?: boolean; lastError: string | null }
export type Reading = { id: number; areaId: number; aqi: number | null; pm25: number | null; pm10: number | null; source: string; providerLocation?: string | null; timestamp: string }
export type AreaData = { area: Area; reading: Reading | null; stale: boolean }
export type Preference = { id: number; docId?: string; areaId: number; aqiThreshold: number; enabled: boolean; systemRule: boolean; emailNotify?: boolean }
export type Alert = { id: number; docId?: string; areaId: number; message: string; status: string; createdAt: string; emailSent?: boolean }
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
