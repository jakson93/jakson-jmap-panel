import React from 'react';
import { Button, useStyles2, useTheme2 } from '@grafana/ui';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Marker, Pane, Popup, Tooltip } from 'react-leaflet';
import { environmentIcon } from './environmentIcon';
import { RainMonitoring } from './useRainMonitoring';

export function RainLayer({ rain }: { rain: RainMonitoring }) {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const icon = React.useMemo(() => environmentIcon('rain', theme), [theme]);
  if (!rain.enabled) {
    return null;
  }
  const markers = rain.alerts.flatMap((alert) => alert.routes.map((route) => ({ alert, route }))).slice(0, 200);
  return (
    <Pane name="jmap-rain-alerts" style={{ zIndex: 621 }}>
      {markers.map(({ alert, route }) => (
        <Marker
          key={`${alert.id}/${route.id}`}
          position={[route.point.lat, route.point.lng]}
          icon={icon}
          title={`Alerta INMET · ${alert.event} · ${route.name}`}
        >
          <Tooltip>
            Alerta de {alert.event.toLowerCase()} · {route.name}
          </Tooltip>
          <Popup className={styles.popup} maxHeight={parseFloat(theme.spacing(40))}>
            <strong>{alert.event} · INMET</strong>
            <p>{alert.severity}</p>
            <p>
              Vigência: {new Date(alert.startsAt).toLocaleString()} até {new Date(alert.endsAt).toLocaleString()}
            </p>
            <p>Trajeto sob aviso: {route.name}</p>
            {alert.risks.map((risk, i) => (
              <p key={i}>{risk}</p>
            ))}
            <small>
              Aviso meteorológico para a região do trajeto. Não é medição de chuva na fibra e não confirma interrupção.
            </small>
          </Popup>
        </Marker>
      ))}
    </Pane>
  );
}
export function RainControls({
  rain,
  onLocate,
}: {
  rain: RainMonitoring;
  onLocate: (lat: number, lng: number) => void;
}) {
  const styles = useStyles2(getStyles);
  const [open, setOpen] = React.useState(false);
  if (!rain.enabled) {
    return null;
  }
  const warning = rain.error || rain.stale || rain.noCoordinates || rain.invalid || rain.truncated;
  const markers = rain.alerts.reduce((sum, alert) => sum + alert.routes.length, 0);
  return (
    <div className={styles.controls}>
      <Button
        size="sm"
        variant={rain.alerts.length || warning ? 'primary' : 'secondary'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Chuva ·{' '}
        {rain.loading && !rain.fetchedAt ? 'consultando' : !rain.fetchedAt ? 'indisponível' : rain.alerts.length}
        {warning ? ' · atenção' : ''}
      </Button>
      {open && (
        <section className={styles.details} aria-label="Alertas de chuva nas rotas de fibra">
          <strong>Alertas de chuva · INMET</strong>
          <small>
            Avisos vigentes que cruzam os trajetos cadastrados. Dados recentes, independentes do período das métricas.
          </small>
          {rain.loading && <span role="status">Consultando INMET…</span>}
          {rain.error && (
            <span role="alert">
              {rain.error} {rain.fetchedAt ? 'Exibindo a última consulta disponível.' : ''}
            </span>
          )}
          {rain.noCoordinates && (
            <span role="alert">
              Cadastre caminhos geográficos das rotas de fibra com pelo menos dois pontos distintos.
            </span>
          )}
          {rain.stale && <span role="alert">Consulta desatualizada. A cobertura atual não está confirmada.</span>}
          {rain.truncated && <span role="alert">Consulta parcial: limite de 500 avisos atingido.</span>}
          {rain.invalid > 0 && (
            <span role="alert">{rain.invalid} aviso(s) inválido(s) ignorado(s). Cobertura parcial.</span>
          )}
          {rain.fetchedAt && <small>Última consulta: {new Date(rain.fetchedAt).toLocaleString()}</small>}
          {rain.fetchedAt && !rain.alerts.length && !warning && (
            <span>Nenhum aviso vigente de chuva cruzando as rotas nessa consulta.</span>
          )}
          {rain.alerts.slice(0, 20).map((alert) => (
            <article key={alert.id} className={styles.alert}>
              <strong>{alert.event}</strong>
              <span>{alert.severity}</span>
              <small>
                {new Date(alert.startsAt).toLocaleString()} até {new Date(alert.endsAt).toLocaleString()}
              </small>
              {alert.routes.slice(0, 20).map((route) => (
                <button key={route.id} type="button" onClick={() => onLocate(route.point.lat, route.point.lng)}>
                  Localizar na fibra · {route.name}
                </button>
              ))}
              {alert.routes.length > 20 && (
                <small>Lista limitada às primeiras 20 rotas; total sob aviso: {alert.routes.length}.</small>
              )}
            </article>
          ))}
          {(rain.alerts.length > 20 || markers > 200) && (
            <small>
              Lista: primeiros 20 avisos. Mapa: até 200 cruzamentos com rotas. Total de cruzamentos: {markers}.
            </small>
          )}
          <small>
            Aviso de condições meteorológicas adversas; não é medição de precipitação no local nem confirmação de falha
            da rede.
          </small>
          <a href="https://avisos.inmet.gov.br/" target="_blank" rel="noreferrer">
            Fonte: avisos meteorológicos do INMET
          </a>
        </section>
      )}
    </div>
  );
}
function getStyles(theme: GrafanaTheme2) {
  return {
    popup: css({
      '.leaflet-popup-content-wrapper, .leaflet-popup-tip': {
        background: theme.colors.background.primary,
        color: theme.colors.text.primary,
      },
      'a.leaflet-popup-close-button': { color: theme.colors.text.secondary },
    }),
    controls: css({ position: 'relative' }),
    details: css({
      position: 'absolute',
      right: 0,
      top: '100%',
      width: theme.spacing(45),
      maxWidth: `calc(100vw - ${theme.spacing(6)})`,
      maxHeight: '60vh',
      overflowY: 'auto',
      display: 'grid',
      gap: theme.spacing(1),
      padding: theme.spacing(2),
      background: theme.colors.background.primary,
      color: theme.colors.text.primary,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z3,
      zIndex: 1000,
      small: { color: theme.colors.text.secondary },
      '[role=alert]': { color: theme.colors.warning.text },
    }),
    alert: css({
      display: 'grid',
      gap: theme.spacing(0.75),
      padding: theme.spacing(1),
      background: theme.colors.background.secondary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      button: {
        padding: theme.spacing(1),
        textAlign: 'left',
        color: theme.colors.info.text,
        background: theme.colors.background.primary,
        border: `1px solid ${theme.colors.border.weak}`,
        borderRadius: theme.shape.radius.default,
        '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}` },
      },
    }),
  };
}
