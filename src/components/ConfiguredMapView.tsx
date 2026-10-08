import React from 'react';
import { useMap } from 'react-leaflet';

/** Leaflet's initial center/zoom props are immutable; synchronize only when saved options change. */
export function ConfiguredMapView({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  React.useEffect(() => {
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Number.isFinite(zoom) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      map.setView([lat, lng], Math.max(1, Math.min(20, zoom)), { animate: false });
    }
  }, [map, lat, lng, zoom]);
  return null;
}
