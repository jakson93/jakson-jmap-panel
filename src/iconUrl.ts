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
