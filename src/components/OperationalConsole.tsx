import React from 'react';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2, TimeRange } from '@grafana/data';
import { Button, useStyles2, useTheme2 } from '@grafana/ui';
import { NetworkFilter, NetworkView, PanelOptions, SavedNetworkView } from '../types';
import { Readings, routeStatus, statusColor, statusLabel } from '../networkTelemetry';
import { routeEndpoint } from '../networkModel';
import {
  ageLabel,
  dependentRoutes,
  emptyFilter,
  endpointLabel,
  filterNetwork,
  routeFreshness,
  routeHistory,
  routeKinds,
} from '../operationalModel';

type Props = {
  options: PanelOptions;
  readings: Readings;
  referenceTime: number;
  timeRange: TimeRange;
  filter: NetworkFilter;
  onFilter: (filter: NetworkFilter) => void;
  view: NetworkView;
  expandedPops: string[];
  onRestore: (view: SavedNetworkView) => void;
  onOptionsChange: (options: PanelOptions) => void;
  onLocate: (id: string) => void;
  onDetails: (id: string) => void;
  queryError?: boolean;
};

export function OperationalConsole(props: Props) {
  const { options, readings, referenceTime, filter, onFilter, timeRange } = props;
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const [tab, setTab] = React.useState<'incidents' | 'filters' | 'history'>();
  const [collapsed, setCollapsed] = React.useState(props.view === 'topology');
  const [name, setName] = React.useState('');
  const [historyRoute, setHistoryRoute] = React.useState('');
  const filtered = React.useMemo(() => filterNetwork(options, filter, readings), [options, filter, readings]);
  const incidents = filtered.routes.filter((r) => routeStatus(r, readings) !== 'online');
  const failures = filtered.routes.filter((r) => routeStatus(r, readings) === 'down');
  const staleCount = options.routes.filter((r) => routeFreshness(r, readings).state === 'stale').length;
  const warning = incidents.some((r) => routeStatus(r, readings) === 'alert');
  const unknown = incidents.some((r) => routeStatus(r, readings) === 'unknown');
  const indicator = failures.length
    ? theme.colors.error.text
    : warning
      ? theme.colors.warning.text
      : unknown || !options.routes.length
        ? theme.colors.text.secondary
        : incidents.length
          ? theme.colors.info.text
          : theme.colors.success.text;
  const selectedHistory = options.routes.find((r) => r.id === historyRoute) ?? failures[0] ?? options.routes[0];
  const history =
    selectedHistory &&
    routeHistory(
      selectedHistory,
      readings,
      timeRange.from.valueOf(),
      Math.min(referenceTime, timeRange.to.valueOf()),
      (options.staleAfterSeconds ?? 300) * 1000
    );
  const active = filter.query || filter.popIds.length || filter.status !== 'all' || filter.kind !== 'all';
  const update = (patch: Partial<NetworkFilter>) => onFilter({ ...filter, ...patch });
  const date = (time?: number) =>
    time === undefined ? 'Sem horário de coleta' : new Date(time).toLocaleString('pt-BR');
  const incidentCard = (route: PanelOptions['routes'][number]) => {
    const status = routeStatus(route, readings);
    const freshness = routeFreshness(route, readings);
    const observed = routeHistory(
      route,
      readings,
      timeRange.from.valueOf(),
      referenceTime,
      (options.staleAfterSeconds ?? 300) * 1000
    );
    const ongoing = [...observed.incidents].reverse().find((i) => i.end === undefined);
    const affected = dependentRoutes(options, route.id);
    return (
      <article key={route.id} className={styles.card} style={{ borderLeftColor: statusColor(status, theme) }}>
        <div className={styles.row}>
          <strong>{route.name || 'Sem nome'}</strong>
          <span className={styles.badge} style={{ color: statusColor(status, theme) }}>
            {freshness.state === 'stale' && status !== 'maintenance' ? 'Dados antigos' : statusLabel[status]}
          </span>
        </div>
        <div className={styles.endpoints}>
          <span>{endpointLabel(routeEndpoint(route, 'source', options.pops), options)}</span>
          <span>↓ {endpointLabel(routeEndpoint(route, 'target', options.pops), options)}</span>
        </div>
        {status === 'down' && ongoing && (
          <div className={styles.duration}>
            <strong>
              {ongoing.boundedStart ? 'Pelo menos ' : ''}
              {ageLabel(referenceTime - ongoing.start)}
            </strong>
            <small>
              {ongoing.observed ? `Observada desde ${date(ongoing.start)}` : 'Histórico com lacunas; duração parcial'}
            </small>
          </div>
        )}
        {status === 'down' && !ongoing && <small>Início da falha não disponível no período consultado.</small>}
        <small>Última amostra: {date(freshness.time)}</small>
        {affected.length > 0 && (
          <details>
            <summary>{affected.length} rota(s) com dependência cadastrada</summary>
            <p>Possível impacto; confira as métricas de cada ligação.</p>
            {affected.map((r) => (
              <button key={r.id} className={styles.link} onClick={() => props.onDetails(r.id)}>
                {r.name} · {statusLabel[routeStatus(r, readings)]}
              </button>
            ))}
          </details>
        )}
        <div className={styles.row}>
          <Button size="sm" variant="secondary" onClick={() => props.onLocate(route.id)}>
            Localizar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => props.onDetails(route.id)}>
            Detalhes da rota
          </Button>
        </div>
      </article>
    );
  };
  return (
    <aside
      className={styles.console}
      aria-label="Operação da rede"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setTab(undefined);
          e.stopPropagation();
        }
      }}
    >
      <div className={cx(styles.row, styles.consoleHeader)}>
        <button className={styles.heading} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          <span style={{ color: indicator }}>●</span>{' '}
          {failures.length
            ? `${failures.length} rota(s) em falha`
            : unknown
              ? 'Dados indisponíveis'
              : 'Operação da rede'}{' '}
          <small>{collapsed ? 'Expandir' : 'Recolher'}</small>
        </button>
        <Button
          size="sm"
          variant={tab ? 'primary' : 'secondary'}
          aria-expanded={Boolean(tab)}
          onClick={() => setTab(tab ? undefined : 'incidents')}
        >
          Analisar rede
        </Button>
      </div>
      {props.queryError && <p role="alert">A consulta falhou. Os valores exibidos são da última resposta recebida.</p>}
      {!collapsed && !tab && (
        <>
          <div className={styles.row}>
            <small>
              {filtered.routes.length}/{options.routes.length} rotas · {staleCount} com dados antigos
            </small>
            {Boolean(active) && (
              <button className={styles.link} onClick={() => onFilter(emptyFilter())}>
                Limpar filtros
              </button>
            )}
          </div>
          {failures.length > 0 && (
            <div className={styles.preview} aria-label="Rotas em falha">
              {failures.map(incidentCard)}
            </div>
          )}
        </>
      )}
      {tab && (
        <div className={styles.drawer}>
          <div className={styles.row} role="group" aria-label="Análise da rede">
            {(['incidents', 'filters', 'history'] as const).map((id) => (
              <Button key={id} size="sm" variant={id === tab ? 'primary' : 'secondary'} onClick={() => setTab(id)}>
                {id === 'incidents' ? 'Incidentes' : id === 'filters' ? 'Filtros e visões' : 'Histórico'}
              </Button>
            ))}
          </div>
          {tab === 'incidents' && (
            <>
              <small>Falhas, alertas, manutenção e ausência de dados são apresentados separadamente.</small>
              {incidents.length ? incidents.map(incidentCard) : <p>Nenhuma ocorrência nos filtros atuais.</p>}
            </>
          )}
          {tab === 'filters' && (
            <>
              <label>
                Buscar rota, POP, região ou equipamento
                <input value={filter.query} onChange={(e) => update({ query: e.currentTarget.value })} />
              </label>
              <div className={styles.grid}>
                <label>
                  Status
                  <select
                    aria-label="Status"
                    value={filter.status}
                    onChange={(e) => update({ status: e.currentTarget.value })}
                  >
                    <option value="all">Todos</option>
                    {Object.entries(statusLabel).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                    <option value="stale">Dados antigos</option>
                  </select>
                </label>
                <label>
                  Tipo de ligação
                  <select
                    aria-label="Tipo de ligação"
                    value={filter.kind}
                    onChange={(e) => update({ kind: e.currentTarget.value })}
                  >
                    <option value="all">Todos</option>
                    {Object.entries(routeKinds).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset>
                <legend>POPs</legend>
                {options.pops.map((pop) => (
                  <label key={pop.id} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={filter.popIds.includes(pop.id)}
                      onChange={(e) =>
                        update({
                          popIds: e.currentTarget.checked
                            ? [...filter.popIds, pop.id]
                            : filter.popIds.filter((id) => id !== pop.id),
                        })
                      }
                    />
                    {pop.name}
                  </label>
                ))}
              </fieldset>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={filter.includeDependencies}
                  onChange={(e) => update({ includeDependencies: e.currentTarget.checked })}
                />
                Incluir rotas das quais a seleção depende
              </label>
              <Button variant="secondary" size="sm" onClick={() => onFilter(emptyFilter())}>
                Limpar filtros
              </Button>
              <label>
                Nome da visão
                <input
                  value={name}
                  maxLength={80}
                  placeholder="Ex.: Backbone — região sul"
                  onChange={(e) => setName(e.currentTarget.value)}
                />
              </label>
              <Button
                size="sm"
                disabled={!name.trim()}
                onClick={() => {
                  props.onOptionsChange({
                    ...options,
                    savedViews: [
                      ...(options.savedViews ?? []),
                      {
                        id: crypto.randomUUID(),
                        name: name.trim(),
                        filter: structuredClone(filter),
                        view: props.view,
                        expandedPops: props.expandedPops,
                      },
                    ],
                  });
                  setName('');
                }}
              >
                Salvar visão atual
              </Button>
              <small>As visões são opções deste painel. Salve o dashboard no Grafana para mantê-las.</small>
              {(options.savedViews ?? []).map((saved) => (
                <div key={saved.id} className={styles.row}>
                  <Button size="sm" variant="secondary" onClick={() => props.onRestore(saved)}>
                    {saved.name}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Excluir visão ${saved.name}`}
                    onClick={() =>
                      props.onOptionsChange({
                        ...options,
                        savedViews: options.savedViews?.filter((v) => v.id !== saved.id),
                      })
                    }
                  >
                    Excluir
                  </Button>
                </div>
              ))}
            </>
          )}
          {tab === 'history' && (
            <>
              <label>
                Rota
                <select
                  aria-label="Rota"
                  value={selectedHistory?.id ?? ''}
                  onChange={(e) => setHistoryRoute(e.currentTarget.value)}
                >
                  {options.routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Período consultado no Grafana · máximo entre amostras:{' '}
                {ageLabel((options.staleAfterSeconds ?? 300) * 1000)}.
              </small>
              {history && (
                <>
                  <div className={styles.grid}>
                    <div className={styles.stat}>
                      <small>Disponibilidade observada</small>
                      <strong>
                        {history.availability === undefined ? '—' : `${(history.availability * 100).toFixed(2)}%`}
                      </strong>
                    </div>
                    <div className={styles.stat}>
                      <small>Cobertura de dados</small>
                      <strong>{(history.coverage * 100).toFixed(1)}%</strong>
                    </div>
                    <div className={styles.stat}>
                      <small>Tempo observado em falha</small>
                      <strong>{ageLabel(history.downMs)}</strong>
                    </div>
                    <div className={styles.stat}>
                      <small>Tempo médio de recuperação</small>
                      <strong>{history.meanRepairMs === undefined ? '—' : ageLabel(history.meanRepairMs)}</strong>
                    </div>
                  </div>
                  <p>
                    Calculado somente com amostras recebidas. Lacunas não contam como disponibilidade. O tempo médio usa
                    apenas quedas e recuperações completas observadas; manutenção cadastrada não altera o histórico
                    bruto.
                  </p>
                  <ol className={styles.timeline}>
                    {history.incidents.map((event, index) => (
                      <li key={index}>
                        <strong>
                          {date(event.start)}
                          {event.boundedStart ? ' · início parcial' : ''}
                        </strong>
                        <small>
                          {event.end
                            ? `Recuperação: ${date(event.end)}`
                            : event.observed
                              ? 'Sem recuperação observada'
                              : 'Continuidade desconhecida'}{' '}
                          · {event.observed ? 'Amostras contínuas' : 'Lacuna de dados'}
                        </small>
                      </li>
                    ))}
                  </ol>
                  {!history.incidents.length && <p>Nenhuma queda observada no período.</p>}
                </>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function getStyles(t: GrafanaTheme2) {
  const border = `1px solid ${t.colors.border.weak}`;
  return {
    console: css({
      position: 'absolute',
      zIndex: 650,
      left: t.spacing(1.5),
      bottom: t.spacing(7),
      width: t.spacing(48),
      maxWidth: `calc(100% - ${t.spacing(3)})`,
      maxHeight: '62%',
      overflow: 'auto',
      padding: t.spacing(1.5),
      background: t.colors.background.primary,
      color: t.colors.text.primary,
      border,
      borderRadius: t.shape.radius.default,
      boxShadow: t.shadows.z2,
      fontFamily: t.typography.fontFamily,
      fontSize: t.typography.bodySmall.fontSize,
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
      'small, p': { color: t.colors.text.secondary },
      'input:not([type=checkbox]), select': {
        background: t.colors.background.secondary,
        color: t.colors.text.primary,
        border,
        borderRadius: t.shape.radius.default,
        padding: t.spacing(0.75),
        width: '100%',
        minWidth: 0,
        font: 'inherit',
      },
      label: { display: 'flex', flexDirection: 'column', gap: t.spacing(0.5) },
      'button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible': {
        outline: `2px solid ${t.colors.primary.text}`,
        outlineOffset: 2,
      },
      fieldset: { border, padding: t.spacing(1) },
    }),
    row: css({
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.spacing(1),
      flexWrap: 'wrap',
    }),
    consoleHeader: css({
      position: 'sticky',
      top: 0,
      zIndex: 2,
      background: t.colors.background.primary,
      paddingBottom: t.spacing(0.5),
    }),
    badge: css({
      background: t.colors.background.canvas,
      padding: t.spacing(0.25, 0.75),
      borderRadius: t.shape.radius.default,
      border: '1px solid currentColor',
    }),
    heading: css({
      border: 0,
      background: 'transparent',
      color: t.colors.text.primary,
      font: 'inherit',
      fontWeight: t.typography.fontWeightMedium,
      padding: 0,
      cursor: 'pointer',
      textAlign: 'left',
      small: { marginLeft: t.spacing(1) },
    }),
    drawer: css({ display: 'flex', flexDirection: 'column', gap: t.spacing(1.5) }),
    preview: css({
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
    }),
    card: css({
      border,
      borderLeftWidth: t.spacing(0.5),
      borderRadius: t.shape.radius.default,
      padding: t.spacing(1.5),
      background: t.colors.background.secondary,
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
      overflowWrap: 'anywhere',
      '> div:first-child strong': { fontSize: t.typography.body.fontSize },
      summary: { cursor: 'pointer' },
    }),
    endpoints: css({ display: 'flex', flexDirection: 'column', gap: t.spacing(0.5), color: t.colors.text.secondary }),
    duration: css({
      display: 'flex',
      flexDirection: 'column',
      strong: { fontSize: t.typography.h4.fontSize, fontVariantNumeric: 'tabular-nums' },
    }),
    link: css({
      border: 0,
      background: 'transparent',
      color: t.colors.primary.text,
      textAlign: 'left',
      cursor: 'pointer',
      padding: t.spacing(0.5),
      font: 'inherit',
    }),
    grid: css({ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: t.spacing(1) }),
    stat: css({
      background: t.colors.background.secondary,
      border,
      padding: t.spacing(1.5),
      borderRadius: t.shape.radius.default,
      strong: { display: 'block', fontSize: t.typography.h4.fontSize, fontVariantNumeric: 'tabular-nums' },
    }),
    check: css({ '&&': { flexDirection: 'row', alignItems: 'center' } }),
    timeline: css({ paddingLeft: t.spacing(2.5), li: { marginBottom: t.spacing(1.5), small: { display: 'block' } } }),
  };
}
