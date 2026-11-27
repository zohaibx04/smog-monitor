import { useState, type FormEvent } from 'react'
import { category, type Area, type AreaData } from './api'
import { Icon } from './App'

type PickerTab = 'catalog' | 'worldwide'

interface PlaceResult {
  id: number
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
}

export interface MyLocationsProps {
  userAreas: AreaData[]
  globalAreas: AreaData[]
  defaultCityId?: string | null
  isSignedIn: boolean
  isFirebaseMode: boolean
  onSignIn: () => void | Promise<void>
  onAddCity: (city: {
    name: string
    latitude: number
    longitude: number
    docId?: string
  }) => Promise<void>
  onRemoveCity?: (area: Area) => Promise<void>
  onSetDefaultCity?: (area: Area) => Promise<void>
  onOpenCity: (id: number) => void
  getIdToken?: () => Promise<string | null>
}

function formatAqi(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value)
}

export default function MyLocations({
  userAreas,
  globalAreas,
  defaultCityId,
  isSignedIn,
  isFirebaseMode,
  onSignIn,
  onAddCity,
  onRemoveCity,
  onSetDefaultCity,
  onOpenCity,
  getIdToken,
}: MyLocationsProps) {
  const [pickerTab, setPickerTab] = useState<PickerTab>('catalog')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [country, setCountry] = useState('')
  const [results, setResults] = useState<PlaceResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [manualName, setManualName] = useState('')
  const [manualLat, setManualLat] = useState('')
  const [manualLon, setManualLon] = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const canModifyWatchlist = !isFirebaseMode || isSignedIn

  const isInWatchlist = (area: Area & { docId?: string }) =>
    userAreas.some((item) => {
      const candidate = item.area as Area & { docId?: string }
      if (area.docId && candidate.docId && area.docId === candidate.docId) return true
      if (candidate.id === area.id) return true
      return candidate.name.toLowerCase() === area.name.toLowerCase()
    })

  const isDefaultArea = (area: Area & { docId?: string }) => {
    if (!defaultCityId) return false
    return (
      (area.docId && area.docId === defaultCityId) ||
      String(area.id) === defaultCityId
    )
  }

  const trimmedCatalog = catalogQuery.trim().toLowerCase()
  const filteredCatalog = trimmedCatalog
    ? globalAreas.filter((item) => item.area.name.toLowerCase().includes(trimmedCatalog))
    : globalAreas

  async function handleCatalogAdd(item: AreaData) {
    const area = item.area as Area & { docId?: string }
    const key = area.docId ?? String(area.id)
    setBusyKey(key)
    setActionError('')
    try {
      await onAddCity({
        name: area.name,
        latitude: area.latitude,
        longitude: area.longitude,
        docId: area.docId,
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add location')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRemove(area: Area & { docId?: string }) {
    if (!onRemoveCity) return
    const key = `rm:${area.docId ?? area.id}`
    setBusyKey(key)
    setActionError('')
    try {
      await onRemoveCity(area)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove location')
    } finally {
      setBusyKey(null)
    }
  }

  async function handleSetDefault(area: Area & { docId?: string }) {
    if (!onSetDefaultCity) return
    const key = `def:${area.docId ?? area.id}`
    setBusyKey(key)
    setActionError('')
    try {
      await onSetDefaultCity(area)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not set default city')
    } finally {
      setBusyKey(null)
    }
  }

  async function runWorldSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearching(true)
    setSearchError('')
    setResults(null)
    const params = new URLSearchParams({
      q: searchQuery.trim(),
      country: country.trim(),
      discover: 'true',
    })
    try {
      const token = isFirebaseMode && getIdToken ? await getIdToken() : null
      const response = await fetch(`/api/locations/search?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.message || `Search failed (${response.status})`)
      }
      setResults((await response.json()) as PlaceResult[])
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Location search failed')
    } finally {
      setSearching(false)
    }
  }

  function choosePlace(place: PlaceResult) {
    const label = [place.name, place.country].filter(Boolean).join(', ')
    setManualName(label.length <= 80 ? label : place.name.slice(0, 80))
    setManualLat(String(place.latitude))
    setManualLon(String(place.longitude))
    setActionError('')
  }

  async function handleManualAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingManual(true)
    setActionError('')
    try {
      await onAddCity({
        name: manualName.trim(),
        latitude: Number(manualLat),
        longitude: Number(manualLon),
      })
      setManualName('')
      setManualLat('')
      setManualLon('')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add location')
    } finally {
      setSavingManual(false)
    }
  }

  return (
    <div className="my-locations-layout">
      {actionError && (
        <div className="notice error-notice my-locations-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{actionError}</span>
        </div>
      )}

      <div className="my-locations-grid">
        <section className="card my-locations-watchlist" aria-label="Your monitored locations">
          <div className="card-title-row my-locations-head">
            <div>
              <h3>{isSignedIn ? 'My watchlist' : 'Starter locations'}</h3>
              <p className="data-footnote">
                {isSignedIn
                  ? 'Cities synced to your personal dashboard and alerts'
                  : 'Default cities shown while browsing as a guest'}
              </p>
            </div>
            <span className="my-locations-count mono">{userAreas.length} cities</span>
          </div>

          {!isSignedIn && isFirebaseMode && (
            <div className="my-locations-guest-prompt">
              <div className="my-locations-guest-copy">
                <Icon name="info" size={16} />
                <span>Sign in with Google to save custom cities, set a default city, and receive email alerts</span>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => void onSignIn()}
              >
                Sign in with Google
              </button>
            </div>
          )}

          {userAreas.length === 0 ? (
            <div className="empty-state">
              <Icon name="pin" size={16} />
              <p>No cities in your watchlist yet — add one from the catalog or search worldwide</p>
            </div>
          ) : (
            <ul className="my-locations-list">
              {userAreas.map((item) => {
                const area = item.area as Area & { docId?: string }
                const aqi = item.reading?.aqi
                const status = category(aqi)
                const isDef = isDefaultArea(area)
                const rowKey = area.docId ?? String(area.id)

                return (
                  <li key={rowKey} className="my-locations-item">
                    <div className="my-locations-item-info">
                      <div className="my-locations-item-title">
                        <Icon name="pin" size={16} />
                        <strong>{area.name}</strong>
                        {isDef && <span className="my-locations-default-badge">Default</span>}
                        {!area.active && <span className="rankings-city-paused">Paused</span>}
                      </div>
                      <div className="my-locations-item-meta">
                        <span className={`status-pill ${status.style}`}>
                          <span className="status-dot" />
                          {status.label}
                        </span>
                        <span className="mono my-locations-item-aqi">
                          {formatAqi(aqi)} US AQI
                        </span>
                      </div>
                    </div>

                    <div className="my-locations-item-actions">
                      {onSetDefaultCity && canModifyWatchlist && !isDef && (
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={busyKey === `def:${rowKey}`}
                          onClick={() => void handleSetDefault(area)}
                        >
                          Default
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => onOpenCity(area.id)}
                      >
                        Open
                      </button>
                      {onRemoveCity && canModifyWatchlist && (
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Remove ${area.name}`}
                          disabled={busyKey === `rm:${rowKey}`}
                          onClick={() => void handleRemove(area)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="card my-locations-picker" aria-label="Add cities">
          <div className="card-title-row my-locations-head">
            <div>
              <h3>Add locations</h3>
              <p className="data-footnote">Pick from the global catalog or search worldwide</p>
            </div>
            <div className="segmented" role="group" aria-label="Add location mode">
              <button
                type="button"
                className={pickerTab === 'catalog' ? 'active' : ''}
                onClick={() => setPickerTab('catalog')}
              >
                Global catalog
              </button>
              <button
                type="button"
                className={pickerTab === 'worldwide' ? 'active' : ''}
                onClick={() => setPickerTab('worldwide')}
              >
                Search worldwide
              </button>
            </div>
          </div>

          {pickerTab === 'catalog' ? (
            <div className="my-locations-catalog">
              <label className="search-box my-locations-search">
                <Icon name="search" size={16} />
                <input
                  type="search"
                  placeholder="Filter global catalog"
                  aria-label="Filter global catalog"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                />
              </label>

              {filteredCatalog.length === 0 ? (
                <div className="empty-state">
                  <Icon name="search" size={16} />
                  <p>No catalog cities match "{catalogQuery.trim()}"</p>
                </div>
              ) : (
                <ul className="my-locations-catalog-list">
                  {filteredCatalog.map((item) => {
                    const area = item.area as Area & { docId?: string }
                    const key = area.docId ?? String(area.id)
                    const added = isInWatchlist(area)
                    const status = category(item.reading?.aqi)

                    return (
                      <li key={key} className="my-locations-catalog-row">
                        <div className="my-locations-catalog-info">
                          <strong>{area.name}</strong>
                          <span className="mono my-locations-coords">
                            {area.latitude.toFixed(2)}, {area.longitude.toFixed(2)}
                          </span>
                        </div>
                        <span className={`status-pill ${status.style}`}>
                          <span className="status-dot" />
                          <span className="mono">{formatAqi(item.reading?.aqi)}</span>
                        </span>
                        {added ? (
                          <span className="my-locations-added-badge">
                            <Icon name="check" size={16} />
                            Added
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={!canModifyWatchlist || busyKey === key}
                            onClick={() => void handleCatalogAdd(item)}
                          >
                            <Icon name="plus" size={16} />
                            Add
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="my-locations-worldwide">
              <form className="world-search-form" onSubmit={runWorldSearch}>
                <label className="field">
                  <span>City or postcode</span>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Faisalabad"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <label className="field">
                  <span>Country code (optional)</span>
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    placeholder="PK"
                    maxLength={2}
                    pattern="[A-Za-z]{2}"
                  />
                </label>
                <button type="submit" className="btn secondary" disabled={searching || savingManual}>
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </form>

              {searchError && (
                <div className="notice error-notice" role="alert">
                  <Icon name="warning" size={16} />
                  <span>{searchError}</span>
                </div>
              )}

              {results?.length === 0 && (
                <p className="config-intro" role="status">
                  No locations found — try another query or enter coordinates below
                </p>
              )}

              {!!results?.length && (
                <div className="world-results">
                  {results.map((place) => (
                    <div className="world-result" key={place.id}>
                      <div>
                        <strong>{place.name}</strong>
                        <span>{[place.region, place.country].filter(Boolean).join(', ')}</span>
                        <small className="mono">
                          {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={savingManual}
                        onClick={() => choosePlace(place)}
                      >
                        Use location
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form className="my-locations-manual-form" onSubmit={handleManualAdd}>
                <label className="field">
                  <span>Location name</span>
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="City, Country"
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
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
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
                    value={manualLon}
                    onChange={(e) => setManualLon(e.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!canModifyWatchlist || savingManual || !manualName.trim()}
                >
                  <Icon name="plus" size={16} />
                  {savingManual ? 'Adding…' : 'Add to watchlist'}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
