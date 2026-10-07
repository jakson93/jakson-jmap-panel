import { createTheme, FieldType, toDataFrame } from '@grafana/data';
import { itemStatus, numeric, popStatus, readTelemetry, Readings, routeStatus } from './networkTelemetry';
import { Route } from './types';

const readings: Readings = new Map([
  ['status', { raw: 1, text: 'Online', values: [1, 0, 1], times: [1000, 2000, 3000] }],
  ['rx', { raw: -30, text: '-30 dBm', values: [-30], times: [3000] }],
]);
test('missing, empty and nonnumeric readings never become healthy values', () => {
  expect(itemStatus(undefined, '1', readings)).toBe('unknown');
  expect(itemStatus('missing', '1', readings)).toBe('unknown');
  expect(numeric('')).toBeUndefined();
  expect(numeric(null)).toBeUndefined();
  expect(numeric('x')).toBeUndefined();
  expect(popStatus({ id: 'a', name: 'A', lat: 0, lng: 0, equipments: [] }, readings)).toBe('unknown');
});
test('threshold and flapping alerts preserve down priority', () => {
  const route: Route = {
    id: 'r',
    name: 'R',
    interfaceItem: 'status',
    onlineValue: '1',
    colors: { online: '', down: '', alert: '' },
    metrics: [{ id: 'rx', label: 'RX', enabled: true, zabbixItem: 'rx' }],
    extraMetrics: [],
    trunks: [],
    points: [],
    thresholds: { enabled: true, rxLow: -25 },
  };
  expect(routeStatus(route, readings)).toBe('alert');
  expect(routeStatus({ ...route, onlineValue: '0' }, readings)).toBe('down');
  expect(
    routeStatus({ ...route, thresholds: { enabled: true, flappingWindowMin: 1, flappingCount: 2 } }, readings)
  ).toBe('alert');
});
test('Grafana array fields, multiple value fields and display units are resolved correctly', () => {
  const frame = toDataFrame({
    name: 'ambiguous',
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      { name: 'cpu', type: FieldType.number, values: [10, 32], config: { unit: 'percent' } },
      { name: 'status', type: FieldType.number, values: [0, 1] },
    ],
  });
  const result = readTelemetry([frame], createTheme());
  expect(result.get('cpu')?.raw).toBe(32);
  expect(result.get('cpu')?.text).toContain('%');
  expect(result.has('ambiguous')).toBe(false);
  expect(itemStatus('status', '1', result)).toBe('online');
});
