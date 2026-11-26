import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import type { Alert, Area, AreaData, Preference, Reading } from '../api'
import { db } from './config'

export interface SystemAdvisory {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  active: boolean
  createdAt?: string
  expiresAt?: string | null
}

export interface FirebaseWorkspaceData {
  globalAreas: AreaData[]
  userAreas: AreaData[]
  alerts: Alert[]
  preferences: Preference[]
  advisories: SystemAdvisory[]
}

function toIso(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  if (value instanceof Date) return value.toISOString()
  return undefined
}

export function hashCityId(docId: string): number {
  let hash = 2166136261
  for (let i = 0; i < docId.length; i += 1) {
    hash ^= docId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 2_000_000_000) + 1
}

interface GlobalCityDoc {
  name?: string
  latitude?: number
  longitude?: number
  active?: boolean
  customLocation?: boolean
  isStarter?: boolean
  lastError?: string | null
  stale?: boolean
  numericId?: number
  latestReading?: {
    aqi?: number | null
    pm25?: number | null
    pm10?: number | null
    source?: string
    providerLocation?: string | null
    timestamp?: string
  } | null
}

function mapCityDoc(docId: string, data: GlobalCityDoc): AreaData {
  const numericId = typeof data.numericId === 'number' ? data.numericId : hashCityId(docId)
  const area: Area & { docId?: string; isStarter?: boolean } = {
    id: numericId,
    docId,
    name: data.name ?? docId,
    latitude: Number(data.latitude ?? 0),
    longitude: Number(data.longitude ?? 0),
    active: data.active !== false,
    customLocation: Boolean(data.customLocation),
    lastError: data.lastError ?? null,
    isStarter: Boolean(data.isStarter),
  }

  const latest = data.latestReading
  const reading: Reading | null = latest?.timestamp
    ? {
        id: numericId,
        areaId: numericId,
        aqi: latest.aqi ?? null,
        pm25: latest.pm25 ?? null,
        pm10: latest.pm10 ?? null,
        source: latest.source ?? 'Open-Meteo / CAMS model estimate',
        providerLocation: latest.providerLocation ?? null,
        timestamp: latest.timestamp,
      }
    : null

  return {
    area,
    reading,
    stale: data.stale !== undefined ? Boolean(data.stale) : !reading,
  }
}

export async function loadFirebaseWorkspace(uid: string | null): Promise<FirebaseWorkspaceData> {
  if (!db) {
    return {
      globalAreas: [],
      userAreas: [],
      alerts: [],
      preferences: [],
      advisories: [],
    }
  }

  const [citiesSnap, advisoriesSnap, systemRulesSnap] = await Promise.all([
    getDocs(collection(db, 'globalCities')),
    getDocs(collection(db, 'systemAdvisories')).catch(() => null),
    getDocs(collection(db, 'systemRules')).catch(() => null),
  ])

  const globalAreas: AreaData[] = []
  const byDocId = new Map<string, AreaData>()

  citiesSnap.forEach((snap) => {
    const data = snap.data() as GlobalCityDoc
    if (data.active === false) return
    const mapped = mapCityDoc(snap.id, data)
    globalAreas.push(mapped)
    byDocId.set(snap.id, mapped)
  })

  globalAreas.sort((a, b) => a.area.name.localeCompare(b.area.name))

  const now = Date.now()
  const advisories: SystemAdvisory[] = []
  advisoriesSnap?.forEach((snap) => {
    const data = snap.data() as Record<string, unknown>
    if (data.active === false) return
    const expiresAt = toIso(data.expiresAt) ?? null
    if (expiresAt && Date.parse(expiresAt) < now) return
    const sev = data.severity
    advisories.push({
      id: snap.id,
      title: typeof data.title === 'string' ? data.title : 'System advisory',
      message: typeof data.message === 'string' ? data.message : '',
      severity: sev === 'critical' || sev === 'warning' ? sev : 'info',
      active: true,
      createdAt: toIso(data.createdAt),
      expiresAt,
    })
  })
  advisories.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const preferences: (Preference & { docId?: string; emailNotify?: boolean })[] = []
  systemRulesSnap?.forEach((snap) => {
    const data = snap.data() as {
      cityId?: string
      cityDocId?: string
      areaId?: number
      aqiThreshold?: number
      enabled?: boolean
    }
    const targetDocId = data.cityId ?? data.cityDocId
    const cityArea = targetDocId ? byDocId.get(targetDocId) : undefined
    const areaId = cityArea?.area.id ?? data.areaId ?? 0
    if (!areaId) return
    preferences.push({
      id: hashCityId(snap.id),
      docId: snap.id,
      areaId,
      aqiThreshold: Number(data.aqiThreshold ?? 150),
      enabled: data.enabled !== false,
      systemRule: true,
    })
  })

  if (!uid) {
    const starters = globalAreas.filter((item) => (item.area as Area & { isStarter?: boolean }).isStarter)
    const userAreas = starters.length ? starters : globalAreas.slice(0, 5)
    return {
      globalAreas,
      userAreas,
      alerts: [],
      preferences,
      advisories,
    }
  }

  const [watchlistSnap, rulesSnap, alertsSnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'watchlist')),
    getDocs(collection(db, 'users', uid, 'alertRules')),
    getDocs(collection(db, 'users', uid, 'alerts')),
  ])

  const userAreas: AreaData[] = []
  watchlistSnap.forEach((snap) => {
    const data = snap.data() as {
      cityId?: string
      cityDocId?: string
      name?: string
      latitude?: number
      longitude?: number
    }
    const docId = data.cityId ?? data.cityDocId ?? snap.id
    const globalMatch = byDocId.get(docId)
    if (globalMatch) {
      userAreas.push(globalMatch)
    } else if (data.name) {
      userAreas.push(
        mapCityDoc(docId, {
          name: data.name,
          latitude: data.latitude,
          longitude: data.longitude,
          active: true,
        }),
      )
    }
  })
  userAreas.sort((a, b) => a.area.name.localeCompare(b.area.name))

  rulesSnap.forEach((snap) => {
    const data = snap.data() as {
      cityId?: string
      cityDocId?: string
      areaId?: number
      aqiThreshold?: number
      enabled?: boolean
      emailNotify?: boolean
    }
    const targetDocId = data.cityId ?? data.cityDocId
    const cityArea = targetDocId ? byDocId.get(targetDocId) : undefined
    const areaId = cityArea?.area.id ?? data.areaId ?? (targetDocId ? hashCityId(targetDocId) : 0)
    if (!areaId) return
    preferences.push({
      id: hashCityId(snap.id),
      docId: snap.id,
      areaId,
      aqiThreshold: Number(data.aqiThreshold ?? 100),
      enabled: data.enabled !== false,
      systemRule: false,
      emailNotify: Boolean(data.emailNotify),
    })
  })

  const alerts: (Alert & { docId?: string; emailSent?: boolean })[] = []
  alertsSnap.forEach((snap) => {
    const data = snap.data() as {
      cityId?: string
      cityDocId?: string
      areaId?: number
      message?: string
      status?: string
      createdAt?: unknown
      emailSent?: boolean
    }
    const targetDocId = data.cityId ?? data.cityDocId
    const cityArea = targetDocId ? byDocId.get(targetDocId) : undefined
    const areaId = cityArea?.area.id ?? data.areaId ?? (targetDocId ? hashCityId(targetDocId) : 0)
    alerts.push({
      id: hashCityId(snap.id),
      docId: snap.id,
      areaId,
      message: data.message ?? 'Threshold exceeded',
      status: data.status ?? 'Active',
      createdAt: toIso(data.createdAt) ?? new Date().toISOString(),
      emailSent: Boolean(data.emailSent),
    })
  })
  alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    globalAreas,
    userAreas,
    alerts,
    preferences,
    advisories,
  }
}

export async function fetchFirebaseHistory(docId: string, hours: number): Promise<Reading[]> {
  const response = await fetch(`/api/cities/${encodeURIComponent(docId)}/history?hours=${hours}`)
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.message || `Unable to load history (${response.status})`)
  }
  const raw = (await response.json()) as
    | Array<{
        id?: number | string
        areaId?: number
        aqi: number | null
        pm25: number | null
        pm10: number | null
        source?: string
        providerLocation?: string | null
        timestamp: string
      }>
    | {
        readings?: Array<{
          id?: number | string
          areaId?: number
          aqi: number | null
          pm25: number | null
          pm10: number | null
          source?: string
          providerLocation?: string | null
          timestamp: string
        }>
      }
  const rows = Array.isArray(raw) ? raw : raw.readings ?? []
  const numericAreaId = hashCityId(docId)
  return rows.map((row, index) => ({
    id: typeof row.id === 'number' ? row.id : hashCityId(`${docId}:${row.timestamp}:${index}`),
    areaId: typeof row.areaId === 'number' ? row.areaId : numericAreaId,
    aqi: row.aqi ?? null,
    pm25: row.pm25 ?? null,
    pm10: row.pm10 ?? null,
    source: row.source ?? 'Open-Meteo / CAMS model estimate',
    providerLocation: row.providerLocation ?? null,
    timestamp: row.timestamp,
  }))
}

export async function addCityToWatchlist(
  _uid: string,
  idToken: string,
  city: { name: string; latitude: number; longitude: number; docId?: string },
): Promise<{ cityId: string; added: boolean }> {
  const response = await fetch('/api/cities/ensure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(city),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.message || `Could not add location (${response.status})`)
  }
  const data = (await response.json()) as { cityId: string; added?: boolean }
  return { cityId: data.cityId, added: Boolean(data.added) }
}

export async function removeCityFromWatchlist(uid: string, docId: string): Promise<void> {
  if (!db) throw new Error('Firestore is not configured')
  await deleteDoc(doc(db, 'users', uid, 'watchlist', docId))
}

export async function createUserAlertRule(
  uid: string,
  input: {
    areaId: number
    cityDocId?: string
    cityId?: string
    cityName?: string
    aqiThreshold: number
    enabled?: boolean
    emailNotify?: boolean
  },
): Promise<string> {
  if (!db) throw new Error('Firestore is not configured')
  const resolvedCityId = (input.cityId ?? input.cityDocId ?? String(input.areaId)).trim()
  const resolvedCityName = (input.cityName?.trim() || resolvedCityId).slice(0, 80)
  const ref = await addDoc(collection(db, 'users', uid, 'alertRules'), {
    cityId: resolvedCityId,
    cityName: resolvedCityName,
    aqiThreshold: input.aqiThreshold,
    enabled: input.enabled ?? true,
    emailNotify: Boolean(input.emailNotify),
    aboveThreshold: false,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateUserAlertRule(
  uid: string,
  ruleId: string,
  patch: { aqiThreshold?: number; enabled?: boolean; emailNotify?: boolean },
): Promise<void> {
  if (!db) throw new Error('Firestore is not configured')
  await updateDoc(doc(db, 'users', uid, 'alertRules', ruleId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteUserAlertRule(uid: string, ruleId: string): Promise<void> {
  if (!db) throw new Error('Firestore is not configured')
  await deleteDoc(doc(db, 'users', uid, 'alertRules', ruleId))
}

export async function acknowledgeUserAlert(uid: string, alertId: string): Promise<void> {
  if (!db) throw new Error('Firestore is not configured')
  await updateDoc(doc(db, 'users', uid, 'alerts', alertId), {
    status: 'Acknowledged',
  })
}
