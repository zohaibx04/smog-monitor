import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Icon } from './App'
import SelectDropdown from './SelectDropdown'

export type AdminSection =
  | 'admin-overview'
  | 'admin-catalog'
  | 'admin-users'
  | 'admin-advisories'
  | 'admin-health'

interface AdminCity {
  id: string
  name: string
  latitude: number
  longitude: number
  active: boolean
  isStarter: boolean
  stale?: boolean
  lastError?: string | null
  watchlistCount?: number
  updatedAt?: string
  latestReading?: {
    aqi?: number | null
    pm25?: number | null
    pm10?: number | null
    timestamp?: string
  } | null
}

interface AdminUser {
  uid: string
  email: string | null
  name?: string | null
  picture?: string | null
  displayName?: string | null
  photoURL?: string | null
  role: 'user' | 'admin'
  disabled: boolean
  lastSeenAt?: string
  createdAt?: string
}

interface AdminAdvisory {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  active: boolean
  createdAt?: string
}

interface AdminRule {
  id: string
  cityId: string
  cityDocId?: string
  cityName?: string
  aqiThreshold: number
  enabled: boolean
  createdAt?: string
}

interface EmailLogItem {
  id: string
  uid?: string
  toEmail: string
  cityName: string
  aqi: number | null
  threshold: number
  status: 'sent' | 'failed' | 'skipped'
  error?: string | null
  createdAt: string
}

interface AnalyticsPayload {
  totalUsers: number
  adminCount: number
  totalCities: number
  activeCities: number
  staleCities: number
  activeAlertsCount: number
  topCities: { id: string; name: string; watchlistCount: number; aqi: number | null }[]
  recentEmailLogs: EmailLogItem[]
}

function formatDate(value?: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function initialsOf(name: string | null, email: string | null): string {
  const source = (name || email || 'U').trim()
  const parts = source.split(/\s+/)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

export default function AdminPanel({
  section,
  getIdToken,
  onDataChanged,
}: {
  section: AdminSection
  getIdToken: () => Promise<string | null>
  onDataChanged: () => Promise<void>
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null)
  const [cities, setCities] = useState<AdminCity[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [advisories, setAdvisories] = useState<AdminAdvisory[]>([])
  const [rules, setRules] = useState<AdminRule[]>([])

  const [cityQuery, setCityQuery] = useState('')
  const [userQuery, setUserQuery] = useState('')

  const [editingCityId, setEditingCityId] = useState<string | null>(null)
  const [cityName, setCityName] = useState('')
  const [cityLat, setCityLat] = useState('')
  const [cityLon, setCityLon] = useState('')
  const [cityActive, setCityActive] = useState(true)
  const [cityStarter, setCityStarter] = useState(false)

  const [advTitle, setAdvTitle] = useState('')
  const [advMessage, setAdvMessage] = useState('')
  const [advSeverity, setAdvSeverity] = useState<'info' | 'warning' | 'critical'>('warning')

  const [ruleCityId, setRuleCityId] = useState('')
  const [ruleThreshold, setRuleThreshold] = useState('150')

  const authedFetch = useCallback(
    async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => {
      const token = await getIdToken()
      if (!token) throw new Error('Sign in as an administrator to manage the network')
      const response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.message || `Request failed (${response.status})`)
      }
      const text = await response.text()
      return (text ? JSON.parse(text) : undefined) as T
    },
    [getIdToken],
  )

  const loadSection = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (section === 'admin-overview' || section === 'admin-health') {
        const [analyticsRes, citiesRes] = await Promise.all([
          authedFetch<AnalyticsPayload>('/api/admin/analytics'),
          authedFetch<AdminCity[] | { cities?: AdminCity[] }>('/api/admin/cities'),
        ])
        setAnalytics(analyticsRes)
        setCities(Array.isArray(citiesRes) ? citiesRes : citiesRes.cities ?? [])
      } else if (section === 'admin-catalog') {
        const citiesRes = await authedFetch<AdminCity[] | { cities?: AdminCity[] }>('/api/admin/cities')
        setCities(Array.isArray(citiesRes) ? citiesRes : citiesRes.cities ?? [])
      } else if (section === 'admin-users') {
        const usersRes = await authedFetch<AdminUser[] | { users?: AdminUser[] }>('/api/admin/users')
        setUsers(Array.isArray(usersRes) ? usersRes : usersRes.users ?? [])
      } else if (section === 'admin-advisories') {
        const [advRes, citiesRes] = await Promise.all([
          authedFetch<{ advisories?: AdminAdvisory[]; rules?: AdminRule[] }>('/api/admin/advisories'),
          authedFetch<AdminCity[] | { cities?: AdminCity[] }>('/api/admin/cities'),
        ])
        setAdvisories(advRes.advisories ?? [])
        setRules(advRes.rules ?? [])
        const loadedCities = Array.isArray(citiesRes) ? citiesRes : citiesRes.cities ?? []
        setCities(loadedCities)
        if (!ruleCityId && loadedCities[0]) setRuleCityId(loadedCities[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load administrator data')
    } finally {
      setLoading(false)
    }
  }, [authedFetch, ruleCityId, section])

  useEffect(() => {
    setNotice('')
    void loadSection()
  }, [loadSection])

  async function runAction(work: () => Promise<string>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const msg = await work()
      await loadSection()
      await onDataChanged()
      setNotice(msg)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setBusy(false)
    }
  }

  function startEditCity(city: AdminCity) {
    setEditingCityId(city.id)
    setCityName(city.name)
    setCityLat(String(city.latitude))
    setCityLon(String(city.longitude))
    setCityActive(city.active)
    setCityStarter(city.isStarter)
  }

  function resetCityForm() {
    setEditingCityId(null)
    setCityName('')
    setCityLat('')
    setCityLon('')
    setCityActive(true)
    setCityStarter(false)
  }

  function handleSaveCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      await authedFetch('/api/admin/cities', editingCityId ? 'PUT' : 'POST', {
        id: editingCityId ?? undefined,
        name: cityName.trim(),
        latitude: Number(cityLat),
        longitude: Number(cityLon),
        active: cityActive,
        isStarter: cityStarter,
      })
      const savedName = cityName.trim()
      resetCityForm()
      return editingCityId ? `Updated ${savedName}` : `Added ${savedName} to global catalog`
    })
  }

  function handleCreateAdvisory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runAction(async () => {
      await authedFetch('/api/admin/advisories', 'POST', {
        kind: 'advisory',
        title: advTitle.trim(),
        message: advMessage.trim(),
        severity: advSeverity,
        active: true,
      })
      setAdvTitle('')
      setAdvMessage('')
      return 'Published system advisory'
    })
  }

  function handleCreateRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetCity = cities.find((c) => c.id === ruleCityId)
    void runAction(async () => {
      await authedFetch('/api/admin/advisories', 'POST', {
        kind: 'rule',
        cityId: ruleCityId,
        cityName: targetCity?.name ?? ruleCityId,
        aqiThreshold: Number(ruleThreshold),
        enabled: true,
      })
      return 'Created official alert rule'
    })
  }

  const filteredCities = cityQuery.trim()
    ? cities.filter((c) => c.name.toLowerCase().includes(cityQuery.trim().toLowerCase()))
    : cities

  const filteredUsers = userQuery.trim()
    ? users.filter((u) => {
        const q = userQuery.trim().toLowerCase()
        return (
          (u.displayName ?? u.name ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
        )
      })
    : users

  const staleOrErrorCities = cities.filter((c) => c.stale || c.lastError)
  const maxWatchlist = Math.max(1, ...(analytics?.topCities.map((c) => c.watchlistCount) ?? [1]))

  return (
    <div className="admin-panel">
      {error && (
        <div className="notice error-notice" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Icon name="check" size={16} />
          <span>{notice}</span>
        </div>
      )}

      {loading && !analytics && cities.length === 0 && users.length === 0 && advisories.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Icon name="clock" size={16} />
            <p>Loading administrator workspace…</p>
          </div>
        </div>
      ) : null}

      {section === 'admin-overview' && analytics && (
        <div className="admin-panel-section">
          <div className="admin-kpi-grid">
            <div className="card admin-kpi-card">
              <span className="admin-kpi-label">Registered users</span>
              <strong className="admin-kpi-value mono">{analytics.totalUsers}</strong>
              <span className="admin-kpi-meta mono">{analytics.adminCount} admins</span>
            </div>
            <div className="card admin-kpi-card">
              <span className="admin-kpi-label">Global cities</span>
              <strong className="admin-kpi-value mono">{analytics.totalCities}</strong>
              <span className="admin-kpi-meta mono">{analytics.activeCities} active</span>
            </div>
            <div className="card admin-kpi-card">
              <span className="admin-kpi-label">Stale readings</span>
              <strong className="admin-kpi-value mono">{analytics.staleCities}</strong>
              <span className="admin-kpi-meta">Needs sync or check</span>
            </div>
            <div className="card admin-kpi-card">
              <span className="admin-kpi-label">Active user alerts</span>
              <strong className="admin-kpi-value mono">{analytics.activeAlertsCount}</strong>
              <span className="admin-kpi-meta">Across all watchlists</span>
            </div>
          </div>

          <div className="admin-overview-grid">
            <section className="card admin-panel-card">
              <div className="card-title-row">
                <div>
                  <h3>Top monitored cities</h3>
                  <p className="data-footnote">Ranked by user watchlist count</p>
                </div>
                <Icon name="list" size={16} />
              </div>

              {analytics.topCities.length === 0 ? (
                <div className="empty-state">
                  <Icon name="database" size={16} />
                  <p>No monitored cities tracked yet</p>
                </div>
              ) : (
                <ul className="admin-bar-list">
                  {analytics.topCities.map((city) => {
                    const pct = Math.max(6, Math.round((city.watchlistCount / maxWatchlist) * 100))
                    return (
                      <li key={city.id} className="admin-bar-item">
                        <div className="admin-bar-head">
                          <span>{city.name}</span>
                          <span className="mono">
                            {city.watchlistCount} watchers · {city.aqi ?? '—'} AQI
                          </span>
                        </div>
                        <div className="rankings-bar-track" aria-hidden="true">
                          <div
                            className="rankings-bar-fill"
                            style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="card admin-panel-card">
              <div className="card-title-row">
                <div>
                  <h3>Recent email alerts</h3>
                  <p className="data-footnote">Resend threshold notifications</p>
                </div>
                <Icon name="bell" size={16} />
              </div>

              {analytics.recentEmailLogs.length === 0 ? (
                <div className="empty-state">
                  <Icon name="bell" size={16} />
                  <p>No email notifications logged yet</p>
                </div>
              ) : (
                <ul className="admin-log-list">
                  {analytics.recentEmailLogs.slice(0, 8).map((log) => (
                    <li key={log.id} className="admin-log-item">
                      <div>
                        <strong>{log.cityName}</strong>
                        <span>{log.toEmail}</span>
                      </div>
                      <span className={`status-pill ${log.status === 'sent' ? 'good' : log.status === 'failed' ? 'unhealthy' : 'unknown'}`}>
                        <span className="status-dot" />
                        {log.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {section === 'admin-catalog' && (
        <div className="admin-panel-section">
          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>{editingCityId ? 'Edit catalog city' : 'Add city to global catalog'}</h3>
                <p className="data-footnote">Manage cities available across all user watchlists</p>
              </div>
              {editingCityId && (
                <button type="button" className="btn secondary" onClick={resetCityForm}>
                  Cancel edit
                </button>
              )}
            </div>

            <form className="admin-city-form" onSubmit={handleSaveCity}>
              <label className="field">
                <span>City name</span>
                <input
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  placeholder="Islamabad, Pakistan"
                  maxLength={80}
                  required
                />
              </label>
              <label className="field">
                <span>Latitude</span>
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={cityLat}
                  onChange={(e) => setCityLat(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Longitude</span>
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={cityLon}
                  onChange={(e) => setCityLon(e.target.value)}
                  required
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cityActive}
                  onChange={(e) => setCityActive(e.target.checked)}
                />
                Active
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cityStarter}
                  onChange={(e) => setCityStarter(e.target.checked)}
                />
                Starter city
              </label>
              <button type="submit" className="btn primary" disabled={busy || !cityName.trim()}>
                <Icon name={editingCityId ? 'check' : 'plus'} size={16} />
                {editingCityId ? 'Save city' : 'Add city'}
              </button>
            </form>
          </section>

          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>Global city catalog</h3>
                <p className="data-footnote mono">{filteredCities.length} of {cities.length} cities</p>
              </div>
              <label className="search-box">
                <Icon name="search" size={16} />
                <input
                  type="search"
                  placeholder="Search catalog"
                  aria-label="Search catalog"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                />
              </label>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>City</th>
                    <th>Coordinates</th>
                    <th className="num-col">US AQI</th>
                    <th>Starter</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCities.map((city) => (
                    <tr key={city.id}>
                      <td><strong>{city.name}</strong></td>
                      <td className="mono">{city.latitude.toFixed(2)}, {city.longitude.toFixed(2)}</td>
                      <td className="num-col mono">{city.latestReading?.aqi ?? '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary rankings-inspect-btn"
                          disabled={busy}
                          onClick={() =>
                            void runAction(async () => {
                              await authedFetch('/api/admin/cities', 'PUT', {
                                id: city.id,
                                isStarter: !city.isStarter,
                              })
                              return `${city.name} starter status updated`
                            })
                          }
                        >
                          {city.isStarter ? 'Starter' : 'Standard'}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn secondary rankings-inspect-btn"
                          disabled={busy}
                          onClick={() =>
                            void runAction(async () => {
                              await authedFetch('/api/admin/cities', 'PUT', {
                                id: city.id,
                                active: !city.active,
                              })
                              return `${city.name} ${city.active ? 'paused' : 'activated'}`
                            })
                          }
                        >
                          {city.active ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="admin-row-actions">
                        <button
                          type="button"
                          className="btn secondary rankings-inspect-btn"
                          disabled={busy}
                          onClick={() => startEditCity(city)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Delete ${city.name}`}
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete ${city.name} from global catalog?`)) {
                              void runAction(async () => {
                                await authedFetch(`/api/admin/cities?id=${encodeURIComponent(city.id)}`, 'DELETE')
                                return `Removed ${city.name}`
                              })
                            }
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {section === 'admin-users' && (
        <div className="admin-panel-section">
          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>Users & roles</h3>
                <p className="data-footnote mono">{filteredUsers.length} of {users.length} accounts</p>
              </div>
              <label className="search-box">
                <Icon name="search" size={16} />
                <input
                  type="search"
                  placeholder="Search users or email"
                  aria-label="Search users or email"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                />
              </label>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="empty-state">
                <Icon name="database" size={16} />
                <p>No matching user accounts</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Last seen</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const userName = u.displayName || u.name || null
                      const userPhoto = u.photoURL || u.picture || null
                      return (
                      <tr key={u.uid}>
                        <td>
                          <div className="admin-user-cell">
                            {userPhoto ? (
                              <img src={userPhoto} alt="" className="admin-user-avatar" />
                            ) : (
                              <span className="admin-user-initials mono">
                                {initialsOf(userName, u.email)}
                              </span>
                            )}
                            <span>{userName || 'Unnamed user'}</span>
                          </div>
                        </td>
                        <td className="mono">{u.email || '—'}</td>
                        <td>
                          <span className={`status-pill ${u.role === 'admin' ? 'good' : 'unknown'}`}>
                            <span className="status-dot" />
                            {u.role === 'admin' ? 'Admin' : 'User'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${u.disabled ? 'unhealthy' : 'good'}`}>
                            <span className="status-dot" />
                            {u.disabled ? 'Disabled' : 'Active'}
                          </span>
                        </td>
                        <td className="mono">{formatDate(u.lastSeenAt)}</td>
                        <td className="admin-row-actions">
                          <button
                            type="button"
                            className="btn secondary rankings-inspect-btn"
                            disabled={busy}
                            onClick={() =>
                              void runAction(async () => {
                                const nextRole = u.role === 'admin' ? 'user' : 'admin'
                                await authedFetch('/api/admin/users', 'PATCH', {
                                  uid: u.uid,
                                  role: nextRole,
                                })
                                return `Updated ${u.email || u.uid} role to ${nextRole}`
                              })
                            }
                          >
                            {u.role === 'admin' ? 'Revoke admin' : 'Make admin'}
                          </button>
                          <button
                            type="button"
                            className="btn secondary rankings-inspect-btn"
                            disabled={busy}
                            onClick={() =>
                              void runAction(async () => {
                                await authedFetch('/api/admin/users', 'PATCH', {
                                  uid: u.uid,
                                  disabled: !u.disabled,
                                })
                                return `${u.disabled ? 'Enabled' : 'Disabled'} ${u.email || u.uid}`
                              })
                            }
                          >
                            {u.disabled ? 'Enable' : 'Disable'}
                          </button>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {section === 'admin-advisories' && (
        <div className="admin-panel-section admin-two-col">
          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>System advisories</h3>
                <p className="data-footnote">Network-wide banners displayed to all users</p>
              </div>
              <Icon name="bell" size={16} />
            </div>

            <form className="admin-stacked-form" onSubmit={handleCreateAdvisory}>
              <label className="field">
                <span>Headline</span>
                <input
                  value={advTitle}
                  onChange={(e) => setAdvTitle(e.target.value)}
                  placeholder="Severe winter smog advisory"
                  maxLength={100}
                  required
                />
              </label>
              <label className="field">
                <span>Message</span>
                <input
                  value={advMessage}
                  onChange={(e) => setAdvMessage(e.target.value)}
                  placeholder="Limit outdoor activity during evening peaks"
                  maxLength={280}
                  required
                />
              </label>
              <div className="field">
                <span>Severity</span>
                <SelectDropdown
                  value={advSeverity}
                  onChange={(val) => setAdvSeverity(val as 'info' | 'warning' | 'critical')}
                  ariaLabel="Advisory severity"
                  options={[
                    { value: 'info', label: 'Informational' },
                    { value: 'warning', label: 'Warning' },
                    { value: 'critical', label: 'Critical' },
                  ]}
                />
              </div>
              <button type="submit" className="btn primary" disabled={busy || !advTitle.trim()}>
                <Icon name="plus" size={16} />
                Publish advisory
              </button>
            </form>

            <div className="admin-list-wrap">
              {advisories.length === 0 ? (
                <div className="empty-state">
                  <Icon name="info" size={16} />
                  <p>No system advisories published</p>
                </div>
              ) : (
                advisories.map((adv) => (
                  <div key={adv.id} className="admin-list-row">
                    <div>
                      <strong>{adv.title}</strong>
                      <p>{adv.message}</p>
                      <small className="mono">{adv.severity} · {adv.active ? 'Active' : 'Inactive'}</small>
                    </div>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="btn secondary rankings-inspect-btn"
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            await authedFetch('/api/admin/advisories', 'PUT', {
                              kind: 'advisory',
                              id: adv.id,
                              active: !adv.active,
                            })
                            return 'Advisory status updated'
                          })
                        }
                      >
                        {adv.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Delete advisory ${adv.title}`}
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            await authedFetch(
                              `/api/admin/advisories?kind=advisory&id=${encodeURIComponent(adv.id)}`,
                              'DELETE',
                            )
                            return 'Advisory removed'
                          })
                        }
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>Official alert rules</h3>
                <p className="data-footnote">Shared system thresholds across monitored cities</p>
              </div>
              <Icon name="shield" size={16} />
            </div>

            <form className="admin-stacked-form" onSubmit={handleCreateRule}>
              <div className="field">
                <span>City</span>
                <SelectDropdown
                  value={ruleCityId}
                  onChange={setRuleCityId}
                  ariaLabel="System rule city"
                  placeholder="Select city"
                  options={cities.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <label className="field">
                <span>US AQI threshold (1–500)</span>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={ruleThreshold}
                  onChange={(e) => setRuleThreshold(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn primary" disabled={busy || !ruleCityId}>
                <Icon name="plus" size={16} />
                Add system rule
              </button>
            </form>

            <div className="admin-list-wrap">
              {rules.length === 0 ? (
                <div className="empty-state">
                  <Icon name="sliders" size={16} />
                  <p>No official alert rules configured</p>
                </div>
              ) : (
                rules.map((rule) => (
                  <div key={rule.id} className="admin-list-row">
                    <div>
                      <strong>{rule.cityName || rule.cityId || rule.cityDocId}</strong>
                      <small className="mono">
                        US AQI &gt; {rule.aqiThreshold} · {rule.enabled ? 'Enabled' : 'Paused'}
                      </small>
                    </div>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="btn secondary rankings-inspect-btn"
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            await authedFetch('/api/admin/advisories', 'PUT', {
                              kind: 'rule',
                              id: rule.id,
                              enabled: !rule.enabled,
                            })
                            return 'System rule updated'
                          })
                        }
                      >
                        {rule.enabled ? 'Pause' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label="Delete system rule"
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            await authedFetch(
                              `/api/admin/advisories?kind=rule&id=${encodeURIComponent(rule.id)}`,
                              'DELETE',
                            )
                            return 'System rule deleted'
                          })
                        }
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {section === 'admin-health' && (
        <div className="admin-panel-section">
          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>Network ingestion & sync</h3>
                <p className="data-footnote">
                  Open-Meteo telemetry sync and threshold evaluation across {cities.length} global cities
                </p>
              </div>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const res = await authedFetch<{
                      refreshed?: number
                      errors?: number
                      alertsCreated?: number
                      emailsSent?: number
                    }>('/api/cron/refresh', 'POST')
                    return `Synced ${res.refreshed ?? 0} cities · ${res.alertsCreated ?? 0} alerts created · ${res.emailsSent ?? 0} emails sent`
                  })
                }
              >
                <Icon name="refresh" size={16} />
                Force global refresh
              </button>
            </div>

            <div className="admin-kpi-grid">
              <div className="card admin-kpi-card">
                <span className="admin-kpi-label">Active cities</span>
                <strong className="admin-kpi-value mono">{analytics?.activeCities ?? 0}</strong>
              </div>
              <div className="card admin-kpi-card">
                <span className="admin-kpi-label">Stale or error</span>
                <strong className="admin-kpi-value mono">{staleOrErrorCities.length}</strong>
              </div>
              <div className="card admin-kpi-card">
                <span className="admin-kpi-label">Recent emails logged</span>
                <strong className="admin-kpi-value mono">{analytics?.recentEmailLogs.length ?? 0}</strong>
              </div>
            </div>
          </section>

          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>Stale or failing cities</h3>
                <p className="data-footnote">Cities requiring provider refresh or coordinate check</p>
              </div>
              <span className="mono rankings-count">{staleOrErrorCities.length} flagged</span>
            </div>

            {staleOrErrorCities.length === 0 ? (
              <div className="empty-state">
                <Icon name="check" size={16} />
                <p>All monitored cities have fresh telemetry readings</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Status</th>
                      <th>Last error</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staleOrErrorCities.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.name}</strong></td>
                        <td>{c.stale ? 'Stale' : 'Error'}</td>
                        <td>{c.lastError || 'Awaiting fresh reading'}</td>
                        <td className="mono">{formatDate(c.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card admin-panel-card">
            <div className="card-title-row">
              <div>
                <h3>Resend email delivery logs</h3>
                <p className="data-footnote">Latest alert email dispatches</p>
              </div>
              <Icon name="activity" size={16} />
            </div>

            {!analytics?.recentEmailLogs.length ? (
              <div className="empty-state">
                <Icon name="bell" size={16} />
                <p>No email delivery logs recorded yet</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Recipient</th>
                      <th className="num-col">AQI</th>
                      <th className="num-col">Threshold</th>
                      <th>Status</th>
                      <th>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentEmailLogs.map((log) => (
                      <tr key={log.id}>
                        <td><strong>{log.cityName}</strong></td>
                        <td className="mono">{log.toEmail}</td>
                        <td className="num-col mono">{log.aqi ?? '—'}</td>
                        <td className="num-col mono">{log.threshold}</td>
                        <td>
                          <span className={`status-pill ${log.status === 'sent' ? 'good' : log.status === 'failed' ? 'unhealthy' : 'unknown'}`}>
                            <span className="status-dot" />
                            {log.status}
                          </span>
                        </td>
                        <td className="mono">{formatDate(log.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
