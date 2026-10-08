import React from 'react';
import L from 'leaflet';
import { css, cx } from '@emotion/css';
import { GrafanaTheme2, LoadingState, PanelProps } from '@grafana/data';
import { Button, Icon, useStyles2, useTheme2 } from '@grafana/ui';
import { PanelOptions, NetworkView, NetworkFilter, Route } from '../types';
import {
  alignEquipment,
  snapPoint,
  connectNodes,
  moveNode,
  networkNodes,
  organizeTopology,
  routeEndpoint,
  routePath,
  updateRoutePath,
} from '../networkModel';
import { topologyNodes, topologyPaths } from '../networkPresentation';
import { equipmentStatus, popStatus, routeStatus, statusColor, statusLabel } from '../networkTelemetry';
import { NetworkCanvas, EditTool } from './NetworkCanvas';
import { MapView } from './MapView';
import { OperationalConsole } from './OperationalConsole';
import { useOperationalReadings } from './useOperationalReadings';
import {
  dependencyError,
  connectionError,
  emptyFilter,
  filterNetwork,
  endpointLabel,
  routeKinds,
} from '../operationalModel';

export function NetworkPanel({ options, onOptionsChange, data, timeRange, timeZone, width }: PanelProps<PanelOptions>) {
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const [filter, setFilter] = React.useState<NetworkFilter>(emptyFilter);
  const [snap, setSnap] = React.useState(true);
  const [fromPort, setFromPort] = React.useState('');
  const [toPort, setToPort] = React.useState('');
  const [portName, setPortName] = React.useState('');
  const [view, setView] = React.useState<NetworkView>(options.viewMode ?? 'map');
  const [draft, setDraft] = React.useState<PanelOptions>();
  const [history, setHistory] = React.useState<PanelOptions[]>([]);
  const [future, setFuture] = React.useState<PanelOptions[]>([]);
  const [base, setBase] = React.useState('');
  const [tool, setTool] = React.useState<EditTool>('move');
  const [selection, setSelection] = React.useState<{ kind: 'node' | 'route'; id: string }>();
  const [fullDetails, setFullDetails] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [inventory, setInventory] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [bindRoute, setBindRoute] = React.useState('');
  const [fromId, setFromId] = React.useState('');
  const [toId, setToId] = React.useState('');
  const [expandedPops, setExpandedPops] = React.useState<Set<string>>(new Set());
  const map = React.useRef<L.Map>();
  const root = React.useRef<HTMLDivElement>(null);
  const editing = Boolean(draft);
  const current = draft ?? options;
  const nodes = React.useMemo(() => networkNodes(current, view), [current, view]);
  const expanded = React.useMemo(
    () => (editing ? new Set((current.pops ?? []).map((p) => p.id)) : expandedPops),
    [editing, current.pops, expandedPops]
  );
  const visibleNodes = React.useMemo(
    () => (view === 'topology' ? topologyNodes(nodes, expanded) : nodes),
    [view, nodes, expanded]
  );
  const displayPaths = React.useMemo(
    () => topologyPaths(current, nodes, expanded, editing),
    [current, nodes, expanded, editing]
  );
  const { readings, referenceTime } = useOperationalReadings(data, timeRange, current.staleAfterSeconds, timeZone);
  const filtered = React.useMemo(
    () => (editing ? current : filterNetwork(current, filter, readings)),
    [current, filter, readings, editing]
  );
  const displayedNodes = React.useMemo(
    () => nodes.filter((n) => filtered.pops.some((p) => p.id === n.pop.id)),
    [nodes, filtered.pops]
  );
  const grid = view === 'topology' && snap ? (current.topologyGridSize ?? 20) : 0;
  const routes = current.routes ?? [];
  const routeCounts = React.useMemo(() => {
    const counts = { online: 0, alert: 0, down: 0, unknown: 0, maintenance: 0 };
    for (const route of current.routes ?? []) {
      counts[routeStatus(route, readings)]++;
    }
    return counts;
  }, [current.routes, readings]);
  const togglePop = (id: string) =>
    setExpandedPops((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const selectRoute = (id: string) => {
    const route = routes.find((r) => r.id === id);
    if (route && view === 'topology') {
      const source = routeEndpoint(route, 'source', current.pops);
      const target = routeEndpoint(route, 'target', current.pops);
      if (source?.popId === target?.popId && source) {
        setExpandedPops((previous) => new Set([...previous, source.popId]));
      }
    }
    setSelection({ kind: 'route', id });
  };
  const selectedNode = selection?.kind === 'node' ? nodes.find((n) => n.id === selection.id) : undefined;
  const selectedRoute = selection?.kind === 'route' ? routes.find((r) => r.id === selection.id) : undefined;
  const conflicting = Boolean(draft && JSON.stringify(options) !== base);
  const unbound =
    view === 'topology' ? routes.filter((r) => routePath(r, current, view, nodes).length === 0).length : 0;
  React.useEffect(() => {
    setView(options.viewMode ?? 'map');
  }, [options.viewMode]);
  React.useEffect(() => {
    if (!options.captureNow || !map.current || (view === 'map' && !draft)) {
      return;
    }
    const center = map.current.getCenter();
    onOptionsChange({
      ...options,
      captureNow: false,
      ...(view === 'map' ? { centerLat: center.lat, centerLng: center.lng, zoom: map.current.getZoom() } : {}),
    });
  }, [options, onOptionsChange, view, draft]);
  React.useEffect(() => {
    if (!editing) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing]);
  const change = (next: PanelOptions) => {
    if (!draft || next === draft) {
      return;
    }
    setHistory((past) => [...past.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setMessage('Alterações em rascunho');
  };
  const start = () => {
    setDraft(structuredClone(options));
    setBase(JSON.stringify(options));
    setHistory([]);
    setFuture([]);
    setMessage('Arraste os itens ou use as ferramentas para editar.');
  };
  const cancel = () => {
    setDraft(undefined);
    setHistory([]);
    setFuture([]);
    setTool('move');
    setSelection(undefined);
    setBindRoute('');
    setFromPort('');
    setToPort('');
    setMessage('Edição cancelada.');
  };
  const apply = () => {
    if (!draft || conflicting) {
      return;
    }
    onOptionsChange({ ...draft, viewMode: view });
    setDraft(undefined);
    setHistory([]);
    setFuture([]);
    setTool('move');
    setMessage('Alterações aplicadas ao painel. Salve o dashboard no Grafana para mantê-las.');
  };
  const undo = () => {
    if (draft && history.length) {
      setFuture((next) => [draft, ...next]);
      setDraft(history[history.length - 1]);
      setHistory((past) => past.slice(0, -1));
    }
  };
  const redo = () => {
    if (draft && future.length) {
      setHistory((past) => [...past, draft]);
      setDraft(future[0]);
      setFuture((next) => next.slice(1));
    }
  };
  const connect = (sourceId: string, targetId: string, usePorts = false) => {
    const source = nodes.find((n) => n.id === sourceId);
    const target = nodes.find((n) => n.id === targetId);
    if (!draft || !source || !target || sourceId === targetId) {
      return;
    }
    const from = { ...source.endpoint, ...(usePorts && fromPort ? { portId: fromPort } : {}) };
    const to = { ...target.endpoint, ...(usePorts && toPort ? { portId: toPort } : {}) };
    const error = connectionError(draft, from, bindRoute) || connectionError(draft, to, bindRoute);
    if (error) {
      setMessage(error);
      return;
    }
    const next = connectNodes(
      draft,
      from,
      to,
      { online: theme.colors.success.text, alert: theme.colors.warning.text, down: theme.colors.error.text },
      bindRoute || undefined
    );
    change(next);
    const route = bindRoute ? next.routes.find((r) => r.id === bindRoute) : next.routes[next.routes.length - 1];
    if (route) {
      setSelection({ kind: 'route', id: route.id });
    }
    setMessage(
      bindRoute ? 'Extremidades da rota vinculadas.' : 'Conexão criada. Configure as métricas em Cadastro de Rotas.'
    );
    setBindRoute('');
    setFromPort('');
    setToPort('');
  };
  const updateRoute = (patch: Partial<Route>) => {
    if (!selectedRoute) {
      return;
    }
    if (patch.dependsOnRouteIds) {
      const error = dependencyError(current, selectedRoute.id, patch.dependsOnRouteIds);
      if (error) {
        setMessage(error);
        return;
      }
    }
    change({ ...current, routes: routes.map((r) => (r.id === selectedRoute.id ? { ...r, ...patch } : r)) });
  };
  const fit = () => {
    if (!map.current || !nodes.length) {
      return;
    }
    const points: L.LatLngTuple[] = visibleNodes.map((node) => [
      view === 'map' ? node.position.y : -node.position.y,
      node.position.x,
    ]);
    routes.forEach((route) =>
      (view === 'topology' ? (displayPaths.get(route.id) ?? []) : routePath(route, current, view, nodes)).forEach((p) =>
        points.push([view === 'map' ? p.y : -p.y, p.x])
      )
    );
    map.current.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [100, 200],
      paddingBottomRight: [100, 120],
      maxZoom: view === 'map' ? 14 : 0,
    });
  };
  const selectedStatus = selectedRoute
    ? routeStatus(selectedRoute, readings)
    : selectedNode?.equipment
      ? equipmentStatus(selectedNode.equipment, readings)
      : selectedNode
        ? popStatus(selectedNode.pop, readings)
        : 'unknown';
  const value = (item?: string) => (item ? readings.get(item.trim())?.text : undefined) ?? '—';
  const routeMetric = (id: string) => value(selectedRoute?.metrics.find((m) => m.id === id)?.zabbixItem);
  const endpointName = (side: 'source' | 'target') => {
    if (!selectedRoute) {
      return '';
    }
    const endpoint = routeEndpoint(selectedRoute, side, current.pops);
    return endpointLabel(endpoint, current);
  };
  const compact = width < 760;
  if (view === 'map' && !editing) {
    return (
      <div ref={root} className={styles.root} data-testid="jmap-workspace">
        <MapView
          options={options}
          onOptionsChange={onOptionsChange}
          data={data}
          timeRange={timeRange}
          timeZone={timeZone}
          filter={filter}
          onFilter={setFilter}
          onRestore={(saved) => {
            setFilter(saved.filter);
            setView(saved.view);
            setExpandedPops(new Set(saved.expandedPops));
            setSelection(undefined);
          }}
          tools={
            <div className={styles.mapControls} role="group" aria-label="Modo de exibição">
              <Button variant="primary" aria-pressed>
                Mapa
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setView('topology');
                  setSelection(undefined);
                }}
              >
                Topologia
              </Button>
              <Button variant="secondary" icon="edit" onClick={start}>
                Editar layout
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  return (
    <div
      ref={root}
      className={cx(styles.root, compact && styles.compact)}
      data-testid="jmap-workspace"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setFullDetails(false);
          setSelection(undefined);
        }
      }}
    >
      <header className={styles.header}>
        <div className={styles.actions} role="group" aria-label="Modo de exibição">
          <button
            className={cx(styles.tab, view === 'map' && styles.active)}
            aria-pressed={view === 'map'}
            onClick={() => {
              setView('map');
              setSelection(undefined);
            }}
          >
            <Icon name="globe" /> Mapa
          </button>
          <button
            className={cx(styles.tab, view === 'topology' && styles.active)}
            aria-pressed={view === 'topology'}
            onClick={() => {
              setView('topology');
              setSelection(undefined);
            }}
          >
            <Icon name="share-alt" /> Topologia
          </button>
        </div>
        <div className={styles.actions}>
          {editing ? (
            <>
              <Button variant="secondary" onClick={cancel}>
                Cancelar
              </Button>
              <Button onClick={apply} disabled={conflicting}>
                Aplicar alterações
              </Button>
            </>
          ) : (
            <Button variant="secondary" icon="edit" onClick={start}>
              Editar layout
            </Button>
          )}
        </div>
      </header>
      {conflicting && (
        <div className={styles.notice} role="alert">
          As opções foram alteradas fora do editor. Cancele este rascunho e reabra a edição para evitar sobrescrever
          essas alterações.
        </div>
      )}
      {data.state === LoadingState.Error && (
        <div className={styles.notice} role="alert">
          Falha na consulta. Os valores disponíveis podem estar desatualizados; confira a fonte de dados.
        </div>
      )}
      <div className={styles.workarea}>
        <main className={styles.stage} aria-label={view === 'map' ? 'Mapa da rede' : 'Topologia da rede'}>
          <NetworkCanvas
            key={view}
            options={filtered}
            view={view}
            nodes={displayedNodes}
            readings={readings}
            editing={editing}
            tool={tool}
            selectedNode={selectedNode?.id}
            selectedRoute={selectedRoute?.id}
            onSelectNode={(id) => setSelection({ kind: 'node', id })}
            onSelectRoute={(id) => setSelection({ kind: 'route', id })}
            onMove={(node, p) => change(moveNode(current, node.endpoint, snapPoint(p, grid), view))}
            onPath={(id, points) =>
              change(
                updateRoutePath(
                  current,
                  id,
                  points.map((p, i) => (i > 0 && i < points.length - 1 ? snapPoint(p, grid) : p)),
                  view
                )
              )
            }
            onConnect={(source, target) => connect(source.id, target.id)}
            onReady={(ready) => {
              map.current = ready;
            }}
            expanded={expanded}
            onTogglePop={togglePop}
          />
          {!editing && !selection && (
            <OperationalConsole
              options={current}
              queryError={data.state === LoadingState.Error}
              readings={readings}
              referenceTime={referenceTime}
              timeRange={timeRange}
              filter={filter}
              onFilter={setFilter}
              view={view}
              expandedPops={[...expandedPops]}
              onRestore={(saved) => {
                setFilter(saved.filter);
                setView(saved.view);
                setExpandedPops(new Set(saved.expandedPops));
              }}
              onOptionsChange={onOptionsChange}
              onLocate={(id) => {
                selectRoute(id);
                const path = routePath(routes.find((r) => r.id === id)!, current, view, nodes);
                if (path.length) {
                  map.current?.fitBounds(L.latLngBounds(path.map((p) => [-p.y, p.x] as L.LatLngTuple)), {
                    padding: [180, 200],
                    maxZoom: 0,
                  });
                }
              }}
              onDetails={(id) => {
                selectRoute(id);
                setFullDetails(true);
              }}
            />
          )}
          {view === 'topology' && !editing && (
            <div className={styles.overview} aria-label="Resumo da rede">
              <div>
                <small>POPs</small>
                <strong>{current.pops?.length ?? 0}</strong>
              </div>
              <div>
                <small>Equipamentos</small>
                <strong>{current.pops?.reduce((n, p) => n + p.equipments.length, 0) ?? 0}</strong>
              </div>
              <div>
                <small>Rotas</small>
                <strong>{routes.length}</strong>
              </div>
              <div>
                <small>Em falha</small>
                <strong style={{ color: statusColor('down', theme) }}>{routeCounts.down}</strong>
              </div>
              <div>
                <small>Em alerta</small>
                <strong style={{ color: statusColor('alert', theme) }}>{routeCounts.alert}</strong>
              </div>
              {routeCounts.unknown > 0 && (
                <div>
                  <small>Sem dados</small>
                  <strong>{routeCounts.unknown}</strong>
                </div>
              )}
            </div>
          )}
          <div
            className={styles.tools}
            style={{ top: theme.spacing(editing ? 10 : 18) }}
            role="toolbar"
            aria-label="Ferramentas da rede"
          >
            <Button
              variant={inventory ? 'primary' : 'secondary'}
              icon="list-ul"
              aria-label="Listar equipamentos e rotas"
              onClick={() => setInventory(!inventory)}
            />
            {editing && (
              <>
                {(['move', 'connect', 'route'] as const).map((t) => (
                  <Button
                    key={t}
                    variant={tool === t ? 'primary' : 'secondary'}
                    aria-pressed={tool === t}
                    onClick={() => setTool(t)}
                  >
                    {t === 'move' ? 'Mover' : t === 'connect' ? 'Conectar' : 'Ajustar rota'}
                  </Button>
                ))}
                <Button
                  variant="secondary"
                  icon="corner-up-left"
                  aria-label="Desfazer"
                  disabled={!history.length}
                  onClick={undo}
                />
                <Button
                  variant="secondary"
                  icon="corner-up-right"
                  aria-label="Refazer"
                  disabled={!future.length}
                  onClick={redo}
                />
                {view === 'topology' && (
                  <Button variant={snap ? 'primary' : 'secondary'} aria-pressed={snap} onClick={() => setSnap(!snap)}>
                    Grade {current.topologyGridSize ?? 20}
                  </Button>
                )}
                {view === 'topology' && (
                  <Button
                    variant="secondary"
                    icon="layer-group"
                    disabled={!nodes.length}
                    onClick={() => {
                      const organized = organizeTopology(
                        current,
                        parseFloat(theme.spacing(29)),
                        parseFloat(theme.spacing(20))
                      );
                      change(organized);
                      setMessage('Grupos organizados em rascunho. Os desvios manuais das rotas foram mantidos.');
                      setSelection(undefined);
                      // Use the next committed draft for fitting, after Leaflet receives the positions.
                      requestAnimationFrame(() =>
                        map.current?.fitBounds(
                          L.latLngBounds(
                            networkNodes(organized, 'topology').map(
                              (node) => [-node.position.y, node.position.x] as L.LatLngTuple
                            )
                          ),
                          { paddingTopLeft: [125, 200], paddingBottomRight: [125, 120], maxZoom: 0 }
                        )
                      );
                    }}
                  >
                    Organizar grupos
                  </Button>
                )}
              </>
            )}
            {view === 'topology' && !editing && (
              <Button
                variant="secondary"
                icon="layer-group"
                onClick={() => {
                  setExpandedPops(expandedPops.size ? new Set() : new Set(current.pops.map((p) => p.id)));
                  setSelection(undefined);
                }}
              >
                {expandedPops.size ? 'Recolher POPs' : 'Expandir POPs'}
              </Button>
            )}
            <Button variant="secondary" icon="expand-arrows" onClick={fit}>
              Enquadrar
            </Button>
          </div>
          {nodes.length === 0 && (
            <div className={styles.empty}>
              <Icon name="map-marker" size="xxl" />
              <h3>Sua rede começa aqui</h3>
              <p>Cadastre os POPs e seus equipamentos nas opções do painel.</p>
              <p>Depois, organize as posições e conecte os itens em Editar layout.</p>
            </div>
          )}
          {inventory && (
            <aside
              className={styles.inventory}
              style={{ top: theme.spacing(editing ? 16 : 24) }}
              aria-label="Inventário da rede"
            >
              <div className={styles.inventoryHeader}>
                <strong>Inventário</strong>
                <Button
                  variant="secondary"
                  icon="times"
                  aria-label="Fechar inventário"
                  onClick={() => setInventory(false)}
                />
              </div>
              <input
                aria-label="Buscar na rede"
                placeholder="Buscar equipamento ou rota"
                value={search}
                onChange={(e) => setSearch(e.currentTarget.value)}
              />
              <h6>Equipamentos e POPs</h6>
              {nodes
                .filter((n) => `${n.name} ${n.pop.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
                .map((node) => (
                  <button
                    key={node.id}
                    onClick={() => {
                      setSelection({ kind: 'node', id: node.id });
                      if (node.equipment) {
                        setExpandedPops((previous) => new Set([...previous, node.pop.id]));
                      }
                      map.current?.panTo([view === 'map' ? node.position.y : -node.position.y, node.position.x]);
                    }}
                  >
                    <strong>{node.name}</strong>
                    <small>{node.equipment ? node.pop.name : 'POP'}</small>
                  </button>
                ))}
              <h6>Rotas</h6>
              {routes
                .filter((r) => r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
                .map((route) => (
                  <button key={route.id} onClick={() => selectRoute(route.id)}>
                    <strong>{route.name}</strong>
                    <small style={{ color: statusColor(routeStatus(route, readings), theme) }}>
                      {statusLabel[routeStatus(route, readings)]}
                    </small>
                  </button>
                ))}
            </aside>
          )}
          {editing && tool === 'connect' && (
            <div className={styles.connectBar}>
              <label>
                Rota
                <select
                  aria-label="Rota para conectar"
                  value={bindRoute}
                  onChange={(e) => setBindRoute(e.currentTarget.value)}
                >
                  <option value="">Criar nova rota</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      Vincular: {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Origem
                <select
                  aria-label="Origem da conexão"
                  value={fromId}
                  onChange={(e) => {
                    setFromId(e.currentTarget.value);
                    setFromPort('');
                  }}
                >
                  <option value="">Selecione</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.pop.name} / {n.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destino
                <select
                  aria-label="Destino da conexão"
                  value={toId}
                  onChange={(e) => {
                    setToId(e.currentTarget.value);
                    setToPort('');
                  }}
                >
                  <option value="">Selecione</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.pop.name} / {n.name}
                    </option>
                  ))}
                </select>
              </label>
              {[
                { id: fromId, port: fromPort, set: setFromPort, label: 'Porta de origem' },
                { id: toId, port: toPort, set: setToPort, label: 'Porta de destino' },
              ].map((side) => {
                const equipment = nodes.find((n) => n.id === side.id)?.equipment;
                return (
                  Boolean(equipment?.ports?.length) && (
                    <label key={side.label}>
                      {side.label}
                      <select value={side.port} onChange={(e) => side.set(e.currentTarget.value)}>
                        <option value="">Sem porta específica</option>
                        {equipment?.ports?.map((port) => (
                          <option key={port.id} value={port.id}>
                            {port.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                );
              })}
              <Button
                disabled={!nodes.some((n) => n.id === fromId) || !nodes.some((n) => n.id === toId) || fromId === toId}
                onClick={() => connect(fromId, toId, true)}
              >
                Conectar itens
              </Button>
            </div>
          )}
          <div className={styles.zoom}>
            <Button
              variant="secondary"
              icon="minus"
              aria-label="Diminuir zoom"
              onClick={() => map.current?.zoomOut()}
            />
            <Button variant="secondary" icon="plus" aria-label="Aumentar zoom" onClick={() => map.current?.zoomIn()} />
            <Button
              variant="secondary"
              icon="expand-arrows"
              aria-label="Tela cheia"
              onClick={() => {
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                } else {
                  void root.current?.requestFullscreen();
                }
              }}
            />
          </div>
        </main>
        {(selectedRoute || selectedNode) && !(editing && tool === 'connect') && (
          <section className={styles.inspector} aria-label="Detalhes da seleção">
            <div className={styles.detailTitle}>
              <div>
                <small>
                  {selectedRoute
                    ? 'ROTA SELECIONADA'
                    : selectedNode?.equipment
                      ? selectedNode.pop.name
                      : 'PONTO DE PRESENÇA'}
                </small>
                <h3>{selectedRoute?.name ?? selectedNode?.name}</h3>
                <span style={{ color: statusColor(selectedStatus, theme) }}>{statusLabel[selectedStatus]}</span>
              </div>
              <Button
                variant="secondary"
                icon="times"
                aria-label="Fechar detalhes"
                onClick={() => setSelection(undefined)}
              />
            </div>
            <div className={styles.metrics}>
              {(selectedRoute
                ? [
                    ['Capacidade', selectedRoute.capacityManualText || '—'],
                    ['RX', routeMetric('rx')],
                    ['TX', routeMetric('tx')],
                    ['Download', routeMetric('download')],
                    ['Upload', routeMetric('upload')],
                  ]
                : selectedNode?.equipment
                  ? [
                      [
                        'CPU',
                        selectedNode.equipment.cpuShow !== false ? value(selectedNode.equipment.cpuItem) : 'Oculto',
                      ],
                      [
                        'Memória',
                        selectedNode.equipment.memoryShow !== false
                          ? value(selectedNode.equipment.memoryItem)
                          : 'Oculto',
                      ],
                      [
                        'Temperatura',
                        selectedNode.equipment.temperatureShow !== false
                          ? value(selectedNode.equipment.temperatureItem)
                          : 'Oculto',
                      ],
                      [
                        'Uptime',
                        selectedNode.equipment.uptimeShow !== false
                          ? value(selectedNode.equipment.uptimeItem)
                          : 'Oculto',
                      ],
                    ]
                  : [
                      ['Equipamentos', String(selectedNode?.pop.equipments.length ?? 0)],
                      ['Latitude', selectedNode?.pop.lat.toFixed(5) ?? '—'],
                      ['Longitude', selectedNode?.pop.lng.toFixed(5) ?? '—'],
                    ]
              ).map(([label, content]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{content}</strong>
                </div>
              ))}
            </div>
            {selectedRoute && (
              <div className={styles.endpointInfo}>
                <div>
                  <small>Origem</small>
                  <strong>{endpointName('source')}</strong>
                </div>
                <div>
                  <small>Destino</small>
                  <strong>{endpointName('target')}</strong>
                </div>
                <small>As extremidades reais são mantidas quando os POPs estão recolhidos.</small>
              </div>
            )}
            {selectedNode && !selectedNode.equipment && !editing && (
              <>
                <Button
                  variant="secondary"
                  icon="layer-group"
                  onClick={() => {
                    togglePop(selectedNode.pop.id);
                    setSelection(undefined);
                  }}
                >
                  {expandedPops.has(selectedNode.pop.id) ? 'Recolher equipamentos' : 'Expandir equipamentos'}
                </Button>
                <div className={styles.equipmentList} aria-label="Equipamentos deste POP">
                  {selectedNode.pop.equipments.map((equipment) => (
                    <button
                      key={equipment.id}
                      onClick={() => {
                        setExpandedPops((previous) => new Set([...previous, selectedNode.pop.id]));
                        setSelection({ kind: 'node', id: JSON.stringify([selectedNode.pop.id, equipment.id]) });
                      }}
                    >
                      <strong>{equipment.name}</strong>
                      <span style={{ color: statusColor(equipmentStatus(equipment, readings), theme) }}>
                        {statusLabel[equipmentStatus(equipment, readings)]}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {editing && selectedNode && (
              <div className={styles.endpointInfo}>
                {view === 'topology' && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(
                          selectedNode.equipment
                            ? selectedNode.equipment.topologyLocked
                            : selectedNode.pop.topologyLocked
                        )}
                        onChange={(e) => {
                          const locked = e.currentTarget.checked;
                          change({
                            ...current,
                            pops: current.pops.map((p) =>
                              p.id !== selectedNode.pop.id
                                ? p
                                : selectedNode.equipment
                                  ? {
                                      ...p,
                                      equipments: p.equipments.map((item) =>
                                        item.id === selectedNode.equipment!.id
                                          ? { ...item, topologyLocked: locked }
                                          : item
                                      ),
                                    }
                                  : { ...p, topologyLocked: locked }
                            ),
                          });
                        }}
                      />
                      Bloquear posição
                    </label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => change(alignEquipment(current, selectedNode.pop.id, 'horizontal'))}
                    >
                      Alinhar equipamentos na horizontal
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => change(alignEquipment(current, selectedNode.pop.id, 'vertical'))}
                    >
                      Alinhar equipamentos na vertical
                    </Button>
                  </>
                )}
                {!selectedNode.equipment && (
                  <label>
                    Região
                    <input
                      value={selectedNode.pop.region ?? ''}
                      onChange={(e) => {
                        const region = e.currentTarget.value;
                        change({
                          ...current,
                          pops: current.pops.map((p) => (p.id === selectedNode.pop.id ? { ...p, region } : p)),
                        });
                      }}
                    />
                  </label>
                )}
                {selectedNode.equipment && (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedNode.equipment.maintenance)}
                        onChange={(e) => {
                          const maintenance = e.currentTarget.checked;
                          change({
                            ...current,
                            pops: current.pops.map((p) =>
                              p.id !== selectedNode.pop.id
                                ? p
                                : {
                                    ...p,
                                    equipments: p.equipments.map((item) =>
                                      item.id === selectedNode.equipment!.id ? { ...item, maintenance } : item
                                    ),
                                  }
                            ),
                          });
                        }}
                      />
                      Equipamento em manutenção
                    </label>
                    <strong>Portas cadastradas</strong>
                    {(selectedNode.equipment.ports ?? []).map((port) => (
                      <small key={port.id}>{port.name}</small>
                    ))}
                    <label>
                      Nome da porta
                      <input value={portName} onChange={(e) => setPortName(e.currentTarget.value)} />
                    </label>
                    <Button
                      size="sm"
                      disabled={
                        !portName.trim() || selectedNode.equipment.ports?.some((p) => p.name === portName.trim())
                      }
                      onClick={() => {
                        const port = { id: crypto.randomUUID(), name: portName.trim() };
                        change({
                          ...current,
                          pops: current.pops.map((p) =>
                            p.id !== selectedNode.pop.id
                              ? p
                              : {
                                  ...p,
                                  equipments: p.equipments.map((item) =>
                                    item.id === selectedNode.equipment!.id
                                      ? { ...item, ports: [...(item.ports ?? []), port] }
                                      : item
                                  ),
                                }
                          ),
                        });
                        setPortName('');
                      }}
                    >
                      Adicionar porta
                    </Button>
                  </>
                )}
              </div>
            )}
            {editing && selectedRoute && (
              <div className={styles.endpointInfo}>
                <label>
                  Tipo de ligação
                  <select
                    value={selectedRoute.kind ?? 'transport'}
                    onChange={(e) => updateRoute({ kind: e.currentTarget.value as Route['kind'] })}
                  >
                    {Object.entries(routeKinds).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedRoute.maintenance)}
                    onChange={(e) => updateRoute({ maintenance: e.currentTarget.checked })}
                  />
                  Rota em manutenção
                </label>
                <strong>Depende das rotas</strong>
                <small>Cadastre apenas dependências reais. Ciclos não são permitidos.</small>
                {routes
                  .filter((r) => r.id !== selectedRoute.id)
                  .map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={selectedRoute.dependsOnRouteIds?.includes(r.id) ?? false}
                        onChange={(e) =>
                          updateRoute({
                            dependsOnRouteIds: e.currentTarget.checked
                              ? [...(selectedRoute.dependsOnRouteIds ?? []), r.id]
                              : (selectedRoute.dependsOnRouteIds?.filter((id) => id !== r.id) ?? []),
                          })
                        }
                      />
                      {r.name}
                    </label>
                  ))}
                {(['source', 'target'] as const).map((side) => {
                  const endpoint = routeEndpoint(selectedRoute, side, current.pops);
                  const equipment = current.pops
                    .find((p) => p.id === endpoint?.popId)
                    ?.equipments.find((e) => e.id === endpoint?.equipmentId);
                  return (
                    equipment &&
                    endpoint && (
                      <label key={side}>
                        Porta {side === 'source' ? 'de origem' : 'de destino'}
                        <select
                          value={endpoint.portId ?? ''}
                          onChange={(e) => {
                            const next = { ...endpoint, portId: e.currentTarget.value || undefined };
                            const error = connectionError(current, next, selectedRoute.id);
                            if (error) {
                              setMessage(error);
                            } else {
                              updateRoute({ [side]: next });
                            }
                          }}
                        >
                          <option value="">Sem porta específica</option>
                          {equipment.ports?.map((port) => (
                            <option key={port.id} value={port.id}>
                              {port.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )
                  );
                })}
              </div>
            )}
            {editing && selectedRoute && (
              <div className={styles.actions}>
                <label>
                  Nome da rota
                  <input
                    aria-label="Nome da rota"
                    value={selectedRoute.name}
                    onChange={(e) =>
                      change({
                        ...current,
                        routes: routes.map((r) =>
                          r.id === selectedRoute.id ? { ...r, name: e.currentTarget.value } : r
                        ),
                      })
                    }
                  />
                </label>
                <Button variant="secondary" onClick={() => setTool('route')}>
                  Ajustar caminho
                </Button>
                <Button
                  variant="secondary"
                  disabled={routePath(selectedRoute, current, view, nodes).length < 3}
                  onClick={() => {
                    const path = routePath(selectedRoute, current, view, nodes);
                    change(updateRoutePath(current, selectedRoute.id, [path[0], path[path.length - 1]], view));
                  }}
                >
                  Limpar desvios
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    change({
                      ...current,
                      routes: routes
                        .filter((r) => r.id !== selectedRoute.id)
                        .map((r) => ({
                          ...r,
                          dependsOnRouteIds: r.dependsOnRouteIds?.filter((id) => id !== selectedRoute.id),
                        })),
                    });
                    setSelection(undefined);
                  }}
                >
                  Excluir rota
                </Button>
              </div>
            )}
            {!editing && (
              <Button variant="secondary" onClick={() => setFullDetails(true)}>
                Detalhes completos
              </Button>
            )}
          </section>
        )}
        <footer className={styles.footer}>
          <span role="status">
            {message ||
              (editing
                ? tool === 'connect'
                  ? 'Puxe de um item até outro ou selecione origem e destino.'
                  : tool === 'route'
                    ? 'Selecione uma rota e clique nela para inserir pontos. Arraste os pontos; duplo clique remove.'
                    : 'Arraste os itens para posicionar.'
                : data.state === LoadingState.Loading
                  ? 'Atualizando dados…'
                  : 'Selecione um POP ou uma rota. Expanda um POP para ver seus equipamentos.')}
          </span>
          {unbound > 0 && <span>{unbound} rota(s) sem extremidades vinculadas. Use Conectar → Vincular.</span>}
          <div className={styles.legend}>
            {(['online', 'alert', 'down', 'unknown', 'maintenance'] as const).map((s) => (
              <span key={s} style={{ color: statusColor(s, theme) }}>
                {statusLabel[s]}
              </span>
            ))}
          </div>
        </footer>
        {fullDetails && (
          <div className={styles.fullDetails} role="dialog" aria-label="Detalhes completos da rede" aria-modal="true">
            <Button autoFocus variant="secondary" onClick={() => setFullDetails(false)}>
              Voltar à rede
            </Button>
            <div className={styles.legacy}>
              <MapView
                options={current}
                onOptionsChange={onOptionsChange}
                data={data}
                timeRange={timeRange}
                timeZone={timeZone}
                initialRouteId={selectedRoute?.id}
                initialPopId={selectedNode?.pop.id}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStyles(t: GrafanaTheme2) {
  const border = `1px solid ${t.colors.border.weak}`;
  return {
    root: css({
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto',
      position: 'relative',
      background: t.colors.background.canvas,
      color: t.colors.text.primary,
      fontFamily: t.typography.fontFamily,
      fontSize: t.typography.body.fontSize,
      'input:not([type=checkbox]), select': {
        background: t.colors.background.primary,
        color: t.colors.text.primary,
        border,
        borderRadius: t.shape.radius.default,
        padding: t.spacing(0.75),
        minHeight: t.spacing(4.5),
        fontFamily: t.typography.fontFamily,
        fontSize: t.typography.body.fontSize,
        lineHeight: t.typography.body.lineHeight,
        minWidth: 0,
        maxWidth: '100%',
      },
      label: {
        display: 'flex',
        flexDirection: 'column',
        gap: t.spacing(0.5),
        fontSize: t.typography.bodySmall.fontSize,
      },
      'label:has(> input[type=checkbox])': { flexDirection: 'row', alignItems: 'center', gap: t.spacing(1) },
      'input[type=checkbox]': {
        width: t.spacing(2),
        height: t.spacing(2),
        minHeight: 0,
        margin: 0,
        padding: 0,
        flexShrink: 0,
      },
      'button:focus-visible, input:focus-visible, select:focus-visible': {
        outline: `2px solid ${t.colors.primary.text}`,
        outlineOffset: t.spacing(0.25),
      },
    }),
    mapControls: css({
      display: 'flex',
      flexWrap: 'wrap',
      gap: t.spacing(0.5),
      background: t.colors.background.primary,
      padding: t.spacing(0.75),
      border,
      borderRadius: t.shape.radius.default,
      boxShadow: t.shadows.z1,
    }),
    header: css({
      position: 'absolute',
      zIndex: 700,
      top: t.spacing(1.5),
      right: t.spacing(1.5),
      left: t.spacing(1.5),
      background: t.colors.background.primary,
      borderRadius: t.shape.radius.default,
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: t.spacing(1.5),
      padding: t.spacing(1),
      border: border,
    }),
    actions: css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing(1) }),
    tab: css({
      display: 'flex',
      alignItems: 'center',
      gap: t.spacing(0.75),
      background: t.colors.background.secondary,
      color: t.colors.text.secondary,
      border,
      borderRadius: t.shape.radius.default,
      padding: t.spacing(1, 2),
      cursor: 'pointer',
    }),
    active: css({
      color: t.colors.primary.text,
      background: t.colors.primary.transparent,
      borderColor: t.colors.primary.border,
    }),
    workarea: css({
      position: 'relative',
      flex: '1 0 auto',
      minHeight: t.spacing(48),
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      margin: 0,
      border: 0,
      borderRadius: t.shape.radius.default,
      overflow: 'hidden',
    }),
    stage: css({ position: 'relative', flex: '1 0 auto', minHeight: t.spacing(40) }),
    tools: css({
      position: 'absolute',
      zIndex: 500,
      top: t.spacing(18),
      left: t.spacing(1.5),
      right: t.spacing(1.5),
      display: 'flex',
      flexWrap: 'wrap',
      gap: t.spacing(0.75),
      pointerEvents: 'none',
      '> *': { pointerEvents: 'auto' },
    }),
    zoom: css({
      position: 'absolute',
      zIndex: 500,
      bottom: t.spacing(7),
      right: t.spacing(1.5),
      display: 'flex',
      gap: t.spacing(0.5),
    }),
    empty: css({
      position: 'absolute',
      zIndex: 400,
      inset: '25% 10%',
      textAlign: 'center',
      padding: t.spacing(3),
      background: t.colors.background.primary,
      borderRadius: t.shape.radius.default,
    }),
    inspector: css({
      position: 'absolute',
      zIndex: 550,
      bottom: t.spacing(7),
      top: t.spacing(10),
      width: t.spacing(43),
      maxWidth: '45%',
      right: t.spacing(2),
      overflowY: 'auto',
      borderRadius: t.shape.radius.default,
      boxShadow: t.shadows.z2,
      padding: t.spacing(2),
      background: t.colors.background.primary,
      borderTop: border,
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1.5),
    }),
    detailTitle: css({
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: t.spacing(1),
      h3: { margin: t.spacing(0.5, 0), fontSize: t.typography.h4.fontSize },
      small: { color: t.colors.text.secondary },
    }),
    metrics: css({
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: t.spacing(2),
      '> div': { paddingLeft: t.spacing(1.5), borderLeft: border, minWidth: 0 },
      small: { color: t.colors.text.secondary },
      strong: {
        display: 'block',
        fontSize: t.typography.h4.fontSize,
        fontWeight: t.typography.fontWeightMedium,
        overflowWrap: 'anywhere',
        fontVariantNumeric: 'tabular-nums',
      },
    }),
    overview: css({
      position: 'absolute',
      zIndex: 500,
      top: t.spacing(10),
      left: t.spacing(1.5),
      display: 'flex',
      flexWrap: 'wrap',
      gap: t.spacing(2.5),
      maxWidth: 'calc(100% - 24px)',
      padding: t.spacing(1, 1.5),
      border,
      background: t.colors.background.primary,
      borderRadius: t.shape.radius.default,
      boxShadow: t.shadows.z1,
      '> div': { display: 'flex', alignItems: 'baseline', gap: t.spacing(1) },
      small: { color: t.colors.text.secondary, fontSize: t.typography.bodySmall.fontSize },
      strong: { fontSize: t.typography.h5.fontSize, fontVariantNumeric: 'tabular-nums' },
    }),
    endpointInfo: css({
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
      '> div': { display: 'flex', flexDirection: 'column', gap: t.spacing(0.5) },
      small: { color: t.colors.text.secondary, fontSize: t.typography.bodySmall.fontSize },
      strong: { overflowWrap: 'anywhere', fontSize: t.typography.bodySmall.fontSize },
    }),
    equipmentList: css({
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(0.5),
      button: {
        display: 'flex',
        flexDirection: 'column',
        gap: t.spacing(0.5),
        border,
        borderRadius: t.shape.radius.default,
        padding: t.spacing(1),
        background: t.colors.background.secondary,
        color: t.colors.text.primary,
        cursor: 'pointer',
        textAlign: 'left',
        '&:hover': { borderColor: t.colors.primary.border },
      },
      span: { fontSize: t.typography.bodySmall.fontSize },
    }),
    inventory: css({
      position: 'absolute',
      zIndex: 600,
      top: t.spacing(24),
      bottom: t.spacing(7),
      left: t.spacing(1.5),
      width: t.spacing(32),
      maxWidth: '85%',
      overflow: 'auto',
      background: t.colors.background.primary,
      border,
      borderRadius: t.shape.radius.default,
      padding: t.spacing(1.5),
      boxShadow: t.shadows.z2,
      input: { width: '100%' },
      h6: { margin: t.spacing(2, 0, 1) },
      '> button': {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: t.spacing(0.5),
        border: 0,
        borderBottom: border,
        background: 'transparent',
        color: t.colors.text.primary,
        textAlign: 'left',
        padding: t.spacing(1),
        cursor: 'pointer',
        '&:hover': { background: t.colors.action.hover },
        small: { color: t.colors.text.secondary },
      },
    }),
    inventoryHeader: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing(1),
      marginBottom: t.spacing(1),
    }),
    connectBar: css({
      position: 'absolute',
      zIndex: 500,
      left: t.spacing(1.5),
      bottom: t.spacing(7),
      right: t.spacing(16),
      display: 'flex',
      alignItems: 'flex-end',
      flexWrap: 'wrap',
      gap: t.spacing(1),
      background: t.colors.background.primary,
      border,
      borderRadius: t.shape.radius.default,
      padding: t.spacing(1),
      label: { flex: '1 1 100px' },
    }),
    notice: css({
      position: 'absolute',
      zIndex: 800,
      top: t.spacing(8),
      left: 0,
      right: 0,
      margin: t.spacing(0, 2, 1),
      padding: t.spacing(1),
      background: t.colors.warning.transparent,
      color: t.colors.warning.text,
    }),
    footer: css({
      position: 'absolute',
      zIndex: 500,
      bottom: 0,
      left: 0,
      right: 0,
      background: t.colors.background.primary,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: t.spacing(1),
      padding: t.spacing(1.5, 2),
      fontSize: t.typography.bodySmall.fontSize,
      color: t.colors.text.secondary,
    }),
    legend: css({ display: 'flex', gap: t.spacing(1.5) }),
    fullDetails: css({
      position: 'absolute',
      zIndex: 1500,
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: t.spacing(1),
      padding: t.spacing(1),
      background: t.colors.background.canvas,
    }),
    legacy: css({ flex: 1, minHeight: t.spacing(40) }),
    compact: css({
      'section[aria-label="Detalhes da seleção"]': {
        top: 'auto',
        left: t.spacing(1),
        right: t.spacing(1),
        width: 'auto',
        maxWidth: 'none',
        maxHeight: '45%',
        bottom: t.spacing(7),
      },
    }),
  };
}
