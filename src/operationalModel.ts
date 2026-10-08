import { NetworkEndpoint, NetworkFilter, PanelOptions, Route } from './types';
import { endpointKey, routeEndpoint } from './networkModel';
import { numeric, Reading, Readings, routeStatus } from './networkTelemetry';

export const emptyFilter = (): NetworkFilter => ({
  query: '',
  status: 'all',
  popIds: [],
  kind: 'all',
  includeDependencies: false,
});
export const routeKinds = { transport: 'Transporte', access: 'Acesso', backbone: 'Backbone', lan: 'LAN' };

export function freshReadings(readings: Readings, referenceTime: number, staleAfterSeconds: number): Readings {
  const entries = new Map<Reading, Reading>();
  return new Map(
    [...readings].map(([key, reading]) => {
      if (!entries.has(reading)) {
        entries.set(reading, {
          ...reading,
          stale:
            reading.sampleTime !== undefined &&
            (referenceTime - reading.sampleTime > staleAfterSeconds * 1000 ||
              reading.sampleTime > referenceTime + 60000),
        });
      }
      return [key, entries.get(reading)!];
    })
  );
}

export function routeFreshness(route: Route, readings: Readings) {
  const reading = readings.get(route.interfaceItem?.trim() ?? '');
  return {
    state: !reading ? 'missing' : reading.sampleTime === undefined ? 'undated' : reading.stale ? 'stale' : 'fresh',
    time: reading?.sampleTime,
  };
}

export function endpointLabel(endpoint: NetworkEndpoint | undefined, options: PanelOptions) {
  const pop = options.pops.find((p) => p.id === endpoint?.popId);
  const equipment = pop?.equipments.find((e) => e.id === endpoint?.equipmentId);
  const port = equipment?.ports?.find((p) => p.id === endpoint?.portId);
  return pop
    ? `${pop.name}${equipment ? ` / ${equipment.name}` : ''}${port ? ` / ${port.name}` : ''}`
    : 'Não vinculada';
}

export function dependentRoutes(options: PanelOptions, routeId: string) {
  const affected = new Set<string>();
  const pending = [routeId];
  const reverse = new Map<string, string[]>();
  for (const route of options.routes) {
    for (const dependency of route.dependsOnRouteIds ?? []) {
      reverse.set(dependency, [...(reverse.get(dependency) ?? []), route.id]);
    }
  }
  while (pending.length) {
    for (const id of reverse.get(pending.pop()!) ?? []) {
      if (id !== routeId && !affected.has(id)) {
        affected.add(id);
        pending.push(id);
      }
    }
  }
  return options.routes.filter((r) => affected.has(r.id));
}

export function dependencyError(options: PanelOptions, routeId: string, dependencies: string[]) {
  if (dependencies.includes(routeId)) {
    return 'Uma rota não pode depender dela mesma.';
  }
  const downstream = new Set(dependentRoutes(options, routeId).map((r) => r.id));
  if (dependencies.some((id) => downstream.has(id))) {
    return 'A dependência criaria um ciclo na rede.';
  }
  if (dependencies.some((id) => !options.routes.some((r) => r.id === id))) {
    return 'Rota dependente não encontrada.';
  }
  return '';
}

export function connectionError(options: PanelOptions, endpoint: NetworkEndpoint, routeId?: string) {
  if (!endpoint.portId) {
    return '';
  }
  const equipment = options.pops
    .find((p) => p.id === endpoint.popId)
    ?.equipments.find((e) => e.id === endpoint.equipmentId);
  if (!equipment?.ports?.some((p) => p.id === endpoint.portId)) {
    return 'Porta não encontrada no equipamento.';
  }
  const occupied = options.routes.some(
    (r) =>
      r.id !== routeId &&
      [r.source, r.target].some(
        (side) => side && side.portId === endpoint.portId && endpointKey(side) === endpointKey(endpoint)
      )
  );
  return occupied ? 'Esta porta já está vinculada a outra rota.' : '';
}

export function filterNetwork(options: PanelOptions, filter: NetworkFilter, readings: Readings): PanelOptions {
  const query = filter.query.trim().toLocaleLowerCase();
  const routes = options.routes.filter((route) => {
    const source = routeEndpoint(route, 'source', options.pops);
    const target = routeEndpoint(route, 'target', options.pops);
    const kind = route.kind ?? (source?.popId === target?.popId && source ? 'lan' : 'transport');
    const text =
      `${route.name} ${source ? endpointLabel(source, options) : ''} ${target ? endpointLabel(target, options) : ''} ${options.pops
        .filter((p) => [source?.popId, target?.popId].includes(p.id))
        .map((p) => p.region ?? '')
        .join(' ')}`.toLocaleLowerCase();
    return (
      (!query || text.includes(query)) &&
      (!filter.popIds.length || [source?.popId, target?.popId].some((id) => id && filter.popIds.includes(id))) &&
      (filter.kind === 'all' || filter.kind === kind) &&
      (filter.status === 'all' ||
        (filter.status === 'stale'
          ? routeFreshness(route, readings).state === 'stale'
          : routeStatus(route, readings) === filter.status))
    );
  });
  const selected = new Set(routes.map((r) => r.id));
  if (filter.includeDependencies) {
    const pending = [...routes];
    while (pending.length) {
      for (const id of pending.pop()!.dependsOnRouteIds ?? []) {
        const route = options.routes.find((r) => r.id === id);
        if (route && !selected.has(id)) {
          selected.add(id);
          pending.push(route);
        }
      }
    }
  }
  const filteredRoutes = options.routes.filter((r) => selected.has(r.id));
  const linkedPops = new Set(
    filteredRoutes.flatMap((r) => [
      routeEndpoint(r, 'source', options.pops)?.popId,
      routeEndpoint(r, 'target', options.pops)?.popId,
    ])
  );
  const unfiltered = !query && !filter.popIds.length && filter.status === 'all' && filter.kind === 'all';
  return {
    ...options,
    routes: filteredRoutes,
    pops: options.pops.filter(
      (pop) =>
        unfiltered ||
        linkedPops.has(pop.id) ||
        (filter.status === 'all' &&
          filter.kind === 'all' &&
          (!filter.popIds.length || filter.popIds.includes(pop.id)) &&
          (!query ||
            `${pop.name} ${pop.region ?? ''} ${pop.equipments.map((e) => `${e.name} ${e.ip ?? ''}`).join(' ')}`
              .toLocaleLowerCase()
              .includes(query)))
    ),
  };
}

export type Incident = { start: number; end?: number; boundedStart: boolean; observed: boolean };
/** Time-weighted observed history. Gaps and missing samples never count as uptime. */
export function routeHistory(route: Route, readings: Readings, start: number, end: number, maxGapMs: number) {
  const reading = readings.get(route.interfaceItem?.trim() ?? '');
  const samples = (reading?.times ?? [])
    .map((time, index) => ({ time, value: reading?.values[index] }))
    .filter((s) => Number.isFinite(s.time) && s.time <= end)
    .sort((a, b) => a.time - b.time)
    .filter((sample, index, all) => index === all.length - 1 || sample.time !== all[index + 1].time);
  const incidents: Incident[] = [];
  let onlineMs = 0,
    downMs = 0;
  let open: Incident | undefined;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const next = samples[i + 1];
    const defined = sample.value !== null && sample.value !== undefined && String(sample.value).trim() !== '';
    const onlineValue = (route.onlineValue ?? '1').trim().toLowerCase();
    const online =
      defined &&
      (String(sample.value).trim().toLowerCase() === onlineValue ||
        reading?.format?.(sample.value).trim().toLowerCase() === onlineValue);
    const gap = i > 0 && sample.time - samples[i - 1].time > maxGapMs;
    if (gap && open) {
      open.observed = false;
      open = undefined;
    }
    if (!defined && open) {
      open.observed = false;
      open = undefined;
    }
    if (defined && !online && !open && (next?.time ?? end) >= start) {
      open = {
        start: Math.max(start, sample.time),
        boundedStart:
          i === 0 ||
          gap ||
          sample.time < start ||
          samples[i - 1].value == null ||
          String(samples[i - 1].value).trim() === '',
        observed: true,
      };
      incidents.push(open);
    }
    if (online && open) {
      open.end = sample.time;
      open = undefined;
    }
    const duration = Math.max(
      0,
      Math.min(next?.time ?? end, sample.time + maxGapMs, end) - Math.max(sample.time, start)
    );
    if (defined) {
      if (online) {
        onlineMs += duration;
      } else {
        downMs += duration;
      }
    }
  }
  if (open && end - samples[samples.length - 1].time > maxGapMs) {
    open.observed = false;
  }
  const knownMs = onlineMs + downMs;
  const complete = incidents.filter((i) => i.end !== undefined && !i.boundedStart && i.observed);
  return {
    incidents,
    onlineMs,
    downMs,
    coverage: end > start ? knownMs / (end - start) : 0,
    availability: knownMs ? onlineMs / knownMs : undefined,
    meanRepairMs: complete.length
      ? complete.reduce((sum, i) => sum + i.end! - i.start, 0) / complete.length
      : undefined,
  };
}

export function ageLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}min`
      : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
}

export function latestNumeric(item: string | undefined, readings: Readings) {
  const reading = readings.get(item ?? '');
  return reading?.stale ? undefined : numeric(reading?.raw);
}
