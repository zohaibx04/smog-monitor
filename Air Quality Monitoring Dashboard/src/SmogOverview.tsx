import { useState } from 'react'
import { Icon, type Page } from './App'
import { category, type AreaData, type Alert, type Preference, type Reading } from './api'
import HistoryChart from './HistoryChart'
import SelectDropdown from './SelectDropdown'

const formatValue = (n: number | null | undefined, maximumFractionDigits = 1) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(n)

type OverviewPollutant = 'aqi' | 'pm25' | 'pm10'

const trendHeadings: Record<OverviewPollutant, string> = {
  aqi: 'US AQI trend',
  pm25: 'PM2.5 trend',
  pm10: 'PM10 trend',
}

const pollutantOptions: { value: OverviewPollutant; label: string }[] = [
  { value: 'aqi', label: 'US AQI' },
  { value: 'pm25', label: 'PM2.5' },
  { value: 'pm10', label: 'PM10' },
]

export default function SmogOverview({
  current,
  areas: _areas,
  alerts: _alerts,
  preferences: _preferences,
  history,
  historyLoading,
  mode: _mode,
  navigate: _navigate,
}: {
  current?: AreaData
  areas: AreaData[]
  alerts: Alert[]
  preferences: Preference[]
  history: Reading[]
  historyLoading: boolean
  mode: string
  navigate: (page: Page) => void
}) {
  const [overviewPollutant, setOverviewPollutant] = useState<OverviewPollutant>('aqi')

  const reading = current?.reading
  const aqiCategory = category(reading?.aqi)

  return (
    <div className="overview-single-screen">
      <section className="overview-top-grid" aria-label="Current air quality">
        <article className={`overview-aqi-card tone-${aqiCategory.style}`}>
          <div className="overview-aqi-head">
            <span className="overview-aqi-city">{current?.area.name || 'Select a location'}</span>
            <Icon name="wind" size={16} />
          </div>
          <div className="overview-aqi-readout">
            <strong className="mono">{formatValue(reading?.aqi, 0)}</strong>
            <span>US AQI</span>
          </div>
          <p className="overview-aqi-category">{aqiCategory.label}</p>
        </article>

        {([
          { key: 'pm25', name: 'PM2.5', subtitle: 'Fine particles ≤ 2.5 μm', guideline: 'WHO 24h: 15 μg/m³' },
          { key: 'pm10', name: 'PM10', subtitle: 'Coarse particles ≤ 10 μm', guideline: 'WHO 24h: 45 μg/m³' },
        ] as const).map(p => (
          <article key={p.key} className="card overview-pollutant-card">
            <div className="overview-pollutant-head">
              <h3>{p.name}</h3>
              <span>{p.subtitle}</span>
            </div>
            <div className="overview-pollutant-value">
              <strong className="mono">{formatValue(reading?.[p.key], 1)}</strong>
              <span>{reading?.[p.key] != null ? 'μg/m³' : 'No value reported'}</span>
            </div>
            <p className="muted mono">{p.guideline}</p>
          </article>
        ))}
      </section>

      <section id="smog-history" className="card overview-chart-card">
        <div className="card-title-row">
          <div>
            <p className="section-kicker">Last 24 hours</p>
            <h3>{trendHeadings[overviewPollutant]}</h3>
          </div>
          <div className="overview-history-controls">
            <SelectDropdown
              options={pollutantOptions}
              value={overviewPollutant}
              onChange={(v: string) => setOverviewPollutant(v as OverviewPollutant)}
              ariaLabel="Overview chart pollutant"
              icon="chart"
              className="overview-pollutant-select"
            />
          </div>
        </div>
        {historyLoading
          ? <div className="empty-state">Loading stored readings</div>
          : <HistoryChart readings={history} pollutant={overviewPollutant} />}
      </section>
    </div>
  )
}
