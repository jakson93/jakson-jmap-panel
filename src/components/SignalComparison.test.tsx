import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SignalComparison } from './SignalComparison';
jest.mock('@grafana/ui', () => ({ useStyles2: () => ({}) }));

test('compares two selected dates in the Grafana timezone and exposes the actual collection times', () => {
  const start = Date.parse('2026-10-12T12:00:00Z');
  render(
    <SignalComparison
      series={{ times: [start, start + 86400000, start + 2 * 86400000], values: [-20, -22, -19] }}
      timeZone="America/Sao_Paulo"
      toleranceMs={300000}
    />
  );
  expect((screen.getByLabelText('Data A') as HTMLInputElement).value).toBe('2026-10-12T09:00');
  expect(screen.getByText('Melhorou 1.00 dB')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Data B'), { target: { value: '2026-10-13T09:00:00' } });
  expect(screen.getByText('Piorou 2.00 dB')).toBeTruthy();
  expect(screen.getByText('13/10/2026 09:00:00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Data B'), { target: { value: '2026-10-15T09:00:00' } });
  expect(screen.getByRole('status').textContent).toContain('Sem amostra');
});
