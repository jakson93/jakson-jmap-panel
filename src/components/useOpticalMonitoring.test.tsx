import { renderHook, waitFor } from '@testing-library/react';
import { dateTime, FieldType, LoadingState, PanelData, TimeRange, toDataFrame } from '@grafana/data';
import { useOpticalMonitoring } from './useOpticalMonitoring';
import { PanelOptions } from '../types';

const start = Date.parse('2026-10-13T12:00:00Z');
const options: PanelOptions = {
  centerLat: 0,
  centerLng: 0,
  zoom: 5,
  mapProvider: 'osm',
  pops: [],
  routes: [
    {
      id: 'r',
      name: 'Fibra',
      points: [],
      colors: { online: '', down: '', alert: '' },
      metrics: [{ id: 'rx', label: 'RX', enabled: true, zabbixItem: 'rx' }],
      extraMetrics: [],
      trunks: [],
    },
  ],
};
const data = (times: number[], values: Array<number | null>): PanelData => ({
  state: LoadingState.Done,
  series: [
    toDataFrame({
      fields: [
        { name: 'time', type: FieldType.time, values: times },
        { name: 'rx', type: FieldType.number, values },
      ],
    }),
  ],
  timeRange: range(start, start + 600000),
});
const range = (from: number, to: number, live = true): TimeRange => ({
  from: dateTime(from),
  to: dateTime(to),
  raw: { from: live ? 'now-6h' : dateTime(from), to: live ? 'now' : dateTime(to) },
});
test('retains a confirmed live baseline as the query rolls forward, and clears it only after confirmed recovery', async () => {
  const hook = renderHook(({ frames, window, now }) => useOpticalMonitoring(frames, options, window, now), {
    initialProps: {
      frames: data([start, start + 60000, start + 120000, start + 180000], [-20, -20, -22.5, -22.5]),
      window: range(start, start + 180000),
      now: start + 180000,
    },
  });
  await waitFor(() => expect(hook.result.current.alerts).toHaveLength(1));
  hook.rerender({
    frames: data([start + 240000, start + 300000], [-22.5, -22.5]),
    window: range(start + 240000, start + 300000),
    now: start + 300000,
  });
  await waitFor(() =>
    expect(hook.result.current.alerts[0].event).toMatchObject({ baseline: -20, referenceRetained: true })
  );
  hook.rerender({
    frames: data([start + 300000, start + 360000], [-22.5, -20.5]),
    window: range(start + 300000, start + 360000),
    now: start + 360000,
  });
  await waitFor(() => expect(hook.result.current.alerts[0].event?.recovering).toBe(true));
  hook.rerender({
    frames: data([start + 360000, start + 420000], [-20.5, -20.5]),
    window: range(start + 360000, start + 420000),
    now: start + 420000,
  });
  await waitFor(() => expect(hook.result.current.alerts).toHaveLength(0));
});
test('missing/stale history, disabled detection and maintenance never report a healthy confirmed analysis', () => {
  const frames = data([start, start + 60000, start + 120000, start + 180000], [-20, -20, -22.5, -22.5]);
  const inactive = renderHook(() =>
    useOpticalMonitoring(
      frames,
      { ...options, attenuationEnabled: false },
      range(start, start + 180000),
      start + 180000
    )
  );
  expect(inactive.result.current.alerts).toHaveLength(0);
  const stale = renderHook(() => useOpticalMonitoring(frames, options, range(start, start + 600000), start + 600000));
  expect(stale.result.current.alerts).toHaveLength(0);
  expect(stale.result.current.unavailable[0].state).toBe('stale');
  const maintenance = renderHook(() =>
    useOpticalMonitoring(
      frames,
      { ...options, routes: [{ ...options.routes[0], maintenance: true }] },
      range(start, start + 180000),
      start + 180000
    )
  );
  expect(maintenance.result.current.alerts).toHaveLength(0);
});
test('historical queries and changed thresholds cannot reuse a live reference from another analysis', async () => {
  const frames = data([start, start + 60000, start + 120000, start + 180000], [-20, -20, -22.5, -22.5]);
  const hook = renderHook(
    ({ opts, window, source }) => useOpticalMonitoring(source, opts, window, window.to.valueOf()),
    { initialProps: { opts: options, window: range(start, start + 180000), source: frames } }
  );
  await waitFor(() => expect(hook.result.current.alerts).toHaveLength(1));
  hook.rerender({
    opts: { ...options, attenuationDropDb: 5 },
    window: range(start + 240000, start + 300000),
    source: data([start + 240000, start + 300000], [-22.5, -22.5]),
  });
  expect(hook.result.current.alerts).toHaveLength(0);
  hook.rerender({
    opts: options,
    window: range(start + 240000, start + 300000, false),
    source: data([start + 240000, start + 300000], [-22.5, -22.5]),
  });
  expect(hook.result.current.alerts).toHaveLength(0);
});

test('a correction to the current sample invalidates the retained confirmation and is recalculated', async () => {
  const times = [start, start + 60000, start + 120000, start + 180000];
  const hook = renderHook(
    ({ frames }) => useOpticalMonitoring(frames, options, range(start, start + 180000), start + 180000),
    { initialProps: { frames: data(times, [-20, -20, -22.5, -22.5]) } }
  );
  await waitFor(() => expect(hook.result.current.alerts).toHaveLength(1));
  hook.rerender({ frames: data(times, [-20, -20, -22.5, -20]) });
  await waitFor(() => expect(hook.result.current.alerts).toHaveLength(0));
});
