import { useId, useState, type PointerEvent, type KeyboardEvent } from 'react'
import type { Reading } from './api'

type Indicator = 'aqi' | 'pm25' | 'pm10'

const format = (value: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)

const palette: Record<Indicator, string> = {
  aqi: 'var(--chart-aqi, #fb923c)',
  pm25: 'var(--chart-pm25, #2dd4bf)',
  pm10: 'var(--chart-pm10, #a1a1a6)',
}

const axisTextStyle = {
  fontSize: '12px',
  fill: 'var(--text-muted, #85858b)',
} as const

export default function HistoryChart({ readings, pollutant }: { readings: Reading[]; pollutant: Indicator }) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const tooltipId = useId()
  const valid = readings.filter(r => r[pollutant] != null)
  if (!valid.length) {
    return (
      <div className="empty-state">
        <p>No readings in this period · refresh data or choose a longer range</p>
      </div>
    )
  }

  const label = pollutant === 'aqi' ? 'US AQI' : pollutant === 'pm25' ? 'PM2.5' : 'PM10'
  const unit = pollutant === 'aqi' ? 'index' : 'μg/m³'
  const colour = palette[pollutant]
  const max = Math.max(50, ...valid.map(r => r[pollutant]!)) * 1.15
  const start = Date.parse(readings[0].timestamp)
  const duration = Math.max(1, Date.parse(readings[readings.length - 1].timestamp) - start)
  const x = (r: Reading) => 55 + (Date.parse(r.timestamp) - start) / duration * 660
  const y = (r: Reading) => 230 - r[pollutant]! / max * 200
  const active = valid.find(r => r.id === activeId)

  const segments: Reading[][] = []
  let previousTime: number | null = null
  for (const r of readings) {
    if (r[pollutant] == null) {
      previousTime = null
      continue
    }
    const time = Date.parse(r.timestamp)
    if (previousTime != null && time - previousTime <= 5400000 && segments.length > 0) {
      segments[segments.length - 1].push(r)
    } else {
      segments.push([r])
    }
    previousTime = time
  }

  const linePaths = segments
    .filter(seg => seg.length >= 2)
    .map(seg => seg.map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r)} ${y(r)}`).join(' '))

  const areaPaths = segments
    .filter(seg => seg.length >= 2)
    .map(seg => {
      const first = seg[0]
      const last = seg[seg.length - 1]
      const points = seg.map(r => `L ${x(r)} ${y(r)}`).join(' ')
      return `M ${x(first)} 230 ${points} L ${x(last)} 230 Z`
    })

  function inspect(event: PointerEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM()
    if (!transform) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    if (point.x < 55 || point.x > 715 || point.y < 20 || point.y > 240) {
      setActiveId(null)
      return
    }
    const closest = valid.reduce((best, r) => Math.abs(x(r) - point.x) < Math.abs(x(best) - point.x) ? r : best)
    setActiveId(closest.id)
  }

  function navigate(event: KeyboardEvent<SVGSVGElement>) {
    const index = valid.findIndex(r => r.id === activeId)
    if (event.key === 'Escape') {
      setActiveId(null)
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? valid.length - 1
      : Math.max(0, Math.min(valid.length - 1, (index < 0 ? valid.length - 1 : index) + (event.key === 'ArrowLeft' ? -1 : 1)))
    setActiveId(valid[next].id)
  }

  const xTicks = [0, Math.floor((readings.length - 1) / 2), readings.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className="chart-wrap interactive-history">
      <div className="history-plot">
        <svg
          className="trend-chart data-chart"
          viewBox="0 0 750 285"
          preserveAspectRatio="xMidYMid meet"
          role="graphics-document"
          tabIndex={0}
          aria-label={`${label} history, ${valid.length} readings. Use left and right arrow keys to inspect dates and values.`}
          aria-describedby={active ? tooltipId : undefined}
          onPointerMove={inspect}
          onPointerDown={inspect}
          onPointerLeave={() => setActiveId(null)}
          onFocus={event => {
            if (event.currentTarget.matches(':focus-visible')) setActiveId(valid[valid.length - 1].id)
          }}
          onBlur={() => setActiveId(null)}
          onKeyDown={navigate}
        >
          {[0, 1, 2, 3, 4].map(i => (
            <g key={i}>
              <line
                x1="55"
                x2="715"
                y1={230 - i * 50}
                y2={230 - i * 50}
                className="grid-line"
                stroke="var(--chart-grid, rgba(237, 237, 237, 0.08))"
                strokeWidth="1"
              />
              <text x="44" y={234 - i * 50} textAnchor="end" className="mono" style={axisTextStyle}>
                {Math.round(max * i / 4)}
              </text>
            </g>
          ))}
          {areaPaths.map((d, i) => (
            <path key={`area-${i}`} d={d} fill={colour} opacity="0.08" stroke="none" />
          ))}
          {linePaths.map((d, i) => (
            <path
              key={`line-${i}`}
              d={d}
              fill="none"
              stroke={colour}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {valid.length <= 48 && valid.map(r => (
            <circle key={r.id} cx={x(r)} cy={y(r)} r="2.5" fill={colour} />
          ))}
          {active && (
            <g pointerEvents="none">
              <line
                x1={x(active)}
                x2={x(active)}
                y1="20"
                y2="230"
                stroke="var(--chart-crosshair, rgba(237, 237, 237, 0.28))"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(active)}
                cy={y(active)}
                r="5"
                fill="var(--bg-card, #19191b)"
                stroke={colour}
                strokeWidth="2"
              />
            </g>
          )}
          {xTicks.map((i, j) => (
            <text
              key={i}
              x={x(readings[i])}
              y="265"
              textAnchor={j === 0 ? 'start' : i === readings.length - 1 ? 'end' : 'middle'}
              className="mono"
              style={axisTextStyle}
            >
              {new Date(readings[i].timestamp).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </text>
          ))}
        </svg>
        {active && (
          <div
            id={tooltipId}
            role="tooltip"
            className="history-tooltip"
            style={{ left: `clamp(8px, calc(${x(active) / 750 * 100}% - var(--tooltip-w, 230px) / 2), max(8px, calc(100% - var(--tooltip-w, 230px) - 8px)))` }}
          >
            <time dateTime={active.timestamp}>
              {new Date(active.timestamp).toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </time>
            <span className="mono">
              {new Date(active.timestamp).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </span>
            <strong>
              {label}{' '}
              <b className="mono">
                {format(active[pollutant]!)} <small>{unit}</small>
              </b>
            </strong>
            <small>{active.source}</small>
          </div>
        )}
      </div>
      <p className="chart-caption">
        {label} ({unit}) · <span className="mono">{valid.length}</span> stored {valid.length === 1 ? 'reading' : 'readings'} · Hover, tap, or use ← → to inspect
      </p>
    </div>
  )
}
