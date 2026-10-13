import React from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { nonOverlappingLabels } from '../networkPresentation';

export type MapLabel = { id: string; name: string; lat: number; lng: number; iconSize: number; priority: number };

/** Runs on viewport/data changes, never on an animation tick. */
export function MapLabels({
  labels,
  fontSize,
  padding,
  gap,
  fontFamily,
  maxWidth,
  onVisible,
}: {
  labels: MapLabel[];
  fontSize: number;
  padding: number;
  gap: number;
  fontFamily: string;
  maxWidth: number;
  onVisible: (ids: Set<string>) => void;
}) {
  const map = useMap();
  const update = React.useCallback(() => {
    const size = map.getSize();
    const measurement = document.createElement('canvas').getContext('2d');
    if (measurement) {
      measurement.font = `500 ${fontSize}px ${fontFamily}`;
    }
    const candidates = labels.map((label) => {
      const position = map.latLngToContainerPoint([label.lat, label.lng]);
      const height = fontSize * 1.5 + padding * 2;
      return {
        id: label.id,
        x: position.x + label.iconSize / 2 + gap,
        y: position.y - height / 2,
        width: Math.min(
          (measurement?.measureText(label.name).width ?? label.name.length * fontSize) + padding * 2 + fontSize + 4,
          maxWidth
        ),
        height,
        priority: label.priority,
      };
    });
    onVisible(nonOverlappingLabels(candidates, size.x, size.y, gap));
  }, [map, labels, fontSize, fontFamily, maxWidth, padding, gap, onVisible]);
  useMapEvents({ moveend: update, zoomend: update, resize: update });
  React.useEffect(update, [update]);
  return null;
}
