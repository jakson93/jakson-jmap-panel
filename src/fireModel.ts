import { PanelOptions, RoutePoint } from './types';

export const FIRE_SOURCE = 'https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/wfs';
export const FIRE_LIMIT = 2000;
export type FireFocus = RoutePoint & {
  id: string;
  detectedAt: number;
  satellite: string;
  municipality: string;
  state: string;
};
export type FireExposure = { kind: 'route'; id: string; name: string; distanceKm: number };
export type NearbyFire = FireFocus & { exposures: FireExposure[] };
const rad = (n: number) => (n * Math.PI) / 180;
const earth = 6371.0088;
export const validGeoPoint = (p: RoutePoint) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export function geoDistance(a: RoutePoint, b: RoutePoint) {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function bearing(a: RoutePoint, b: RoutePoint) {
  const dl = rad(b.lng - a.lng);
  return Math.atan2(
    Math.sin(dl) * Math.cos(rad(b.lat)),
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dl)
  );
}
/** Distance to the actual geographic segment, including its interior, never the topology path. */
export function segmentDistance(focus: RoutePoint, a: RoutePoint, b: RoutePoint) {
  const length = geoDistance(a, b);
  if (length < 0.000001) {
    return geoDistance(focus, a);
  }
  const delta = geoDistance(a, focus) / earth;
  const angle = bearing(a, focus) - bearing(a, b);
  const along = Math.atan2(Math.sin(delta) * Math.cos(angle), Math.cos(delta)) * earth;
  if (along <= 0) {
    return geoDistance(focus, a);
  }
  if (along >= length) {
    return geoDistance(focus, b);
  }
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, Math.sin(delta) * Math.sin(angle))))) * earth;
}

export function fireSettings(options: PanelOptions) {
  const clamp = (n: number | undefined, fallback: number, min: number, max: number) =>
    Number.isFinite(n) ? Math.max(min, Math.min(max, n!)) : fallback;
  return {
    radius: clamp(options.fireRadiusKm, 5, 0.1, 50),
    hours: clamp(options.fireWindowHours, 24, 1, 48),
    refresh: clamp(options.fireRefreshSeconds, 600, 120, 3600),
  };
}

export function networkFireBounds(options: PanelOptions): [number, number, number, number] | undefined {
  const points = geographicRouteSegments(options).flatMap(({ a, b }) => [a, b]);
  if (!points.length) {
    return undefined;
  }
  let south = 90,
    north = -90,
    west = 180,
    east = -180;
  for (const p of points) {
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
  }
  const radius = fireSettings(options).radius;
  const latPad = radius / 110;
  const lonPad = radius / (110 * Math.max(0.01, Math.cos(rad(Math.max(Math.abs(south), Math.abs(north))))));
  return [
    Math.max(-180, west - lonPad),
    Math.max(-90, south - latPad),
    Math.min(180, east + lonPad),
    Math.min(90, north + latPad),
  ];
}

/** All configured routes represent fiber. Only actual, contiguous geographic segments qualify. */
export function geographicRouteSegments(options: PanelOptions) {
  return (options.routes ?? []).flatMap((route) =>
    (route.points ?? []).slice(1).flatMap((b, i) => {
      const a = route.points[i];
      if (!validGeoPoint(a) || !validGeoPoint(b)) {
        return [];
      }
      const length = geoDistance(a, b);
      return length > 0.000001 ? [{ a, b, route, length }] : [];
    })
  );
}

export function fireQuery(bounds: [number, number, number, number]) {
  const query = new URLSearchParams({
    service: 'WFS',
    version: '1.0.0',
    request: 'GetFeature',
    typeName: 'dados_abertos:focos_48h_br_todosats',
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    bbox: `${bounds.join(',')},EPSG:4326`,
    maxFeatures: String(FIRE_LIMIT),
    sortBy: 'data_hora_gmt D',
  });
  return `${FIRE_SOURCE}?${query}`;
}

export function parseFireResponse(input: unknown): { focuses: FireFocus[]; truncated: boolean; invalid: number } {
  if (!input || typeof input !== 'object') {
    throw new Error('Resposta inválida do INPE');
  }
  const collection = input as { type?: unknown; features?: unknown; numberMatched?: unknown; totalFeatures?: unknown };
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Resposta inválida do INPE');
  }
  const focuses: FireFocus[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const feature of collection.features.slice(0, FIRE_LIMIT)) {
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates : undefined;
    const lat = properties?.latitude ?? coordinates?.[1];
    const lng = properties?.longitude ?? coordinates?.[0];
    const rawDate = properties?.data_hora_gmt;
    // INPE publishes GMT; avoid interpreting a timestamp without a timezone as browser-local time.
    const date = typeof rawDate === 'string' ? rawDate.replace(' ', 'T') : '';
    const detectedAt = Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(date) ? date : `${date}Z`);
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !validGeoPoint({ lat, lng }) ||
      !Number.isFinite(detectedAt)
    ) {
      invalid++;
      continue;
    }
    const satellite = typeof properties?.satelite === 'string' ? properties.satelite : 'Não informado';
    const id = String(properties?.foco_id ?? `${satellite}/${lat}/${lng}/${detectedAt}`);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    focuses.push({
      id,
      lat,
      lng,
      detectedAt,
      satellite,
      municipality: String(properties?.municipio ?? ''),
      state: String(properties?.estado ?? ''),
    });
  }
  const matched = Number(collection.numberMatched ?? collection.totalFeatures);
  return {
    focuses,
    invalid,
    truncated: collection.features.length >= FIRE_LIMIT && (!Number.isFinite(matched) || matched > FIRE_LIMIT),
  };
}

export function nearbyFires(focuses: FireFocus[], options: PanelOptions, now: number): NearbyFire[] {
  const { radius, hours } = fireSettings(options);
  const segments = geographicRouteSegments(options);
  const result: NearbyFire[] = [];
  for (const focus of focuses) {
    if (focus.detectedAt < now - hours * 3600000 || focus.detectedAt > now + 60000) {
      continue;
    }
    const exposures: FireExposure[] = [];
    const distances = new Map<string, FireExposure>();
    for (const { a, b, route, length } of segments) {
      // Cheap geographic rejection before the spherical segment calculation.
      const pad = (radius + length / 2) / 110;
      const lonPad = pad / Math.max(0.01, Math.cos(rad(Math.max(Math.abs(a.lat), Math.abs(b.lat)))));
      if (
        Math.abs(a.lng - b.lng) < 180 &&
        (focus.lat < Math.min(a.lat, b.lat) - pad ||
          focus.lat > Math.max(a.lat, b.lat) + pad ||
          focus.lng < Math.min(a.lng, b.lng) - lonPad ||
          focus.lng > Math.max(a.lng, b.lng) + lonPad)
      ) {
        continue;
      }
      const distanceKm = segmentDistance(focus, a, b);
      if (distanceKm <= radius && distanceKm < (distances.get(route.id)?.distanceKm ?? Infinity)) {
        distances.set(route.id, { kind: 'route', id: route.id, name: route.name, distanceKm });
      }
    }
    exposures.push(...distances.values());
    exposures.sort((a, b) => a.distanceKm - b.distanceKm);
    if (exposures.length) {
      result.push({ ...focus, exposures });
    }
  }
  return result.sort((a, b) => a.exposures[0].distanceKm - b.exposures[0].distanceKm || b.detectedAt - a.detectedAt);
}
