import {
  FIRE_LIMIT,
  fireQuery,
  geoDistance,
  nearbyFires,
  networkFireBounds,
  parseFireResponse,
  segmentDistance,
} from './fireModel';
import { PanelOptions } from './types';

const options: PanelOptions = {
  centerLat: 0,
  centerLng: 0,
  zoom: 10,
  mapProvider: 'osm',
  fireRadiusKm: 2,
  pops: [{ id: 'p', name: 'POP', lat: -23, lng: -46, equipments: [] }],
  routes: [
    {
      id: 'r',
      name: 'Fibra',
      interfaceItem: '',
      colors: { online: '', alert: '', down: '' },
      metrics: [],
      extraMetrics: [],
      trunks: [],
      points: [
        { lat: -23, lng: -46 },
        { lat: -23, lng: -45.8 },
      ],
      topologyPoints: [{ x: 9999, y: 9999 }],
    },
  ],
};
const now = Date.parse('2026-10-08T12:00:00Z');
const focus = {
  id: 'f',
  lat: -22.999,
  lng: -45.9,
  detectedAt: now - 3600000,
  satellite: 'NOAA-20',
  municipality: 'Município',
  state: 'SP',
};

test('detects fire near the middle of a geographic route even when POPs are far, without changing metrics or topology', () => {
  const original = JSON.parse(JSON.stringify(options)) as typeof options;
  const result = nearbyFires([focus], options, now);
  expect(result).toHaveLength(1);
  expect(result[0].exposures).toHaveLength(1);
  expect(result[0].exposures[0]).toMatchObject({ kind: 'route', id: 'r' });
  expect(result[0].exposures[0].distanceKm).toBeLessThan(0.2);
  expect(options).toEqual(original);
});
test('excludes old/future/distant detections and checks POPs too, with configurable radius', () => {
  const nearPop = { ...focus, lat: -23, lng: -46 };
  expect(nearbyFires([nearPop], options, now)[0].exposures.map((e) => e.kind)).toEqual(['pop', 'route']);
  expect(
    nearbyFires(
      [
        { ...focus, detectedAt: now - 25 * 3600000 },
        { ...focus, detectedAt: now + 3600000 },
        { ...focus, lat: -20 },
      ],
      options,
      now
    )
  ).toEqual([]);
  expect(nearbyFires([{ ...focus, lat: -22.98 }], { ...options, fireRadiusKm: 0.1 }, now)).toEqual([]);
});
test('spherical distances handle endpoint clamping, coincident endpoints and antimeridian', () => {
  const a = { lat: 0, lng: 0 },
    b = { lat: 0, lng: 1 };
  expect(segmentDistance({ lat: 0, lng: 2 }, a, b)).toBeCloseTo(geoDistance(b, { lat: 0, lng: 2 }), 4);
  expect(segmentDistance(a, a, a)).toBe(0);
  expect(segmentDistance({ lat: 0, lng: 180 }, { lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeLessThan(0.001);
});
test('query uses geographic POPs/routes with radius padding and caps newest records', () => {
  const bounds = networkFireBounds(options)!;
  expect(bounds[0]).toBeLessThan(-46);
  expect(bounds[2]).toBeGreaterThan(-45.8);
  const query = new URL(fireQuery(bounds));
  expect(query.searchParams.get('maxFeatures')).toBe(String(FIRE_LIMIT));
  expect(query.searchParams.get('sortBy')).toBe('data_hora_gmt D');
  expect(networkFireBounds({ ...options, pops: [], routes: [] })).toBeUndefined();
});
test('parses verified INPE schema as GMT, deduplicates and rejects malformed data without implying zero detections', () => {
  const feature = {
    geometry: { type: 'Point', coordinates: [-46, -23] },
    properties: {
      foco_id: 'id',
      data_hora_gmt: '2026-10-08 10:00:00',
      satelite: 'NOAA-20',
      municipio: '<script>test</script>',
    },
  };
  const parsed = parseFireResponse({
    type: 'FeatureCollection',
    features: [feature, feature, { properties: { latitude: 91, longitude: 0 } }],
  });
  expect(parsed.focuses).toHaveLength(1);
  expect(parsed.focuses[0].detectedAt).toBe(Date.parse('2026-10-08T10:00:00Z'));
  expect(parsed.invalid).toBe(1);
  expect(() => parseFireResponse({ error: 'server failed' })).toThrow();
  expect(
    parseFireResponse({
      type: 'FeatureCollection',
      features: Array(FIRE_LIMIT).fill(feature),
      totalFeatures: FIRE_LIMIT + 1,
    }).truncated
  ).toBe(true);
});
