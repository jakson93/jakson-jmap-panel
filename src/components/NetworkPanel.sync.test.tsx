import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createTheme, dateTime, LoadingState, PanelProps } from '@grafana/data';
import { NetworkPanel } from './NetworkPanel';
import { PanelOptions } from '../types';
import { NetworkNode } from '../networkModel';

jest.mock('@grafana/ui', () => ({
  useTheme2: () => createTheme(),
  useStyles2: () => ({}),
  Icon: () => null,
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': label,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </button>
  ),
}));
jest.mock('./useOperationalReadings', () => ({
  useOperationalReadings: () => ({ readings: new Map(), referenceTime: 0 }),
}));
jest.mock('./OperationalConsole', () => ({ OperationalConsole: () => null }));
jest.mock('./NetworkCanvas', () => ({
  NetworkCanvas: (props: {
    nodes: NetworkNode[];
    onSelectNode: (id: string) => void;
    onMove: (node: NetworkNode, point: { x: number; y: number }) => void;
  }) => (
    <div>
      <button onClick={() => props.onMove(props.nodes[0], { x: 600, y: 600 })}>Mover POP teste</button>
      <button onClick={() => props.onSelectNode(props.nodes[0].id)}>Selecionar POP teste</button>
    </div>
  ),
}));
jest.mock('./RainLayer', () => ({ RainControls: () => null }));
jest.mock('./FireLayer', () => ({ FireControls: () => null }));
jest.mock('./MapView', () => ({ MapView: () => null }));

const opts = (): PanelOptions => ({
  viewMode: 'topology',
  centerLat: 1,
  centerLng: 2,
  zoom: 10,
  mapProvider: 'osm',
  pops: [{ id: 'p', name: 'P', lat: 1, lng: 2, equipments: [], topologyPosition: { x: 100, y: 100 } }],
  routes: [
    {
      id: 'r',
      name: 'R',
      interfaceItem: 'status',
      points: [
        { lat: 1, lng: 2 },
        { lat: 2, lng: 3 },
      ],
      colors: { online: '', down: '', alert: '' },
      metrics: [],
      extraMetrics: [],
      trunks: [{ id: 't', name: 'T', interfaces: [{ id: 'i', name: 'I', rxItem: 'old.rx', metrics: [] }] }],
    },
  ],
});
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
beforeAll(() => {
  global.structuredClone = clone;
});

test('panel options updates during layout editing survive live rebasing, undo and apply', async () => {
  const options = opts(),
    onOptionsChange = jest.fn();
  const props = {
    options,
    onOptionsChange,
    width: 1000,
    data: { state: LoadingState.Done, series: [] },
    timeRange: { from: dateTime(0), to: dateTime(1000), raw: { from: 'now-1h', to: 'now' } },
  } as unknown as PanelProps<PanelOptions>;
  const panel = render(<NetworkPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar layout' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mover POP teste' }));
  const external = clone(options);
  external.routes[0].trunks[0].interfaces[0].rxItem = 'new.rx';
  external.pops[0].name = 'Nome do cadastro';
  panel.rerender(<NetworkPanel {...props} options={external} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar alterações' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refazer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar alterações' }));
  expect(onOptionsChange).toHaveBeenCalledWith(
    expect.objectContaining({
      pops: [expect.objectContaining({ name: 'Nome do cadastro', topologyPosition: { x: 600, y: 600 } })],
      routes: [
        expect.objectContaining({
          trunks: [expect.objectContaining({ interfaces: [expect.objectContaining({ rxItem: 'new.rx' })] })],
        }),
      ],
    })
  );
  expect(options).toEqual(opts());
});

test('different concurrent choices for the same POP icon block applying instead of losing the original option change', async () => {
  const options = opts();
  const props = {
    options,
    onOptionsChange: jest.fn(),
    width: 1000,
    data: { state: LoadingState.Done, series: [] },
    timeRange: { from: dateTime(0), to: dateTime(1000), raw: { from: 'now-1h', to: 'now' } },
  } as unknown as PanelProps<PanelOptions>;
  const panel = render(<NetworkPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar layout' }));
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar POP teste' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ícone Torre' }));
  const external = clone(options);
  external.pops[0].iconUrl = 'img/olt.png';
  panel.rerender(<NetworkPanel {...props} options={external} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Aplicar alterações' })).toBeDisabled());
  expect(screen.getByRole('alert')).toHaveTextContent('O mesmo campo foi alterado');
  expect(props.onOptionsChange).not.toHaveBeenCalled();
});
