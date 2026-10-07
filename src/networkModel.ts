import { CanvasPoint, NetworkEndpoint, NetworkView, PanelOptions, Pop, PopEquipment, Route, RoutePoint } from './types';

export type NetworkNode = {
  id: string;
  endpoint: NetworkEndpoint;
  name: string;
  pop: Pop;
  equipment?: PopEquipment;
  position: CanvasPoint;
};

export const endpointKey = (endpoint: NetworkEndpoint) =>
  JSON.stringify([endpoint.popId, endpoint.equipmentId ?? null]);
export const sameEndpoint = (a: NetworkEndpoint, b: NetworkEndpoint) => endpointKey(a) === endpointKey(b);
export const validPoint = (point?: CanvasPoint): point is CanvasPoint =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

export function networkNodes(options: PanelOptions, view: NetworkView): NetworkNode[] {
  return (options.pops ?? [])
    .flatMap((pop, index) => {
      const group = pop.topologyPosition ?? { x: 180 + (index % 3) * 380, y: 150 + Math.floor(index / 3) * 380 };
      const popNode: NetworkNode = {
        id: endpointKey({ popId: pop.id }),
        endpoint: { popId: pop.id },
        name: pop.name,
        pop,
        position: view === 'map' ? { x: pop.lng, y: pop.lat } : group,
      };
      if (view === 'map') {
        return [popNode];
      }
      // A POP anchor keeps older POP-to-POP routes visible even when equipment exists.
      return [
        popNode,
        ...(pop.equipments ?? []).map((equipment, i) => {
          const endpoint = { popId: pop.id, equipmentId: equipment.id };
          return {
            id: endpointKey(endpoint),
            endpoint,
            name: equipment.name,
            pop,
            equipment,
            position: validPoint(equipment.topologyPosition)
              ? equipment.topologyPosition
              : { x: group.x + (i % 2) * 180 - 80, y: group.y + 125 + Math.floor(i / 2) * 125 },
          };
        }),
      ];
    })
    .filter((node) => validPoint(node.position));
}

// Only exact legacy endpoints are inferred. Nearby POPs are not silently connected.
export function routeEndpoint(route: Route, side: 'source' | 'target', pops: Pop[]): NetworkEndpoint | undefined {
  if (route[side]) {
    return route[side];
  }
  const point = side === 'source' ? route.points[0] : route.points[route.points.length - 1];
  if (!point) {
    return undefined;
  }
  const matches = pops.filter((p) => Math.abs(p.lat - point.lat) < 0.000001 && Math.abs(p.lng - point.lng) < 0.000001);
  return matches.length === 1 ? { popId: matches[0].id } : undefined;
}

export function routePath(route: Route, options: PanelOptions, view: NetworkView, nodes: NetworkNode[]): CanvasPoint[] {
  if (view === 'map') {
    return route.points.map((point) => ({ x: point.lng, y: point.lat }));
  }
  const source = routeEndpoint(route, 'source', options.pops ?? []);
  const target = routeEndpoint(route, 'target', options.pops ?? []);
  const start = source && nodes.find((node) => sameEndpoint(node.endpoint, source));
  const end = target && nodes.find((node) => sameEndpoint(node.endpoint, target));
  return start && end ? [start.position, ...(route.topologyPoints ?? []).filter(validPoint), end.position] : [];
}

export function moveNode(
  options: PanelOptions,
  endpoint: NetworkEndpoint,
  point: CanvasPoint,
  view: NetworkView
): PanelOptions {
  if (!validPoint(point)) {
    return options;
  }
  const pops = (options.pops ?? []).map((pop) => {
    if (pop.id !== endpoint.popId) {
      return pop;
    }
    if (view === 'map') {
      return { ...pop, lat: point.y, lng: point.x };
    }
    if (!endpoint.equipmentId) {
      return { ...pop, topologyPosition: point };
    }
    return {
      ...pop,
      equipments: pop.equipments.map((equipment) =>
        equipment.id === endpoint.equipmentId ? { ...equipment, topologyPosition: point } : equipment
      ),
    };
  });
  const routes =
    view === 'topology'
      ? options.routes
      : (options.routes ?? []).map((route) => {
          const source = routeEndpoint(route, 'source', options.pops ?? []);
          const target = routeEndpoint(route, 'target', options.pops ?? []);
          const points = route.points.map((p, i) =>
            (i === 0 && source?.popId === endpoint.popId) ||
            (i === route.points.length - 1 && target?.popId === endpoint.popId)
              ? { lat: point.y, lng: point.x }
              : p
          );
          return { ...route, points, ...(source ? { source } : {}), ...(target ? { target } : {}) };
        });
  return { ...options, pops, routes };
}

export function connectNodes(
  options: PanelOptions,
  source: NetworkEndpoint,
  target: NetworkEndpoint,
  colors: Route['colors'],
  existingRouteId?: string
): PanelOptions {
  if (sameEndpoint(source, target)) {
    return options;
  }
  const from = options.pops.find((pop) => pop.id === source.popId);
  const to = options.pops.find((pop) => pop.id === target.popId);
  if (
    !from ||
    !to ||
    (source.equipmentId && !from.equipments.some((e) => e.id === source.equipmentId)) ||
    (target.equipmentId && !to.equipments.some((e) => e.id === target.equipmentId))
  ) {
    return options;
  }
  const name = (pop: Pop, endpoint: NetworkEndpoint) =>
    pop.equipments.find((e) => e.id === endpoint.equipmentId)?.name ?? pop.name;
  const points: RoutePoint[] = [
    { lat: from.lat, lng: from.lng },
    { lat: to.lat, lng: to.lng },
  ];
  if (existingRouteId) {
    return {
      ...options,
      routes: options.routes.map((route) =>
        route.id === existingRouteId
          ? {
              ...route,
              source,
              target,
              topologyPoints: [],
              points: route.points.length > 1 ? [points[0], ...route.points.slice(1, -1), points[1]] : points,
            }
          : route
      ),
    };
  }
  return {
    ...options,
    routes: [
      ...options.routes,
      {
        id: `route-${Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('-')}`,
        name: `${name(from, source)} → ${name(to, target)}`,
        source,
        target,
        points,
        topologyPoints: [],
        metrics: [
          { id: 'download', label: 'Download (Mbps)', enabled: false },
          { id: 'upload', label: 'Upload (Mbps)', enabled: false },
        ],
        extraMetrics: [],
        trunks: [],
        colors,
        onlineValue: '1',
      },
    ],
  };
}

export function updateRoutePath(
  options: PanelOptions,
  routeId: string,
  points: CanvasPoint[],
  view: NetworkView
): PanelOptions {
  if (points.length < 2 || !points.every(validPoint)) {
    return options;
  }
  return {
    ...options,
    routes: options.routes.map((route) =>
      route.id !== routeId
        ? route
        : view === 'topology'
          ? { ...route, topologyPoints: points.slice(1, -1) }
          : { ...route, points: points.map((p) => ({ lat: p.y, lng: p.x })) }
    ),
  };
}

export function insertBend(path: CanvasPoint[], point: CanvasPoint): CanvasPoint[] {
  let best = Infinity;
  let index = 1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const distance = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
    if (distance < best) {
      best = distance;
      index = i;
    }
  }
  return [...path.slice(0, index), point, ...path.slice(index)];
}
