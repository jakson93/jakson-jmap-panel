import { createTheme, FieldType, toDataFrame } from '@grafana/data';
import { alignEquipment, moveNode, networkNodes, organizeTopology, snapPoint } from './networkModel';
import {
  connectionError,
  dependencyError,
  dependentRoutes,
  emptyFilter,
  filterNetwork,
  freshReadings,
  routeHistory,
} from './operationalModel';
import { readTelemetry, Readings, routeStatus } from './networkTelemetry';
import { PanelOptions, Route } from './types';
import { migratePresetIcon } from './iconUrl';

const route = (id = 'a'): Route => ({
  id,
  name: id,
  points: [],
  metrics: [],
  extraMetrics: [],
  trunks: [],
  colors: { online: '', down: '', alert: '' },
  interfaceItem: 'status',
  onlineValue: '1',
});
const readings = (values: unknown[], times: number[]): Readings =>
  new Map([
    [
      'status',
      {
        raw: values[values.length - 1],
        text: String(values[values.length - 1]),
        values,
        times,
        sampleTime: times[times.length - 1],
      },
    ],
  ]);
const options = (): PanelOptions => ({
  centerLat: 0,
  centerLng: 0,
  zoom: 10,
  mapProvider: 'osm',
  pops: [
    {
      id: 'p',
      name: 'Centro',
      lat: 0,
      lng: 0,
      equipments: [
        {
          id: 'e',
          name: 'Core',
          metrics: [],
          topologyPosition: { x: 20, y: 30 },
          topologyLocked: true,
          ports: [{ id: 'eth1', name: 'eth1' }],
        },
        { id: 'f', name: 'OLT', metrics: [] },
      ],
    },
  ],
  routes: [route('a'), { ...route('b'), dependsOnRouteIds: ['a'] }, { ...route('c'), dependsOnRouteIds: ['b'] }],
});

test('freshness follows the last valid sample and preserves Grafana aliases and units', () => {
  const frame = toDataFrame({
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000, 3000] },
      { name: 'status', type: FieldType.number, values: [1, 0, null], config: { displayName: 'alias' } },
    ],
  });
  const base = readTelemetry([frame], createTheme());
  expect(base.get('status')?.sampleTime).toBe(2000);
  const fresh = freshReadings(base, 22000, 10);
  expect(fresh.get('status')).toBe(fresh.get('alias'));
  expect(base.get('status')?.stale).toBeUndefined();
  expect(routeStatus(route(), fresh)).toBe('unknown');
  expect(routeStatus({ ...route(), maintenance: true }, fresh)).toBe('maintenance');
  expect(routeStatus(route(), freshReadings(base, 3000, 10))).toBe('down');
});

test('history uses time weights and only complete incidents for mean recovery', () => {
  const history = routeHistory(route(), readings([1, 0, 0, 1], [0, 1000, 3000, 5000]), 0, 6000, 3000);
  expect(history.downMs).toBe(4000);
  expect(history.availability).toBeCloseTo(1 / 3);
  expect(history.coverage).toBe(1);
  expect(history.meanRepairMs).toBe(4000);
  expect(history.incidents).toEqual([{ start: 1000, end: 5000, boundedStart: false, observed: true }]);
});

test('gaps, nulls and a partial beginning never become an SLA or a complete repair', () => {
  const history = routeHistory(route(), readings([0, null, 0, 1], [0, 1000, 10000, 11000]), 0, 12000, 2000);
  expect(history.coverage).toBeCloseTo(3 / 12);
  expect(history.incidents[0].observed).toBe(false);
  expect(history.incidents[1].boundedStart).toBe(true);
  expect(history.meanRepairMs).toBeUndefined();
  expect(routeHistory(route(), new Map(), 0, 1000, 2000).availability).toBeUndefined();
});

test('explicit impact is transitive and dependencies reject cycles without assuming adjacency', () => {
  const config = options();
  expect(dependentRoutes(config, 'a').map((r) => r.id)).toEqual(['b', 'c']);
  expect(dependencyError(config, 'a', ['c'])).toContain('ciclo');
  expect(dependencyError(config, 'a', ['a'])).toContain('mesma');
  expect(dependencyError(config, 'b', ['a'])).toBe('');
});

test('filters include explicit upstream dependencies and never modify the configuration', () => {
  const config = options();
  const before = JSON.stringify(config);
  expect(
    filterNetwork(config, { ...emptyFilter(), query: 'c', includeDependencies: true }, new Map()).routes.map(
      (r) => r.id
    )
  ).toEqual(['a', 'b', 'c']);
  expect(filterNetwork(config, { ...emptyFilter(), query: 'c' }, new Map()).routes.map((r) => r.id)).toEqual(['c']);
  expect(JSON.stringify(config)).toBe(before);
});

test('locked positions survive dragging, organizing and alignment; map positions remain editable', () => {
  const config = options();
  const endpoint = { popId: 'p', equipmentId: 'e' };
  expect(moveNode(config, endpoint, { x: 40, y: 60 }, 'topology')).toBe(config);
  expect(organizeTopology(config, 230, 160).pops[0].equipments[0].topologyPosition).toEqual({ x: 20, y: 30 });
  const aligned = alignEquipment(config, 'p', 'horizontal');
  expect(
    networkNodes(aligned, 'topology')
      .filter((n) => n.equipment)
      .map((n) => n.position.y)
  ).toEqual([30, 30]);
  expect(moveNode(config, { popId: 'p' }, { x: 1, y: 2 }, 'map').pops[0].lat).toBe(2);
  expect(snapPoint({ x: 23, y: 38 }, 20)).toEqual({ x: 20, y: 40 });
  expect(snapPoint({ x: 23, y: 38 }, 0)).toEqual({ x: 23, y: 38 });
});

test('ports reject occupation by another route and missing ports', () => {
  const config = options();
  const endpoint = { popId: 'p', equipmentId: 'e', portId: 'eth1' };
  config.routes[0].source = endpoint;
  expect(connectionError(config, endpoint)).toContain('outra rota');
  expect(connectionError(config, endpoint, 'a')).toBe('');
  expect(connectionError(config, { ...endpoint, portId: 'missing' })).toContain('não encontrada');
});

test('old preset URLs continue to work without touching external icons', () => {
  expect(migratePresetIcon('/public/plugins/jakson-jmap-panel/5816cf71483c5479f81b.png')).toContain('/img/sw.png');
  expect(migratePresetIcon('https://example.org/5816cf71483c5479f81b.png')).toBe(
    'https://example.org/5816cf71483c5479f81b.png'
  );
});
