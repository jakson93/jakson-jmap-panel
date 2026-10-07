import { DataFrame, FieldType, GrafanaTheme2, TimeZone, getDisplayProcessor } from '@grafana/data';
import { Pop, PopEquipment, Route } from './types';

export type Status = 'online' | 'down' | 'alert' | 'unknown';
export type Reading = { raw: unknown; text: string; values: unknown[]; times: number[] };
export type Readings = Map<string, Reading>;
export const statusLabel: Record<Status, string> = {
  online: 'Online',
  down: 'Indisponível',
  alert: 'Em alerta',
  unknown: 'Sem dados',
};

export function readTelemetry(series: DataFrame[], theme: GrafanaTheme2, timeZone?: TimeZone): Readings {
  const readings: Readings = new Map();
  for (const frame of series) {
    const fields = frame.fields.filter((field) => field.type !== FieldType.time);
    const times = Array.from(frame.fields.find((field) => field.type === FieldType.time)?.values ?? []).map(Number);
    for (const field of fields) {
      const values: unknown[] = Array.from(field.values);
      let raw: unknown;
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] !== null && values[i] !== undefined && values[i] !== '') {
          raw = values[i];
          break;
        }
      }
      if (raw === undefined) {
        continue;
      }
      const display = getDisplayProcessor({ field, theme, timeZone })(raw);
      const entry = { raw, text: `${display.prefix ?? ''}${display.text}${display.suffix ?? ''}`, values, times };
      for (const label of [
        fields.length === 1 ? frame.name : undefined,
        field.name,
        field.config.displayNameFromDS,
        field.config.displayName,
      ]) {
        if (label?.trim() && !readings.has(label.trim())) {
          readings.set(label.trim(), entry);
        }
      }
    }
  }
  return readings;
}

export function numeric(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') {
    return undefined;
  }
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function itemStatus(item: string | undefined, onlineValue: string | undefined, readings: Readings): Status {
  const value = item ? readings.get(item.trim()) : undefined;
  if (!value) {
    return 'unknown';
  }
  const normalize = (v: unknown) =>
    String(v ?? '')
      .trim()
      .toLowerCase();
  return normalize(value.raw) === normalize(onlineValue ?? '1') ||
    normalize(value.text) === normalize(onlineValue ?? '1')
    ? 'online'
    : 'down';
}

export function equipmentStatus(equipment: PopEquipment, readings: Readings): Status {
  return itemStatus(equipment.statusItem, equipment.onlineValue, readings);
}

export function popStatus(pop: Pop, readings: Readings): Status {
  const statuses = (pop.equipments ?? []).filter((e) => e.statusItem?.trim()).map((e) => equipmentStatus(e, readings));
  if (statuses.includes('down')) {
    return 'down';
  }
  if (statuses.length === 0 || statuses.includes('unknown')) {
    return 'unknown';
  }
  return 'online';
}

export function routeStatus(route: Route, readings: Readings): Status {
  const base = itemStatus(route.interfaceItem, route.onlineValue, readings);
  if (base === 'down' || !route.thresholds?.enabled) {
    return base;
  }
  const threshold = route.thresholds;
  const metric = (id: string) => numeric(readings.get(route.metrics.find((m) => m.id === id)?.zabbixItem ?? '')?.raw);
  const low = (id: string, limit?: number) => limit !== undefined && metric(id) !== undefined && metric(id)! <= limit;
  const traffic = [metric('download'), metric('upload')].filter((v): v is number => v !== undefined);
  let flaps = 0;
  const status = readings.get(route.interfaceItem ?? '');
  if (status && threshold.flappingWindowMin) {
    const last = status.times[status.times.length - 1];
    const start = last - threshold.flappingWindowMin * 60000;
    for (let i = 1; i < status.values.length; i++) {
      if (
        status.times[i] >= start &&
        status.values[i] != null &&
        status.values[i - 1] != null &&
        status.values[i] !== status.values[i - 1]
      ) {
        flaps++;
      }
    }
  }
  return low('rx', threshold.rxLow) ||
    low('tx', threshold.txLow) ||
    (threshold.bandwidthHigh !== undefined && traffic.some((n) => n >= threshold.bandwidthHigh!)) ||
    (Boolean(threshold.flappingCount) && flaps >= threshold.flappingCount!)
    ? 'alert'
    : base;
}

export const statusColor = (status: Status, theme: GrafanaTheme2) =>
  ({
    online: theme.colors.success.text,
    alert: theme.colors.warning.text,
    down: theme.colors.error.text,
    unknown: theme.colors.text.secondary,
  })[status];
