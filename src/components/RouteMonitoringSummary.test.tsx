import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { createTheme, FieldType, toDataFrame } from '@grafana/data';
import { RouteMonitoringSummary } from './RouteMonitoringSummary';
import { readTelemetry } from '../networkTelemetry';
import { Route } from '../types';

jest.mock('@grafana/ui', () => ({ useStyles2: () => ({}) }));

test('the topology summary resolves original trunk signals, custom metrics and visibility flags from existing frames', () => {
  const readings = readTelemetry(
    [
      toDataFrame({
        fields: [
          { name: 'Time', type: FieldType.time, values: [1000] },
          { name: 'sfp.rx', type: FieldType.number, values: [-23.5], config: { unit: 'dBm' } },
          { name: 'sfp.tx', type: FieldType.number, values: [2.1], config: { unit: 'dBm' } },
          { name: 'errors', type: FieldType.number, values: [12] },
          { name: 'latency', type: FieldType.number, values: [7], config: { unit: 'ms' } },
        ],
      }),
    ],
    createTheme()
  );
  const route: Route = {
    id: 'old',
    name: 'Antiga',
    points: [],
    colors: { online: '', down: '', alert: '' },
    interfaceItem: 'status',
    metrics: [],
    extraMetrics: [
      { id: 'latency', name: 'Latência', item: 'latency' },
      { id: 'hidden', name: 'Oculta', item: 'latency', showInDetails: false },
    ],
    trunks: [
      {
        id: 't',
        name: 'Trunk existente',
        interfaces: [
          {
            id: 'i',
            name: 'sfp1',
            rxItem: 'sfp.rx',
            txItem: 'sfp.tx',
            metrics: [{ id: 'errors', label: 'Erros', item: 'errors' }],
          },
          { id: 'hidden-signal', name: 'Sem TX', txItem: 'sfp.tx', showTx: false, metrics: [] },
        ],
      },
    ],
  };
  const original = JSON.stringify(route);
  render(<RouteMonitoringSummary route={route} readings={readings} />);
  const iface = within(screen.getByRole('article', { name: 'Interface sfp1' }));
  expect(iface.getByText(/-23.5.*dBm/)).toBeInTheDocument();
  expect(iface.getByText(/2.1.*dBm/)).toBeInTheDocument();
  expect(iface.getByText('12')).toBeInTheDocument();
  expect(screen.getByText('Latência')).toBeInTheDocument();
  expect(screen.queryByText('Oculta')).not.toBeInTheDocument();
  expect(within(screen.getByRole('article', { name: 'Interface Sem TX' })).queryByText('TX')).not.toBeInTheDocument();
  expect(JSON.stringify(route)).toBe(original);
});
