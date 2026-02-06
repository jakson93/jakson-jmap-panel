export type MapViewState = { lat: number; lng: number; zoom: number };

let last: MapViewState | null = null;

export function setLastMapView(v: MapViewState) {
  last = v;
}

export function getLastMapView() {
  return last;
}
