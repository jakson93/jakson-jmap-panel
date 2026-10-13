import { geographicRouteSegments, validGeoPoint } from './fireModel';
import { PanelOptions, RoutePoint } from './types';

export const RAIN_SOURCE = 'https://apiprevmet3.inmet.gov.br/avisos/ativos';
type Ring = RoutePoint[];
export type RainAlert = {
  id: string;
  event: string;
  severity: string;
  startsAt: number;
  endsAt: number;
  risks: string[];
  polygons: Ring[][];
};
export type RouteRain = RainAlert & { routes: Array<{ id: string; name: string; point: RoutePoint }> };

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function rainRefresh(options: PanelOptions) {
  return Number.isFinite(options.rainRefreshSeconds) ? Math.max(120, Math.min(3600, options.rainRefreshSeconds!)) : 600;
}
export function parseRainResponse(input: unknown) {
  const data = input as { hoje?: unknown; futuro?: unknown } | null;
  if (!data || !Array.isArray(data.hoje) || !Array.isArray(data.futuro)) {
    throw new Error('Resposta inválida do INMET');
  }
  const records: unknown[] = [...data.hoje, ...data.futuro];
  const alerts: RainAlert[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const record of records.slice(0, 500)) {
    if (!record || typeof record !== 'object') {
      invalid++;
      continue;
    }
    const raw = record as Record<string, unknown>;
    const event = text(raw.descricao);
    if (!event) {
      invalid++;
      continue;
    }
    if (!/chuva|tempestade/.test(normalize(event)) || raw.encerrado === true) {
      continue;
    }
    try {
      const geo = typeof raw.poligono === 'string' ? JSON.parse(raw.poligono) : raw.poligono;
      const coordinates =
        geo?.type === 'Polygon' ? [geo.coordinates] : geo?.type === 'MultiPolygon' ? geo.coordinates : undefined;
      if (!Array.isArray(coordinates) || !coordinates.length) {
        throw new Error();
      }
      let count = 0;
      const polygons: Ring[][] = coordinates.map((polygon: unknown) => {
        if (!Array.isArray(polygon) || !polygon.length) {
          throw new Error();
        }
        return polygon.map((ring: unknown) => {
          if (!Array.isArray(ring) || ring.length < 4) {
            throw new Error();
          }
          const points = ring.map((pair: unknown) => {
            if (++count > 50000 || !Array.isArray(pair) || typeof pair[0] !== 'number' || typeof pair[1] !== 'number') {
              throw new Error();
            }
            const point = { lng: pair[0], lat: pair[1] };
            if (!validGeoPoint(point)) {
              throw new Error();
            }
            return point;
          });
          if (points[0].lat !== points[points.length - 1].lat || points[0].lng !== points[points.length - 1].lng) {
            throw new Error();
          }
          return points;
        });
      });
      // Date fields contain calendar dates; hora_* is the local Brasília time shown by INMET.
      const date = (day: unknown, hour: unknown) =>
        /^\d{4}-\d{2}-\d{2}/.test(text(day)) && /^\d{2}:\d{2}$/.test(text(hour))
          ? Date.parse(`${text(day).slice(0, 10)}T${text(hour)}:00-03:00`)
          : NaN;
      const startsAt = date(raw.data_inicio, raw.hora_inicio),
        endsAt = date(raw.data_fim, raw.hora_fim);
      const id = text(raw.codigo) || (typeof raw.id === 'number' ? String(raw.id) : text(raw.id));
      if (!id || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt < startsAt) {
        throw new Error();
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      alerts.push({
        id,
        event,
        severity: text(raw.severidade) || 'Não informada',
        startsAt,
        endsAt,
        risks: Array.isArray(raw.riscos) ? raw.riscos.filter((r): r is string => typeof r === 'string') : [],
        polygons,
      });
    } catch {
      invalid++;
    }
  }
  return { alerts, invalid, truncated: records.length > 500 };
}
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
function inRing(p: RoutePoint, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i];
    const area = cross(b.lng - a.lng, b.lat - a.lat, p.lng - a.lng, p.lat - a.lat);
    if (
      Math.abs(area) < 1e-10 &&
      p.lng >= Math.min(a.lng, b.lng) &&
      p.lng <= Math.max(a.lng, b.lng) &&
      p.lat >= Math.min(a.lat, b.lat) &&
      p.lat <= Math.max(a.lat, b.lat)
    ) {
      return true;
    }
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < a.lng + ((p.lat - a.lat) * (b.lng - a.lng)) / (b.lat - a.lat)) {
      inside = !inside;
    }
  }
  return inside;
}
function inside(p: RoutePoint, polygon: Ring[]) {
  return inRing(p, polygon[0]) && !polygon.slice(1).some((hole) => inRing(p, hole));
}
/** Find a point on the actual route inside a warning, even when both endpoints lie outside it. */
export function rainIntersection(a: RoutePoint, b: RoutePoint, polygon: Ring[]): RoutePoint | undefined {
  const boundary = polygon[0];
  const bounds = boundary.reduce(
    (v, p) => [Math.min(v[0], p.lng), Math.min(v[1], p.lat), Math.max(v[2], p.lng), Math.max(v[3], p.lat)],
    [180, 90, -180, -90]
  );
  if (
    Math.max(a.lng, b.lng) < bounds[0] ||
    Math.min(a.lng, b.lng) > bounds[2] ||
    Math.max(a.lat, b.lat) < bounds[1] ||
    Math.min(a.lat, b.lat) > bounds[3]
  ) {
    return;
  }
  const dx = b.lng - a.lng,
    dy = b.lat - a.lat;
  const times = [0, 1];
  for (const ring of polygon) {
    for (let i = 1; i < ring.length; i++) {
      const c = ring[i - 1],
        d = ring[i],
        ex = d.lng - c.lng,
        ey = d.lat - c.lat;
      const denominator = cross(dx, dy, ex, ey);
      if (Math.abs(denominator) < 1e-12) {
        continue;
      }
      const t = cross(c.lng - a.lng, c.lat - a.lat, ex, ey) / denominator;
      const u = cross(c.lng - a.lng, c.lat - a.lat, dx, dy) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        times.push(t);
      }
    }
  }
  times.sort((x, y) => x - y);
  const point = (t: number) => ({ lng: a.lng + dx * t, lat: a.lat + dy * t });
  for (let i = 1; i < times.length; i++) {
    const p = point((times[i - 1] + times[i]) / 2);
    if (inside(p, polygon)) {
      return p;
    }
  }
  return times.map(point).find((p) => inside(p, polygon));
}
export function routeRainAlerts(alerts: RainAlert[], options: PanelOptions, now: number): RouteRain[] {
  const segments = geographicRouteSegments(options);
  return alerts
    .filter((alert) => now >= alert.startsAt && now <= alert.endsAt)
    .flatMap((alert) => {
      const routes = new Map<string, RouteRain['routes'][number]>();
      for (const { a, b, route } of segments) {
        if (routes.has(route.id)) {
          continue;
        }
        for (const polygon of alert.polygons) {
          const point = rainIntersection(a, b, polygon);
          if (point) {
            routes.set(route.id, { id: route.id, name: route.name, point });
            break;
          }
        }
      }
      return routes.size ? [{ ...alert, routes: [...routes.values()] }] : [];
    });
}
