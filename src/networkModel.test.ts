import {
  connectNodes,
  endpointKey,
  insertBend,
  moveNode,
  networkNodes,
  organizeTopology,
  routeEndpoint,
  routePath,
  updateRoutePath,
} from './networkModel';
import { PanelOptions, Route } from './types';

const colors = { online: 'green', alert: 'orange', down: 'red' };
const route: Route = {
  id: 'r1',
  name: 'Backbone',
  colors,
  points: [
    { lat: -23, lng: -46 },
    { lat: -23.1, lng: -46.1 },
    { lat: -24, lng: -47 },
  ],
  metrics: [],
  extraMetrics: [],
  trunks: [],
  interfaceItem: 'link',
  topologyPoints: [{ x: 400, y: 200 }],
};
const options = (): PanelOptions => ({
  centerLat: -23,
  centerLng: -46,
  zoom: 10,
  mapProvider: 'osm',
  routes: [JSON.parse(JSON.stringify(route))],
  pops: [
    { id: 'p1', name: 'Centro', lat: -23, lng: -46, equipments: [{ id: 'e1', name: 'Core', metrics: [] }] },
    { id: 'p2', name: 'Norte', lat: -24, lng: -47, equipments: [] },
  ],
});

test('moving equipment in topology never changes geographic coordinates or geographic route points', () => {
  const original = options();
  const next = moveNode(original, { popId: 'p1', equipmentId: 'e1' }, { x: 350, y: 400 }, 'topology');
  expect(next.pops[0].equipments[0].topologyPosition).toEqual({ x: 350, y: 400 });
  expect(next.pops[0].lat).toBe(original.pops[0].lat);
  expect(next.routes).toEqual(original.routes);
  expect(original.pops[0].equipments[0].topologyPosition).toBeUndefined();
});
test('moving a POP follows legacy endpoints, preserves intermediate bends and binds endpoints before moving', () => {
  const original = options();
  const next = moveNode(original, { popId: 'p1' }, { x: -45, y: -22 }, 'map');
  expect(next.routes[0].points).toEqual([{ lat: -22, lng: -45 }, route.points[1], route.points[2]]);
  expect(next.routes[0].source).toEqual({ popId: 'p1' });
  expect(next.routes[0].topologyPoints).toEqual(route.topologyPoints);
  expect(original.routes[0]).toEqual(route);
});
test('does not guess ambiguous or distant geographic endpoints', () => {
  const current = options();
  current.pops.push({ ...current.pops[0], id: 'duplicate' });
  expect(routeEndpoint(route, 'source', current.pops)).toBeUndefined();
  expect(routeEndpoint({ ...route, points: [{ lat: 0, lng: 0 }] }, 'source', current.pops)).toBeUndefined();
});
test('rebinding an existing route retains monitoring metrics and geographic bends', () => {
  const current = options();
  const next = connectNodes(current, { popId: 'p1', equipmentId: 'e1' }, { popId: 'p2' }, colors, 'r1');
  expect(next.routes).toHaveLength(1);
  expect(next.routes[0].interfaceItem).toBe('link');
  expect(next.routes[0].points[1]).toEqual(route.points[1]);
  expect(next.routes[0].source?.equipmentId).toBe('e1');
  const nodes = networkNodes(next, 'topology');
  const path = routePath(next.routes[0], next, 'topology', nodes);
  expect(path[0]).toEqual(nodes.find((n) => n.id === endpointKey({ popId: 'p1', equipmentId: 'e1' }))?.position);
});
test('rejects self-connections and deleted endpoints', () => {
  const current = options();
  expect(connectNodes(current, { popId: 'p1' }, { popId: 'p1' }, colors)).toBe(current);
  expect(connectNodes(current, { popId: 'p1', equipmentId: 'missing' }, { popId: 'p2' }, colors)).toBe(current);
});
test('editing topology bends does not overwrite map routes; serialized layout survives reload', () => {
  const current = options();
  const next = updateRoutePath(
    current,
    'r1',
    [
      { x: 0, y: 0 },
      { x: 12, y: 40 },
      { x: 100, y: 0 },
    ],
    'topology'
  );
  expect(next.routes[0].points).toEqual(route.points);
  const restored = JSON.parse(JSON.stringify(next));
  expect(restored.routes[0].topologyPoints).toEqual([{ x: 12, y: 40 }]);
  expect(
    updateRoutePath(
      current,
      'r1',
      [
        { x: NaN, y: 0 },
        { x: 1, y: 1 },
      ],
      'map'
    )
  ).toBe(current);
});
test('inserts a new bend on the closest segment, including zero-length segments', () => {
  expect(
    insertBend(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      { x: 110, y: 50 }
    )
  ).toEqual([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 110, y: 50 },
    { x: 100, y: 100 },
  ]);
  expect(
    insertBend(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      { x: 1, y: 0 }
    )
  ).toHaveLength(3);
});

test('moving a POP in topology carries manually placed equipment while preserving monitoring and geographic routes', () => {
  const current = options();
  current.pops[0].topologyPosition = { x: 200, y: 100 };
  current.pops[0].equipments[0].topologyPosition = { x: 150, y: 250 };
  const next = moveNode(current, { popId: 'p1' }, { x: 400, y: 300 }, 'topology');
  expect(next.pops[0].equipments[0].topologyPosition).toEqual({ x: 350, y: 450 });
  expect(next.pops[0].lat).toBe(current.pops[0].lat);
  expect(next.routes).toEqual(current.routes);
  expect(current.pops[0].equipments[0].topologyPosition).toEqual({ x: 150, y: 250 });
});

test('organizing a crowded topology preserves geographic coordinates, route bends and all monitoring options', () => {
  const current = options();
  const next = organizeTopology(current, 240, 160);
  expect(next.routes).toEqual(current.routes);
  expect(next.pops[0].lat).toBe(current.pops[0].lat);
  expect(next.pops[0].equipments[0].name).toBe(current.pops[0].equipments[0].name);
  expect(next.pops[0].equipments[0].topologyPosition).toEqual({ x: 120, y: 320 });
  expect(next.pops[1].topologyPosition?.x).toBe(840);
  expect(current.pops[0].equipments[0].topologyPosition).toBeUndefined();
});
