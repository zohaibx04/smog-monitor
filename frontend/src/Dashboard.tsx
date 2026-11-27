import SmogOverview from './SmogOverview'
import PollutantTab from './PollutantTab'
import CityRankings from './CityRankings'
import ForecastHealthTab from './ForecastHealthTab'
import GasesWeatherTab from './GasesWeatherTab'
import MyLocations from './MyLocations'
import AdminPanel, { type AdminSection } from './AdminPanel'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { Icon, navGroups, navItems, type Page } from './App'
import {
  api,
  category,
  fetchProactiveInsights,
  type Area,
  type AreaData,
  type Reading,
  type Alert,
  type Preference,
  type HealthProfile,
  type ProactiveInsights,
} from './api'
import { useAuth } from './firebase/AuthContext'
import {
  acknowledgeUserAlert,
  addCityToWatchlist,
  createUserAlertRule,
  deleteUserAlertRule,
  fetchFirebaseHistory,
  loadFirebaseWorkspace,
  removeCityFromWatchlist,
  updateUserAlertRule,
  type SystemAdvisory,
} from './firebase/dataService'
import PreferenceRow from './PreferenceRow'
import AdminRules from './AdminRules'
import SelectDropdown from './SelectDropdown'

const number = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)
const aqiNumber = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value)
const date = (value?: string) => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'No reading received'
const desktopViewport = '(min-width: 901px)'
const historyPages: Page[] = ['dashboard', 'usaqi', 'pm25', 'pm10']
const hasLocationSelectorPages: Page[] = ['dashboard', 'forecast', 'usaqi', 'pm25', 'pm10', 'gases']
const SmogMap = lazy(() => import('./SmogMap'))

function readSavedHealthProfile(): HealthProfile {
  const raw = window.localStorage.getItem('smog-health-profile')
  return raw === 'respiratory' || raw === 'sensitive' || raw === 'athlete' ? raw : 'general'
}
function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }
function Pill({ aqi }: { aqi?: number | null }) { const c = category(aqi); return <span className={`status-pill ${c.style}`}><span className="status-dot" />{c.label}</span> }
function Empty({ children }: { children: ReactNode }) { return <div className="empty-state"><Icon name="database" size={16} /><p>{children}</p></div> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }

function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || 'U').trim()
  const parts = source.split(/\s+/)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function FirebasePreferenceRow({
  preference,
  location,
  busy,
  save,
  remove,
}: {
  preference: Preference
  location: string
  busy: boolean
  save: (value: { aqiThreshold: number; enabled: boolean; emailNotify: boolean }) => void
  remove: () => void
}) {
  const [threshold, setThreshold] = useState(preference.aqiThreshold)
  const [enabled, setEnabled] = useState(preference.enabled)
  const [emailNotify, setEmailNotify] = useState(Boolean(preference.emailNotify))
  const unchanged =
    threshold === preference.aqiThreshold &&
    enabled === preference.enabled &&
    emailNotify === Boolean(preference.emailNotify)

  return (
    <form
      className="preference-row preference-row-email"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        save({ aqiThreshold: threshold, enabled, emailNotify })
      }}
    >
      <div className="management-name">
        <strong>{location}</strong>
        <span>Alert when US AQI exceeds threshold</span>
      </div>
      <label className="field">
        <span>US AQI threshold</span>
        <input
          aria-label={`${location} alert threshold`}
          type="number"
          min="1"
          max="500"
          required
          value={threshold}
          onChange={e => setThreshold(Number(e.target.value))}
        />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        Enabled
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={emailNotify} onChange={e => setEmailNotify(e.target.checked)} />
        Email alert
      </label>
      <button className="btn secondary" disabled={busy || unchanged}>
        Save changes
      </button>
      <button type="button" className="btn secondary" disabled={busy} onClick={remove}>
        Remove
      </button>
    </form>
  )
}

export default function DashboardApp() {
  const {
    user,
    profile,
    isAdmin,
    loading: authLoading,
    authError,
    isFirebaseConfigured: firebaseMode,
    signInWithGoogle,
    signOutUser,
    getIdToken,
    updateProfilePrefs,
  } = useAuth()

  const [page, setPage] = useState<Page>('dashboard')
  const [demoAqi, setDemoAqi] = useState('120')
  const [desktop, setDesktop] = useState(() => window.matchMedia(desktopViewport).matches)
  const [menu, setMenu] = useState(desktop)
  const menuButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [userAreas, setUserAreas] = useState<AreaData[]>([])
  const [globalAreas, setGlobalAreas] = useState<AreaData[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [advisories, setAdvisories] = useState<SystemAdvisory[]>([])
  const [dismissedAdvisories, setDismissedAdvisories] = useState<string[]>([])
  const seenAlerts = useRef<Set<number> | null>(null)
  const [incomingAlerts, setIncomingAlerts] = useState<Alert[]>([])
  const [preferences, setPreferences] = useState<Preference[]>([])
  const [selected, setSelected] = useState(0)
  const [historyResult, setHistoryResult] = useState<{ key: string; readings: Reading[] } | null>(null)
  const [insightsResult, setInsightsResult] = useState<{ key: string; data: ProactiveInsights } | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [healthProfile, setHealthProfile] = useState<HealthProfile>(readSavedHealthProfile)
  const [hours, setHours] = useState(24)
  const [mode, setMode] = useState('connecting')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [compare, setCompare] = useState<number[]>([])
  const [alertFilter, setAlertFilter] = useState('All')
  const [version, setVersion] = useState(0)
  const [token, setToken] = useState('')
  const [editing, setEditing] = useState<Area | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [refreshState, setRefreshState] = useState<'idle' | 'working' | 'complete'>('idle')
  const refreshTimer = useRef<number | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (window.localStorage.getItem('smog-theme') === 'light' ? 'light' : 'dark'))
  const navRef = useRef<HTMLElement>(null)
  const [navIndicator, setNavIndicator] = useState<{ top: number; height: number; ready: boolean }>({ top: 0, height: 0, ready: false })
  const alertSegRef = useRef<HTMLDivElement>(null)
  const [alertIndicator, setAlertIndicator] = useState<{ left: number; width: number; ready: boolean }>({ left: 0, width: 0, ready: false })

  const defaultCityIdRef = useRef<string | null | undefined>(profile?.defaultCityId)
  defaultCityIdRef.current = profile?.defaultCityId

  const allKnownAreas = useMemo(() => {
    const byId = new Map<number, AreaData>()
    globalAreas.forEach(item => byId.set(item.area.id, item))
    userAreas.forEach(item => byId.set(item.area.id, item))
    return Array.from(byId.values())
  }, [globalAreas, userAreas])

  const areas = userAreas
  const historyHours = page === 'dashboard' ? 24 : hours
  const historyKey = `${selected}:${historyHours}`
  const history = historyResult?.key === historyKey ? historyResult.readings : []
  const current = userAreas.find(a => a.area.id === selected) ?? globalAreas.find(a => a.area.id === selected)
  const insightsKey = current
    ? `${current.area.docId ?? current.area.id}:${current.area.latitude}:${current.area.longitude}`
    : ''
  const insights = insightsResult?.key === insightsKey ? insightsResult.data : null
  const enabledThresholds = preferences
    .filter(p => p.enabled && p.areaId === selected)
    .map(p => p.aqiThreshold)
  const userThreshold = enabledThresholds.length ? Math.min(...enabledThresholds) : null
  const defaultAreas = areas.filter(item => !item.area.customLocation)
  const activeAlerts = alerts.filter(a => a.status === 'Active').length
  const visibleAdvisories = advisories.filter(a => a.active && !dismissedAdvisories.includes(a.id))
  const lockedViewport =
    page === 'dashboard' ||
    page === 'forecast' ||
    page === 'usaqi' ||
    page === 'pm25' ||
    page === 'pm10' ||
    page === 'gases' ||
    page === 'rankings' ||
    page === 'global-rankings' ||
    page === 'areas' ||
    page === 'map'

  const visibleNavGroups = useMemo(
    () =>
      navGroups.filter(group => {
        if (group === 'Admin') return firebaseMode && isAdmin
        if (group === 'System') return !firebaseMode
        return true
      }),
    [firebaseMode, isAdmin],
  )

  function closeMenu() {
    setMenu(false)
    window.requestAnimationFrame(() => menuButton.current?.focus())
  }
  const navigate = (id: Page) => {
    setPage(id)
    if (!desktop && menu) closeMenu()
    setNotice('')
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    if (authLoading) return
    if (firebaseMode) {
      if (page === 'admin') setPage(isAdmin ? 'admin-overview' : 'dashboard')
      else if (page.startsWith('admin-') && !isAdmin) setPage('dashboard')
    } else if (page.startsWith('admin-')) {
      setPage('admin')
    }
  }, [authLoading, firebaseMode, isAdmin, page])

  useEffect(() => {
    if (profile?.theme === 'dark' || profile?.theme === 'light') {
      setTheme(profile.theme)
    }
  }, [profile?.theme])

  useEffect(() => {
    if (
      profile?.healthProfile === 'general' ||
      profile?.healthProfile === 'respiratory' ||
      profile?.healthProfile === 'sensitive' ||
      profile?.healthProfile === 'athlete'
    ) {
      setHealthProfile(profile.healthProfile)
      window.localStorage.setItem('smog-health-profile', profile.healthProfile)
    }
  }, [profile?.healthProfile])

  useEffect(() => {
    const viewport = window.matchMedia(desktopViewport)
    const resize = (event: MediaQueryListEvent) => {
      setDesktop(event.matches)
      setMenu(event.matches)
    }
    viewport.addEventListener('change', resize)
    return () => viewport.removeEventListener('change', resize)
  }, [])

  useEffect(() => {
    if (!menu) return
    if (!desktop) closeButton.current?.focus()
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [desktop, menu])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const activeBtn = nav.querySelector<HTMLButtonElement>('button.active')
      if (!activeBtn) {
        setNavIndicator(prev => prev.ready ? { ...prev, ready: false } : prev)
        return
      }
      setNavIndicator({ top: activeBtn.offsetTop, height: activeBtn.offsetHeight, ready: true })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [page, desktop, menu, isAdmin, firebaseMode])

  useLayoutEffect(() => {
    const seg = alertSegRef.current
    if (page !== 'alerts' || loading || !seg) return
    const measure = () => {
      const activeBtn = seg.querySelector<HTMLButtonElement>('button.active')
      if (!activeBtn) {
        setAlertIndicator(prev => prev.ready ? { ...prev, ready: false } : prev)
        return
      }
      setAlertIndicator({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth, ready: true })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(seg)
    return () => observer.disconnect()
  }, [page, alertFilter, loading])

  const load = useCallback(async () => {
    if (firebaseMode) {
      const ws = await loadFirebaseWorkspace(user?.uid ?? null)
      if (seenAlerts.current) {
        const incoming = ws.alerts.filter(alert => alert.status === 'Active' && !seenAlerts.current!.has(alert.id))
        if (incoming.length) setIncomingAlerts(incoming)
        else setIncomingAlerts(old => old.filter(alert => ws.alerts.some(item => item.id === alert.id && item.status === 'Active')))
      }
      seenAlerts.current = new Set(ws.alerts.map(alert => alert.id))
      setGlobalAreas(ws.globalAreas)
      setUserAreas(ws.userAreas)
      setAlerts(ws.alerts)
      setPreferences(ws.preferences)
      setAdvisories(ws.advisories)
      setMode('live')

      const combined = ws.userAreas.length ? ws.userAreas : ws.globalAreas
      const prefDefault = defaultCityIdRef.current
      const defaultMatch = prefDefault
        ? ws.userAreas.find(x => x.area.docId === prefDefault || String(x.area.id) === prefDefault) ??
          ws.globalAreas.find(x => x.area.docId === prefDefault || String(x.area.id) === prefDefault)
        : undefined

      setSelected(old => {
        if (old && (ws.userAreas.some(x => x.area.id === old) || ws.globalAreas.some(x => x.area.id === old))) {
          return old
        }
        return defaultMatch?.area.id || combined[0]?.area.id || 0
      })
      setCompare(old => old.filter(id => ws.userAreas.some(x => x.area.id === id)))
      setVersion(v => v + 1)
      return
    }

    const [a, s, p, status] = await Promise.all([
      api<AreaData[]>('/areas'),
      api<Alert[]>('/alerts'),
      api<Preference[]>('/preferences'),
      api<{ mode: string }>('/status'),
    ])
    if (seenAlerts.current) {
      const incoming = s.filter(alert => alert.status === 'Active' && !seenAlerts.current!.has(alert.id))
      if (incoming.length) setIncomingAlerts(incoming)
      else setIncomingAlerts(old => old.filter(alert => s.some(item => item.id === alert.id && item.status === 'Active')))
    }
    seenAlerts.current = new Set(s.map(alert => alert.id))
    setGlobalAreas(a)
    setUserAreas(a)
    setAlerts(s)
    setPreferences(p)
    setAdvisories([])
    setMode(status.mode)
    setSelected(old => a.some(x => x.area.id === old) ? old : a[0]?.area.id || 0)
    setCompare(old => old.filter(id => a.some(x => x.area.id === id)))
    setVersion(v => v + 1)
  }, [firebaseMode, user?.uid])

  useEffect(() => {
    if (firebaseMode && authLoading) return
    let active = true
    const update = () =>
      load()
        .then(() => {
          if (active) setError('')
        })
        .catch(e => {
          if (active) {
            setError(e.message)
            setMode('offline')
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    void update()
    const timer = window.setInterval(update, 60000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [authLoading, firebaseMode, load])

  useEffect(() => {
    let active = true
    if (!selected || !historyPages.includes(page)) return
    const target = userAreas.find(a => a.area.id === selected) ?? globalAreas.find(a => a.area.id === selected)
    if (firebaseMode && !target) return

    setHistoryLoading(true)
    const request = firebaseMode
      ? fetchFirebaseHistory(target?.area.docId || String(selected), historyHours)
      : api<Reading[]>(`/areas/${selected}/history?hours=${historyHours}`)

    request
      .then(data => {
        if (active) setHistoryResult({ key: historyKey, readings: data })
      })
      .catch(e => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [firebaseMode, globalAreas, historyHours, historyKey, page, selected, userAreas, version])

  useEffect(() => {
    let active = true
    if ((page !== 'forecast' && page !== 'gases') || !current) return
    setInsightsLoading(true)
    setInsightsError('')
    fetchProactiveInsights(
      current.area.docId || String(current.area.id),
      current.area.latitude,
      current.area.longitude,
    )
      .then(data => {
        if (active) setInsightsResult({ key: insightsKey, data })
      })
      .catch(e => {
        if (active) setInsightsError(e instanceof Error ? e.message : 'Unable to load forecast and weather insights')
      })
      .finally(() => {
        if (active) setInsightsLoading(false)
      })
    return () => {
      active = false
    }
  }, [current, insightsKey, page, version])

  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await work()
      await load()
      setNotice(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('smog-theme', theme)
  }, [theme])

  useEffect(() => {
    return () => {
      if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
    }
  }, [])

  function selectTheme(next: 'dark' | 'light') {
    setTheme(next)
    if (firebaseMode && user) {
      void updateProfilePrefs({ theme: next })
    }
  }

  function handleHealthProfileChange(next: HealthProfile) {
    setHealthProfile(next)
    window.localStorage.setItem('smog-health-profile', next)
    if (firebaseMode && user) {
      void updateProfilePrefs({ healthProfile: next })
    }
  }

  async function refresh() {
    if (refreshTimer.current !== null) {
      clearTimeout(refreshTimer.current)
      refreshTimer.current = null
    }
    setRefreshState('working')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (firebaseMode) {
        if (isAdmin) {
          const idToken = await getIdToken()
          if (idToken) {
            const response = await fetch('/api/cron/refresh', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
              },
            })
            if (!response.ok) {
              const detail = await response.json().catch(() => null)
              throw new Error(detail?.message || `Refresh failed (${response.status})`)
            }
          }
        }
        await load()
      } else {
        await api('/refresh', 'POST')
        await load()
      }
      setRefreshState('complete')
      refreshTimer.current = window.setTimeout(() => {
        setRefreshState('idle')
        refreshTimer.current = null
      }, 2000)
    } catch (e) {
      setRefreshState('idle')
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function addCity(location: { name: string; latitude: number; longitude: number; docId?: string }) {
    if (firebaseMode) {
      if (!user) {
        await signInWithGoogle()
        return
      }
      const idToken = await getIdToken()
      if (!idToken) throw new Error('Sign in with Google to modify your watchlist')
      const result = await addCityToWatchlist(user.uid, idToken, location)
      await load()
      const ws = await loadFirebaseWorkspace(user.uid)
      const addedArea =
        ws.userAreas.find(item => item.area.docId === result.cityId) ??
        ws.globalAreas.find(item => item.area.docId === result.cityId)
      if (addedArea) setSelected(addedArea.area.id)
      setNotice(result.added ? `${location.name} added to your watchlist` : `${location.name} is already in your watchlist`)
      return
    }

    const result = await api<{ area: Area; added: boolean }>('/areas', 'POST', {
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
    })
    await load()
    setSelected(result.area.id)
    setNotice(result.added ? `${result.area.name} added to monitoring` : `${result.area.name} is already monitored`)
  }

  const selectOptionsAreas = useMemo(() => {
    if (!current || areas.some(a => a.area.id === current.area.id)) return areas
    return [current, ...areas]
  }, [areas, current])

  const select = (
    <SelectDropdown
      className="header-location-select"
      icon="pin"
      ariaLabel="Selected location"
      value={String(selected)}
      onChange={val => setSelected(Number(val))}
      options={selectOptionsAreas.map(a => ({
        value: String(a.area.id),
        label: `${a.area.name}${a.area.active ? '' : ' (paused)'}`,
      }))}
    />
  )

  const filtered = areas.filter(a => a.area.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || filter === category(a.reading?.aqi).style))
  const compared = areas.filter(a => compare.includes(a.area.id))

  function exportHistory() {
    const escape = (value: unknown) => {
      const text = String(value ?? '')
      const safeText = typeof value === 'string' && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
      return `"${safeText.replaceAll('"', '""')}"`
    }
    const csv = [['Location', 'Timestamp UTC', 'US AQI', 'PM2.5 (ug/m3)', 'PM10 (ug/m3)', 'Source', 'Provider reporting location'], ...history.map(r => [current?.area.name, r.timestamp, r.aqi, r.pm25, r.pm10, r.source, r.providerLocation])].map(row => row.map(escape).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `smog-monitor-history-${selected}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const heading = {
    dashboard: { title: 'Smog overview', subtitle: '' },
    forecast: { title: 'Forecast & health', subtitle: '' },
    usaqi: { title: 'US AQI', subtitle: '' },
    pm25: { title: 'PM2.5', subtitle: '' },
    pm10: { title: 'PM10', subtitle: '' },
    gases: { title: 'Gases & weather', subtitle: '' },
    rankings: { title: 'City rankings', subtitle: '' },
    'global-rankings': { title: 'Global rankings', subtitle: '' },
    map: { title: 'Smog map', subtitle: '' },
    areas: { title: 'Compare locations', subtitle: '' },
    'add-location': { title: 'My locations', subtitle: 'Manage your watchlist, set a default city, or search worldwide' },
    alerts: { title: 'Smog alerts', subtitle: 'Configure US AQI thresholds, acknowledge active alerts, and review episodes' },
    admin: { title: 'Administration', subtitle: 'Maintain monitoring locations and shared alert rules' },
    'admin-overview': { title: 'Admin overview', subtitle: 'Network metrics, popular monitored cities, and recent threshold emails' },
    'admin-catalog': { title: 'Global catalog', subtitle: 'Add, edit, or toggle global monitoring locations and starter defaults' },
    'admin-users': { title: 'Users & roles', subtitle: 'Manage Google-authenticated accounts, admin roles, and account status' },
    'admin-advisories': { title: 'Advisories & rules', subtitle: 'Publish network-wide advisories and official threshold alert rules' },
    'admin-health': { title: 'Network health', subtitle: 'Inspect Open-Meteo sync health, stale stations, and Resend delivery logs' },
  }[page]

  const mapAreas = globalAreas.length ? globalAreas : userAreas
  const activeMonitoredAreas = areas.filter(a => a.area.active)
  const displayName = profile?.displayName || user?.displayName || user?.email || 'Account'
  const avatarUrl = profile?.photoURL || user?.photoURL

  return <div className={`app-shell${menu ? ' sidebar-open' : ''}`}>
    <aside id="app-sidebar" className={`sidebar${menu ? ' open' : ''}${firebaseMode && isAdmin ? ' is-admin' : ''}`} inert={!menu}>
      <div className="brand">
        <div className="brand-mark"><img src="/app-icon.svg?v=3" alt="Smog Monitor" className="brand-icon-img" /></div>
        <div>
          <strong>Smog Monitor</strong>
          <span>Air quality &amp; alerts</span>
        </div>
        <button ref={closeButton} type="button" className="mobile-close" aria-label="Hide sidebar" onClick={closeMenu}><Icon name="close" size={16} /></button>
      </div>
      <nav ref={navRef} aria-label="Main navigation">
        <span
          className="nav-glide-indicator"
          aria-hidden="true"
          style={{
            transform: `translateY(${navIndicator.top}px)`,
            height: `${navIndicator.height}px`,
            opacity: navIndicator.ready ? 1 : 0,
          }}
        />
        {visibleNavGroups.map(group => {
          const items = navItems.filter(n => n.group === group)
          return <div className="nav-group" key={group}>
            <div className="nav-group-label">{group}</div>
            <div className="nav-group-items">
              {items.map(n => <button key={n.id} className={page === n.id ? 'active' : ''} aria-current={page === n.id ? 'page' : undefined} onClick={() => navigate(n.id)}>
                <Icon name={n.icon} size={16} />
                <span>{n.label}</span>
                {n.id === 'alerts' && activeAlerts > 0 && <b className="mono">{activeAlerts}</b>}
              </button>)}
            </div>
          </div>
        })}
      </nav>
      <div className="sidebar-theme-footer">
        <div className="theme-switch" role="group" aria-label="Color theme">
          <span
            className="theme-switch-glide"
            aria-hidden="true"
            style={{ transform: `translateX(${theme === 'light' ? '100%' : '0%'})` }}
          />
          <button
            type="button"
            className={theme === 'dark' ? 'active' : ''}
            aria-pressed={theme === 'dark'}
            onClick={() => selectTheme('dark')}
          >
            <Icon name="moon" size={16} />
            <span>Dark</span>
          </button>
          <button
            type="button"
            className={theme === 'light' ? 'active' : ''}
            aria-pressed={theme === 'light'}
            onClick={() => selectTheme('light')}
          >
            <Icon name="sun" size={16} />
            <span>Light</span>
          </button>
        </div>
      </div>
    </aside>{menu && !desktop && <div className="overlay" aria-hidden="true" onClick={closeMenu} />}
    <div className="main-shell" inert={menu && !desktop}>
      <header className="topbar">
        <button ref={menuButton} type="button" className="menu-button" aria-controls="app-sidebar" aria-expanded={menu}
          aria-label={menu ? 'Hide sidebar' : 'Show sidebar'} title={menu ? 'Hide sidebar' : 'Show sidebar'}
          onClick={() => setMenu(open => !open)}><Icon name="menu" size={16} /></button>
        <span className="mobile-title">{navItems.find(n => n.id === page)?.label}</span>
        <div className="topbar-right">
          <div className={`data-live ${mode !== 'live' ? 'muted-status' : ''}`}>
            <span />{mode === 'demo' ? 'Sample data' : mode === 'live' ? 'Open-Meteo live' : mode === 'offline' ? 'Offline' : 'Connecting'}
          </div>
          <button className="top-icon notification" aria-label="View alerts" onClick={() => navigate('alerts')}>
            <Icon name="bell" size={16} />
            {activeAlerts > 0 && <span />}
          </button>
          <div className="date">
            <strong className="mono">{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
          </div>
          {firebaseMode && (
            user ? (
              <div className="topbar-auth-chip">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="topbar-avatar" referrerPolicy="no-referrer" />
                ) : (
                  <span className="topbar-avatar-fallback mono" aria-hidden="true">
                    {initialsOf(profile?.displayName ?? user.displayName, profile?.email ?? user.email)}
                  </span>
                )}
                <span className="topbar-user-name">{displayName}</span>
                {isAdmin && <span className="topbar-admin-tag">Admin</span>}
                <button
                  type="button"
                  className="icon-button topbar-signout-btn"
                  aria-label="Sign out"
                  title="Sign out"
                  onClick={() => {
                    void signOutUser()
                  }}
                >
                  <Icon name="logOut" size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn primary topbar-signin-btn"
                disabled={authLoading}
                onClick={() => {
                  void signInWithGoogle()
                }}
              >
                <Icon name="user" size={16} />
                <span>Sign in with Google</span>
              </button>
            )
          )}
        </div>
      </header>
      <main id="main-content" className={lockedViewport ? 'overview-viewport' : ''}>
        <div className="page-header">
          <div className="page-header-title">
            <h1>{heading.title}</h1>
          </div>
          <div className="page-header-actions">
            {hasLocationSelectorPages.includes(page) && selectOptionsAreas.length > 0 && select}
            {hasLocationSelectorPages.includes(page) && current && !current.area.active && (
              <span className="inline-warning">Monitoring paused</span>
            )}
            <button
              className={`btn secondary refresh-btn${refreshState === 'working' ? ' is-working' : refreshState === 'complete' ? ' is-complete' : ''}`}
              disabled={busy || loading || refreshState === 'working'}
              onClick={() => { void refresh() }}
            >
              <Icon name={refreshState === 'complete' ? 'check' : 'refresh'} size={16} />
              <span>{refreshState === 'working' ? 'Working…' : refreshState === 'complete' ? 'Complete' : 'Refresh data'}</span>
            </button>
          </div>
        </div>
        {!lockedViewport && heading.subtitle && <p className="page-description">{heading.subtitle}</p>}
        {visibleAdvisories.map(adv => (
          <div
            key={adv.id}
            className={`system-advisory-banner is-${adv.severity}`}
            role="status"
          >
            <Icon name={adv.severity === 'info' ? 'info' : 'warning'} size={16} />
            <div className="system-advisory-body">
              <strong>{adv.title}</strong>
              {adv.message && <p>{adv.message}</p>}
            </div>
            <button
              type="button"
              className="icon-button system-advisory-close"
              aria-label={`Dismiss advisory ${adv.title}`}
              onClick={() => setDismissedAdvisories(old => [...old, adv.id])}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        {mode === 'demo' && <div className="notice demo-notice"><Icon name="info" size={16} />Demo mode · Readings and alerts use synthetic samples</div>}
        {(authError || error) && <div className="notice error-notice" role="alert"><Icon name="warning" size={16} /><span>{authError || error}</span><button className="text-button" disabled={busy} onClick={() => action(load, 'Connection restored')}>Retry</button></div>}
        {notice && <div className="notice" role="status"><Icon name="check" size={16} />{notice}</div>}
        {incomingAlerts.length > 0 && <div className="smog-new-alert" role="alert"><Icon name="bell" size={16} /><div><strong>{incomingAlerts.length} new smog {incomingAlerts.length === 1 ? 'alert' : 'alerts'}</strong><p>{incomingAlerts[0].message}</p></div><button className="btn secondary" onClick={() => { navigate('alerts'); setIncomingAlerts([]) }}>Review alerts</button><button className="icon-button" aria-label="Dismiss new-alert banner" onClick={() => setIncomingAlerts([])}><Icon name="close" size={16} /></button></div>}
        {loading ? <Card><Empty>Connecting to monitoring network…</Empty></Card> : <>
          {page === 'map' && <Suspense fallback={<Card><Empty>Loading map…</Empty></Card>}>
            <SmogMap areas={mapAreas} onOpenLocation={id => { setSelected(id); navigate('dashboard') }} />
          </Suspense>}
          {page === 'add-location' && (
            <MyLocations
              userAreas={userAreas}
              globalAreas={globalAreas}
              defaultCityId={firebaseMode ? profile?.defaultCityId : selected ? String(selected) : null}
              isSignedIn={Boolean(user)}
              isFirebaseMode={firebaseMode}
              onSignIn={signInWithGoogle}
              onAddCity={addCity}
              onRemoveCity={
                firebaseMode && user
                  ? async area => {
                      const docId = area.docId
                      if (!docId) return
                      await removeCityFromWatchlist(user.uid, docId)
                      await load()
                      setNotice(`Removed ${area.name} from your watchlist`)
                    }
                  : undefined
              }
              onSetDefaultCity={
                firebaseMode && user
                  ? async area => {
                      const docId = area.docId ?? String(area.id)
                      await updateProfilePrefs({ defaultCityId: docId })
                      setSelected(area.id)
                      setNotice(`${area.name} set as default city`)
                    }
                  : async area => {
                      setSelected(area.id)
                      setNotice(`${area.name} selected as default view`)
                    }
              }
              onOpenCity={id => {
                setSelected(id)
                navigate('dashboard')
              }}
            />
          )}
          {page === 'dashboard' && <>
            {current?.area.lastError && (!current.reading || current.stale) && <div className="notice error-notice"><Icon name="warning" size={16} />{current.area.lastError}</div>}
            {!firebaseMode && mode === 'demo' && current?.area.active && <Card className="location-form">
              <h3>Simulate a reading for {current.area.name}</h3>
              <p className="data-footnote">With an AQI threshold of 150, submit 120, 175, 185, then 110 to observe a crossing, repeated high reading, and recovery.</p>
              <form onSubmit={e => {
                e.preventDefault()
                void action(() => api(`/demo/areas/${selected}/readings`, 'POST', { aqi: Number(demoAqi) }), 'Sample reading recorded and alert rules evaluated')
              }}>
                <Field label="Sample US AQI"><input type="number" min="0" max="500" required value={demoAqi} onChange={e => setDemoAqi(e.target.value)} /></Field>
                <button className="btn primary" disabled={busy}>Add sample reading</button>
              </form>
            </Card>}
            <SmogOverview current={current} areas={areas} alerts={alerts} preferences={preferences} history={history} historyLoading={historyLoading} mode={mode} navigate={navigate} />
          </>}
          {page === 'forecast' && (
            <ForecastHealthTab
              current={current}
              insights={insights}
              loading={insightsLoading}
              error={insightsError}
              healthProfile={healthProfile}
              onHealthProfileChange={handleHealthProfileChange}
              userThreshold={userThreshold}
              onOpenAlerts={() => navigate('alerts')}
            />
          )}
          {page === 'usaqi' && <PollutantTab pollutant="aqi" current={current} areas={areas} history={history} historyLoading={historyLoading} hours={hours} onHoursChange={setHours} onExport={exportHistory} onSelectArea={id => setSelected(id)} />}
          {page === 'pm25' && <PollutantTab pollutant="pm25" current={current} areas={areas} history={history} historyLoading={historyLoading} hours={hours} onHoursChange={setHours} onExport={exportHistory} onSelectArea={id => setSelected(id)} />}
          {page === 'pm10' && <PollutantTab pollutant="pm10" current={current} areas={areas} history={history} historyLoading={historyLoading} hours={hours} onHoursChange={setHours} onExport={exportHistory} onSelectArea={id => setSelected(id)} />}
          {page === 'gases' && (
            <GasesWeatherTab
              current={current}
              insights={insights}
              loading={insightsLoading}
              error={insightsError}
            />
          )}
          {page === 'rankings' && <CityRankings areas={userAreas} selectedId={selected} onSelectCity={id => { setSelected(id); navigate('dashboard') }} />}
          {page === 'global-rankings' && <CityRankings areas={globalAreas} selectedId={selected} onSelectCity={id => { setSelected(id); navigate('dashboard') }} />}
          {page === 'areas' && <div className="compare-viewport">
            <div className="area-controls">
              <label className="search-box"><Icon name="search" size={16} /><input placeholder="Search locations" aria-label="Search locations" value={query} onChange={e => setQuery(e.target.value)} /></label>
              <SelectDropdown
                className="area-filter-select"
                icon="filter"
                ariaLabel="Air quality category"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All categories' },
                  ...[25, 75, 125, 175, 250, 350, null].map(v => {
                    const c = category(v)
                    return { value: c.style, label: c.label }
                  }),
                ]}
              />
            </div>
            <div className="compare-split">
              <Card className="comparison-card compare-table-pane">
                <div className="card-title-row">
                  <h3>Compare selected locations</h3>
                  <div className="compare-table-actions">
                    <span className="muted mono">{compared.length} selected</span>
                    {compared.length > 0 && (
                      <button type="button" className="text-button" onClick={() => setCompare([])}>
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
                {compared.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>City</th>
                          <th>Status</th>
                          <th className="num-col">US AQI</th>
                          <th className="num-col">PM2.5</th>
                          <th className="num-col">PM10</th>
                          <th>Updated</th>
                          <th aria-label="Remove" />
                        </tr>
                      </thead>
                      <tbody>
                        {compared.map(a => (
                          <tr key={a.area.id}>
                            <td>
                              <button
                                type="button"
                                className="compare-city-link"
                                onClick={() => { setSelected(a.area.id); navigate('dashboard') }}
                              >
                                {a.area.name}
                              </button>
                            </td>
                            <td><Pill aqi={a.reading?.aqi} /></td>
                            <td className="mono num-col">{aqiNumber(a.reading?.aqi)}</td>
                            <td className="mono num-col">
                              {number(a.reading?.pm25)}
                              {a.reading?.pm25 != null && <span className="unit-inline"> μg/m³</span>}
                            </td>
                            <td className="mono num-col">
                              {number(a.reading?.pm10)}
                              {a.reading?.pm10 != null && <span className="unit-inline"> μg/m³</span>}
                            </td>
                            <td className="mono">{date(a.reading?.timestamp)}{a.stale && ' · stale'}</td>
                            <td className="compare-remove-cell">
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remove ${a.area.name} from comparison`}
                                onClick={() => setCompare(old => old.filter(id => id !== a.area.id))}
                              >
                                <Icon name="close" size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>Click any city card on the right to add it to the comparison</Empty>
                )}
              </Card>
              <div className="compare-locations-pane">
                {filtered.length ? (
                  <div className="compare-city-list">
                    {filtered.map(a => {
                      const isSelected = compare.includes(a.area.id)
                      return (
                        <button
                          key={a.area.id}
                          type="button"
                          className={`compare-city-card${isSelected ? ' is-selected' : ''}`}
                          aria-pressed={isSelected}
                          onClick={() => setCompare(old => (isSelected ? old.filter(id => id !== a.area.id) : [...old, a.area.id]))}
                        >
                          <span className="compare-city-pin" aria-hidden="true">
                            <Icon name="pin" size={16} />
                          </span>
                          <span className="compare-city-info">
                            <strong>{a.area.name}</strong>
                            <span>{a.area.active ? 'Monitoring enabled' : 'Paused'}</span>
                          </span>
                          <span className="compare-city-toggle" aria-hidden="true">
                            <Icon name={isSelected ? 'check' : 'plus'} size={16} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <Empty>No matching locations</Empty>
                )}
              </div>
            </div>
          </div>}
          {page === 'alerts' && <>
            <div className="alerts-layout">
              <Card className="alerts-table-card">
                <div className="card-title-row">
                  <div>
                    <h3>Smog alerts</h3>
                    <p className="card-subtitle">Threshold alert episodes</p>
                  </div>
                  <div className="segmented" ref={alertSegRef}>
                    <span
                      className="segmented-glide-indicator"
                      aria-hidden="true"
                      style={{
                        transform: `translateX(${alertIndicator.left}px)`,
                        width: `${alertIndicator.width}px`,
                        opacity: alertIndicator.ready ? 1 : 0,
                      }}
                    />
                    {['All', 'Active', 'Acknowledged', 'Resolved'].map(f => (
                      <button key={f} className={alertFilter === f ? 'active' : ''} onClick={() => setAlertFilter(f)}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className="alert-list">
                  {alerts.filter(a => alertFilter === 'All' || a.status === alertFilter).map(a => (
                    <div className="alert-entry" key={a.docId ?? a.id}>
                      <Icon name="bell" size={16} />
                      <div>
                        <strong>{allKnownAreas.find(x => x.area.id === a.areaId)?.area.name || 'Removed area'}</strong>
                        <p>{a.message}</p>
                        <small className="mono">
                          {date(a.createdAt)} · {a.status}
                          {a.emailSent ? ' · Email sent' : ''}
                        </small>
                      </div>
                      {a.status === 'Active' && (
                        <button
                          className="btn secondary"
                          disabled={busy}
                          onClick={() => {
                            if (firebaseMode) {
                              if (!user || !a.docId) return
                              void action(() => acknowledgeUserAlert(user.uid, a.docId!), 'Alert acknowledged')
                            } else {
                              void action(() => api(`/alerts/${a.id}`, 'PATCH'), 'Alert acknowledged')
                            }
                          }}
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!alerts.some(a => alertFilter === 'All' || a.status === alertFilter) && <Empty>No {alertFilter === 'All' ? '' : alertFilter.toLowerCase()} alerts</Empty>}
              </Card>
              <Card className="config-card">
                <div className="card-heading">
                  <Icon name="sliders" size={16} />
                  <div>
                    <h3>Create a smog alert rule</h3>
                    <p className="card-subtitle">{firebaseMode ? 'Personal alert threshold' : 'Shared monitoring workspace'}</p>
                  </div>
                </div>
                <p className="config-intro">Alert when a fresh US AQI reading exceeds your threshold.</p>
                {firebaseMode && !user && (
                  <div className="alerts-guest-signin">
                    <p className="data-footnote">Sign in with Google to configure personal alert rules and email alerts.</p>
                    <button type="button" className="btn primary" onClick={() => void signInWithGoogle()}>
                      <Icon name="user" size={16} />
                      Sign in with Google
                    </button>
                  </div>
                )}
                <form
                  onSubmit={(e: FormEvent<HTMLFormElement>) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    const areaId = Number(f.get('areaId'))
                    const aqiThreshold = Number(f.get('threshold'))
                    const emailNotify = f.get('emailNotify') === 'on'
                    if (firebaseMode) {
                      if (!user) {
                        void signInWithGoogle()
                        return
                      }
                      const target = allKnownAreas.find(item => item.area.id === areaId)
                      void action(
                        () =>
                          createUserAlertRule(user.uid, {
                            areaId,
                            cityDocId: target?.area.docId,
                            cityName: target?.area.name,
                            aqiThreshold,
                            enabled: true,
                            emailNotify,
                          }),
                        'Alert rule saved',
                      )
                      return
                    }
                    void action(() => api('/preferences', 'POST', { areaId, aqiThreshold, enabled: true }), 'Alert preference saved')
                  }}
                >
                  <div className="field">
                    <span>Monitored location</span>
                    <SelectDropdown
                      name="areaId"
                      key={selected}
                      ariaLabel="Monitored location"
                      defaultValue={current?.area.active ? String(selected) : undefined}
                      disabled={!activeMonitoredAreas.length || (firebaseMode && !user)}
                      options={activeMonitoredAreas.map(a => ({ value: String(a.area.id), label: a.area.name }))}
                    />
                  </div>
                  <Field label="AQI threshold (1–500)">
                    <input name="threshold" type="number" min="1" max="500" defaultValue="100" required disabled={firebaseMode && !user} />
                  </Field>
                  {firebaseMode && (
                    <label className="checkbox-label alert-email-checkbox">
                      <input
                        name="emailNotify"
                        type="checkbox"
                        defaultChecked={profile?.emailAlertsEnabled ?? true}
                        disabled={!user}
                      />
                      Send email alert
                    </label>
                  )}
                  <button className="btn primary full" disabled={busy || !activeMonitoredAreas.length || (firebaseMode && !user)}>
                    <Icon name="plus" size={16} />
                    Enable alert rule
                  </button>
                </form>
              </Card>
            </div>
            <Card className="comparison-card">
              <h3>Your smog alert rules</h3>
              {preferences.some(p => !p.systemRule) ? (
                preferences
                  .filter(p => !p.systemRule)
                  .map(p =>
                    firebaseMode ? (
                      <FirebasePreferenceRow
                        key={`${p.docId ?? p.id}-${p.aqiThreshold}-${p.enabled}-${Boolean(p.emailNotify)}`}
                        preference={p}
                        location={allKnownAreas.find(a => a.area.id === p.areaId)?.area.name || 'Removed area'}
                        busy={busy}
                        save={value => {
                          if (!user || !p.docId) return
                          void action(() => updateUserAlertRule(user.uid, p.docId!, value), 'Alert rule updated')
                        }}
                        remove={() => {
                          if (!user || !p.docId) return
                          void action(() => deleteUserAlertRule(user.uid, p.docId!), 'Alert rule removed')
                        }}
                      />
                    ) : (
                      <PreferenceRow
                        key={`${p.id}-${p.aqiThreshold}-${p.enabled}`}
                        preference={p}
                        location={allKnownAreas.find(a => a.area.id === p.areaId)?.area.name || 'Removed area'}
                        busy={busy}
                        save={value => { void action(() => api(`/preferences/${p.id}`, 'PUT', value), 'Preference updated') }}
                        remove={() => { void action(() => api(`/preferences/${p.id}`, 'DELETE'), 'Preference removed') }}
                      />
                    ),
                  )
              ) : (
                <Empty>No alert preferences configured</Empty>
              )}
            </Card>
          </>}
          {!firebaseMode && page === 'admin' && <><Card className="admin-access"><div><h3>Manage network</h3><p className="config-intro">Administrator token required to edit cities and shared rules.</p></div><Field label="Administrator token"><input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Enter administrator token" /></Field><button className="btn primary" disabled={defaultAreas.length >= 5} onClick={() => { setEditing(null); setShowForm(!showForm) }}><Icon name="plus" size={16} />{defaultAreas.length >= 5 ? 'Default cities configured' : showForm ? 'Close form' : 'Add default city'}</button></Card>
            {showForm && <Card className="location-form"><h3>{editing?.id ? 'Edit monitoring location' : 'Add monitoring location'}</h3><form key={editing ? `${editing.id}-${editing.latitude}-${editing.longitude}` : 'new'} onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); void action(async () => { await api(editing?.id ? `/admin/areas/${editing.id}` : '/admin/areas', editing?.id ? 'PUT' : 'POST', { name: f.get('name'), latitude: Number(f.get('latitude')), longitude: Number(f.get('longitude')), active: f.get('active') === 'on' }, token); setShowForm(false) }, 'Location saved. Refresh data to load its readings') }}><div className="field"><span>Location name</span>{editing?.customLocation ? <input name="name" required maxLength={80} defaultValue={editing.name} /> : <SelectDropdown name="name" ariaLabel="Location name" defaultValue={editing?.name.split(',')[0]} options={['Karachi', 'Lahore', 'Islamabad', 'Peshawar', 'Quetta'].filter(city => editing ? editing.name.split(',')[0] === city : !defaultAreas.some(item => item.area.name.split(',')[0] === city)).map(city => ({ value: city, label: city }))} />}</div><Field label="Latitude (−90 to 90)"><input name="latitude" type="number" step="any" min="-90" max="90" required defaultValue={editing?.latitude} /></Field><Field label="Longitude (−180 to 180)"><input name="longitude" type="number" step="any" min="-180" max="180" required defaultValue={editing?.longitude} /></Field><label className="checkbox-label"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} />Monitoring enabled</label><button className="btn primary" disabled={busy || !token}>Save location</button></form></Card>}
            <Card className="management-card"><div className="card-title-row"><div><h3>Monitored locations</h3><p className="card-subtitle">Monitoring coverage</p></div><span className="muted mono">{areas.length} locations</span></div>{areas.map(a => <div className="management-item" key={a.area.id}><Icon name="pin" size={16} /><div className="management-name"><strong>{a.area.name}</strong><span className="mono">{a.area.latitude}, {a.area.longitude} · {a.area.active ? 'Enabled' : 'Paused'}</span><span>{a.area.lastError || (a.stale ? 'Stale or unavailable data' : 'Recent estimate available')}</span></div><button className="btn secondary" onClick={() => { setEditing(a.area); setShowForm(true) }}>Edit</button><button className="icon-button danger" disabled={busy || !token} aria-label={`Remove ${a.area.name}`} onClick={() => { if (window.confirm(`Remove ${a.area.name} from monitoring? Its saved readings and rules are retained.`)) void action(() => api(`/admin/areas/${a.area.id}`, 'DELETE', undefined, token), 'Location removed from monitoring') }}><Icon name="trash" size={16} /></button></div>)}{!areas.length && <Empty>Add your first monitoring location</Empty>}</Card><AdminRules areas={areas} preferences={preferences} token={token} busy={busy} run={action} />
          </>}
          {firebaseMode && isAdmin && page.startsWith('admin-') && (
            <AdminPanel
              section={page as AdminSection}
              getIdToken={getIdToken}
              onDataChanged={load}
            />
          )}
        </>}
        {!lockedViewport && <footer className="app-footer"><span>Smog Monitor — Air quality monitoring and alerts</span><span>Data: <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noreferrer">Open-Meteo</a> · <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noreferrer">CAMS</a></span></footer>}
      </main></div>
  </div>
}
