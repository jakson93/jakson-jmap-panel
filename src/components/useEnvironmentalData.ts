import React from 'react';

const requests = new Map<string, { at: number; result: Promise<{ value: unknown; fetchedAt: number }> }>();
function load<T>(url: string, refresh: number, parse: (input: unknown) => T) {
  const cached = requests.get(url);
  if (cached && Date.now() - cached.at < refresh * 1000) {
    return cached.result as Promise<{ value: T; fetchedAt: number }>;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  const result = fetch(url, { signal: controller.signal, credentials: 'omit' })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return { value: parse(await response.json()), fetchedAt: Date.now() };
    })
    .catch((error) => {
      if (requests.get(url)?.result === result) {
        requests.delete(url);
      }
      throw error;
    })
    .finally(() => window.clearTimeout(timeout));
  if (requests.size >= 20) {
    requests.delete(requests.keys().next().value!);
  }
  requests.set(url, { at: Date.now(), result });
  return result;
}

/** Optional external layers share bounded requests and ignore responses for a superseded query. */
export function useEnvironmentalData<T>(url: string, refresh: number, parse: (input: unknown) => T, failure: string) {
  const [snapshot, setSnapshot] = React.useState<{ url: string; value: T; fetchedAt: number }>();
  const [request, setRequest] = React.useState({ url: '', loading: false, error: '' });
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    if (!url) {
      return;
    }
    let active = true;
    const update = async () => {
      setRequest({ url, loading: true, error: '' });
      try {
        const data = await load(url, refresh, parse);
        if (active) {
          setSnapshot({ url, ...data });
          setRequest({ url, loading: false, error: '' });
        }
      } catch {
        if (active) {
          setRequest({ url, loading: false, error: failure });
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
  }, [url, refresh, parse, failure]);
  const current = snapshot?.url === url ? snapshot : undefined;
  return {
    data: current?.value,
    now,
    fetchedAt: current?.fetchedAt,
    error: request.url === url ? request.error : '',
    loading: Boolean(url && ((!current && request.url !== url) || (request.url === url && request.loading))),
    stale: Boolean(current && now - current.fetchedAt > (refresh * 2 + 120) * 1000),
  };
}
