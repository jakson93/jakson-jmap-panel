import { renderHook, waitFor } from '@testing-library/react';
import { useFireMonitoring } from './useFireMonitoring';
import { PanelOptions } from '../types';

const options = (lng: number, enabled = true): PanelOptions => ({
  centerLat: 0,
  centerLng: lng,
  zoom: 8,
  mapProvider: 'osm',
  fireEnabled: enabled,
  pops: [{ id: 'p', name: 'P', lat: -23, lng, equipments: [] }],
  routes: [
    {
      id: 'r',
      name: 'Fibra',
      kind: 'transport',
      colors: { online: '', alert: '', down: '' },
      points: [
        { lat: -23, lng },
        { lat: -23, lng: lng + 0.1 },
      ],
      metrics: [],
      extraMetrics: [],
      trunks: [],
    },
  ],
});
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

test('disabled layer never calls the external service', () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  const hook = renderHook(() => useFireMonitoring(options(-45, false)));
  expect(hook.result.current.enabled).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('concurrent panels share one request, omit credentials, and count only near geographic assets', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      type: 'FeatureCollection',
      features: [
        {
          properties: {
            foco_id: 'f',
            latitude: -23,
            longitude: -44,
            data_hora_gmt: new Date().toISOString(),
            satelite: 'NOAA-20',
          },
        },
      ],
    }),
  });
  global.fetch = fetchMock;
  const first = renderHook(() => useFireMonitoring(options(-44)));
  const second = renderHook(() => useFireMonitoring(options(-44)));
  await waitFor(() => expect(first.result.current.nearby).toHaveLength(1));
  await waitFor(() => expect(second.result.current.nearby).toHaveLength(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
});

test('service failure is unavailable, never a successful zero-focus observation', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('CORS'));
  const hook = renderHook(() => useFireMonitoring(options(-43)));
  await waitFor(() => expect(hook.result.current.error).toContain('Não foi possível'));
  expect(hook.result.current.fetchedAt).toBeUndefined();
  expect(hook.result.current.loading).toBe(false);
});

test('late response from a previous region cannot overwrite the new network region', async () => {
  let finishOld: (value: unknown) => void = () => {};
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValue({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) });
  global.fetch = fetchMock;
  const hook = renderHook(({ lng }) => useFireMonitoring(options(lng)), { initialProps: { lng: -42 } });
  hook.rerender({ lng: -41 });
  await waitFor(() => expect(hook.result.current.fetchedAt).toBeDefined());
  finishOld({
    ok: true,
    json: async () => ({
      type: 'FeatureCollection',
      features: [
        {
          properties: {
            latitude: -23,
            longitude: -42,
            foco_id: 'old',
            data_hora_gmt: new Date().toISOString(),
          },
        },
      ],
    }),
  });
  await waitFor(() => expect(hook.result.current.nearby).toHaveLength(0));
});
