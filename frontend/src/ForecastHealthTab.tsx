import { useState } from 'react'
import {
  category,
  type AreaData,
  type ForecastPoint,
  type HealthProfile,
  type ProactiveInsights,
  type Reading,
} from './api'
import { Icon } from './App'
import HistoryChart from './HistoryChart'
import SelectDropdown from './SelectDropdown'

type ForecastPollutant = 'aqi' | 'pm25' | 'pm10'
type Horizon = '24h' | '72h'

interface ProfileConfig {
  label: string
  recommendedThreshold: number
  precautions: [string, string, string]
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

function formatAqi(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value)
}

function findBestWindow(points: ForecastPoint[]): {
  label: string
  avgAqi: number
} | null {
  if (points.length === 0) return null

  let bestAvg = Infinity
  let bestPair: [ForecastPoint, ForecastPoint] | null = null

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i].aqi
    const b = points[i + 1].aqi
    if (a == null || b == null) continue
    const avg = (a + b) / 2
    if (avg < bestAvg) {
      bestAvg = avg
      bestPair = [points[i], points[i + 1]]
    }
  }

  if (bestPair) {
    return {
      label: formatTimeRange(bestPair[0].timestamp, bestPair[1].timestamp),
      avgAqi: bestAvg,
    }
  }

  const single = points
    .filter((p): p is ForecastPoint & { aqi: number } => p.aqi != null)
    .sort((a, b) => a.aqi - b.aqi)[0]

  if (!single) return null
  return {
    label: formatTimeRange(single.timestamp, single.timestamp),
    avgAqi: single.aqi,
  }
}

function findPeak24h(points: ForecastPoint[]): {
  aqi: number
  hoursUntil: number
  timestamp: string
} | null {
  let peak: (ForecastPoint & { aqi: number }) | null = null
  for (const pt of points) {
    if (pt.aqi == null) continue
    if (!peak || pt.aqi > peak.aqi) {
      peak = { ...pt, aqi: pt.aqi }
    }
  }
  if (!peak) return null
  const hoursUntil = Math.max(0, Math.round((Date.parse(peak.timestamp) - Date.now()) / 3_600_000))
  return {
    aqi: peak.aqi,
    hoursUntil,
    timestamp: peak.timestamp,
  }
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
  const [pollutant, setPollutant] = useState<ForecastPollutant>('aqi')
  const [horizon, setHorizon] = useState<Horizon>('24h')

  const allPoints = insights?.forecast ?? []
  const next24Points = allPoints.slice(0, 24)
  const visiblePoints = horizon === '24h' ? next24Points : allPoints.slice(0, 72)

  const bestWindow = findBestWindow(next24Points)
  const bestStatus = category(bestWindow?.avgAqi)

  const peak24 = findPeak24h(next24Points)
  const profileConfig = PROFILE_META[healthProfile]
  const effectiveThreshold = userThreshold ?? profileConfig.recommendedThreshold
  const peakExceeds = peak24 != null && peak24.aqi > effectiveThreshold

  const chartReadings: Reading[] = visiblePoints.map((pt, idx) => ({
    id: idx + 1,
    areaId: current?.area.id ?? 0,
    aqi: pt.aqi,
    pm25: pt.pm25,
    pm10: pt.pm10,
    source: 'Open-Meteo hourly forecast',
    timestamp: pt.timestamp,
  }))

  const pollutantLabel =
    pollutant === 'aqi' ? 'US AQI' : pollutant === 'pm25' ? 'PM2.5' : 'PM10'

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
              {bestWindow ? `${formatAqi(bestWindow.avgAqi)} US AQI` : '—'}
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
                    ? `${formatAqi(peak24.aqi)} US AQI`
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

      <section className="card forecast-chart-card">
        <div className="card-title-row forecast-chart-head">
          <div>
            <h3>{pollutantLabel} forecast</h3>
            <p className="data-footnote">
              {current?.area.name ?? 'Selected location'} ·{' '}
              {horizon === '24h' ? 'Next 24 hours' : 'Next 72 hours'}
            </p>
          </div>

          <div className="forecast-chart-controls">
            <SelectDropdown
              value={pollutant}
              onChange={(val) => setPollutant(val as ForecastPollutant)}
              ariaLabel="Forecast pollutant"
              icon="chart"
              options={[
                { value: 'aqi', label: 'US AQI' },
                { value: 'pm25', label: 'PM2.5' },
                { value: 'pm10', label: 'PM10' },
              ]}
            />
            <div className="segmented" role="group" aria-label="Forecast horizon">
              <button
                type="button"
                className={horizon === '24h' ? 'active' : ''}
                aria-pressed={horizon === '24h'}
                onClick={() => setHorizon('24h')}
              >
                Next 24h
              </button>
              <button
                type="button"
                className={horizon === '72h' ? 'active' : ''}
                aria-pressed={horizon === '72h'}
                onClick={() => setHorizon('72h')}
              >
                Next 72h
              </button>
            </div>
          </div>
        </div>

        {loading && !insights ? (
          <div className="empty-state">
            <Icon name="clock" size={16} />
            <p>Loading hourly air quality forecast…</p>
          </div>
        ) : (
          <HistoryChart readings={chartReadings} pollutant={pollutant} />
        )}
      </section>
    </div>
  )
}
