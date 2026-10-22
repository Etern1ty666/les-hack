// deck.gl поверх MapLibre в interleaved-режиме: слои рисуются в том же WebGL-контексте и понимают globe.
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { useEffect } from 'react'
import { useControl } from 'react-map-gl/maplibre'

export function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay({ ...props, interleaved: true }))
  overlay.setProps(props)
  useEffect(() => {
    // отладка из консоли: экземпляр, реально добавленный на карту (StrictMode создаёт фабрикой два)
    if (import.meta.env.DEV) Object.assign(window, { __podrostDeck: overlay })
  }, [overlay])
  return null
}
