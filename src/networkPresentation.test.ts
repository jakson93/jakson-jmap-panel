import { networkNodes } from './networkModel';
import { nonOverlappingLabels, topologyNodes, topologyPaths } from './networkPresentation';
import { PanelOptions, Route } from './types';

const route: Route = {
  id: 'wan',
  name: 'WAN',
  colors: { online: 'green', down: 'red', alert: 'orange' },
  interfaceItem: 'wan.status',
  metrics: [{ id: 'rx', label: 'RX', enabled: true, zabbixItem: 'wan.rx' }],
  extraMetrics: [],
  trunks: [],
  points: [
    { lat: 1, lng: 2 },
    { lat: 3, lng: 4 },
  ],
  source: { popId: 'a', equipmentId: 'router' },
  target: { popId: 'b', equipmentId: 'router' },
};
const options = (): PanelOptions => ({
  centerLat: 1,
  centerLng: 2,
  zoom: 10,
  mapProvider: 'osm',
  routes: [JSON.parse(JSON.stringify(route))],
  pops: [
    {
      id: 'a',
      name: 'A',
      lat: 1,
      lng: 2,
      equipments: [{ id: 'router', name: 'A router', metrics: [] }],
      topologyPosition: { x: 100, y: 100 },
    },
    {
      id: 'b',
      name: 'B',
      lat: 3,
      lng: 4,
      equipments: [{ id: 'router', name: 'B router', metrics: [] }],
      topologyPosition: { x: 900, y: 100 },
    },
  ],
});

test('folding projects WAN onto POPs and preserves all actual endpoints and metrics', () => {
  const current = options();
  const snapshot = JSON.stringify(current);
  const nodes = networkNodes(current, 'topology');
  expect(topologyNodes(nodes, new Set())).toHaveLength(2);
  const path = topologyPaths(current, nodes, new Set(), false).get('wan')!;
  expect(path[0]).toEqual(current.pops[0].topologyPosition);
  expect(path[path.length - 1]).toEqual(current.pops[1].topologyPosition);
  const expanded = topologyPaths(current, nodes, new Set(['a', 'b']), false).get('wan')!;
  expect(expanded[0]).toEqual(nodes.find((n) => n.pop.id === 'a' && n.equipment)?.position);
  expect(JSON.stringify(current)).toBe(snapshot);
});

test('an internal route reappears on expansion; deleted equipment is never projected as a valid POP link', () => {
  const current = options();
  current.pops[0].equipments.push({ id: 'switch', name: 'Switch', metrics: [] });
  current.routes.push({ ...route, id: 'lan', target: { popId: 'a', equipmentId: 'switch' } });
  const nodes = networkNodes(current, 'topology');
  expect(topologyPaths(current, nodes, new Set(), false).has('lan')).toBe(false);
  expect(topologyPaths(current, nodes, new Set(['a']), false).has('lan')).toBe(true);
  current.routes[0].source = { popId: 'a', equipmentId: 'deleted' };
  expect(topologyPaths(current, nodes, new Set(), false).has('wan')).toBe(false);
});

test('manual bends and editing paths remain exact; automatic routing options do not alter saved paths', () => {
  const current = options();
  current.routes[0].topologyPoints = [{ x: 460, y: 310 }];
  const nodes = networkNodes(current, 'topology');
  for (const style of ['curve', 'orthogonal', 'direct'] as const) {
    const path = topologyPaths({ ...current, topologyRouteStyle: style }, nodes, new Set(), false).get('wan')!;
    expect(path).toEqual([current.pops[0].topologyPosition, { x: 460, y: 310 }, current.pops[1].topologyPosition]);
  }
  current.routes[0].topologyPoints = [];
  expect(topologyPaths(current, nodes, new Set(), true).get('wan')).toHaveLength(2);
  expect(
    topologyPaths({ ...current, topologyRouteStyle: 'orthogonal' }, nodes, new Set(), false).get('wan')
  ).toHaveLength(4);
});

test('parallel WAN routes in opposite directions receive distinct lanes', () => {
  const current = options();
  current.routes.push({ ...route, id: 'reverse', source: route.target, target: route.source });
  const paths = topologyPaths(current, networkNodes(current, 'topology'), new Set(), false);
  expect(paths.get('wan')![12]).not.toEqual(paths.get('reverse')![12]);
});

test('smart labels prioritize failures, keep offscreen names out and avoid collisions in a dense map', () => {
  const labels = [
    { id: 'healthy', x: 20, y: 30, width: 100, height: 30, priority: 0 },
    { id: 'failed', x: 30, y: 40, width: 100, height: 30, priority: 2 },
    { id: 'far', x: 220, y: 50, width: 100, height: 30, priority: 0 },
    { id: 'outside', x: 490, y: 0, width: 100, height: 30, priority: 0 },
  ];
  expect([...nonOverlappingLabels(labels, 500, 300, 8)]).toEqual(['failed', 'far']);
});
