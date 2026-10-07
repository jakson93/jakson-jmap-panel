import { NetworkNode, endpointKey, routeEndpoint, validPoint } from './networkModel';
import { CanvasPoint, PanelOptions, Route } from './types';

/** Presentation only: folding a site never rewrites the actual route endpoints. */
export function topologyNodes(nodes: NetworkNode[], expanded: ReadonlySet<string>) {
  return nodes.filter((node) => !node.equipment || expanded.has(node.pop.id));
}

export function topologyPaths(
  options: PanelOptions,
  nodes: NetworkNode[],
  expanded: ReadonlySet<string>,
  editing: boolean
) {
  const index = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, Route[]>();
  const endpoints = new Map<string, [NetworkNode, NetworkNode]>();
  for (const route of options.routes ?? []) {
    const source = routeEndpoint(route, 'source', options.pops ?? []);
    const target = routeEndpoint(route, 'target', options.pops ?? []);
    if (!source || !target) {
      continue;
    }
    // Validate real endpoints before projecting equipment onto a folded POP.
    if (!index.has(endpointKey(source)) || !index.has(endpointKey(target))) {
      continue;
    }
    const from = index.get(endpointKey(expanded.has(source.popId) ? source : { popId: source.popId }));
    const to = index.get(endpointKey(expanded.has(target.popId) ? target : { popId: target.popId }));
    if (!from || !to || from.id === to.id) {
      continue;
    }
    endpoints.set(route.id, [from, to]);
    const key = JSON.stringify([from.id, to.id].sort());
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }
  const paths = new Map<string, CanvasPoint[]>();
  for (const routes of groups.values()) {
    routes.forEach((route, i) => {
      const [from, to] = endpoints.get(route.id)!;
      const bends = (route.topologyPoints ?? []).filter(validPoint);
      const path = [from.position, ...bends, to.position];
      // Manual points are never smoothed or replaced by a cosmetic path.
      if (editing || bends.length || options.topologyRouteStyle === 'direct') {
        paths.set(route.id, path);
        return;
      }
      const a = from.position;
      const b = to.position;
      // Canonical orientation keeps opposite directions in separate lanes.
      const direction = from.id < to.id ? 1 : -1;
      const lane = (i - (routes.length - 1) / 2) * 36 * direction;
      if (options.topologyRouteStyle === 'orthogonal') {
        const mid = (a.x + b.x) / 2 + lane;
        paths.set(route.id, [a, { x: mid, y: a.y }, { x: mid, y: b.y }, b]);
        return;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const bend = length * 0.12 * direction + lane;
      const control = { x: (a.x + b.x) / 2 - (dy / length) * bend, y: (a.y + b.y) / 2 + (dx / length) * bend };
      paths.set(
        route.id,
        Array.from({ length: 25 }, (_, step) => {
          const t = step / 24;
          return {
            x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * control.x + t ** 2 * b.x,
            y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * control.y + t ** 2 * b.y,
          };
        })
      );
    });
  }
  return paths;
}

export type LabelCandidate = { id: string; x: number; y: number; width: number; height: number; priority: number };
export function nonOverlappingLabels(
  labels: LabelCandidate[],
  width: number,
  height: number,
  gap: number
): Set<string> {
  const accepted: LabelCandidate[] = [];
  for (const label of [...labels].sort((a, b) => b.priority - a.priority)) {
    if (label.x < 0 || label.y < 0 || label.x + label.width > width || label.y + label.height > height) {
      continue;
    }
    if (
      !accepted.some(
        (other) =>
          label.x < other.x + other.width + gap &&
          label.x + label.width + gap > other.x &&
          label.y < other.y + other.height + gap &&
          label.y + label.height + gap > other.y
      )
    ) {
      accepted.push(label);
    }
  }
  return new Set(accepted.map((label) => label.id));
}
