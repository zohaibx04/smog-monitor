import type { AreaData, ProactiveInsights } from './api'
import { Icon } from './App'

interface GasSpec {
  key: 'no2' | 'o3' | 'so2' | 'co'
  formula: string
  name: string
  whoWindow: string
  whoLimit: number
  sourceNote: string
}

const GAS_SPECS: GasSpec[] = [
  {
    key: 'no2',
    formula: 'NO₂',
    name: 'Nitrogen dioxide',
    whoWindow: 'WHO 24h: 25 μg/m³',
    whoLimit: 25,
    sourceNote: 'Traffic & combustion',
  },
  {
    key: 'o3',
    formula: 'O₃',
    name: 'Ground-level ozone',
    whoWindow: 'WHO 8h: 100 μg/m³',
    whoLimit: 100,
    sourceNote: 'Photochemical smog',
  },
  {
    key: 'so2',
    formula: 'SO₂',
    name: 'Sulfur dioxide',
    whoWindow: 'WHO 24h: 40 μg/m³',
    whoLimit: 40,
    sourceNote: 'Industrial & fuel',
  },
  {
    key: 'co',
    formula: 'CO',
    name: 'Carbon monoxide',
    whoWindow: 'WHO 24h: 4,000 μg/m³',
    whoLimit: 4000,
    sourceNote: 'Incomplete combustion',
  },
]

function formatMetric(value: number | null | undefined, maxDecimals = 1): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits: maxDecimals }).format(value)
}

function gasStatus(value: number | null | undefined, limit: number): {
  label: string
  style: string
  color: string
  ratioPct: number
} {
  if (value == null) {
    return {
      label: 'Unavailable',
      style: 'unknown',
      color: 'var(--aqi-unknown, #525252)',
      ratioPct: 0,
    }
  }
  const ratio = value / limit
  const ratioPct = Math.max(4, Math.min(100, ratio * 100))
  if (ratio <= 0.6) {
    return { label: 'Within WHO', style: 'good', color: 'var(--aqi-good, #15803d)', ratioPct }
  }
  if (ratio <= 1) {
    return { label: 'Near WHO', style: 'moderate', color: 'var(--aqi-moderate, #eab308)', ratioPct }
  }
  if (ratio <= 1.5) {
    return { label: 'Above WHO', style: 'sensitive', color: 'var(--aqi-sensitive, #c2410c)', ratioPct }
  }
  return { label: 'Elevated', style: 'unhealthy', color: 'var(--aqi-unhealthy, #b91c1c)', ratioPct }
}

function trapStatus(risk: 'low' | 'moderate' | 'high' | undefined): {
  label: string
  style: string
} {
  if (risk === 'high') return { label: 'High', style: 'unhealthy' }
  if (risk === 'moderate') return { label: 'Moderate', style: 'moderate' }
  if (risk === 'low') return { label: 'Low', style: 'good' }
  return { label: 'Unavailable', style: 'unknown' }
}

export default function GasesWeatherTab({
  current,
  insights,
  loading,
  error,
}: {
  current?: AreaData
  insights: ProactiveInsights | null
  loading: boolean
  error: string
}) {
  const gases = insights?.gases
  const weather = insights?.weather
  const trap = trapStatus(weather?.trapRisk)

  return (
    <div className="gases-viewport">
      {error && (
        <div className="notice error-notice" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && !insights ? (
        <section className="card">
          <div className="empty-state">
            <Icon name="clock" size={16} />
            <p>Loading gaseous pollutants and weather conditions…</p>
          </div>
        </section>
      ) : (
        <>
          <section className="gases-grid" aria-label="Gaseous air pollutants">
            {GAS_SPECS.map((spec) => {
              const rawValue = gases?.[spec.key] ?? null
              const status = gasStatus(rawValue, spec.whoLimit)
              const decimals = spec.key === 'co' ? 0 : 1

              return (
                <article key={spec.key} className="card gas-card">
                  <div className="gas-card-head">
                    <div>
                      <h3 className="gas-card-formula">{spec.formula}</h3>
                      <span className="gas-card-source">{spec.sourceNote}</span>
                    </div>
                    <span className={`status-pill ${status.style}`}>
                      <span className="status-dot" />
                      {status.label}
                    </span>
                  </div>

                  <div className="gas-card-value">
                    <strong className="mono">{formatMetric(rawValue, decimals)}</strong>
                    <span>μg/m³</span>
                  </div>

                  <div className="gas-card-footer">
                    <div className="rankings-bar-track" aria-hidden="true">
                      <div
                        className="rankings-bar-fill"
                        style={{
                          width: `${status.ratioPct}%`,
                          backgroundColor: status.color,
                        }}
                      />
                    </div>
                    <span className="gas-card-who mono">{spec.whoWindow}</span>
                  </div>
                </article>
              )
            })}
          </section>

          <section className="weather-section" aria-label="Atmospheric dispersion and weather drivers">
            <article className="card weather-trap-card">
              <div className="weather-trap-head">
                <div>
                  <span className="weather-trap-kicker">Smog-trap risk</span>
                  <h3>{current?.area.name ?? 'Selected location'}</h3>
                </div>
                <span className={`status-pill ${trap.style}`}>
                  <span className="status-dot" />
                  {trap.label}
                </span>
              </div>
              <p className="weather-trap-reason">
                {weather?.trapReason || 'Atmospheric dispersion estimate unavailable'}
              </p>
              <div className="weather-trap-meta mono">
                <Icon name="clock" size={16} />
                <span>
                  {gases?.timestamp
                    ? new Date(gases.timestamp).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : 'Awaiting reading'}
                </span>
              </div>
            </article>

            <div className="weather-grid">
              <article className="card weather-card">
                <div className="weather-card-label">
                  <Icon name="wind" size={16} />
                  <span>Wind speed</span>
                </div>
                <strong className="weather-card-value mono">
                  {formatMetric(weather?.windSpeedKmh, 1)}
                  <small> km/h</small>
                </strong>
              </article>

              <article className="card weather-card">
                <div className="weather-card-label">
                  <Icon name="droplet" size={16} />
                  <span>Relative humidity</span>
                </div>
                <strong className="weather-card-value mono">
                  {formatMetric(weather?.humidityPct, 0)}
                  <small> %</small>
                </strong>
              </article>

              <article className="card weather-card">
                <div className="weather-card-label">
                  <Icon name="activity" size={16} />
                  <span>Temperature</span>
                </div>
                <strong className="weather-card-value mono">
                  {formatMetric(weather?.temperatureC, 1)}
                  <small> °C</small>
                </strong>
              </article>

              <article className="card weather-card">
                <div className="weather-card-label">
                  <Icon name="cloud" size={16} />
                  <span>Visibility</span>
                </div>
                <strong className="weather-card-value mono">
                  {formatMetric(weather?.visibilityKm, 1)}
                  <small> km</small>
                </strong>
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
