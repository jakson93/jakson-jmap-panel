import React from 'react';
import { PanelOptions } from '../types';
import { FireFocus, fireQuery, fireSettings, nearbyFires, networkFireBounds, parseFireResponse } from '../fireModel';

import { useEnvironmentalData } from './useEnvironmentalData';
const noFocuses: FireFocus[] = [];
export function useFireMonitoring(options: PanelOptions) {
  const bounds = React.useMemo(() => (options.fireEnabled ? networkFireBounds(options) : undefined), [options]);
  const { radius, hours, refresh } = fireSettings(options);
  const url = options.fireEnabled && bounds ? fireQuery(bounds) : '';
  const { data, now, fetchedAt, loading, error, stale } = useEnvironmentalData(
    url,
    refresh,
    parseFireResponse,
    'Não foi possível atualizar os focos do INPE. Verifique conexão, CORS ou CSP do Grafana.'
  );
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
    loading,
    error,
    noCoordinates: Boolean(options.fireEnabled && !bounds),
    fetchedAt,
    stale,
    truncated: Boolean(data?.truncated),
    invalid: data?.invalid ?? 0,
  };
}
export type FireMonitoring = ReturnType<typeof useFireMonitoring>;
