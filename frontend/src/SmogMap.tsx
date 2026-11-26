import { useEffect, useMemo, useRef, useState } from 'react'
import { divIcon, type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { category, type AreaData } from './api'
import SelectDropdown from './SelectDropdown'
import 'leaflet/dist/leaflet.css'
import './smog-map.css'

const CARTO_API_KEY = import.meta.env.VITE_CARTO_API_KEY || 'cb1_5fm1_1_d408a1cab46481fcbc011252'

type TileConfig = {
  url: string
  attribution: string
  subdomains?: string
}

const VOYAGER_TILE: TileConfig = {
  url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_API_KEY}`,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
}

const OSM_FALLBACK_TILE: TileConfig = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}

const TILE_ERROR_THRESHOLD = 4

const bands = [
  { value: 25, range: '0–50' }, { value: 75, range: '51–100' },
  { value: 125, range: '101–150' }, { value: 175, range: '151–200' },
  { value: 250, range: '201–300' }, { value: 350, range: '301+' },
]
const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

function locationStatus({ area, stale, reading }: AreaData) {
  if (!area.active) return 'Monitoring paused'
  if (stale) return reading ? 'Stale reading' : 'No reading available'
  if (area.lastError) return 'Latest provider check failed'
  return 'Latest available reading'
}

function MarkerPopup({ data, onOpenLocation }: {
  data: AreaData
  onOpenLocation: (id: number) => void
}) {
  const { area, reading } = data
  const level = category(reading?.aqi)
  return <div className="smog-map-popup">
    <h3>{area.name}</h3>
    <span className={`status-pill ${level.style}`}>{level.label}</span>
    <dl>
      <div><dt>US AQI</dt><dd>{reading?.aqi == null ? '—' : format.format(reading.aqi)}</dd></div>
      <div><dt>PM2.5</dt><dd>{reading?.pm25 == null ? '—' : `${format.format(reading.pm25)} μg/m³`}</dd></div>
      <div><dt>PM10</dt><dd>{reading?.pm10 == null ? '—' : `${format.format(reading.pm10)} μg/m³`}</dd></div>
    </dl>
    <p>{locationStatus(data)}{reading && <> · <time dateTime={reading.timestamp}>{new Date(reading.timestamp).toLocaleString()}</time></>}</p>
    {reading && <p>{reading.source}</p>}
    <button type="button" className="btn primary" onClick={() => onOpenLocation(area.id)}>View dashboard</button>
  </div>
}

function KeepMapSized() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize({ pan: false })
    const raf = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false, debounceMoveend: true }))
    observer.observe(map.getContainer())
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [map])
  return null
}

export default function SmogMap({ areas, onOpenLocation }: {
  areas: AreaData[]
  onOpenLocation: (id: number) => void
}) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [useOsmFallback, setUseOsmFallback] = useState(false)
  const [selected, setSelected] = useState('')
  const markers = useRef(new Map<number, LeafletMarker>())
  const hasAutoFitted = useRef(false)
  const tileErrorCount = useRef(0)

  const locations = useMemo(
    () => areas.filter(({ area }) => Number.isFinite(area.latitude) && Number.isFinite(area.longitude)),
    [areas],
  )

  useEffect(() => {
    if (!map || hasAutoFitted.current || locations.length === 0) return
    hasAutoFitted.current = true
    map.fitBounds(
      locations.map(({ area }) => [area.latitude, area.longitude]),
      { padding: [56, 56], maxZoom: 10, animate: false },
    )
  }, [map, locations])

  function zoomToLocations() {
    if (!map || !locations.length) return
    map.fitBounds(locations.map(({ area }) => [area.latitude, area.longitude]), {
      padding: [56, 56], maxZoom: 10, animate: false,
    })
  }

  function focusLocation(id: number) {
    const location = locations.find(({ area }) => area.id === id)
    if (!map || !location) return
    setSelected(String(id))
    const { latitude, longitude } = location.area
    map.setView([latitude, longitude], Math.max(map.getZoom(), 9), { animate: false })
    markers.current.get(id)?.openPopup()
  }

  const activeTile = useOsmFallback ? OSM_FALLBACK_TILE : VOYAGER_TILE

  return <section className="card smog-map-card" aria-label="Monitored locations map">
    <div className="smog-map-toolbar">
      <div className="field">
        <span>Find a monitored location</span>
        <SelectDropdown
          options={locations.map(({ area }) => ({ value: String(area.id), label: area.name }))}
          value={locations.some(({ area }) => String(area.id) === selected) ? selected : ''}
          onChange={value => focusLocation(Number(value))}
          placeholder="Choose a location"
          ariaLabel="Find a monitored location"
          disabled={!map || !locations.length}
        />
      </div>
      <div className="smog-map-actions">
        <button type="button" className="btn secondary" disabled={!map || !locations.length} onClick={zoomToLocations}>Zoom to monitored locations</button>
        <button type="button" className="btn secondary" disabled={!map} onClick={() => map?.fitWorld({ animate: false })}>World view</button>
      </div>
    </div>
    {!locations.length && <p className="smog-map-notice" role="status">Use Add location to place your first marker</p>}
    <MapContainer ref={setMap} center={[20, 0]} zoom={2} minZoom={1} maxZoom={19} worldCopyJump className="smog-map-canvas">
      <TileLayer
        key={useOsmFallback ? 'osm' : 'voyager'}
        url={activeTile.url}
        attribution={activeTile.attribution}
        {...(activeTile.subdomains ? { subdomains: activeTile.subdomains } : {})}
        maxZoom={19}
        eventHandlers={{
          tileload: () => {
            tileErrorCount.current = 0
          },
          tileerror: () => {
            if (useOsmFallback) return
            tileErrorCount.current += 1
            if (tileErrorCount.current >= TILE_ERROR_THRESHOLD) {
              tileErrorCount.current = 0
              setUseOsmFallback(true)
            }
          },
        }}
      />
      <KeepMapSized />
      {locations.map(data => {
        const { area, reading, stale } = data
        const tone = area.active && !stale && reading?.aqi != null ? category(reading.aqi).style : 'unknown'
        const icon = divIcon({
          className: `smog-map-marker smog-map-tone-${tone}`,
          html: reading?.aqi == null ? '—' : format.format(reading.aqi),
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          popupAnchor: [0, -18],
        })
        return <Marker key={area.id} position={[area.latitude, area.longitude]} icon={icon} title={area.name}
          ref={marker => { if (marker) markers.current.set(area.id, marker); else markers.current.delete(area.id) }}>
          <Popup minWidth={212}><MarkerPopup data={data} onOpenLocation={onOpenLocation} /></Popup>
        </Marker>
      })}
    </MapContainer>
    <div className="smog-map-key">
      <h3>US AQI legend</h3>
      <ul>
        {bands.map(({ value, range }) => {
          const level = category(value)
          return <li key={range}><span className={`smog-map-dot smog-map-tone-${level.style}`} aria-hidden="true" />{level.label} <small>{range}</small></li>
        })}
        <li><span className="smog-map-dot smog-map-tone-unknown" aria-hidden="true" />Stale, unavailable or paused</li>
      </ul>
    </div>
  </section>
}
