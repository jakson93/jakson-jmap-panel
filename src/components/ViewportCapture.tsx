import React from 'react';
import L from 'leaflet';
import { useMap, useMapEvents } from 'react-leaflet';

/** Keep a generous margin so panning does not pop markers at the viewport edge. */
export function ViewportCapture({ onBounds }: { onBounds: (bounds: L.LatLngBounds) => void }) {
  const map = useMap();
  const update = React.useCallback(() => onBounds(map.getBounds().pad(0.4)), [map, onBounds]);
  useMapEvents({ moveend: update, zoomend: update, resize: update });
  React.useEffect(update, [update]);
  return null;
}
