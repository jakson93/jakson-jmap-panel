import L from 'leaflet';
import { GrafanaTheme2 } from '@grafana/data';

/** Code-native symbols; provider text is never interpolated into marker HTML. */
export function environmentIcon(kind: 'fire' | 'rain', theme: GrafanaTheme2) {
  const size = parseFloat(theme.spacing(5));
  const color = kind === 'fire' ? theme.colors.warning.text : theme.colors.info.text;
  const symbol =
    kind === 'fire'
      ? `<path d="M18 5c1 7-7 8-5 15-4-1-2-5-3-7-5 5-5 11 0 15 4 4 12 3 15-2 5-8-2-16-7-21Z" fill="${color}"/><path d="M17 19c0 4-4 5-3 9 2 3 7 2 8-1 1-3-2-6-5-8Z" fill="${theme.colors.error.text}"/>`
      : `<path d="M9 22a6 6 0 0 1-1-12 8 8 0 0 1 15-1 6 6 0 0 1 1 13Z" fill="${color}"/><path d="m10 26-2 5m9-5-2 5m9-5-2 5" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
  return L.divIcon({
    className: `jmap-environment-icon jmap-${kind}-icon`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 36 36"><circle cx="18" cy="18" r="17" fill="${theme.colors.background.primary}" stroke="${color}"/>${symbol}</svg>`,
  });
}
