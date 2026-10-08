/** Stable paths also support the bundled preset URLs stored by older dashboards. */
export function migratePresetIcon(value: string) {
  const aliases: Record<string, string> = {
    '20585457f717548f4270.png': 'torre.png',
    '5816cf71483c5479f81b.png': 'sw.png',
    '59b1001a15f4b1e16fb6.png': 'olt.png',
    'beee0b4ff4d74d22dbff.png': 'datacenter.png',
  };
  const name = value.split('/').pop() ?? '';
  // External icons with coincident filenames remain untouched.
  return aliases[name] && !/^https?:\/\//i.test(value)
    ? `/public/plugins/jakson-jmap-panel/img/${aliases[name]}`
    : value;
}

export const POP_ICON_PRESETS = [
  { id: 'datacenter', label: 'Datacenter', url: '/public/plugins/jakson-jmap-panel/img/datacenter.png' },
  { id: 'olt', label: 'OLT', url: '/public/plugins/jakson-jmap-panel/img/olt.png' },
  { id: 'sw', label: 'SW', url: '/public/plugins/jakson-jmap-panel/img/sw.png' },
  { id: 'torre', label: 'Torre', url: '/public/plugins/jakson-jmap-panel/img/torre.png' },
];

/** Works under Grafana's subpath as well as at the domain root. */
export function normalizePopIconUrl(value?: string) {
  const raw = migratePresetIcon(value?.trim() ?? '');
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith('data:image/')) {
    return raw;
  }
  const publicPath = raw.replace(/^\/?public\//, 'public/');
  if (publicPath.startsWith('public/')) {
    return publicPath;
  }
  if (raw.startsWith('/')) {
    return raw;
  }
  return `public/plugins/jakson-jmap-panel/${raw.replace(/^\.\//, '')}`;
}
