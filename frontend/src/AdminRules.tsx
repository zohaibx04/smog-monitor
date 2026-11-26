import type { FormEvent } from 'react'
import { api, type AreaData, type Preference } from './api'
import PreferenceRow from './PreferenceRow'
import SelectDropdown from './SelectDropdown'

export default function AdminRules({ areas, preferences, token, busy, run }: {
  areas: AreaData[]; preferences: Preference[]; token: string; busy: boolean;
  run: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const rules = preferences.filter(p => p.systemRule)
  const activeAreas = areas.filter(a => a.area.active)
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    void run(() => api('/admin/preferences', 'POST', {
      areaId: Number(form.get('areaId')), aqiThreshold: Number(form.get('threshold')), enabled: true,
    }, token), 'Administrator alert rule saved')
  }
  return <section className="card comparison-card">
    <div className="card-title-row">
      <div>
        <h3>Shared smog alert rules</h3>
        <p className="card-subtitle">Administrator-controlled thresholds</p>
      </div>
      <span className="muted mono">{rules.length} configured</span>
    </div>
    <p className="config-intro">These rules apply across the monitoring network. The administrator token is required to create, change, or remove them. Users can still configure their own preferences on the Smog alerts screen.</p>
    <form className="admin-rule-form" onSubmit={create}>
      <div className="field">
        <span>Rule location</span>
        <SelectDropdown
          name="areaId"
          ariaLabel="Rule location"
          disabled={!activeAreas.length}
          options={activeAreas.map(a => ({ value: String(a.area.id), label: a.area.name }))}
        />
      </div>
      <label className="field"><span>US AQI threshold (1–500)</span><input name="threshold" type="number" min="1" max="500" defaultValue="100" required /></label>
      <button className="btn primary" disabled={busy || !token || !activeAreas.length}>Add monitoring rule</button>
    </form>
    {rules.map(p => <PreferenceRow key={`${p.id}-${p.aqiThreshold}-${p.enabled}`} preference={p}
      location={areas.find(a => a.area.id === p.areaId)?.area.name || 'Unavailable location'} busy={busy || !token}
      save={value => { void run(() => api(`/preferences/${p.id}`, 'PUT', value, token), 'Monitoring rule updated') }}
      remove={() => { void run(() => api(`/preferences/${p.id}`, 'DELETE', undefined, token), 'Monitoring rule removed') }} />)}
    <p className="data-footnote">Only fresh US AQI readings trigger alerts</p>
  </section>
}
