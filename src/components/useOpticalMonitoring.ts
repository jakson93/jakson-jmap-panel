import React from 'react';
import { LoadingState, PanelData, TimeRange } from '@grafana/data';
import { PanelOptions } from '../types';
import { buildSignalSeries, signalWindow } from '../signalHistory';
import { AttenuationEvent, opticalChannels, opticalSettings, signalAttenuation } from '../opticalModel';

export function useOpticalMonitoring(
  data: PanelData,
  options: PanelOptions,
  timeRange: TimeRange,
  referenceTime: number
) {
  const series = React.useMemo(() => buildSignalSeries(data.series ?? []), [data.series]);
  const settings = React.useMemo(() => opticalSettings(options), [options]);
  const scope = JSON.stringify([
    timeRange.raw.to === 'now',
    String(timeRange.raw.from),
    settings,
    data.request?.targets.map((target) => [target.refId, target.datasource?.uid]),
  ]);
  // Retain observed baselines only in this open panel, when the same live query rolls forward.
  const [retained, setRetained] = React.useState<{ scope: string; events: Record<string, AttenuationEvent> }>({
    scope: '',
    events: {},
  });
  const channels = React.useMemo(
    () =>
      settings.enabled
        ? opticalChannels(options).map((channel) => {
            const history = signalWindow(
              series.get(channel.item),
              timeRange.from.valueOf(),
              Math.min(timeRange.to.valueOf(), referenceTime)
            );
            const event =
              retained.scope === scope && timeRange.raw.to === 'now'
                ? retained.events[JSON.stringify([channel.routeId, channel.item])]
                : undefined;
            const previousIndex = event ? history.times.indexOf(event.current.time) : -1;
            const seed =
              event &&
              history.times.length &&
              history.times[history.times.length - 1] >= event.current.time &&
              (previousIndex < 0 || history.values[previousIndex] === event.current.value) &&
              history.times[0] > event.startedAt - settings.windowMs
                ? event
                : undefined;
            return { ...channel, ...signalAttenuation(history, settings, referenceTime, seed) };
          })
        : [],
    [series, options, timeRange.from, timeRange.to, timeRange.raw.to, referenceTime, settings, retained, scope]
  );
  React.useEffect(() => {
    if (data.state !== LoadingState.Done && data.state !== LoadingState.Streaming) {
      return;
    }
    const events: Record<string, AttenuationEvent> = {};
    if (timeRange.raw.to === 'now') {
      channels.forEach((channel) => {
        if (channel.event && !channel.maintenance) {
          events[JSON.stringify([channel.routeId, channel.item])] = channel.event;
        }
      });
    }
    setRetained((previous) =>
      previous.scope === scope && JSON.stringify(previous.events) === JSON.stringify(events)
        ? previous
        : { scope, events }
    );
  }, [channels, scope, data.state, timeRange.raw.to]);
  return {
    settings,
    channels,
    referenceTime,
    queryError: data.state === LoadingState.Error,
    alerts: channels.filter((channel) => channel.state === 'active' && !channel.maintenance),
    pending: channels.filter((channel) => channel.state === 'pending' && !channel.maintenance),
    unavailable: channels.filter(
      (channel) => ['stale', 'gap', 'insufficient'].includes(channel.state) && !channel.maintenance
    ),
    live: timeRange.raw.to === 'now',
  };
}
export type OpticalMonitoring = ReturnType<typeof useOpticalMonitoring>;
