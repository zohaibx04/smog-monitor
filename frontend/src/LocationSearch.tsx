import { useRef, useState, type FormEvent } from 'react'
import { api } from './api'
import { Icon } from './App'

type Place = { id: number; name: string; region: string; country: string; latitude: number; longitude: number }
export type LocationInput = { name: string; latitude: number; longitude: number }

export default function LocationSearch({ onAdd }: { onAdd: (location: LocationInput) => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('')
  const [results, setResults] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [name, setName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearching(true)
    setSearchError('')
    setResults(null)
    const params = new URLSearchParams({ q: query.trim(), country: country.trim(), discover: 'true' })
    try {
      setResults(await api<Place[]>(`/locations/search?${params}`))
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Location search failed')
    } finally {
      setSearching(false)
    }
  }

  function choose(place: Place) {
    const label = [place.name, place.country].filter(Boolean).join(', ')
    setName(label.length <= 80 ? label : place.name.slice(0, 80))
    setLatitude(String(place.latitude))
    setLongitude(String(place.longitude))
    setSaveError('')
    nameInput.current?.focus()
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      await onAdd({ name: name.trim(), latitude: Number(latitude), longitude: Number(longitude) })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not add the location')
      setSaving(false)
    }
  }

  return <>
    <section className="card world-search">
      <div className="card-heading">
        <Icon name="search" size={16} />
        <h3>Find a city</h3>
      </div>
      <form className="world-search-form" onSubmit={search}>
        <label className="field"><span>City or postcode</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Faisalabad" minLength={2} maxLength={100} required /></label>
        <label className="field"><span>Country code (optional)</span><input value={country} onChange={e => setCountry(e.target.value.toUpperCase())} placeholder="PK" maxLength={2} pattern="[A-Za-z]{2}" /></label>
        <button type="submit" className="btn secondary" disabled={searching || saving}>{searching ? 'Searching…' : 'Search'}</button>
      </form>
      {searchError && <p className="notice error-notice" role="alert">{searchError}</p>}
      {results?.length === 0 && <p className="config-intro" role="status">No locations found. Try another name or enter coordinates below.</p>}
      {!!results?.length && <div className="world-results">{results.map(place => <div className="world-result" key={place.id}>
        <div><strong>{place.name}</strong><span>{[place.region, place.country].filter(Boolean).join(', ')}</span><small className="mono">{place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</small></div>
        <button type="button" className="btn secondary" disabled={saving} onClick={() => choose(place)}>Use location<span className="sr-only"> for {place.name}, {place.region}, {place.country}, at {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</span></button>
      </div>)}</div>}
    </section>
    <section className="card location-form">
      <h3>Location details</h3>
      <p className="config-intro">Choose a search result or enter coordinates. The location will appear in the shared monitoring dashboard.</p>
      <form onSubmit={save}>
        <label className="field"><span>Location name</span><input ref={nameInput} value={name} onChange={e => setName(e.target.value)} maxLength={80} required /></label>
        <label className="field"><span>Latitude</span><input type="number" step="any" min="-90" max="90" value={latitude} onChange={e => setLatitude(e.target.value)} required /></label>
        <label className="field"><span>Longitude</span><input type="number" step="any" min="-180" max="180" value={longitude} onChange={e => setLongitude(e.target.value)} required /></label>
        <button type="submit" className="btn primary" disabled={saving || !name.trim()}><Icon name="plus" size={16} />{saving ? 'Adding…' : 'Add to monitoring'}</button>
      </form>
      {saveError && <p className="notice error-notice" role="alert">{saveError}</p>}
    </section>
  </>
}
