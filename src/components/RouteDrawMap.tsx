import React from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

type Point = { lat: number; lng: number };

type Props = {
  center: [number, number];
  zoom: number;
  points: Point[];
  existingRoutes?: Point[][];
  pops?: Array<{ id: string; name: string; lat: number; lng: number }>;
  onAddPoint: (point: Point) => void;
};

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function ClickCapture({ onAddPoint }: { onAddPoint: (point: Point) => void }) {
  useMapEvents({
    click: (e) => {
      onAddPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
}

function PreventModalDismiss() {
  const map = useMap();

  React.useEffect(() => {
    const container = map.getContainer();
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
  }, [map]);

  return null;
}

export function RouteDrawMap({ center, zoom, points, existingRoutes, pops, onAddPoint }: Props) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <PreventModalDismiss />
      <ClickCapture onAddPoint={onAddPoint} />
      <TileLayer url={DEFAULT_TILE_URL} />
      {(existingRoutes ?? []).map((routePoints, idx) => (
        <Polyline
          key={`existing-${idx}`}
          positions={routePoints.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: 'rgba(148, 163, 184, 0.5)', weight: 2 }}
        />
      ))}
      {(pops ?? []).map((pop) => (
        <CircleMarker
          key={pop.id}
          center={[pop.lat, pop.lng]}
          radius={7}
          pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.9 }}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1} permanent>
            <span>{pop.name}</span>
          </Tooltip>
        </CircleMarker>
      ))}
      {points.length > 0 && (
        <>
          <Polyline positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#60a5fa', weight: 3 }} />
          {points.map((p, idx) => (
            <CircleMarker key={`${p.lat}-${p.lng}-${idx}`} center={[p.lat, p.lng]} radius={5} />
          ))}
        </>
      )}
    </MapContainer>
  );
}
