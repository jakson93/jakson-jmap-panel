import React from 'react';
import { PanelData, TimeRange, TimeZone } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { readTelemetry } from '../networkTelemetry';
import { freshReadings } from '../operationalModel';

export function useOperationalReadings(
  data: PanelData,
  timeRange: TimeRange,
  staleAfterSeconds = 300,
  timeZone?: TimeZone
) {
  const theme = useTheme2();
  const end = timeRange.to.valueOf();
  const live = timeRange.raw.to === 'now';
  const [clock, setClock] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!live) {
      return;
    }
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [live]);
  const referenceTime = live ? Math.max(clock, end) : end;
  const base = React.useMemo(() => readTelemetry(data.series ?? [], theme, timeZone), [data.series, theme, timeZone]);
  const readings = React.useMemo(
    () => freshReadings(base, referenceTime, Math.max(1, staleAfterSeconds)),
    [base, referenceTime, staleAfterSeconds]
  );
  return { readings, referenceTime, live };
}
