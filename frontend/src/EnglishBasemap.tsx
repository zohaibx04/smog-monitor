import { useEffect } from 'react'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl, type ExpressionSpecification, type StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useMap } from 'react-leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'

setWorkerUrl(workerUrl)

const styleUrl = 'https://tiles.openfreemap.org/styles/positron'
const englishPlaceName: ExpressionSpecification = [
  'coalesce', ['get', 'name:en'],
  ['case',
    ['all', ['has', 'name_en'],
      ['!=', ['get', 'name_en'], ['get', 'name']],
      ['!=', ['get', 'name_en'], ['get', 'name:nonlatin']]],
    ['get', 'name_en'],
    ['has', 'name:nonlatin'], ['get', 'name:latin'],
    ['coalesce', ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']]],
  '',
]

export type BasemapStatus = 'loading' | 'ready' | 'unavailable'

export default function EnglishBasemap({ onStatus }: { onStatus: (status: BasemapStatus) => void }) {
  const map = useMap()

  useEffect(() => {
    const controller = new AbortController()
    let layer: ReturnType<typeof maplibreGL> | undefined

    async function loadBasemap() {
      onStatus('loading')
      try {
        const response = await fetch(styleUrl, { signal: controller.signal })
        if (!response.ok) throw new Error('Basemap style failed to load.')
        const style: StyleSpecification = await response.json()
        if (controller.signal.aborted) return

        for (const label of style.layers) {
          if (label.type === 'symbol' && label['source-layer'] === 'place' && label.layout?.['text-field']) {
            label.layout['text-field'] = englishPlaceName
          }
        }

        layer = maplibreGL({ style })
        layer.addTo(map)
        const basemap = layer.getMaplibreMap()
        basemap.on('load', () => onStatus('ready'))
        basemap.on('error', () => onStatus('unavailable'))
        basemap.on('idle', () => {
          if (basemap.areTilesLoaded()) onStatus('ready')
        })
      } catch {
        if (!controller.signal.aborted) onStatus('unavailable')
      }
    }

    void loadBasemap()
    return () => {
      controller.abort()
      if (layer && map.hasLayer(layer)) map.removeLayer(layer)
    }
  }, [map, onStatus])

  return null
}
