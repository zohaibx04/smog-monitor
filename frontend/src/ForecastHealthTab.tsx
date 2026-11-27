import { useState, type KeyboardEvent } from 'react'
import {
  category,
  type AreaData,
  type ForecastPoint,
  type HealthProfile,
  type ProactiveInsights,
} from './api'
import { Icon } from './App'
import SelectDropdown from './SelectDropdown'

interface ProfileConfig {
  label: string
  recommendedThreshold: number
  precautions: [string, string, string]
}

const AQI_TONE: Record<string, string> = {
  good: 'var(--aqi-good, #15803d)',
  moderate: 'var(--aqi-moderate, #eab308)',
  sensitive: 'var(--aqi-sensitive, #c2410c)',
  unhealthy: 'var(--aqi-unhealthy, #b91c1c)',
  'very-unhealthy': 'var(--aqi-very-unhealthy, #7e22ce)',
  hazardous: 'var(--aqi-hazardous, #881337)',
  unknown: 'var(--aqi-unknown, #525252)',
}

const PROFILE_META: Record<HealthProfile, ProfileConfig> = {
  general: {
    label: 'General',
    recommendedThreshold: 150,
    precautions: [
      'Mask: No mask needed below 100 US AQI; use N95 above 150',
      'Activity: Normal outdoor activity under 100; shorten strenuous effort > 150',
      'Ventilation: Air indoor spaces during the cleanest 2h outdoor window',
    ],
  },
  respiratory: {
    label: 'Respiratory',
    recommendedThreshold: 100,
    precautions: [
      'Mask: Wear a well-fitted N95 or KN95 outdoors above 100 US AQI',
      'Activity: Keep reliever medication nearby; avoid heavy exertion > 100',
      'Ventilation: Keep windows closed and run HEPA filtration above 100',
    ],
  },
  sensitive: {
    label: 'Children & elderly',
    recommendedThreshold: 100,
    precautions: [
      'Mask: Use a fitted particulate mask near busy roads above 100 US AQI',
      'Activity: Shift children’s play and walks indoors above 100 US AQI',
      'Ventilation: Seal street-facing windows before afternoon pollution peaks',
    ],
  },
  athlete: {
    label: 'Outdoor athlete',
    recommendedThreshold: 120,
    precautions: [
      'Mask: Move high-intensity intervals indoors rather than training in haze > 120',
      'Activity: Schedule endurance sessions during the cleanest 2h window',
      'Ventilation: Recover in filtered indoor air when evening AQI climbs > 120',
    ],
  },
}

function formatHourShort(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatTimeRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(Date.parse(endIso) + 3_600_000)
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }
  return `${start.toLocaleTimeString([], opts)} – ${end.toLocaleTimeString([], opts)}`
}

function formatNumber(value: number | null | undefined, maxDecimals = 0): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits: maxDecimals }).format(value)
}

function findBestWindow(points: ForecastPoint[]): {
  label: string
  avgAqi: number
  startIndex: number
  endIndex: number
} | null {
  if (points.length === 0) return null

  let bestAvg = Infinity
  let bestStart = -1
  let bestEnd = -1

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i].aqi
    const b = points[i + 1].aqi
    if (a == null || b == null) continue
    const avg = (a + b) / 2
    if (avg < bestAvg) {
      bestAvg = avg
      bestStart = i
      bestEnd = i + 1
    }
  }

  if (bestStart >= 0) {
    return {
      label: formatTimeRange(points[bestStart].timestamp, points[bestEnd].timestamp),
      avgAqi: bestAvg,
      startIndex: bestStart,
      endIndex: bestEnd,
    }
  }

  let bestSingleIdx = -1
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i].aqi
    if (a == null) continue
    if (bestSingleIdx < 0 || a < (points[bestSingleIdx].aqi ?? Infinity)) {
      bestSingleIdx = i
    }
  }

  if (bestSingleIdx < 0) return null
  return {
    label: formatTimeRange(points[bestSingleIdx].timestamp, points[bestSingleIdx].timestamp),
    avgAqi: points[bestSingleIdx].aqi!,
    startIndex: bestSingleIdx,
    endIndex: bestSingleIdx,
  }
}

function findPeak24h(points: ForecastPoint[]): {
  aqi: number
  hoursUntil: number
  timestamp: string
  index: number
} | null {
  let peakIdx = -1
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i].aqi
    if (a == null) continue
    if (peakIdx < 0 || a > (points[peakIdx].aqi ?? -1)) {
      peakIdx = i
    }
  }
  if (peakIdx < 0) return null
  const peakPt = points[peakIdx]
  const hoursUntil = Math.max(0, Math.round((Date.parse(peakPt.timestamp) - Date.now()) / 3_600_000))
  return {
    aqi: peakPt.aqi!,
    hoursUntil,
    timestamp: peakPt.timestamp,
    index: peakIdx,
  }
}

interface DaySummary {
  key: string
  dayLabel: string
  dateLabel: string
  minAqi: number | null
  maxAqi: number | null
  peakHour: string | null
  status: { label: string; style: string }
  color: string
  barPct: number
}

function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildDaySummaries(points: ForecastPoint[]): DaySummary[] {
  const groups = new Map<string, { date: Date; items: ForecastPoint[] }>()
  for (const pt of points) {
    const d = new Date(pt.timestamp)
    if (Number.isNaN(d.getTime())) continue
    const key = localDayKey(d)
    const bucket = groups.get(key)
    if (bucket) {
      bucket.items.push(pt)
    } else {
      groups.set(key, { date: d, items: [pt] })
    }
  }

  const today = new Date()
  const todayKey = localDayKey(today)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const tomorrowKey = localDayKey(tomorrow)

  const ordered = Array.from(groups.entries()).slice(0, 3)
  const overallMax = Math.max(
    100,
    ...ordered.flatMap(([, g]) =>
      g.items.map((p) => p.aqi).filter((v): v is number => v != null),
    ),
  )

  return ordered.map(([key, { date, items }]) => {
    const valid = items.filter((p): p is ForecastPoint & { aqi: number } => p.aqi != null)
    const minAqi = valid.length ? Math.min(...valid.map((p) => p.aqi)) : null
    const maxAqi = valid.length ? Math.max(...valid.map((p) => p.aqi)) : null
    const peakPoint = valid.length
      ? valid.reduce((best, cur) => (cur.aqi > best.aqi ? cur : best))
      : null

    const dayLabel =
      key === todayKey
        ? 'Today'
        : key === tomorrowKey
          ? 'Tomorrow'
          : date.toLocaleDateString([], { weekday: 'long' })

    const dateLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    const status = category(maxAqi)
    const color = AQI_TONE[status.style] ?? AQI_TONE.unknown
    const barPct =
      maxAqi != null ? Math.max(8, Math.min(100, Math.round((maxAqi / overallMax) * 100))) : 0

    return {
      key,
      dayLabel,
      dateLabel,
      minAqi,
      maxAqi,
      peakHour: peakPoint ? formatHourShort(peakPoint.timestamp) : null,
      status,
      color,
      barPct,
    }
  })
}

export default function ForecastHealthTab({
  current,
  insights,
  loading,
  error,
  healthProfile,
  onHealthProfileChange,
  userThreshold,
  onOpenAlerts,
}: {
  current?: AreaData
  insights: ProactiveInsights | null
  loading: boolean
  error: string
  healthProfile: HealthProfile
  onHealthProfileChange: (profile: HealthProfile) => void
  userThreshold: number | null
  onOpenAlerts: () => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const allPoints = insights?.forecast ?? []
  const next24Points = allPoints.slice(0, 24)

  const bestWindow = findBestWindow(next24Points)
  const bestStatus = category(bestWindow?.avgAqi)

  const peak24 = findPeak24h(next24Points)
  const profileConfig = PROFILE_META[healthProfile]
  const effectiveThreshold = userThreshold ?? profileConfig.recommendedThreshold
  const peakExceeds = peak24 != null && peak24.aqi > effectiveThreshold

  const activeIdx =
    hoveredIdx != null && hoveredIdx >= 0 && hoveredIdx < next24Points.length
      ? hoveredIdx
      : (peak24?.index ?? 0)
  const activeSlot = next24Points[activeIdx] ?? null
  const activeStatus = category(activeSlot?.aqi)

  const maxHeatAqi = Math.max(
    100,
    effectiveThreshold,
    ...next24Points.map((p) => p.aqi).filter((v): v is number => v != null),
  )

  const daySummaries = buildDaySummaries(allPoints.slice(0, 72))

  function handleSlotKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const next = Math.min(next24Points.length - 1, index + 1)
      setHoveredIdx(next)
      const parent = event.currentTarget.parentElement
      const target = parent?.querySelectorAll<HTMLButtonElement>('.forecast-hour-slot')[next]
      target?.focus()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const prev = Math.max(0, index - 1)
      setHoveredIdx(prev)
      const parent = event.currentTarget.parentElement
      const target = parent?.querySelectorAll<HTMLButtonElement>('.forecast-hour-slot')[prev]
      target?.focus()
    }
  }

  return (
    <div className="forecast-viewport">
      {error && (
        <div className="notice error-notice" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <section className="forecast-top-grid" aria-label="Proactive forecast and health guidance">
        <article className="card forecast-card">
          <div className="forecast-card-head">
            <div>
              <span className="forecast-card-kicker">Best outdoor window (next 24h)</span>
              <strong className="forecast-card-primary mono">
                {loading && !insights ? 'Loading…' : bestWindow ? bestWindow.label : 'Unavailable'}
              </strong>
            </div>
            <span className={`status-pill ${bestStatus.style}`}>
              <span className="status-dot" />
              {bestStatus.label}
            </span>
          </div>
          <div className="forecast-card-metric">
            <span className="forecast-card-sub">Lowest 2-hour average</span>
            <strong className="mono">
              {bestWindow ? `${formatNumber(bestWindow.avgAqi)} US AQI` : '—'}
            </strong>
          </div>
        </article>

        <article className="card forecast-card">
          <div className="forecast-card-head">
            <div>
              <span className="forecast-card-kicker">24h peak & proactive pre-alert</span>
              <strong className="forecast-card-primary mono">
                {loading && !insights
                  ? 'Loading…'
                  : peak24
                    ? `${formatNumber(peak24.aqi)} US AQI`
                    : 'Unavailable'}
              </strong>
            </div>
            <span
              className={`status-pill ${
                !peak24 ? 'unknown' : peakExceeds ? 'sensitive' : 'good'
              }`}
            >
              <span className="status-dot" />
              {!peak24
                ? 'No forecast'
                : peakExceeds
                  ? `Exceeds ${effectiveThreshold}`
                  : 'Within threshold'}
            </span>
          </div>
          <div className="forecast-card-metric">
            <span className="forecast-card-sub">
              {peak24
                ? peak24.hoursUntil === 0
                  ? 'Peak occurring now'
                  : `Expected in ${peak24.hoursUntil}h · ${userThreshold != null ? 'Saved rule' : 'Profile target'} ${effectiveThreshold}`
                : 'Awaiting hourly forecast'}
            </span>
            <button
              type="button"
              className="btn secondary forecast-alert-btn"
              onClick={onOpenAlerts}
            >
              <Icon name="bell" size={16} />
              Adjust alert rule
            </button>
          </div>
        </article>

        <article className="card forecast-card forecast-profile-card">
          <div className="forecast-card-head">
            <div className="forecast-profile-select-wrap">
              <span className="forecast-card-kicker">Health profile</span>
              <SelectDropdown
                value={healthProfile}
                onChange={(val) => onHealthProfileChange(val as HealthProfile)}
                ariaLabel="Health profile"
                options={(Object.keys(PROFILE_META) as HealthProfile[]).map((key) => ({
                  value: key,
                  label: PROFILE_META[key].label,
                }))}
              />
            </div>
            <span className="forecast-threshold-badge mono">
              Target ≤ {profileConfig.recommendedThreshold} AQI
            </span>
          </div>
          <ul className="forecast-precautions">
            {profileConfig.precautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="card forecast-heatstrip-card" aria-label="24-hour AQI heat-strip">
        <div className="forecast-heatstrip-head">
          <div>
            <h3>24-hour AQI heat-strip</h3>
            <p className="data-footnote">
              {current?.area.name ?? 'Selected location'} · Hover or focus any hour to inspect
            </p>
          </div>

          {activeSlot ? (
            <div className="forecast-heatstrip-readout" aria-live="polite">
              <span className="mono forecast-readout-time">{formatHourShort(activeSlot.timestamp)}</span>
              <strong className="mono forecast-readout-aqi">
                {formatNumber(activeSlot.aqi)} US AQI
              </strong>
              <span className="mono forecast-readout-pm">
                PM2.5 {formatNumber(activeSlot.pm25, 1)} · PM10 {formatNumber(activeSlot.pm10, 1)} μg/m³
              </span>
              <span className={`status-pill ${activeStatus.style}`}>
                <span className="status-dot" />
                {activeStatus.label}
              </span>
            </div>
          ) : null}
        </div>

        {loading && !insights ? (
          <div className="empty-state">
            <Icon name="clock" size={16} />
            <p>Loading hourly air quality heat-strip…</p>
          </div>
        ) : next24Points.length === 0 ? (
          <div className="empty-state">
            <Icon name="activity" size={16} />
            <p>Hourly forecast unavailable for this location</p>
          </div>
        ) : (
          <div
            className="forecast-heatstrip-bars"
            role="list"
            aria-label="Next 24 hours AQI slots"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {next24Points.map((pt, idx) => {
              const slotStatus = category(pt.aqi)
              const slotColor = AQI_TONE[slotStatus.style] ?? AQI_TONE.unknown
              const heightPct =
                pt.aqi != null
                  ? Math.max(12, Math.min(100, Math.round((pt.aqi / maxHeatAqi) * 100)))
                  : 10
              const isBestHour =
                bestWindow != null &&
                idx >= bestWindow.startIndex &&
                idx <= bestWindow.endIndex
              const isAboveThreshold = pt.aqi != null && pt.aqi > effectiveThreshold
              const isActive = idx === activeIdx
              const showTick = idx % 3 === 0 || idx === next24Points.length - 1

              return (
                <button
                  key={pt.timestamp}
                  type="button"
                  role="listitem"
                  className={`forecast-hour-slot${isActive ? ' is-active' : ''}${isBestHour ? ' is-best-window' : ''}${isAboveThreshold ? ' is-above-threshold' : ''}`}
                  aria-label={`${formatHourShort(pt.timestamp)}: ${formatNumber(pt.aqi)} US AQI, ${slotStatus.label}${isBestHour ? ', best outdoor window' : ''}${isAboveThreshold ? ', above threshold' : ''}`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onFocus={() => setHoveredIdx(idx)}
                  onKeyDown={(e) => handleSlotKeyDown(e, idx)}
                >
                  <span className="forecast-hour-markers" aria-hidden="true">
                    {isAboveThreshold && <span className="forecast-hour-dot is-warn" />}
                    {isBestHour && <span className="forecast-hour-dot is-best" />}
                  </span>
                  <span className="forecast-hour-bar-wrap" aria-hidden="true">
                    <span
                      className="forecast-hour-bar"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: slotColor,
                      }}
                    />
                  </span>
                  <span className="forecast-hour-label mono" aria-hidden={!showTick}>
                    {showTick ? formatHourShort(pt.timestamp) : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="forecast-days-grid" aria-label="3-day forecast outlook">
        {daySummaries.map((day) => (
          <article key={day.key} className="card forecast-day-card">
            <div className="forecast-day-head">
              <div>
                <strong className="forecast-day-name">{day.dayLabel}</strong>
                <span className="forecast-day-date mono">{day.dateLabel}</span>
              </div>
              <span className={`status-pill ${day.status.style}`}>
                <span className="status-dot" />
                {day.status.label}
              </span>
            </div>

            <div className="forecast-day-metrics">
              <strong className="forecast-day-range mono">
                {day.minAqi != null && day.maxAqi != null
                  ? `${formatNumber(day.minAqi)} – ${formatNumber(day.maxAqi)} US AQI`
                  : '—'}
              </strong>
              <span className="forecast-day-peak mono">
                {day.peakHour ? `Peak ${day.peakHour}` : 'No peak'}
              </span>
            </div>

            <div className="rankings-bar-track" aria-hidden="true">
              <div
                className="forecast-day-bar"
                style={{
                  width: `${day.barPct}%`,
                  backgroundColor: day.color,
                }}
              />
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
