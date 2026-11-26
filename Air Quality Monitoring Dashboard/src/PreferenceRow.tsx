import { useState, type FormEvent } from 'react'
import type { Preference } from './api'

export default function PreferenceRow({ preference, location, busy, save, remove }: {
  preference: Preference; location: string; busy: boolean;
  save: (value: { areaId: number; aqiThreshold: number; enabled: boolean }) => void;
  remove: () => void;
}) {
  const [threshold, setThreshold] = useState(preference.aqiThreshold)
  const [enabled, setEnabled] = useState(preference.enabled)
  return <form className="preference-row" onSubmit={(e: FormEvent) => { e.preventDefault(); save({ areaId: preference.areaId, aqiThreshold: threshold, enabled }) }}>
    <div className="management-name"><strong>{location}</strong><span>Alert when US AQI exceeds threshold</span></div>
    <label className="field"><span>US AQI threshold</span><input aria-label={`${location} alert threshold`} type="number" min="1" max="500" required value={threshold} onChange={e => setThreshold(Number(e.target.value))} /></label>
    <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Enabled</label>
    <button className="btn secondary" disabled={busy || (threshold === preference.aqiThreshold && enabled === preference.enabled)}>Save changes</button>
    <button type="button" className="btn secondary" disabled={busy} onClick={remove}>Remove</button>
  </form>
}
