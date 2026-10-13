import { parseRainResponse, rainIntersection, routeRainAlerts } from './rainModel';
import { PanelOptions } from './types';

const ring = [
  { lng: 0, lat: 0 },
  { lng: 2, lat: 0 },
  { lng: 2, lat: 2 },
  { lng: 0, lat: 2 },
  { lng: 0, lat: 0 },
];
const raw = {
  id: 1,
  descricao: 'Chuvas Intensas',
  severidade: 'Perigo',
  data_inicio: '2026-10-08T00:00:00.000Z',
  hora_inicio: '00:00',
  data_fim: '2026-10-08T00:00:00.000Z',
  hora_fim: '23:59',
  poligono: JSON.stringify({ type: 'Polygon', coordinates: [ring.map((p) => [p.lng, p.lat])] }),
  riscos: ['Chuva entre 30 e 60 mm/h'],
  encerrado: false,
};
const network: PanelOptions = {
  centerLat: 0,
  centerLng: 0,
  zoom: 8,
  mapProvider: 'osm',
  pops: [{ id: 'p', name: 'POP', lat: 1, lng: 1, equipments: [] }],
  routes: [
    {
      id: 'r',
      name: 'Fibra',
      points: [
        { lat: 1, lng: -1 },
        { lat: 1, lng: 3 },
      ],
      metrics: [],
      extraMetrics: [],
      trunks: [],
      colors: { online: '', alert: '', down: '' },
    },
  ],
};
test('parses verified INMET schema, keeps Brasília validity, deduplicates and excludes non-rain events', () => {
  const result = parseRainResponse({ hoje: [raw, raw, { ...raw, id: 2, descricao: 'Baixa Umidade' }], futuro: [] });
  expect(result.alerts).toHaveLength(1);
  expect(result.alerts[0].startsAt).toBe(Date.parse('2026-10-08T03:00:00Z'));
  expect(result.invalid).toBe(0);
  expect(() => parseRainResponse({ error: 'unavailable' })).toThrow();
});
test('reports invalid warning geometry and dates as partial coverage', () => {
  const result = parseRainResponse({
    hoje: [
      { ...raw, poligono: '{}' },
      { ...raw, hora_inicio: '' },
      { ...raw, descricao: undefined },
    ],
    futuro: [],
  });
  expect(result.invalid).toBe(3);
});
test('detects a route crossing an alert even when both endpoints and its POPs are outside, without mutating monitoring', () => {
  const snapshot = JSON.stringify(network);
  const alerts = parseRainResponse({ hoje: [raw], futuro: [] }).alerts;
  const result = routeRainAlerts(alerts, network, Date.parse('2026-10-08T12:00:00Z'));
  expect(result[0].routes).toEqual([{ id: 'r', name: 'Fibra', point: { lat: 1, lng: 1 } }]);
  expect(JSON.stringify(network)).toBe(snapshot);
  expect(routeRainAlerts(alerts, network, Date.parse('2026-10-08T02:59:00Z'))).toEqual([]);
  expect(routeRainAlerts(alerts, network, Date.parse('2026-10-09T03:00:00Z'))).toEqual([]);
});
test('never exposes an isolated POP or a degenerate local route; respects polygon holes and boundaries', () => {
  const alerts = parseRainResponse({ hoje: [raw], futuro: [] }).alerts;
  expect(routeRainAlerts(alerts, { ...network, routes: [] }, Date.parse('2026-10-08T12:00:00Z'))).toEqual([]);
  const hole = ring.map((p) => ({ lat: 0.5 + p.lat / 2, lng: 0.5 + p.lng / 2 }));
  expect(rainIntersection({ lat: 1, lng: 0.7 }, { lat: 1, lng: 1.3 }, [ring, hole])).toBeUndefined();
  expect(rainIntersection({ lat: 0, lng: -1 }, { lat: 0, lng: 3 }, [ring])).toEqual({ lat: 0, lng: 1 });
});
