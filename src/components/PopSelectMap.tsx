import React from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';

type Props = {
  center: [number, number];
  zoom: number;
  onSelect: (lat: number, lng: number) => void;
};

const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function ClickCapture({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}

export function PopSelectMap({ center, zoom, onSelect }: Props) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <ClickCapture onSelect={onSelect} />
      <TileLayer url={DEFAULT_TILE_URL} />
    </MapContainer>
  );
}
