import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2 } from '@grafana/ui';
import { Readings } from '../networkTelemetry';
import { Route } from '../types';

export function RouteMonitoringSummary({ route, readings }: { route: Route; readings: Readings }) {
  const styles = useStyles2(getStyles);
  const metric = (key: string, label: string, item?: string, manual?: string) => {
    const reading = item?.trim() ? readings.get(item.trim()) : undefined;
    return (
      <div key={key} className={styles.metric}>
        <small>{label}</small>
        <strong>{manual ?? reading?.text ?? '—'}</strong>
        {reading?.stale && <small>Dados antigos</small>}
      </div>
    );
  };
  return (
    <section aria-label="Monitoramento da rota" className={styles.root}>
      {route.interfaceItem && (
        <div className={styles.identity}>
          <small>Interface monitorada</small>
          <strong>{route.interfaceItem}</strong>
        </div>
      )}
      <div className={styles.grid}>
        {metric('capacity', 'Capacidade', undefined, route.capacityManualText || '—')}
        {(route.metrics ?? [])
          .filter((m) => m.enabled && m.zabbixItem)
          .map((m) => metric(`route-${m.id}`, m.label, m.zabbixItem))}
        {(route.extraMetrics ?? [])
          .filter((m) => m.showInDetails !== false && m.item)
          .map((m) => metric(`extra-${m.id}`, m.name, m.item))}
      </div>
      {Boolean(route.trunks?.length) && <strong>Trunks e interfaces</strong>}
      {(route.trunks ?? []).map((trunk) => (
        <div key={trunk.id} className={styles.trunk}>
          <strong>{trunk.name || 'Trunk'}</strong>
          {trunk.description && <small>{trunk.description}</small>}
          {(trunk.interfaces ?? []).map((iface) => (
            <article key={iface.id} aria-label={`Interface ${iface.name || iface.id}`} className={styles.iface}>
              <strong>
                {iface.name || 'Interface'}
                {iface.side ? ` · Lado ${iface.side}` : ''}
              </strong>
              {iface.description && <small>{iface.description}</small>}
              <div className={styles.grid}>
                {iface.showRx !== false && iface.rxItem && metric('rx', 'RX', iface.rxItem)}
                {iface.showTx !== false && iface.txItem && metric('tx', 'TX', iface.txItem)}
                {(iface.metrics ?? []).filter((m) => m.item).map((m) => metric(m.id, m.label, m.item))}
              </div>
            </article>
          ))}
        </div>
      ))}
    </section>
  );
}

function getStyles(t: GrafanaTheme2) {
  return {
    root: css({ display: 'flex', flexDirection: 'column', gap: t.spacing(1.5) }),
    identity: css({ display: 'flex', flexDirection: 'column', gap: t.spacing(0.5), overflowWrap: 'anywhere' }),
    grid: css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: t.spacing(1.5) }),
    metric: css({
      minWidth: 0,
      paddingLeft: t.spacing(1),
      borderLeft: `1px solid ${t.colors.border.weak}`,
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(0.5),
      small: { color: t.colors.text.secondary, fontSize: t.typography.bodySmall.fontSize },
      strong: { fontSize: t.typography.h5.fontSize, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' },
    }),
    trunk: css({
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
      small: { color: t.colors.text.secondary },
    }),
    iface: css({
      padding: t.spacing(1.5),
      border: `1px solid ${t.colors.border.weak}`,
      borderRadius: t.shape.radius.default,
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
      background: t.colors.background.secondary,
      overflowWrap: 'anywhere',
    }),
  };
}
