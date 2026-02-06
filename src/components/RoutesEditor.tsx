import React from 'react';
import { DataFrame, FieldType, SelectableValue, StandardEditorProps } from '@grafana/data';
import { Button, Field, InlineSwitch, Input, Modal, Select, Stack } from '@grafana/ui';

import {
  Route,
  RouteColors,
  RouteExtraMetric,
  RouteMetric,
  RoutePoint,
  TransportInterface,
  TransportInterfaceMetric,
  TransportTrunk,
} from '../types';
import { RouteDrawMap } from './RouteDrawMap';

const ALLOWED_METRIC_IDS = new Set(['download', 'upload']);
const DEFAULT_METRICS: RouteMetric[] = [
  { id: 'download', label: 'Download (Mbps)', description: 'Consumo de download da interface', enabled: false },
  { id: 'upload', label: 'Upload (Mbps)', description: 'Consumo de upload da interface', enabled: false },
];

const DEFAULT_COLORS: RouteColors = {
  online: '#10B981',
  alert: '#F59E0B',
  down: '#EF4444',
};

const createEmptyRoute = (): Route => ({
  id: `route-${Date.now()}`,
  name: '',
  distanceKm: undefined,
  interfaceItem: '',
  onlineValue: '1',
  metrics: DEFAULT_METRICS.map((m) => ({ ...m })),
  extraMetrics: [],
  trunks: [],
  thresholds: {
    enabled: true,
    rxLow: undefined,
    txLow: undefined,
    bandwidthHigh: undefined,
    flappingWindowMin: 15,
    flappingCount: 3,
  },
  colors: { ...DEFAULT_COLORS },
  points: [],
});

const cloneRoute = (route: Route): Route => ({
  ...route,
  metrics: route.metrics.filter((m) => ALLOWED_METRIC_IDS.has(m.id)).map((m) => ({ ...m })),
  extraMetrics: route.extraMetrics.map((m) => ({ ...m })),
  trunks: route.trunks?.map((trunk) => ({
    ...trunk,
    interfaces: trunk.interfaces.map((iface) => ({
      ...iface,
      metrics: iface.metrics?.map((metric) => ({ ...metric })) ?? [],
    })),
  })) ?? [],
  thresholds: { ...route.thresholds },
  colors: { ...route.colors },
  points: route.points.map((p) => ({ ...p })),
});

const toRad = (v: number) => (v * Math.PI) / 180;

const computeDistanceKm = (points: RoutePoint[]): number => {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const hav =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
    total += 6371 * c;
  }
  return total;
};

const buildArcPoints = (
  start: RoutePoint,
  end: RoutePoint,
  bend: number,
  side: 'left' | 'right',
  segments = 36
): RoutePoint[] => {
  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!length) {
    return [start, end];
  }
  const mid = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 };
  const nx = -dy / length;
  const ny = dx / length;
  const sign = side === 'left' ? 1 : -1;
  const offset = length * bend * 0.6;
  const control = {
    lat: mid.lat + ny * offset * sign,
    lng: mid.lng + nx * offset * sign,
  };

  const points: RoutePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push({
      lat: a * start.lat + b * control.lat + c * end.lat,
      lng: a * start.lng + b * control.lng + c * end.lng,
    });
  }
  return points;
};

const createEmptyTrunk = (): TransportTrunk => ({
  id: `trunk-${Date.now()}`,
  name: '',
  description: '',
  interfaces: [],
});

const createEmptyInterface = (): TransportInterface => ({
  id: `iface-${Date.now()}`,
  name: '',
  description: '',
  side: 'A',
  txItem: '',
  rxItem: '',
  rxTimeShift: '',
  showTx: true,
  showRx: true,
  metrics: [],
});

const createEmptyInterfaceMetric = (): TransportInterfaceMetric => ({
  id: `iface-metric-${Date.now()}`,
  label: '',
  description: '',
  item: '',
});

const buildZabbixItemOptions = (data?: DataFrame[]): Array<SelectableValue<string>> => {
  const options: Array<SelectableValue<string>> = [];
  const seen = new Set<string>();

  const addOption = (label?: string) => {
    const value = label?.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    options.push({ label: value, value });
  };

  data?.forEach((frame) => {
    addOption(frame.name);
    frame.fields?.forEach((field) => {
      if (field.type === FieldType.time) {
        return;
      }
      const label = field.config?.displayNameFromDS ?? field.config?.displayName ?? field.name;
      addOption(label);
    });
  });
  data?.forEach((frame) => {
    frame.fields?.forEach((field) => {
      if (field.type === FieldType.time) {
        return;
      }
      addOption(field.name);
    });
  });

  return options;
};

const getSelectValue = (
  value: string | undefined,
  options: Array<SelectableValue<string>>
): SelectableValue<string> | null => {
  if (!value) {
    return null;
  }
  return options.find((option) => option.value === value || option.label === value) ?? { label: value, value };
};

type Props = StandardEditorProps<Route[]>;

type State = {
  isRouteModalOpen: boolean;
  isDrawModalOpen: boolean;
  editingIndex: number | null;
  draftRoute: Route;
  drawBackupPoints: RoutePoint[];
  drawMode: 'path' | 'arc';
  arcStart: RoutePoint | null;
  arcEnd: RoutePoint | null;
  arcBend: number;
  arcSide: 'left' | 'right';
};

export class RoutesEditor extends React.PureComponent<Props, State> {
  state: State = {
    isRouteModalOpen: false,
    isDrawModalOpen: false,
    editingIndex: null,
    draftRoute: createEmptyRoute(),
    drawBackupPoints: [],
    drawMode: 'path',
    arcStart: null,
    arcEnd: null,
    arcBend: 0.35,
    arcSide: 'left',
  };

  get routes(): Route[] {
    return this.props.value ?? [];
  }

  updateRoutes = (routes: Route[]) => {
    this.props.onChange(routes);
  };

  openAddRoute = () => {
    this.setState({
      isRouteModalOpen: true,
      editingIndex: null,
      draftRoute: createEmptyRoute(),
      drawBackupPoints: [],
      drawMode: 'path',
      arcStart: null,
      arcEnd: null,
      arcBend: 0.35,
      arcSide: 'left',
    });
  };

  openEditRoute = (index: number) => {
    const route = this.routes[index];
    if (!route) {
      return;
    }
    this.setState({
      isRouteModalOpen: true,
      editingIndex: index,
      draftRoute: cloneRoute(route),
      drawBackupPoints: [],
      drawMode: 'path',
      arcStart: null,
      arcEnd: null,
      arcBend: 0.35,
      arcSide: 'left',
    });
  };

  closeRouteModal = () => {
    this.setState({ isRouteModalOpen: false, isDrawModalOpen: false, editingIndex: null });
  };

  saveRoute = () => {
    const { draftRoute, editingIndex } = this.state;
    const nextRoutes = [...this.routes];

    const distanceKm =
      draftRoute.distanceKm !== undefined ? draftRoute.distanceKm : computeDistanceKm(draftRoute.points);
    const routeToSave = { ...draftRoute, distanceKm };

    if (editingIndex === null) {
      nextRoutes.push(routeToSave);
    } else {
      nextRoutes[editingIndex] = routeToSave;
    }

    this.updateRoutes(nextRoutes);
    this.setState({ isRouteModalOpen: false, editingIndex: null });
  };

  deleteRoute = (index: number) => {
    const route = this.routes[index];
    if (!route) {
      return;
    }
    if (!confirm(`Excluir a rota "${route.name || 'Sem nome'}"?`)) {
      return;
    }
    const nextRoutes = this.routes.filter((_, i) => i !== index);
    this.updateRoutes(nextRoutes);
  };

  updateDraft = (partial: Partial<Route>) => {
    this.setState((prev) => ({ draftRoute: { ...prev.draftRoute, ...partial } }));
  };

  updateMetricToggle = (id: string, enabled: boolean) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        metrics: prev.draftRoute.metrics.map((m) => (m.id === id ? { ...m, enabled } : m)),
      },
    }));
  };

  updateMetricItem = (id: string, zabbixItem: string) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        metrics: prev.draftRoute.metrics.map((m) => (m.id === id ? { ...m, zabbixItem } : m)),
      },
    }));
  };

  addExtraMetric = () => {
    const metric: RouteExtraMetric = {
      id: `extra-${Date.now()}`,
      name: '',
      description: '',
      item: '',
      showInDetails: true,
    };
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        extraMetrics: [...prev.draftRoute.extraMetrics, metric],
      },
    }));
  };

  updateExtraMetric = (id: string, partial: Partial<RouteExtraMetric>) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        extraMetrics: prev.draftRoute.extraMetrics.map((m) => (m.id === id ? { ...m, ...partial } : m)),
      },
    }));
  };

  addTrunk = () => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: [...(prev.draftRoute.trunks ?? []), createEmptyTrunk()],
      },
    }));
  };

  updateTrunk = (trunkId: string, partial: Partial<TransportTrunk>) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId ? { ...trunk, ...partial } : trunk
        ),
      },
    }));
  };

  removeTrunk = (trunkId: string) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).filter((trunk) => trunk.id !== trunkId),
      },
    }));
  };

  addInterface = (trunkId: string) => {
    const iface = createEmptyInterface();
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId ? { ...trunk, interfaces: [...trunk.interfaces, iface] } : trunk
        ),
      },
    }));
  };

  updateInterface = (trunkId: string, ifaceId: string, partial: Partial<TransportInterface>) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId
            ? {
                ...trunk,
                interfaces: trunk.interfaces.map((iface) => (iface.id === ifaceId ? { ...iface, ...partial } : iface)),
              }
            : trunk
        ),
      },
    }));
  };

  removeInterface = (trunkId: string, ifaceId: string) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId
            ? {
                ...trunk,
                interfaces: trunk.interfaces.filter((iface) => iface.id !== ifaceId),
              }
            : trunk
        ),
      },
    }));
  };

  addInterfaceMetric = (trunkId: string, ifaceId: string) => {
    const metric = createEmptyInterfaceMetric();
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId
            ? {
                ...trunk,
                interfaces: trunk.interfaces.map((iface) =>
                  iface.id === ifaceId ? { ...iface, metrics: [...iface.metrics, metric] } : iface
                ),
              }
            : trunk
        ),
      },
    }));
  };

  updateInterfaceMetric = (
    trunkId: string,
    ifaceId: string,
    metricId: string,
    partial: Partial<TransportInterfaceMetric>
  ) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId
            ? {
                ...trunk,
                interfaces: trunk.interfaces.map((iface) =>
                  iface.id === ifaceId
                    ? {
                        ...iface,
                        metrics: iface.metrics.map((metric) =>
                          metric.id === metricId ? { ...metric, ...partial } : metric
                        ),
                      }
                    : iface
                ),
              }
            : trunk
        ),
      },
    }));
  };

  removeInterfaceMetric = (trunkId: string, ifaceId: string, metricId: string) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        trunks: (prev.draftRoute.trunks ?? []).map((trunk) =>
          trunk.id === trunkId
            ? {
                ...trunk,
                interfaces: trunk.interfaces.map((iface) =>
                  iface.id === ifaceId
                    ? { ...iface, metrics: iface.metrics.filter((metric) => metric.id !== metricId) }
                    : iface
                ),
              }
            : trunk
        ),
      },
    }));
  };

  removeExtraMetric = (id: string) => {
    this.setState((prev) => ({
      draftRoute: {
        ...prev.draftRoute,
        extraMetrics: prev.draftRoute.extraMetrics.filter((m) => m.id !== id),
      },
    }));
  };

  openDrawModal = () => {
    this.setState((prev) => ({
      isDrawModalOpen: true,
      drawBackupPoints: prev.draftRoute.points.map((p) => ({ ...p })),
      arcStart: null,
      arcEnd: null,
    }));
  };

  cancelDraw = () => {
    this.setState((prev) => ({
      isDrawModalOpen: false,
      draftRoute: { ...prev.draftRoute, points: prev.drawBackupPoints.map((p) => ({ ...p })) },
      drawBackupPoints: [],
      arcStart: null,
      arcEnd: null,
    }));
  };

  saveDraw = () => {
    this.setState({ isDrawModalOpen: false, drawBackupPoints: [] });
  };

  addDrawPoint = (point: RoutePoint) => {
    this.setState((prev) => {
      if (prev.drawMode !== 'arc') {
        return { ...prev, draftRoute: { ...prev.draftRoute, points: [...prev.draftRoute.points, point] } };
      }

      if (!prev.arcStart) {
        return {
          ...prev,
          arcStart: point,
          arcEnd: null,
          draftRoute: { ...prev.draftRoute, points: [point] },
        };
      }

      if (!prev.arcEnd) {
        const arcPoints = buildArcPoints(prev.arcStart, point, prev.arcBend, prev.arcSide);
        return {
          ...prev,
          arcEnd: point,
          draftRoute: { ...prev.draftRoute, points: arcPoints },
        };
      }

      return {
        ...prev,
        arcStart: point,
        arcEnd: null,
        draftRoute: { ...prev.draftRoute, points: [point] },
      };
    });
  };

  undoDrawPoint = () => {
    this.setState((prev) => {
      if (prev.drawMode !== 'arc') {
        return { ...prev, draftRoute: { ...prev.draftRoute, points: prev.draftRoute.points.slice(0, -1) } };
      }
      if (prev.arcEnd && prev.arcStart) {
        return {
          ...prev,
          arcEnd: null,
          draftRoute: { ...prev.draftRoute, points: [prev.arcStart] },
        };
      }
      return {
        ...prev,
        arcStart: null,
        arcEnd: null,
        draftRoute: { ...prev.draftRoute, points: [] },
      };
    });
  };

  clearDrawPoints = () => {
    this.setState((prev) => ({
      draftRoute: { ...prev.draftRoute, points: [] },
      arcStart: null,
      arcEnd: null,
    }));
  };

  updateArcSettings = (partial: Partial<Pick<State, 'arcBend' | 'arcSide'>>) => {
    this.setState((prev) => {
      const arcBend = partial.arcBend ?? prev.arcBend;
      const arcSide = partial.arcSide ?? prev.arcSide;
      if (prev.arcStart && prev.arcEnd) {
        const arcPoints = buildArcPoints(prev.arcStart, prev.arcEnd, arcBend, arcSide);
        return { ...prev, arcBend, arcSide, draftRoute: { ...prev.draftRoute, points: arcPoints } };
      }
      return { ...prev, arcBend, arcSide };
    });
  };

  renderRoutesList() {
    const routes = this.routes;
    return (
      <Stack direction="column" gap={1}>
        {routes.map((route, idx) => {
          const distance = route.distanceKm ?? computeDistanceKm(route.points);
          return (
            <Stack key={route.id} direction="row" gap={2} alignItems="center" justifyContent="space-between">
              <Stack direction="column" gap={0}>
                <div style={{ fontWeight: 600 }}>{route.name || 'Sem nome'}</div>
                <div style={{ fontSize: 12 }}>
                  {route.points.length} pontos • {distance.toFixed(2)} km
                </div>
              </Stack>
              <Stack direction="row" gap={1}>
                <Button size="sm" onClick={() => this.openEditRoute(idx)}>
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => this.deleteRoute(idx)}>
                  Excluir
                </Button>
              </Stack>
            </Stack>
          );
        })}
      </Stack>
    );
  }

  renderRouteModal() {
    const { isRouteModalOpen, draftRoute } = this.state;
    const distanceValue = draftRoute.distanceKm ?? '';
    const zabbixItemOptions = buildZabbixItemOptions(this.props.context?.data);

    return (
      <Modal
        title="Gerenciar rota"
        isOpen={isRouteModalOpen}
        onDismiss={this.closeRouteModal}
        className="jmap-route-modal"
        contentClassName="jmap-route-modal__content"
      >
        <style>
          {`
            .jmap-route-modal {
              width: min(1200px, 96vw);
              max-width: 96vw;
            }
            .jmap-route-modal__content {
              width: 100%;
              max-height: 82vh;
              overflow-y: auto;
            }
          `}
        </style>
        <Stack direction="column" gap={3}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Informacoes basicas</div>
            <Stack direction="column" gap={2}>
              <Field label="Nome da rota">
                <Input
                  value={draftRoute.name}
                  placeholder="Ex: Rota Principal SP-RJ"
                  onChange={(e) => this.updateDraft({ name: e.currentTarget.value })}
                />
              </Field>

              <Field label="Distancia (km)" description="Opcional. Se nao informado, sera calculado automaticamente.">
                <Input
                  type="number"
                  step={0.1}
                  placeholder="Ex: 450.5"
                  value={distanceValue}
                  onChange={(e) =>
                    this.updateDraft({
                      distanceKm: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                    })
                  }
                />
              </Field>

              <Field label="Interface monitorada *" description="Defina o item que indica quando a interface esta UP">
                <Select
                  options={zabbixItemOptions}
                  value={getSelectValue(draftRoute.interfaceItem, zabbixItemOptions)}
                  allowCustomValue
                  isClearable
                  placeholder="Selecione um item"
                  onChange={(option) => this.updateDraft({ interfaceItem: option?.value ?? '' })}
                  onCreateOption={(value) => this.updateDraft({ interfaceItem: value })}
                />
              </Field>

              <Field
                label="Valor considerado ONLINE *"
                description="Qual valor o item deve retornar para ser tratado como online."
              >
                <Input
                  value={draftRoute.onlineValue ?? ''}
                  placeholder="Ex: 1, up, operational"
                  onChange={(e) => this.updateDraft({ onlineValue: e.currentTarget.value })}
                />
              </Field>

              <div>
                <Button icon="map-marker" onClick={this.openDrawModal}>
                  Desenhar rota no mapa
                </Button>
              </div>
            </Stack>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Metricas monitoradas</div>
            <Stack direction="column" gap={1}>
              {draftRoute.metrics.filter((metric) => ALLOWED_METRIC_IDS.has(metric.id)).map((metric) => (
                <Stack key={metric.id} direction="column" gap={1}>
                  <Stack direction="row" gap={2} alignItems="center">
                    <Stack direction="column" gap={0}>
                      <div>{metric.label}</div>
                      {metric.description && <div style={{ fontSize: 12 }}>{metric.description}</div>}
                    </Stack>
                  </Stack>
                  <Field label="Item Zabbix" description="Selecione o item do Zabbix">
                    <Select
                      options={zabbixItemOptions}
                      value={getSelectValue(metric.zabbixItem, zabbixItemOptions)}
                      allowCustomValue
                      isClearable
                      placeholder="Selecione um item"
                      onChange={(option) => this.updateMetricItem(metric.id, option?.value ?? '')}
                      onCreateOption={(value) => this.updateMetricItem(metric.id, value)}
                    />
                  </Field>
                </Stack>
              ))}
            </Stack>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Trunks e interfaces</div>
            {(draftRoute.trunks ?? []).length === 0 ? (
              <div style={{ fontSize: 12, marginBottom: 8 }}>Nenhum trunk cadastrado</div>
            ) : (
              <Stack direction="column" gap={3}>
                {draftRoute.trunks.map((trunk) => (
                  <Stack key={trunk.id} direction="column" gap={2}>
                    <Stack direction="row" gap={2} alignItems="center">
                      <Input
                        placeholder="Nome do trunk"
                        value={trunk.name}
                        onChange={(e) => this.updateTrunk(trunk.id, { name: e.currentTarget.value })}
                      />
                      <Input
                        placeholder="Descricao"
                        value={trunk.description ?? ''}
                        onChange={(e) => this.updateTrunk(trunk.id, { description: e.currentTarget.value })}
                      />
                      <Button size="sm" variant="destructive" onClick={() => this.removeTrunk(trunk.id)}>
                        Remover trunk
                      </Button>
                    </Stack>

                    {trunk.interfaces.length === 0 ? (
                      <div style={{ fontSize: 12 }}>Nenhuma interface cadastrada</div>
                    ) : (
                      <Stack direction="column" gap={2}>
                        {trunk.interfaces.map((iface) => (
                          <Stack key={iface.id} direction="column" gap={1}>
                            <Stack direction="row" gap={2} alignItems="center">
                              <Input
                                placeholder="Interface (ex: TenGig0/0/1)"
                                value={iface.name}
                                onChange={(e) =>
                                  this.updateInterface(trunk.id, iface.id, { name: e.currentTarget.value })
                                }
                              />
                              <Select
                                options={[
                                  { label: 'Ponta A', value: 'A' },
                                  { label: 'Ponta B', value: 'B' },
                                  { label: 'Ponta C', value: 'C' },
                                  { label: 'Ponta D', value: 'D' },
                                  { label: 'Ponta E', value: 'E' },
                                ]}
                                value={
                                  iface.side
                                    ? { label: `Ponta ${iface.side}`, value: iface.side }
                                    : null
                                }
                                onChange={(option) =>
                                  this.updateInterface(trunk.id, iface.id, {
                                    side: option?.value as 'A' | 'B' | 'C' | 'D' | 'E',
                                  })
                                }
                                placeholder="Ponta"
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => this.removeInterface(trunk.id, iface.id)}
                              >
                                Remover
                              </Button>
                            </Stack>

                            <Stack direction="row" gap={2} alignItems="center">
                              <Field label="TX (dBm)">
                                <Select
                                  options={zabbixItemOptions}
                                  value={getSelectValue(iface.txItem, zabbixItemOptions)}
                                  allowCustomValue
                                  isClearable
                                  placeholder="Item TX"
                                  onChange={(option) =>
                                    this.updateInterface(trunk.id, iface.id, { txItem: option?.value ?? '' })
                                  }
                                  onCreateOption={(value) =>
                                    this.updateInterface(trunk.id, iface.id, { txItem: value })
                                  }
                                />
                              </Field>
                              <Field label="RX (dBm)">
                                <Select
                                  options={zabbixItemOptions}
                                  value={getSelectValue(iface.rxItem, zabbixItemOptions)}
                                  allowCustomValue
                                  isClearable
                                  placeholder="Item RX"
                                  onChange={(option) =>
                                    this.updateInterface(trunk.id, iface.id, { rxItem: option?.value ?? '' })
                                  }
                                  onCreateOption={(value) =>
                                    this.updateInterface(trunk.id, iface.id, { rxItem: value })
                                  }
                                />
                              </Field>
                            </Stack>

                            <div style={{ marginTop: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                                Metricas adicionais da interface
                              </div>
                              {(iface.metrics ?? []).length === 0 ? (
                                <div style={{ fontSize: 12, marginBottom: 6 }}>Nenhuma metrica configurada</div>
                              ) : (
                                <Stack direction="column" gap={2}>
                                  {(iface.metrics ?? []).map((metric) => (
                                    <Stack key={metric.id} direction="row" gap={2} alignItems="center">
                                      <Input
                                        placeholder="Nome da metrica"
                                        value={metric.label}
                                        onChange={(e) =>
                                          this.updateInterfaceMetric(trunk.id, iface.id, metric.id, {
                                            label: e.currentTarget.value,
                                          })
                                        }
                                      />
                                      <Select
                                        options={zabbixItemOptions}
                                        value={getSelectValue(metric.item, zabbixItemOptions)}
                                        allowCustomValue
                                        isClearable
                                        placeholder="Item"
                                        onChange={(option) =>
                                          this.updateInterfaceMetric(trunk.id, iface.id, metric.id, {
                                            item: option?.value ?? '',
                                          })
                                        }
                                        onCreateOption={(value) =>
                                          this.updateInterfaceMetric(trunk.id, iface.id, metric.id, { item: value })
                                        }
                                      />
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => this.removeInterfaceMetric(trunk.id, iface.id, metric.id)}
                                      >
                                        Remover
                                      </Button>
                                    </Stack>
                                  ))}
                                </Stack>
                              )}
                              <div style={{ marginTop: 6 }}>
                                <Button size="sm" onClick={() => this.addInterfaceMetric(trunk.id, iface.id)}>
                                  + Adicionar metrica
                                </Button>
                              </div>
                            </div>
                          </Stack>
                        ))}
                      </Stack>
                    )}

                    <div>
                      <Button size="sm" onClick={() => this.addInterface(trunk.id)}>
                        + Adicionar interface
                      </Button>
                    </div>
                  </Stack>
                ))}
              </Stack>
            )}
            <div style={{ marginTop: 8 }}>
              <Button onClick={this.addTrunk}>+ Adicionar trunk</Button>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Cores da rota</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Field label="Online">
                <Input
                  type="color"
                  value={draftRoute.colors.online}
                  onChange={(e) => this.updateDraft({ colors: { ...draftRoute.colors, online: e.currentTarget.value } })}
                  style={{ width: '100%', height: 42 }}
                />
              </Field>
              <Field label="Alerta">
                <Input
                  type="color"
                  value={draftRoute.colors.alert}
                  onChange={(e) => this.updateDraft({ colors: { ...draftRoute.colors, alert: e.currentTarget.value } })}
                  style={{ width: '100%', height: 42 }}
                />
              </Field>
              <Field label="Down">
                <Input
                  type="color"
                  value={draftRoute.colors.down}
                  onChange={(e) => this.updateDraft({ colors: { ...draftRoute.colors, down: e.currentTarget.value } })}
                  style={{ width: '100%', height: 42 }}
                />
              </Field>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Alertas inteligentes</div>
            <Stack direction="column" gap={2}>
              <Stack direction="row" gap={2} alignItems="center">
                <InlineSwitch
                  value={draftRoute.thresholds?.enabled ?? true}
                  onChange={(e) =>
                    this.updateDraft({
                      thresholds: { ...draftRoute.thresholds, enabled: e.currentTarget.checked },
                    })
                  }
                />
                <span>Ativar alertas por limiar</span>
              </Stack>
              <Stack direction="row" gap={2}>
                <Field label="RX minimo (dBm)">
                  <Input
                    type="number"
                    step="0.01"
                    value={draftRoute.thresholds?.rxLow ?? ''}
                    placeholder="Ex: -20"
                    onChange={(e) =>
                      this.updateDraft({
                        thresholds: {
                          ...draftRoute.thresholds,
                          rxLow: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="TX minimo (dBm)">
                  <Input
                    type="number"
                    step="0.01"
                    value={draftRoute.thresholds?.txLow ?? ''}
                    placeholder="Ex: -5"
                    onChange={(e) =>
                      this.updateDraft({
                        thresholds: {
                          ...draftRoute.thresholds,
                          txLow: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Uso de banda max (Mbps)">
                  <Input
                    type="number"
                    step="0.01"
                    value={draftRoute.thresholds?.bandwidthHigh ?? ''}
                    placeholder="Ex: 900"
                    onChange={(e) =>
                      this.updateDraft({
                        thresholds: {
                          ...draftRoute.thresholds,
                          bandwidthHigh: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                        },
                      })
                    }
                  />
                </Field>
              </Stack>
              <Stack direction="row" gap={2}>
                <Field label="Flapping: janela (min)">
                  <Input
                    type="number"
                    step="1"
                    value={draftRoute.thresholds?.flappingWindowMin ?? ''}
                    placeholder="Ex: 15"
                    onChange={(e) =>
                      this.updateDraft({
                        thresholds: {
                          ...draftRoute.thresholds,
                          flappingWindowMin:
                            e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Flapping: mudancas">
                  <Input
                    type="number"
                    step="1"
                    value={draftRoute.thresholds?.flappingCount ?? ''}
                    placeholder="Ex: 3"
                    onChange={(e) =>
                      this.updateDraft({
                        thresholds: {
                          ...draftRoute.thresholds,
                          flappingCount: e.currentTarget.value === '' ? undefined : Number(e.currentTarget.value),
                        },
                      })
                    }
                  />
                </Field>
              </Stack>
            </Stack>
          </div>

          <Modal.ButtonRow>
            <Button variant="secondary" onClick={this.closeRouteModal}>
              Cancelar
            </Button>
            <Button onClick={this.saveRoute}>
              Salvar rota
            </Button>
          </Modal.ButtonRow>
        </Stack>
      </Modal>
    );
  }

  renderDrawModal() {
    const { isDrawModalOpen, draftRoute, drawMode, arcBend, arcSide, arcStart, arcEnd } = this.state;
    const centerLat = this.props.context?.options?.centerLat ?? -23.5505;
    const centerLng = this.props.context?.options?.centerLng ?? -46.6333;
    const zoom = this.props.context?.options?.zoom ?? 12;
    const center: [number, number] = [centerLat, centerLng];
    const existingRoutes = this.routes
      .filter((route) => route.id !== draftRoute.id && route.points.length > 1)
      .map((route) => route.points);
    const existingPops = this.props.context?.options?.pops ?? [];

    return (
      <Modal title="Desenhar Rota no Mapa" isOpen={isDrawModalOpen} onDismiss={this.cancelDraw}>
        <Stack direction="column" gap={2}>
          <div>
            <strong>Instrucoes:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>Clique no mapa para adicionar pontos a rota</li>
              <li>A rota sera desenhada conectando os pontos na ordem</li>
              <li>Use \"Desfazer\" para remover o ultimo ponto</li>
              <li>Use \"Limpar\" para recomecar</li>
              <li>Minimo de 2 pontos necessarios</li>
            </ul>
            <div style={{ marginTop: 8 }}>
              <strong>Pontos adicionados: {draftRoute.points.length}</strong>
            </div>
          </div>

          <Stack direction="column" gap={1}>
            <Field label="Modo de desenho">
              <Select
                options={[
                  { label: 'Desenhar caminho', value: 'path' },
                  { label: 'Arco entre dois pontos', value: 'arc' },
                ]}
                value={{ label: drawMode === 'path' ? 'Desenhar caminho' : 'Arco entre dois pontos', value: drawMode }}
                onChange={(option) =>
                  this.setState({
                    drawMode: (option?.value as 'path' | 'arc') ?? 'path',
                    arcStart: null,
                    arcEnd: null,
                    draftRoute: { ...draftRoute, points: [] },
                  })
                }
              />
            </Field>
            {drawMode === 'arc' && (
              <Stack direction="row" gap={2} alignItems="flex-end">
                <Field label="Curvatura">
                  <Input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={arcBend}
                    onChange={(e) => this.updateArcSettings({ arcBend: Number(e.currentTarget.value) })}
                  />
                </Field>
                <Field label="Direcao do arco">
                  <Stack direction="row" gap={1}>
                    <Button
                      size="sm"
                      variant={arcSide === 'left' ? 'primary' : 'secondary'}
                      onClick={() => this.updateArcSettings({ arcSide: 'left' })}
                    >
                      Esquerda
                    </Button>
                    <Button
                      size="sm"
                      variant={arcSide === 'right' ? 'primary' : 'secondary'}
                      onClick={() => this.updateArcSettings({ arcSide: 'right' })}
                    >
                      Direita
                    </Button>
                  </Stack>
                </Field>
                <div style={{ fontSize: 12 }}>
                  {arcStart && !arcEnd ? 'Selecione o ponto final.' : arcStart && arcEnd ? 'Arco pronto.' : ''}
                </div>
              </Stack>
            )}
          </Stack>

          <div style={{ height: 360 }}>
            <RouteDrawMap
              center={center}
              zoom={zoom}
              points={draftRoute.points}
              existingRoutes={existingRoutes}
              pops={existingPops}
              onAddPoint={this.addDrawPoint}
            />
          </div>

          <Stack direction="row" gap={2} justifyContent="space-between">
            <Stack direction="row" gap={1}>
              <Button variant="secondary" onClick={this.undoDrawPoint} disabled={draftRoute.points.length === 0}>
                Desfazer
              </Button>
              <Button variant="secondary" onClick={this.clearDrawPoints} disabled={draftRoute.points.length === 0}>
                Limpar
              </Button>
            </Stack>
            <Stack direction="row" gap={1}>
              <Button variant="secondary" onClick={this.cancelDraw}>
                Cancelar
              </Button>
              <Button onClick={this.saveDraw} disabled={draftRoute.points.length < 2}>
                Salvar ({draftRoute.points.length} pontos)
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Modal>
    );
  }

  render() {
    return (
      <Stack direction="column" gap={2}>
        <div>
          <Button onClick={this.openAddRoute}>Adicionar Rota</Button>
        </div>

        {this.routes.length > 0 && this.renderRoutesList()}

        {this.renderRouteModal()}
        {this.renderDrawModal()}
      </Stack>
    );
  }
}
