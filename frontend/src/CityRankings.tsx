import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { category, type AreaData } from './api'
import { Icon } from './App'

type Metric = 'aqi' | 'pm25' | 'pm10'
type SortOrder = 'highest' | 'cleanest'

function SegmentedGroup<T extends string>({
  className,
  label,
  value,
  options,
  onChange,
}: {
  className: string
  label: string
  value: T
  options: { id: T; content: ReactNode }[]
  onChange: (next: T) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const update = () => {
      const btn = buttonRefs.current[value]
      if (!btn) return
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth })
    }
    update()

    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [value])

  return (
    <div ref={containerRef} className={`segmented ${className}`} role="group" aria-label={label}>
      {indicator.width > 0 && (
        <span
          className="segmented-glide-indicator"
          aria-hidden="true"
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: `${indicator.width}px`,
          }}
        />
      )}
      {options.map((option) => (
        <button
          key={option.id}
          ref={(el) => {
            buttonRefs.current[option.id] = el
          }}
          type="button"
          className={value === option.id ? 'active' : ''}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.content}
        </button>
      ))}
    </div>
  )
}

const AQI_TONE: Record<string, string> = {
  good: 'var(--aqi-good, var(--aqi-good-bg, #15803d))',
  moderate: 'var(--aqi-moderate, var(--aqi-moderate-bg, #eab308))',
  sensitive: 'var(--aqi-sensitive, var(--aqi-sensitive-bg, #c2410c))',
  unhealthy: 'var(--aqi-unhealthy, var(--aqi-unhealthy-bg, #b91c1c))',
  'very-unhealthy': 'var(--aqi-very-unhealthy, var(--aqi-very-unhealthy-bg, #7e22ce))',
  hazardous: 'var(--aqi-hazardous, var(--aqi-hazardous-bg, #881337))',
  unknown: 'var(--aqi-unknown, var(--aqi-unknown-bg, #525252))',
}

const METRIC_LABELS: Record<Metric, string> = {
  aqi: 'US AQI',
  pm25: 'PM2.5',
  pm10: 'PM10',
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits }).format(value)
}

function formatUpdated(value?: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function getBarColor(metric: Metric, value: number | null, aqi: number | null | undefined): string {
  if (value == null) return AQI_TONE.unknown
  if (metric === 'aqi') {
    const c = category(value)
    return AQI_TONE[c.style] ?? AQI_TONE.unknown
  }
  if (metric === 'pm25') {
    if (value <= 12) return AQI_TONE.good
    if (value <= 35.4) return AQI_TONE.moderate
    if (value <= 55.4) return AQI_TONE.sensitive
    if (value <= 150.4) return AQI_TONE.unhealthy
    if (value <= 250.4) return AQI_TONE['very-unhealthy']
    return AQI_TONE.hazardous
  }
  if (metric === 'pm10') {
    if (value <= 54) return AQI_TONE.good
    if (value <= 154) return AQI_TONE.moderate
    if (value <= 254) return AQI_TONE.sensitive
    if (value <= 354) return AQI_TONE.unhealthy
    if (value <= 424) return AQI_TONE['very-unhealthy']
    return AQI_TONE.hazardous
  }
  return AQI_TONE[category(aqi).style] ?? AQI_TONE.unknown
}

export default function CityRankings({
  areas,
  selectedId,
  onSelectCity,
}: {
  areas: AreaData[]
  selectedId: number
  onSelectCity: (id: number) => void
}) {
  const [metric, setMetric] = useState<Metric>('aqi')
  const [sortOrder, setSortOrder] = useState<SortOrder>('highest')
  const [query, setQuery] = useState('')

  const networkValues = areas
    .map((item) => item.reading?.[metric])
    .filter((v): v is number => v != null)

  const highestReading = networkValues.length ? Math.max(...networkValues) : null
  const cleanestReading = networkValues.length ? Math.min(...networkValues) : null
  const networkAverage = networkValues.length
    ? networkValues.reduce((sum, val) => sum + val, 0) / networkValues.length
    : null

  const withReading = areas
    .filter((item) => item.reading?.[metric] != null)
    .sort((a, b) => {
      const aVal = a.reading![metric]!
      const bVal = b.reading![metric]!
      if (aVal !== bVal) {
        return sortOrder === 'highest' ? bVal - aVal : aVal - bVal
      }
      return a.area.name.localeCompare(b.area.name)
    })

  const highestEntry = withReading.length
    ? withReading.reduce((best, cur) => (cur.reading![metric]! > best.reading![metric]! ? cur : best))
    : null
  const cleanestEntry = withReading.length
    ? withReading.reduce((best, cur) => (cur.reading![metric]! < best.reading![metric]! ? cur : best))
    : null

  const withoutReading = areas
    .filter((item) => item.reading?.[metric] == null)
    .sort((a, b) => a.area.name.localeCompare(b.area.name))

  const rankedAll: { item: AreaData; rank: number | null }[] = [
    ...withReading.map((item, idx) => ({ item, rank: idx + 1 })),
    ...withoutReading.map((item) => ({ item, rank: null })),
  ]

  const trimmedQuery = query.trim().toLowerCase()
  const visibleRows = trimmedQuery
    ? rankedAll.filter(({ item }) => item.area.name.toLowerCase().includes(trimmedQuery))
    : rankedAll

  const maxMetricValue = highestReading ?? 0
  const metricDecimals = metric === 'aqi' ? 0 : 1
  const metricUnit = metric === 'aqi' ? 'US AQI' : 'μg/m³'

  return (
    <div className="rankings-viewport">
      <section className="rankings-stats rankings-summary" aria-label="Network summary">
        <div className="card rankings-stat">
          <span className="rankings-stat-label">Highest reading</span>
          <strong className="rankings-stat-value mono">
            {formatNumber(highestReading, metricDecimals)}
            {highestReading != null && <small className="rankings-stat-unit"> {metricUnit}</small>}
          </strong>
          <span className="rankings-stat-meta">
            {highestEntry ? highestEntry.area.name : 'No reading'}
          </span>
        </div>
        <div className="card rankings-stat">
          <span className="rankings-stat-label">Cleanest city</span>
          <strong className="rankings-stat-value mono">
            {formatNumber(cleanestReading, metricDecimals)}
            {cleanestReading != null && <small className="rankings-stat-unit"> {metricUnit}</small>}
          </strong>
          <span className="rankings-stat-meta">
            {cleanestEntry ? cleanestEntry.area.name : 'No reading'}
          </span>
        </div>
        <div className="card rankings-stat">
          <span className="rankings-stat-label">Network average</span>
          <strong className="rankings-stat-value mono">
            {formatNumber(networkAverage, 1)}
            {networkAverage != null && <small className="rankings-stat-unit"> {metricUnit}</small>}
          </strong>
          <span className="rankings-stat-meta">
            Across {withReading.length} {withReading.length === 1 ? 'city' : 'cities'}
          </span>
        </div>
      </section>

      <div className="card rankings-toolbar">
        <SegmentedGroup
          className="rankings-metric-select"
          label="Ranking metric"
          value={metric}
          onChange={setMetric}
          options={(['aqi', 'pm25', 'pm10'] as const).map((m) => ({
            id: m,
            content: METRIC_LABELS[m],
          }))}
        />

        <SegmentedGroup
          className="rankings-sort-toggle"
          label="Sort order"
          value={sortOrder}
          onChange={setSortOrder}
          options={[
            {
              id: 'highest',
              content: (
                <>
                  <Icon name="arrowDown" size={16} />
                  Highest first
                </>
              ),
            },
            {
              id: 'cleanest',
              content: (
                <>
                  <Icon name="arrowUp" size={16} />
                  Cleanest first
                </>
              ),
            },
          ]}
        />

        <label className="search-box rankings-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search cities"
            aria-label="Search cities"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      <section className="card rankings-table-card rankings-card">
        <div className="card-title-row rankings-table-head">
          <div>
            <h3>Saved city rankings</h3>
            <p className="data-footnote">
              Ranked by {METRIC_LABELS[metric]} · {sortOrder === 'highest' ? 'Highest first' : 'Cleanest first'}
            </p>
          </div>
          <span className="rankings-count mono">
            {visibleRows.length} of {areas.length} cities
          </span>
        </div>

        {areas.length === 0 ? (
          <div className="empty-state">
            <Icon name="database" size={16} />
            <p>No saved cities in your monitoring network</p>
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="empty-state">
            <Icon name="search" size={16} />
            <p>No cities match "{query.trim()}"</p>
          </div>
        ) : (
          <div className="table-wrap rankings-table-wrap">
            <table className="rankings-table">
              <colgroup>
                <col className="rankings-col-rank" style={{ width: '64px' }} />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th className="rankings-rank-head">Rank</th>
                  <th className="rankings-city-head">City</th>
                  <th>Status</th>
                  <th className={`num-col${metric === 'aqi' ? ' rankings-col-active' : ''}`}>US AQI</th>
                  <th className={`num-col${metric === 'pm25' ? ' rankings-col-active' : ''}`}>PM2.5</th>
                  <th className={`num-col${metric === 'pm10' ? ' rankings-col-active' : ''}`}>PM10</th>
                  <th>Relative level</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ item, rank }) => {
                  const reading = item.reading
                  const aqiStatus = category(reading?.aqi)
                  const metricVal = reading?.[metric] ?? null
                  const barPct =
                    metricVal != null && maxMetricValue > 0
                      ? Math.max(4, Math.min(100, (metricVal / maxMetricValue) * 100))
                      : 0
                  const barColor = getBarColor(metric, metricVal, reading?.aqi)
                  const isSelected = item.area.id === selectedId

                  return (
                    <tr
                      key={item.area.id}
                      className={`rankings-row${isSelected ? ' is-selected' : ''}${metricVal == null ? ' is-unmeasured' : ''}`}
                    >
                      <td className="rankings-rank mono">
                        {rank != null ? `#${rank}` : '—'}
                      </td>
                      <td className="rankings-city-cell">
                        <div className="rankings-city">
                          <button
                            type="button"
                            className="rankings-city-name compare-city-link"
                            onClick={() => onSelectCity(item.area.id)}
                            aria-label={`Inspect ${item.area.name}`}
                          >
                            {item.area.name}
                          </button>
                          {!item.area.active && (
                            <span className="rankings-city-paused">Paused</span>
                          )}
                        </div>
                      </td>
                      <td className="rankings-status">
                        <span className={`status-pill ${aqiStatus.style}`}>
                          <span className="status-dot" />
                          {aqiStatus.label}
                        </span>
                      </td>
                      <td className={`rankings-metric mono num-col${metric === 'aqi' ? ' rankings-col-active' : ''}`}>
                        {formatNumber(reading?.aqi, 0)}
                      </td>
                      <td className={`rankings-metric mono num-col${metric === 'pm25' ? ' rankings-col-active' : ''}`}>
                        {formatNumber(reading?.pm25, 1)}
                      </td>
                      <td className={`rankings-metric mono num-col${metric === 'pm10' ? ' rankings-col-active' : ''}`}>
                        {formatNumber(reading?.pm10, 1)}
                      </td>
                      <td className="rankings-bar-cell">
                        <div className="rankings-bar-track" aria-hidden="true">
                          <div
                            className="rankings-bar-fill"
                            style={{
                              width: `${barPct}%`,
                              backgroundColor: barColor,
                            }}
                          />
                        </div>
                      </td>
                      <td className="rankings-updated">
                        {formatUpdated(reading?.timestamp)}
                        {item.stale && reading ? ' · Stale' : ''}
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
  )
}
