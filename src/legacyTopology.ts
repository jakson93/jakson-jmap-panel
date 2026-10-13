import { NetworkNode, endpointKey, routeEndpoint, validPoint } from './networkModel';
import { CanvasPoint, PanelOptions, RoutePoint } from './types';

export type MapRouteAnchor = {
  id: string;
  routeId: string;
  side: 'source' | 'target';
  name: string;
  position: CanvasPoint;
  geographicPoint?: RoutePoint;
};
export type MapRouteLayout = { paths: Map<string, CanvasPoint[]>; anchors: MapRouteAnchor[] };

/** Missing associations are drawn explicitly, without guessing equipment from proximity or metric names. */
export function mapRouteLayout(
  options: PanelOptions,
  nodes: NetworkNode[],
  expanded: ReadonlySet<string>
): MapRouteLayout {
  const index = new Map(nodes.map((node) => [node.id, node]));
  const paths = new Map<string, CanvasPoint[]>();
  const anchors: MapRouteAnchor[] = [];
  const firstRow = Math.max(0, ...nodes.map((node) => node.position.y)) + 300;
  let row = 0;
  for (const route of options.routes ?? []) {
    const endpoints = (['source', 'target'] as const).map((side) => {
      const endpoint = routeEndpoint(route, side, options.pops ?? []);
      const actual = endpoint && index.get(endpointKey(endpoint));
      return actual && endpoint
        ? index.get(endpointKey(expanded.has(endpoint.popId) ? endpoint : { popId: endpoint.popId }))
        : undefined;
    });
    if (endpoints.every(Boolean)) {
      continue;
    }
    const positions = (['source', 'target'] as const).map((side, i) => {
      if (endpoints[i]) {
        return endpoints[i]!.position;
      }
      const saved = route.topologyUnboundPositions?.[side];
      const position = validPoint(saved) ? saved : { x: 240 + i * 620, y: firstRow + row * 240 };
      anchors.push({
        id: JSON.stringify(['map-route', route.id, side]),
        routeId: route.id,
        side,
        name: `${side === 'source' ? 'Origem' : 'Destino'} · ${route.name}`,
        position,
        geographicPoint: side === 'source' ? route.points?.[0] : route.points?.[route.points.length - 1],
      });
      return position;
    });
    paths.set(route.id, [positions[0], ...(route.topologyPoints ?? []).filter(validPoint), positions[1]]);
    row++;
  }
  return { paths, anchors };
}
