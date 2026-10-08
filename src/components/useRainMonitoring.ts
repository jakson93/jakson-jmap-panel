import React from 'react';
import { PanelOptions } from '../types';
import { geographicRouteSegments } from '../fireModel';
import { parseRainResponse, rainRefresh, RAIN_SOURCE, routeRainAlerts } from '../rainModel';
import { useEnvironmentalData } from './useEnvironmentalData';

export function useRainMonitoring(options: PanelOptions) {
  const hasRoutes = React.useMemo(
    () => Boolean(options.rainEnabled && geographicRouteSegments(options).length),
    [options]
  );
  const { data, ...state } = useEnvironmentalData(
    hasRoutes ? RAIN_SOURCE : '',
    rainRefresh(options),
    parseRainResponse,
    'Não foi possível atualizar os avisos do INMET. Verifique conexão, CORS ou CSP do Grafana.'
  );
  const alerts = React.useMemo(
    () => (options.rainEnabled && data ? routeRainAlerts(data.alerts, options, state.now) : []),
    [data, options, state.now]
  );
  return {
    ...state,
    alerts,
    enabled: Boolean(options.rainEnabled),
    noCoordinates: Boolean(options.rainEnabled && !hasRoutes),
    invalid: data?.invalid ?? 0,
    truncated: Boolean(data?.truncated),
  };
}
export type RainMonitoring = ReturnType<typeof useRainMonitoring>;
