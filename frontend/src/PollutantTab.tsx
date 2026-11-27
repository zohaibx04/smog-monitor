import { category, type AreaData, type Reading } from './api'
import { Icon } from './App'
import HistoryChart from './HistoryChart'
import SelectDropdown from './SelectDropdown'

type Pollutant = 'aqi' | 'pm25' | 'pm10'

interface SeverityInfo {
  label: string
  style: string
  color: string
  description: string
}

interface ScaleBand {
  range: string
  label: string
  shortLabel: string
  style: string
  color: string
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

const POLLUTANT_META: Record<
  Pollutant,
  {
    title: string
    unit: string
    context: string
    scaleTitle: string
    bands: ScaleBand[]
  }
> = {
  aqi: {
    title: 'US AQI',
    unit: 'US AQI',
    context: 'Composite US EPA index for short-term airborne health risk',
    scaleTitle: 'US EPA AQI bands',
    bands: [
      { range: '0–50', label: 'Good', shortLabel: 'Good', style: 'good', color: AQI_TONE.good },
      { range: '51–100', label: 'Moderate', shortLabel: 'Moderate', style: 'moderate', color: AQI_TONE.moderate },
      { range: '101–150', label: 'Unhealthy for sensitive groups', shortLabel: 'Sensitive', style: 'sensitive', color: AQI_TONE.sensitive },
      { range: '151–200', label: 'Unhealthy', shortLabel: 'Unhealthy', style: 'unhealthy', color: AQI_TONE.unhealthy },
      { range: '201–300', label: 'Very unhealthy', shortLabel: 'Very unhealthy', style: 'very-unhealthy', color: AQI_TONE['very-unhealthy'] },
      { range: '301+', label: 'Hazardous', shortLabel: 'Hazardous', style: 'hazardous', color: AQI_TONE.hazardous },
    ],
  },
  pm25: {
    title: 'PM2.5',
    unit: 'μg/m³',
    context: 'Fine particles ≤ 2.5 μm · WHO 24h guideline is 15 μg/m³',
    scaleTitle: 'PM2.5 bands (μg/m³)',
    bands: [
      { range: '0–12.0', label: 'Good', shortLabel: 'Good', style: 'good', color: AQI_TONE.good },
      { range: '12.1–35.4', label: 'Moderate', shortLabel: 'Moderate', style: 'moderate', color: AQI_TONE.moderate },
      { range: '35.5–55.4', label: 'Unhealthy for sensitive groups', shortLabel: 'Sensitive', style: 'sensitive', color: AQI_TONE.sensitive },
      { range: '55.5–150.4', label: 'Unhealthy', shortLabel: 'Unhealthy', style: 'unhealthy', color: AQI_TONE.unhealthy },
      { range: '150.5–250.4', label: 'Very unhealthy', shortLabel: 'Very unhealthy', style: 'very-unhealthy', color: AQI_TONE['very-unhealthy'] },
      { range: '250.5+', label: 'Hazardous', shortLabel: 'Hazardous', style: 'hazardous', color: AQI_TONE.hazardous },
    ],
  },
  pm10: {
    title: 'PM10',
    unit: 'μg/m³',
    context: 'Coarse particles ≤ 10 μm · WHO 24h guideline is 45 μg/m³',
    scaleTitle: 'PM10 bands (μg/m³)',
    bands: [
      { range: '0–54', label: 'Good', shortLabel: 'Good', style: 'good', color: AQI_TONE.good },
      { range: '55–154', label: 'Moderate', shortLabel: 'Moderate', style: 'moderate', color: AQI_TONE.moderate },
      { range: '155–254', label: 'Unhealthy for sensitive groups', shortLabel: 'Sensitive', style: 'sensitive', color: AQI_TONE.sensitive },
      { range: '255–354', label: 'Unhealthy', shortLabel: 'Unhealthy', style: 'unhealthy', color: AQI_TONE.unhealthy },
      { range: '355–424', label: 'Very unhealthy', shortLabel: 'Very unhealthy', style: 'very-unhealthy', color: AQI_TONE['very-unhealthy'] },
      { range: '425+', label: 'Hazardous', shortLabel: 'Hazardous', style: 'hazardous', color: AQI_TONE.hazardous },
    ],
  },
}

const TIME_RANGES = [
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
  { value: 720, label: 'Last 30 days' },
  { value: 2160, label: 'Last 90 days' },
]

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en', { maximumFractionDigits }).format(value)
}

function formatTimestamp(value?: string): string {
  if (!value) return 'No reading received'
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function classifyPollutant(pollutant: Pollutant, value: number | null | undefined): SeverityInfo {
  if (value == null) {
    return {
      label: 'Unavailable',
      style: 'unknown',
      color: AQI_TONE.unknown,
      description: 'No current measurement available for this location',
    }
  }

  if (pollutant === 'aqi') {
    const c = category(value)
    return {
      label: c.label,
      style: c.style,
      color: AQI_TONE[c.style] ?? AQI_TONE.unknown,
      description: POLLUTANT_META.aqi.context,
    }
  }

  if (pollutant === 'pm25') {
    if (value <= 12) return { label: 'Good', style: 'good', color: AQI_TONE.good, description: POLLUTANT_META.pm25.context }
    if (value <= 35.4) return { label: 'Moderate', style: 'moderate', color: AQI_TONE.moderate, description: POLLUTANT_META.pm25.context }
    if (value <= 55.4) return { label: 'Unhealthy for sensitive groups', style: 'sensitive', color: AQI_TONE.sensitive, description: POLLUTANT_META.pm25.context }
    if (value <= 150.4) return { label: 'Unhealthy', style: 'unhealthy', color: AQI_TONE.unhealthy, description: POLLUTANT_META.pm25.context }
    if (value <= 250.4) return { label: 'Very unhealthy', style: 'very-unhealthy', color: AQI_TONE['very-unhealthy'], description: POLLUTANT_META.pm25.context }
    return { label: 'Hazardous', style: 'hazardous', color: AQI_TONE.hazardous, description: POLLUTANT_META.pm25.context }
  }

  if (value <= 54) return { label: 'Good', style: 'good', color: AQI_TONE.good, description: POLLUTANT_META.pm10.context }
  if (value <= 154) return { label: 'Moderate', style: 'moderate', color: AQI_TONE.moderate, description: POLLUTANT_META.pm10.context }
  if (value <= 254) return { label: 'Unhealthy for sensitive groups', style: 'sensitive', color: AQI_TONE.sensitive, description: POLLUTANT_META.pm10.context }
  if (value <= 354) return { label: 'Unhealthy', style: 'unhealthy', color: AQI_TONE.unhealthy, description: POLLUTANT_META.pm10.context }
  if (value <= 424) return { label: 'Very unhealthy', style: 'very-unhealthy', color: AQI_TONE['very-unhealthy'], description: POLLUTANT_META.pm10.context }
  return { label: 'Hazardous', style: 'hazardous', color: AQI_TONE.hazardous, description: POLLUTANT_META.pm10.context }
}

export default function PollutantTab({
  pollutant,
  current,
  areas: _areas,
  history,
  historyLoading,
  hours,
  threshold,
  onHoursChange,
  onExport,
  onSelectArea: _onSelectArea,
}: {
  pollutant: 'aqi' | 'pm25' | 'pm10'
  current?: AreaData
  areas: AreaData[]
  history: Reading[]
  historyLoading: boolean
  hours: number
  threshold?: number | null
  onHoursChange: (hours: number) => void
  onExport: () => void
  onSelectArea: (id: number) => void
}) {
  const meta = POLLUTANT_META[pollutant]
  const currentValue = current?.reading?.[pollutant] ?? null
  const severity = classifyPollutant(pollutant, currentValue)

  const historyValues = history
    .map((r) => r[pollutant])
    .filter((v): v is number => v != null)

  const average = historyValues.length
    ? historyValues.reduce((sum, val) => sum + val, 0) / historyValues.length
    : null
  const peak = historyValues.length ? Math.max(...historyValues) : null
  const lowest = historyValues.length ? Math.min(...historyValues) : null

  return (
    <div className="pollutant-tab-viewport">
      <section className="pollutant-tab-top" aria-label={`${meta.title} summary and controls`}>
        <div className="card pollutant-tab-hero">
          <div className="pollutant-tab-hero-head">
            <div className="pollutant-tab-location">
              <Icon name="pin" size={16} />
              <span>{current?.area.name ?? 'No location selected'}</span>
              {current && !current.area.active && (
                <span className="pollutant-tab-paused">Paused</span>
              )}
            </div>
            <span className={`status-pill ${severity.style}`}>
              <span className="status-dot" />
              {severity.label}
            </span>
          </div>

          <div className="pollutant-tab-hero-body">
            <div className="pollutant-tab-readout">
              <strong className="pollutant-tab-value mono">
                {formatNumber(currentValue, pollutant === 'aqi' ? 0 : 1)}
              </strong>
              <span className="pollutant-tab-unit">{meta.unit}</span>
            </div>
            <p className="pollutant-tab-context">{severity.description}</p>
          </div>

          <div className="pollutant-tab-hero-meta">
            <span className="pollutant-tab-meta-item">
              <Icon name="clock" size={16} />
              <span>
                {formatTimestamp(current?.reading?.timestamp)}
                {current?.stale && current.reading ? ' (stale)' : ''}
              </span>
            </span>
            <span className="pollutant-tab-meta-item">
              <Icon name="database" size={16} />
              <span>
                {current?.reading?.source || 'No provider reading'}
                {current?.reading?.providerLocation ? ` · ${current.reading.providerLocation}` : ''}
              </span>
            </span>
          </div>
        </div>

        <div className="pollutant-tab-stats" aria-label="Selected period statistics">
          <div className="card pollutant-tab-stat">
            <span className="pollutant-tab-stat-label">Average</span>
            <strong className="pollutant-tab-stat-value mono">
              {formatNumber(average)}
            </strong>
          </div>
          <div className="card pollutant-tab-stat">
            <span className="pollutant-tab-stat-label">Peak</span>
            <strong className="pollutant-tab-stat-value mono">
              {formatNumber(peak, pollutant === 'aqi' ? 0 : 1)}
            </strong>
          </div>
          <div className="card pollutant-tab-stat">
            <span className="pollutant-tab-stat-label">Lowest</span>
            <strong className="pollutant-tab-stat-value mono">
              {formatNumber(lowest, pollutant === 'aqi' ? 0 : 1)}
            </strong>
          </div>
          <div className="card pollutant-tab-stat">
            <span className="pollutant-tab-stat-label">Readings</span>
            <strong className="pollutant-tab-stat-value mono">
              {new Intl.NumberFormat('en').format(historyValues.length)}
            </strong>
          </div>
        </div>

        <div className="card pollutant-tab-controls">
          <div className="field pollutant-tab-range">
            <span>Time range</span>
            <SelectDropdown
              options={TIME_RANGES.map((range) => ({
                value: String(range.value),
                label: range.label,
              }))}
              value={String(hours)}
              onChange={(val) => onHoursChange(Number(val))}
              ariaLabel="Time range"
            />
          </div>

          <button
            type="button"
            className="btn secondary pollutant-tab-export"
            disabled={!history.length || historyLoading}
            onClick={onExport}
          >
            <Icon name="download" size={16} />
            Export CSV
          </button>
        </div>
      </section>

      <div className="pollutant-tab-main">
        <section className="card pollutant-tab-chart-card">
          <div className="card-title-row pollutant-tab-chart-head">
            <div>
              <h3>{meta.title} trend</h3>
              <p className="data-footnote">
                {current?.area.name ?? 'Selected location'} · {meta.unit}
              </p>
            </div>
            <span className="pollutant-tab-chart-count mono">
              {historyValues.length} points
            </span>
          </div>

          {historyLoading ? (
            <div className="empty-state">
              <Icon name="clock" size={16} />
              <p>Loading stored readings…</p>
            </div>
          ) : (
            <HistoryChart readings={history} pollutant={pollutant} threshold={threshold} />
          )}
        </section>
      </div>

      <section className="card pollutant-tab-scale-card" aria-label={meta.scaleTitle}>
        <div className="pollutant-tab-scale-row">
          <span className="pollutant-tab-scale-title">
            <Icon name="info" size={16} />
            {meta.scaleTitle}
          </span>
          <div className="pollutant-tab-scale-bands">
            {meta.bands.map((band) => {
              const isCurrentBand = severity.style === band.style
              return (
                <div
                  key={band.style}
                  title={`${band.label}: ${band.range}`}
                  className={`pollutant-tab-scale-band${isCurrentBand ? ' is-current' : ''}`}
                >
                  <span
                    className="pollutant-tab-scale-swatch"
                    style={{ backgroundColor: band.color }}
                    aria-hidden="true"
                  />
                  <span className="pollutant-tab-scale-label">{band.shortLabel}</span>
                  <span className="pollutant-tab-scale-range mono">
                    {band.range}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
