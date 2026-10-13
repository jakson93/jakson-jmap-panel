import React from 'react';
import { css } from '@emotion/css';
import { dateTimeFormat, GrafanaTheme2 } from '@grafana/data';
import { TimeZone } from '@grafana/schema';
import { Button, useStyles2 } from '@grafana/ui';
import { OpticalMonitoring } from './useOpticalMonitoring';

export function OpticalAlerts({
  monitoring,
  onDetails,
  timeZone,
}: {
  monitoring: OpticalMonitoring;
  onDetails: (routeId: string) => void;
  timeZone?: TimeZone;
}) {
  const styles = useStyles2(getStyles);
  const [open, setOpen] = React.useState(false);
  if (!monitoring.settings.enabled) {
    return null;
  }
  const format = (time: number) => dateTimeFormat(time, { format: 'DD/MM/YYYY HH:mm:ss', timeZone });
  const title = monitoring.alerts.length
    ? `⚠ Atenuação · ${monitoring.alerts.length}`
    : monitoring.queryError
      ? 'Atenuação · consulta falhou'
      : monitoring.pending.length
        ? 'Atenuação · confirmando'
        : monitoring.unavailable.length
          ? 'Atenuação · análise parcial'
          : 'Atenuação · 0';
  return (
    <div className={styles.root}>
      <Button
        size="sm"
        className={monitoring.alerts.length ? styles.warning : undefined}
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {title}
        {monitoring.live ? '' : ' · histórico'}
      </Button>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {monitoring.alerts.length ? `${monitoring.alerts.length} sinal(is) com possível atenuação` : title}
      </span>
      {open && (
        <section className={styles.details} aria-label="Alertas de atenuação óptica">
          <div className={styles.heading}>
            <strong>Possível atenuação óptica</strong>
            <button type="button" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
          <small>
            Queda ≥ {monitoring.settings.dropDb} dB em até {monitoring.settings.windowMs / 60000} min, confirmada em
            duas coletas. Referência: mediana do RX antes da queda. Rotas em manutenção não geram alerta.
          </small>
          <small>
            {monitoring.live ? 'Avaliação ao vivo' : 'Análise histórica'} · referência:{' '}
            {format(monitoring.referenceTime)}
          </small>
          {monitoring.queryError && (
            <p role="alert">
              A consulta falhou. A análise usa a última resposta disponível e pode estar desatualizada.
            </p>
          )}
          {monitoring.alerts.map(
            (channel) =>
              channel.event && (
                <article
                  key={`${channel.routeId}/${channel.item}`}
                  className={styles.card}
                  aria-label={`Atenuação em ${channel.name}`}
                >
                  <strong>{channel.routeName}</strong>
                  <span>{channel.name}</span>
                  <strong className={styles.warningText}>
                    {channel.event.recovering
                      ? 'Recuperação em confirmação'
                      : `Queda de ${channel.event.dropDb.toFixed(2)} dB`}
                  </strong>
                  <span>
                    Referência: {channel.event.baseline.toFixed(2)} dBm · RX atual:{' '}
                    {channel.event.current.value.toFixed(2)} dBm
                  </span>
                  <small>
                    Queda observada: {format(channel.event.startedAt)} · confirmada: {format(channel.event.confirmedAt)}
                  </small>
                  {channel.event.referenceRetained && <small>Referência da queda preservada nesta sessão.</small>}
                  <small>Última coleta: {format(channel.event.current.time)}</small>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setOpen(false);
                      onDetails(channel.routeId);
                    }}
                  >
                    Detalhar rota
                  </Button>
                </article>
              )
          )}
          {monitoring.pending.length > 0 && (
            <p role="status">{monitoring.pending.length} queda(s) aguardando a segunda coleta.</p>
          )}
          {monitoring.unavailable.length > 0 && (
            <details>
              <summary>{monitoring.unavailable.length} sinal(is) sem análise conclusiva</summary>
              {monitoring.unavailable.map((channel) => (
                <p key={`${channel.routeId}/${channel.item}`}>
                  {channel.routeName} · {channel.name}:{' '}
                  {channel.state === 'stale'
                    ? 'dados antigos'
                    : channel.state === 'gap'
                      ? 'lacuna de coleta'
                      : 'histórico insuficiente'}
                </p>
              ))}
            </details>
          )}
          {!monitoring.channels.length && <p>Nenhum item RX configurado nas rotas ou interfaces.</p>}
          {monitoring.channels.length > 0 &&
            !monitoring.alerts.length &&
            !monitoring.pending.length &&
            !monitoring.unavailable.length &&
            !monitoring.queryError && <p>Nenhuma queda repentina ativa nas amostras analisadas.</p>}
          <small>
            Uma queda de RX pode indicar atenuação; confira TX e os equipamentos para investigar a causa. O alerta
            visual acompanha as consultas do painel aberto. Ative a atualização automática do Grafana para acompanhar
            novas coletas.
          </small>
        </section>
      )}
    </div>
  );
}
function getStyles(t: GrafanaTheme2) {
  return {
    root: css({ position: 'relative' }),
    warning: css({
      '&&': {
        color: t.colors.warning.text,
        borderColor: t.colors.warning.border,
        background: t.colors.warning.transparent,
      },
    }),
    warningText: css({ color: t.colors.warning.text }),
    srOnly: css({ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }),
    heading: css({
      display: 'flex',
      gap: t.spacing(1),
      justifyContent: 'space-between',
      button: { background: 'transparent', color: t.colors.text.secondary, border: 0, padding: t.spacing(0.5) },
    }),
    details: css({
      position: 'absolute',
      top: '100%',
      right: 0,
      width: t.spacing(52),
      maxWidth: `calc(100vw - ${t.spacing(6)})`,
      maxHeight: '60vh',
      overflowY: 'auto',
      display: 'grid',
      gap: t.spacing(1.5),
      padding: t.spacing(2),
      background: t.colors.background.primary,
      color: t.colors.text.primary,
      border: `1px solid ${t.colors.border.medium}`,
      borderRadius: t.shape.radius.default,
      boxShadow: t.shadows.z3,
      zIndex: 1100,
      small: { color: t.colors.text.secondary, fontSize: t.typography.bodySmall.fontSize },
      p: { margin: 0 },
      'button:focus-visible, summary:focus-visible': { outline: `2px solid ${t.colors.primary.text}` },
    }),
    card: css({
      display: 'grid',
      gap: t.spacing(0.75),
      padding: t.spacing(1.5),
      background: t.colors.background.secondary,
      border: `1px solid ${t.colors.warning.border}`,
      borderRadius: t.shape.radius.default,
      overflowWrap: 'anywhere',
      button: { justifySelf: 'start' },
    }),
  };
}
