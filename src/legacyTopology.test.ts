import { connectNodes, networkNodes } from './networkModel';
import { mapRouteLayout } from './legacyTopology';
import { topologyPaths } from './networkPresentation';
import { PanelOptions } from './types';

const options = (): PanelOptions => ({
  centerLat: 1,
  centerLng: 2,
  zoom: 10,
  mapProvider: 'osm',
  pops: [
    { id: 'a', name: 'A', lat: 1, lng: 2, equipments: [{ id: 'router', name: 'Router A', metrics: [] }] },
    { id: 'b', name: 'B', lat: 3, lng: 4, equipments: [] },
  ],
  routes: [
    {
      id: 'legacy',
      name: 'Rota existente',
      interfaceItem: 'status',
      onlineValue: 'UP',
      colors: { online: 'green', alert: 'orange', down: 'red' },
      points: [
        { lat: 1.0003, lng: 2.0004 },
        { lat: 2, lng: 3 },
        { lat: 3.0005, lng: 4.0006 },
      ],
      metrics: [{ id: 'rx', label: 'Sinal', enabled: true, zabbixItem: 'optical.rx' }],
      extraMetrics: [{ id: 'latency', name: 'Latência', item: 'ping' }],
      trunks: [
        {
          id: 'trunk',
          name: 'Transporte',
          interfaces: [{ id: 'iface', name: 'sfp1', rxItem: 'sfp1.rx', txItem: 'sfp1.tx', metrics: [] }],
        },
      ],
      thresholds: { enabled: true, rxLow: -28 },
    },
  ],
});

test('legacy map routes render without exact POP matches and keep every monitoring setting untouched', () => {
  const current = options();
  const before = JSON.stringify(current);
  const layout = mapRouteLayout(current, networkNodes(current, 'topology'), new Set());
  expect(layout.paths.get('legacy')).toHaveLength(2);
  expect(layout.anchors.map((a) => a.side)).toEqual(['source', 'target']);
  expect(layout.anchors[0].geographicPoint).toEqual(current.routes[0].points[0]);
  expect(JSON.stringify(current)).toBe(before);
  expect(current.routes[0].source).toBeUndefined();
});

test('only unresolved ends receive provisional anchors; ambiguous POPs and deleted equipment are never guessed', () => {
  const current = options();
  current.routes[0].target = { popId: 'b' };
  current.routes[0].points[0] = { lat: 1, lng: 2 };
  current.pops.push({ ...current.pops[0], id: 'ambiguous' });
  let layout = mapRouteLayout(current, networkNodes(current, 'topology'), new Set());
  expect(layout.anchors.map((a) => a.side)).toEqual(['source']);
  expect(layout.paths.get('legacy')![1]).toEqual(
    networkNodes(current, 'topology').find((n) => n.pop.id === 'b')!.position
  );
  current.routes[0].source = { popId: 'a', equipmentId: 'deleted' };
  layout = mapRouteLayout(current, networkNodes(current, 'topology'), new Set());
  expect(layout.anchors).toHaveLength(1);
  expect(layout.anchors[0].side).toBe('source');
});

test('provisional positions and manual bends survive serialization without altering geographic paths', () => {
  const current = options();
  current.routes[0].topologyUnboundPositions = { source: { x: 111, y: 222 } };
  current.routes[0].topologyPoints = [{ x: 333, y: 444 }];
  const restored = JSON.parse(JSON.stringify(current));
  const layout = mapRouteLayout(restored, networkNodes(restored, 'topology'), new Set());
  expect(layout.paths.get('legacy')!.slice(0, 2)).toEqual([
    { x: 111, y: 222 },
    { x: 333, y: 444 },
  ]);
  expect(restored.routes[0].points).toEqual(current.routes[0].points);
});

test('binding an existing map route in topology preserves its entire geographic path, interfaces and signals', () => {
  const current = options();
  const original = JSON.stringify(current);
  const next = connectNodes(
    current,
    { popId: 'a', equipmentId: 'router' },
    { popId: 'b' },
    current.routes[0].colors,
    'legacy',
    true
  );
  for (const key of [
    'points',
    'metrics',
    'extraMetrics',
    'trunks',
    'thresholds',
    'interfaceItem',
    'onlineValue',
  ] as const) {
    expect(next.routes[0][key]).toEqual(current.routes[0][key]);
  }
  expect(next.routes).toHaveLength(1);
  const nodes = networkNodes(next, 'topology');
  expect(mapRouteLayout(next, nodes, new Set()).anchors).toHaveLength(0);
  expect(topologyPaths(next, nodes, new Set(), false).get('legacy')).toHaveLength(25);
  expect(JSON.stringify(current)).toBe(original);
});
