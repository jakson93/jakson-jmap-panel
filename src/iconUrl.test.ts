import { normalizePopIconUrl } from './iconUrl';

test('preset URLs are consistent between map, topology and original editor including Grafana subpath and old hashes', () => {
  expect(normalizePopIconUrl('/public/plugins/jakson-jmap-panel/img/torre.png')).toBe(
    'public/plugins/jakson-jmap-panel/img/torre.png'
  );
  expect(normalizePopIconUrl('img/torre.png')).toBe('public/plugins/jakson-jmap-panel/img/torre.png');
  expect(normalizePopIconUrl('20585457f717548f4270.png')).toBe('public/plugins/jakson-jmap-panel/img/torre.png');
  expect(normalizePopIconUrl('https://cdn.example/20585457f717548f4270.png')).toBe(
    'https://cdn.example/20585457f717548f4270.png'
  );
  expect(normalizePopIconUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
});
