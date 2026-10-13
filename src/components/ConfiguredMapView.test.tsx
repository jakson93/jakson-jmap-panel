import React from 'react';
import { render } from '@testing-library/react';
import { ConfiguredMapView } from './ConfiguredMapView';

const map = { setView: jest.fn() };
jest.mock('react-leaflet', () => ({ useMap: () => map }));
test('original center/zoom changes apply live without resetting user panning on unrelated renders', () => {
  const view = render(<ConfiguredMapView lat={-23} lng={-46} zoom={12} />);
  expect(map.setView).toHaveBeenLastCalledWith([-23, -46], 12, { animate: false });
  view.rerender(<ConfiguredMapView lat={-24} lng={-47} zoom={10} />);
  expect(map.setView).toHaveBeenLastCalledWith([-24, -47], 10, { animate: false });
  const calls = map.setView.mock.calls.length;
  view.rerender(<ConfiguredMapView lat={-24} lng={-47} zoom={10} />);
  view.rerender(<ConfiguredMapView lat={NaN} lng={-47} zoom={10} />);
  expect(map.setView).toHaveBeenCalledTimes(calls);
});
