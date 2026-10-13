import { renderHook, waitFor } from '@testing-library/react';
import { PanelOptions } from '../types';
import { useRainMonitoring } from './useRainMonitoring';

const options: PanelOptions = {
  centerLat: 0,
  centerLng: 0,
  zoom: 8,
  mapProvider: 'osm',
  pops: [],
  routes: [
    {
      id: 'r',
      name: 'Fibra',
      points: [
        { lat: 1, lng: -1 },
        { lat: 1, lng: 3 },
      ],
      metrics: [],
      extraMetrics: [],
      trunks: [],
      colors: { online: '', alert: '', down: '' },
    },
  ],
};
const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
test('disabled rain and networks without real geographic paths never call INMET', () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  renderHook(() => useRainMonitoring(options));
  const hook = renderHook(() => useRainMonitoring({ ...options, rainEnabled: true, routes: [] }));
  expect(hook.result.current.noCoordinates).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
});
test('failed INMET service is unavailable, never a successful zero-warning result', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('CORS'));
  const hook = renderHook(() => useRainMonitoring({ ...options, rainEnabled: true }));
  await waitFor(() => expect(hook.result.current.error).toContain('Não foi possível'));
  expect(hook.result.current.fetchedAt).toBeUndefined();
});
test('panels share public warning requests and intersect only the current route configuration', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      hoje: [
        {
          id: 1,
          descricao: 'Chuvas Intensas',
          data_inicio: '2020-01-01T00:00:00Z',
          hora_inicio: '00:00',
          data_fim: '2099-12-31T00:00:00Z',
          hora_fim: '23:59',
          poligono: JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [2, 0],
                [2, 2],
                [0, 2],
                [0, 0],
              ],
            ],
          }),
        },
      ],
      futuro: [],
    }),
  });
  global.fetch = fetchMock;
  const hook = renderHook(({ value }) => useRainMonitoring(value), {
    initialProps: { value: { ...options, rainEnabled: true } },
  });
  const second = renderHook(() => useRainMonitoring({ ...options, rainEnabled: true }));
  await waitFor(() => expect(hook.result.current.alerts).toHaveLength(1));
  await waitFor(() => expect(second.result.current.alerts).toHaveLength(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
  hook.rerender({
    value: {
      ...options,
      rainEnabled: true,
      routes: [
        {
          ...options.routes[0],
          points: [
            { lat: 40, lng: 40 },
            { lat: 40, lng: 41 },
          ],
        },
      ],
    },
  });
  expect(hook.result.current.alerts).toHaveLength(0);
});
