import React from 'react';
import { PanelOptions } from '../types';
import { FireFocus, fireQuery, fireSettings, nearbyFires, networkFireBounds, parseFireResponse } from '../fireModel';

type Snapshot = ReturnType<typeof parseFireResponse> & { fetchedAt: number };
// Concurrent panels share a bounded request cache. No credentials, server or extra dependency.
const noFocuses: FireFocus[] = [];
const requests = new Map<string, { at: number; result: Promise<Snapshot> }>();
function load(url: string, refresh: number): Promise<Snapshot> {
  const cached = requests.get(url);
  if (cached && Date.now() - cached.at < refresh * 1000) {
    return cached.result;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const result = fetch(url, { signal: controller.signal, credentials: 'omit' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`INPE HTTP ${response.status}`);
      }
      return { ...parseFireResponse(await response.json()), fetchedAt: Date.now() };
    })
    .catch((error) => {
      requests.delete(url);
      throw error;
    })
    .finally(() => window.clearTimeout(timeout));
  if (requests.size >= 20) {
    requests.delete(requests.keys().next().value!);
  }
  requests.set(url, { at: Date.now(), result });
  return result;
}
export function useFireMonitoring(options: PanelOptions) {
  const bounds = React.useMemo(() => (options.fireEnabled ? networkFireBounds(options) : undefined), [options]);
  const { radius, hours, refresh } = fireSettings(options);
  const url = options.fireEnabled && bounds ? fireQuery(bounds) : '';
  const [snapshot, setSnapshot] = React.useState<{ url: string; data: Snapshot }>();
  const [requestState, setRequestState] = React.useState({ url: '', loading: false, error: '' });
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    if (!url) {
      return;
    }
    let active = true;
    const update = async () => {
      setRequestState({ url, loading: true, error: '' });
      try {
        const data = await load(url, refresh);
        if (active) {
          setSnapshot({ url, data });
          setRequestState({ url, loading: false, error: '' });
        }
      } catch {
        if (active) {
          setRequestState({
            url,
            loading: false,
            error: 'Não foi possível atualizar os focos do INPE. Verifique conexão, CORS ou CSP do Grafana.',
          });
        }
      }
      if (active) {
        setNow(Date.now());
      }
    };
    void update();
    const poll = window.setInterval(() => void update(), refresh * 1000);
    const clock = window.setInterval(() => setNow(Date.now()), 60000);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [url, refresh]);
  const data = snapshot?.url === url ? snapshot.data : undefined;
  const focuses: FireFocus[] = data?.focuses ?? noFocuses;
  const nearby = React.useMemo(
    () => (options.fireEnabled ? nearbyFires(focuses, options, now) : []),
    [focuses, options, now]
  );
  return {
    nearby,
    radius,
    hours,
    enabled: Boolean(options.fireEnabled),
    loading: Boolean(
      url && ((!data && requestState.url !== url) || (requestState.url === url && requestState.loading))
    ),
    error: requestState.url === url ? requestState.error : '',
    noCoordinates: Boolean(options.fireEnabled && !bounds),
    fetchedAt: data?.fetchedAt,
    stale: Boolean(data && now - data.fetchedAt > (refresh * 2 + 120) * 1000),
    truncated: Boolean(data?.truncated),
    invalid: data?.invalid ?? 0,
  };
}
export type FireMonitoring = ReturnType<typeof useFireMonitoring>;
