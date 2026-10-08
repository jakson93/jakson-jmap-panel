import React from 'react';
import { render, screen } from '@testing-library/react';
import { createTheme } from '@grafana/data';
import { SignalTrendChart } from './SignalTrendChart';
jest.mock('@grafana/ui', () => ({ useTheme2: () => createTheme(), useStyles2: () => ({}) }));

test('keeps the previous signal on screen after a drop and updates while the history is open', () => {
  const from = Date.parse('2026-10-08T10:00:00Z'),
    to = from + 120000;
  const series = { times: [from, from + 60000, to], values: [-24, -23.5, -40] };
  const view = render(<SignalTrendChart series={series} from={from} to={to} timeZone="utc" />);
  expect(screen.getByText('-23.50 dBm')).toBeTruthy();
  expect(screen.getByText('-40.00 dBm')).toBeTruthy();
  const lines = [...view.container.querySelectorAll('[data-signal-segment]')];
  expect(lines).toHaveLength(2);
  for (const line of lines) {
    expect(Number(line.getAttribute('y1'))).toBeGreaterThanOrEqual(0);
    expect(Number(line.getAttribute('y2'))).toBeLessThanOrEqual(240);
  }
  view.rerender(
    <SignalTrendChart
      series={{ times: [...series.times, to + 60000], values: [...series.values, -22] }}
      from={from}
      to={to + 60000}
      timeZone="utc"
    />
  );
  expect(screen.getByText('-22.00 dBm')).toBeTruthy();
  expect(screen.getByText('-23.50 dBm')).toBeTruthy();
});
test('null samples break the line and an empty query is not replaced by data from another period', () => {
  const from = Date.parse('2026-10-08T10:00:00Z'),
    to = from + 120000;
  const view = render(
    <SignalTrendChart series={{ times: [from, from + 60000, to], values: [-24, null, -40] }} from={from} to={to} />
  );
  expect(view.container.querySelectorAll('[data-signal-segment]')).toHaveLength(0);
  expect(screen.getByText(/Lacunas representam/)).toBeTruthy();
  view.rerender(<SignalTrendChart series={{ times: [], values: [] }} from={from} to={to} />);
  expect(screen.getByRole('status').textContent).toContain('Sem amostras RX');
});
