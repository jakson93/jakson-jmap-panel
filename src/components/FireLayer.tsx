import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, useStyles2, useTheme2 } from '@grafana/ui';
import { CircleMarker, Pane, Popup, Tooltip } from 'react-leaflet';
import { FireMonitoring } from './useFireMonitoring';

export function FireLayer({ fire }: { fire: FireMonitoring }) {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  if (!fire.enabled) {
    return null;
  }
  return (
    <Pane name="jmap-fire-focuses" style={{ zIndex: 620 }}>
      {fire.nearby.slice(0, 200).map((focus) => (
        <CircleMarker
          key={focus.id}
          center={[focus.lat, focus.lng]}
          radius={Number(theme.spacing(1).replace('px', ''))}
          pathOptions={{
            color: theme.colors.warning.text,
            fillColor: theme.colors.error.text,
            fillOpacity: 0.7,
            weight: 2,
          }}
        >
          <Tooltip>
            Foco de calor · {focus.exposures[0].distanceKm.toFixed(2)} km de {focus.exposures[0].name}
          </Tooltip>
          <Popup className={styles.popup} maxHeight={parseFloat(theme.spacing(40))}>
            <strong>Foco de calor · INPE</strong>
            <p>
              {new Date(focus.detectedAt).toLocaleString()} · {focus.satellite}
              <br />
              {focus.municipality} · {focus.state}
            </p>
            <ul>
              {focus.exposures.map((asset) => (
                <li key={`${asset.kind}/${asset.id}`}>
                  {asset.kind === 'pop' ? 'POP' : 'Rota'}: {asset.name} · {asset.distanceKm.toFixed(2)} km
                </li>
              ))}
            </ul>
            <small>
              Detecção por satélite. Distância aproximada ao traçado cadastrado; não confirma incêndio nem impacto na
              rede.
            </small>
          </Popup>
        </CircleMarker>
      ))}
    </Pane>
  );
}

export function FireControls({
  fire,
  onLocate,
}: {
  fire: FireMonitoring;
  onLocate: (lat: number, lng: number) => void;
}) {
  const styles = useStyles2(getStyles);
  const [open, setOpen] = React.useState(false);
  if (!fire.enabled) {
    return null;
  }
  const warning = fire.error || fire.noCoordinates || fire.stale || fire.truncated || fire.invalid > 0;
  return (
    <div className={styles.controls}>
      <Button
        size="sm"
        variant={warning || fire.nearby.length ? 'primary' : 'secondary'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Focos de calor ·{' '}
        {fire.loading && !fire.fetchedAt ? 'consultando' : !fire.fetchedAt ? 'indisponível' : fire.nearby.length}
        {warning ? ' · atenção' : ''}
      </Button>
      {open && (
        <section className={styles.details} aria-label="Focos de calor próximos da rede">
          <strong>Focos de calor · INPE</strong>
          <small>
            Até {fire.radius} km da rede · últimas {fire.hours}h · dados recentes, independentes do período das
            métricas.
          </small>
          {fire.loading && <span role="status">Consultando INPE…</span>}
          {fire.error && (
            <span role="alert">
              {fire.error} {fire.fetchedAt ? 'Exibindo a última consulta disponível.' : ''}
            </span>
          )}
          {fire.noCoordinates && (
            <span role="alert">Cadastre coordenadas dos POPs ou caminhos geográficos das rotas.</span>
          )}
          {fire.stale && <span role="alert">Consulta desatualizada. A cobertura atual não está confirmada.</span>}
          {fire.truncated && (
            <span role="alert">
              Consulta parcial: limite de 2.000 focos atingido na região. Outros focos podem estar ausentes.
            </span>
          )}
          {fire.invalid > 0 && (
            <span role="alert">{fire.invalid} registro(s) inválido(s) ignorado(s). Cobertura parcial.</span>
          )}
          {fire.fetchedAt && <small>Última consulta: {new Date(fire.fetchedAt).toLocaleString()}</small>}
          {fire.fetchedAt && !fire.nearby.length && !warning && (
            <span>Nenhum foco encontrado próximo da rede nessa consulta.</span>
          )}
          {fire.nearby.length > 200 && (
            <small>Mapa mostra os 200 focos mais próximos; total encontrado: {fire.nearby.length}.</small>
          )}
          <div className={styles.list}>
            {fire.nearby.slice(0, 20).map((focus) => (
              <div key={focus.id}>
                <button type="button" onClick={() => onLocate(focus.lat, focus.lng)}>
                  <strong>
                    {focus.exposures[0].name} · {focus.exposures[0].distanceKm.toFixed(2)} km
                  </strong>
                  <span>
                    {focus.municipality || 'Localização por coordenadas'} · {focus.satellite}
                  </span>
                  <small>
                    {new Date(focus.detectedAt).toLocaleString()} · {focus.exposures.length} estrutura(s)/rota(s)
                    próxima(s)
                  </small>
                </button>
                <details>
                  <summary>Estruturas e rotas próximas</summary>
                  <ul>
                    {focus.exposures.map((asset) => (
                      <li key={`${asset.kind}/${asset.id}`}>
                        {asset.kind === 'pop' ? 'POP' : 'Rota'}: {asset.name} · {asset.distanceKm.toFixed(2)} km
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
          {fire.nearby.length > 20 && <small>Lista: 20 mais próximos. Selecione os demais focos no mapa.</small>}
          <small>
            Detecção por satélite, sem confirmação de incêndio ou interrupção. Distância aproximada ao cadastro, sujeita
            à precisão do satélite e do traçado.
          </small>
          <a href="https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/" target="_blank" rel="noreferrer">
            Fonte e cobertura: Programa Queimadas / INPE
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
      top: '100%',
      right: 0,
      width: theme.spacing(45),
      maxWidth: 'calc(100vw - 48px)',
      display: 'grid',
      gap: theme.spacing(1),
      maxHeight: '60vh',
      overflowY: 'auto',
      zIndex: 1000,
      padding: theme.spacing(2),
      background: theme.colors.background.primary,
      color: theme.colors.text.primary,
      border: `1px solid ${theme.colors.border.medium}`,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z3,
      small: { color: theme.colors.text.secondary },
      '[role=alert]': { color: theme.colors.warning.text },
    }),
    list: css({
      display: 'grid',
      gap: theme.spacing(1),
      button: {
        width: '100%',
        minWidth: 0,
        overflowWrap: 'anywhere',
        textAlign: 'left',
        display: 'grid',
        gap: theme.spacing(0.5),
        border: `1px solid ${theme.colors.border.weak}`,
        borderRadius: theme.shape.radius.default,
        padding: theme.spacing(1),
        background: theme.colors.background.secondary,
        color: theme.colors.text.primary,
        '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}` },
      },
    }),
  };
}
