import React from 'react';
import { ConfiguredMapView } from './ConfiguredMapView';
import { FireLayer } from './FireLayer';
import { FireMonitoring } from './useFireMonitoring';
import { RainMonitoring } from './useRainMonitoring';
import { RainLayer } from './RainLayer';
import { normalizePopIconUrl } from '../iconUrl';
import { ViewportCapture } from './ViewportCapture';
import L from 'leaflet';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, useTheme2 } from '@grafana/ui';
import {
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CanvasPoint, MapProvider, NetworkView, PanelOptions, Route } from '../types';
import { NetworkNode, insertBend, routeEndpoint, routePath } from '../networkModel';
import { topologyNodes, topologyPaths } from '../networkPresentation';
import { MapRouteAnchor, MapRouteLayout } from '../legacyTopology';
import { Readings, equipmentStatus, popStatus, routeStatus, statusColor, statusLabel } from '../networkTelemetry';

export type EditTool = 'move' | 'connect' | 'route';
type Props = {
  options: PanelOptions;
  fire: FireMonitoring;
  rain: RainMonitoring;
  view: NetworkView;
  nodes: NetworkNode[];
  readings: Readings;
  editing: boolean;
  tool: EditTool;
  selectedRoute?: string;
  selectedNode?: string;
  onSelectRoute: (id: string) => void;
  onSelectNode: (id: string) => void;
  onMove: (node: NetworkNode, point: CanvasPoint) => void;
  onPath: (id: string, points: CanvasPoint[]) => void;
  onConnect: (source: NetworkNode, target: NetworkNode) => void;
  onReady: (map: L.Map) => void;
  expanded: ReadonlySet<string>;
  onTogglePop: (id: string) => void;
  mapRouteLayout: MapRouteLayout;
  onMoveMapAnchor: (anchor: MapRouteAnchor, point: CanvasPoint) => void;
};

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const latLng = (p: CanvasPoint, view: NetworkView): L.LatLngTuple => [view === 'map' ? p.y : -p.y, p.x];
const point = (p: L.LatLng, view: NetworkView): CanvasPoint => ({ x: p.lng, y: view === 'map' ? p.lat : -p.lat });

export function tileConfig(provider: MapProvider) {
  const google: Record<string, string> = {
    google_roadmap: 'm',
    google_satellite: 's',
    google_hybrid: 'y',
    google_terrain: 'p',
  };
  if (google[provider]) {
    return {
      url: `https://mt{s}.google.com/vt/lyrs=${google[provider]}&x={x}&y={y}&z={z}`,
      subdomains: ['0', '1', '2', '3'],
      attribution: 'Google',
    };
  }
  const carto: Record<string, string> = {
    carto_light: 'light_all',
    carto_dark: 'dark_all',
    carto_voyager: 'rastertiles/voyager',
  };
  if (carto[provider]) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/${carto[provider]}/{z}/{x}/{y}{r}.png`,
      subdomains: ['a', 'b', 'c', 'd'],
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    };
  }
  return {
    url:
      provider === 'osm_hot'
        ? 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; OpenStreetMap contributors',
  };
}

function MapLifecycle({
  onReady,
  view,
  initialNodes,
  onPointer,
  onCancel,
  onZoom,
}: {
  onReady: Props['onReady'];
  view: NetworkView;
  initialNodes: Array<Pick<NetworkNode, 'id' | 'position'>>;
  onPointer: (p: CanvasPoint) => void;
  onCancel: () => void;
  onZoom: (zoom: number) => void;
}) {
  const map = useMap();
  const initial = React.useRef(initialNodes);
  React.useEffect(() => {
    initial.current = initialNodes;
  }, [initialNodes]);
  const nodeSignature = initialNodes.map((node) => node.id).join('|');
  const ready = React.useRef(onReady);
  useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
    mousemove: (e) => onPointer(point(e.latlng, view)),
    click: (e) => {
      if (!(e.originalEvent.target as Element)?.closest('.jmap-node')) {
        onCancel();
      }
    },
  });
  React.useEffect(() => {
    ready.current(map);
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(map.getContainer());
    return () => resize.disconnect();
  }, [map, view]);
  React.useEffect(() => {
    if (view === 'topology' && initial.current.length) {
      map.fitBounds(L.latLngBounds(initial.current.map((n) => latLng(n.position, view))), {
        paddingTopLeft: [125, 200],
        paddingBottomRight: [125, 120],
        maxZoom: 0,
        animate: false,
      });
    }
  }, [map, view, nodeSignature]);
  return null;
}

export function NetworkCanvas(props: Props) {
  const {
    options,
    view,
    nodes,
    readings,
    editing,
    tool,
    selectedRoute,
    selectedNode,
    onSelectRoute,
    onSelectNode,
    onMove,
    onPath,
    onConnect,
    onReady,
    expanded,
    onTogglePop,
    mapRouteLayout,
    onMoveMapAnchor,
  } = props;
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const [connection, setConnection] = React.useState<NetworkNode>();
  const connectionRef = React.useRef<NetworkNode>();
  const suppressClick = React.useRef(false);
  const [pointer, setPointer] = React.useState<CanvasPoint>();
  const [viewport, setViewport] = React.useState<L.LatLngBounds>();
  const [zoom, setZoom] = React.useState(0);
  const mapRef = React.useRef<L.Map>();
  const visibleNodes = React.useMemo(
    () => (view === 'topology' ? topologyNodes(nodes, expanded) : nodes),
    [nodes, expanded, view]
  );
  const paths = React.useMemo(
    () => new Map([...topologyPaths(options, nodes, expanded, editing), ...mapRouteLayout.paths]),
    [options, nodes, expanded, editing, mapRouteLayout.paths]
  );
  const mapAnchors = React.useMemo(
    () => mapRouteLayout.anchors.filter((anchor) => options.routes.some((route) => route.id === anchor.routeId)),
    [mapRouteLayout.anchors, options.routes]
  );
  const groups = React.useMemo(() => {
    const index = new Map(
      (options.pops ?? []).map((pop) => [pop.id, { pop, members: [] as NetworkNode[], localRoutes: [] as Route[] }])
    );
    nodes.forEach((node) => index.get(node.pop.id)?.members.push(node));
    (options.routes ?? []).forEach((route) => {
      const source = routeEndpoint(route, 'source', options.pops);
      const target = routeEndpoint(route, 'target', options.pops);
      if (source && target && source.popId === target.popId) {
        index.get(source.popId)?.localRoutes.push(route);
      }
    });
    return index;
  }, [options.pops, options.routes, nodes]);
  const cancel = React.useCallback(() => {
    connectionRef.current = undefined;
    setConnection(undefined);
    setPointer(undefined);
  }, []);
  React.useEffect(() => {
    cancel();
  }, [editing, tool, view, cancel]);
  React.useEffect(() => {
    const map = mapRef.current;
    if (editing && tool === 'connect') {
      map?.dragging.disable();
    } else {
      map?.dragging.enable();
    }
    return () => {
      map?.dragging.enable();
    };
  }, [editing, tool]);
  const tile = tileConfig(options.mapProvider);
  const markerScale = view === 'topology' ? Math.min(1, 2 ** zoom) : 1;
  const handleSize = parseFloat(theme.spacing(1.5));
  const handleIcon = L.divIcon({
    className: styles.handle,
    iconSize: [handleSize, handleSize],
    iconAnchor: [handleSize / 2, handleSize / 2],
  });
  const finishConnection = (node: NetworkNode) => {
    const from = connectionRef.current;
    if (from && from.id !== node.id) {
      onConnect(from, node);
      suppressClick.current = true;
      cancel();
    }
  };
  return (
    <div className={styles.container} data-testid="network-canvas" data-view={view}>
      <MapContainer
        key={view}
        crs={view === 'map' ? L.CRS.EPSG3857 : L.CRS.Simple}
        center={view === 'map' ? [options.centerLat, options.centerLng] : [-350, 550]}
        zoom={view === 'map' ? options.zoom : 0}
        zoomSnap={view === 'topology' ? 0.1 : 1}
        minZoom={view === 'map' ? 1 : -4}
        maxZoom={view === 'map' ? 20 : 2}
        zoomControl={false}
        doubleClickZoom={false}
        className={`${styles.map} ${view === 'topology' ? styles.topology : options.mapTone !== 'original' && !['google_satellite', 'google_hybrid', 'carto_dark'].includes(options.mapProvider) ? styles.muted : ''}`}
      >
        <ViewportCapture onBounds={setViewport} />
        {view === 'map' && <ConfiguredMapView lat={options.centerLat} lng={options.centerLng} zoom={options.zoom} />}
        <MapLifecycle
          view={view}
          initialNodes={view === 'topology' ? [...visibleNodes, ...mapAnchors] : visibleNodes}
          onPointer={(p) => {
            if (connectionRef.current) {
              setPointer(p);
            }
          }}
          onCancel={cancel}
          onZoom={setZoom}
          onReady={(map) => {
            mapRef.current = map;
            onReady(map);
            if (editing && tool === 'connect') {
              map.dragging.disable();
            }
          }}
        />
        {view === 'map' && <TileLayer {...tile} maxZoom={20} />}
        {view === 'topology' && (
          <Pane name="jmap-groups" style={{ zIndex: 250, pointerEvents: 'none' }}>
            {[...groups.values()]
              .filter(({ pop, members }) => expanded.has(pop.id) && members.length > 1)
              .map(({ pop, members }) => {
                const paddingX = parseFloat(theme.spacing(16));
                const paddingY = parseFloat(theme.spacing(9));
                const left = Math.min(...members.map((n) => n.position.x)) - paddingX;
                const right = Math.max(...members.map((n) => n.position.x)) + paddingX;
                const top = Math.min(...members.map((n) => n.position.y)) - paddingY;
                const bottom = Math.max(...members.map((n) => n.position.y)) + paddingY;
                return (
                  <Rectangle
                    key={pop.id}
                    bounds={[
                      [-bottom, left],
                      [-top, right],
                    ]}
                    interactive={false}
                    pathOptions={{
                      color: theme.colors.border.medium,
                      weight: 1,
                      fillColor: theme.colors.background.secondary,
                      fillOpacity: 0.65,
                      className: styles.group,
                    }}
                  />
                );
              })}
          </Pane>
        )}
        {(options.routes ?? []).map((route) => {
          const path = view === 'topology' ? (paths.get(route.id) ?? []) : routePath(route, options, view, nodes);
          if (
            path.length < 2 ||
            (!editing &&
              route.id !== selectedRoute &&
              viewport &&
              !viewport.intersects(L.latLngBounds(path.map((p) => latLng(p, view)))))
          ) {
            return null;
          }
          const status = routeStatus(route, readings);
          const color =
            route.id === selectedRoute
              ? theme.colors.primary.text
              : status === 'unknown' || status === 'maintenance'
                ? statusColor(status, theme)
                : (route.colors?.[status] ?? statusColor(status, theme));
          const click = (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e.originalEvent);
            onSelectRoute(route.id);
            if (editing && tool === 'route' && selectedRoute === route.id) {
              onPath(route.id, insertBend(path, point(e.latlng, view)));
            }
          };
          return (
            <React.Fragment key={route.id}>
              <Polyline
                positions={path.map((p) => latLng(p, view))}
                interactive={false}
                pathOptions={{
                  color: theme.colors.background.canvas,
                  opacity: 0.85,
                  weight: (options.transportLineWeight ?? 3) + 4,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              <Polyline
                positions={path.map((p) => latLng(p, view))}
                pathOptions={{
                  color,
                  weight: options.transportLineWeight ?? 3,
                  lineCap: 'round',
                  lineJoin: 'round',
                  dashArray: status === 'down' || status === 'unknown' ? '6 8' : undefined,
                  className:
                    options.transportLineAnimation !== 'static' && status === 'online' ? styles.flow : undefined,
                  ...(options.transportLineAnimation !== 'static' && status === 'online' ? { dashArray: '14 8' } : {}),
                }}
                eventHandlers={{ click }}
              >
                <Tooltip className={styles.tooltip} sticky direction="top">
                  <strong>{route.name}</strong>
                  <br />
                  {statusLabel[status]}
                  {route.capacityManualText && <> · {route.capacityManualText}</>}
                </Tooltip>
              </Polyline>
              <Polyline
                positions={path.map((p) => latLng(p, view))}
                pathOptions={{ color, opacity: 0, weight: 18 }}
                eventHandlers={{ click }}
              />
              {editing &&
                tool === 'route' &&
                selectedRoute === route.id &&
                path.map((p, i) =>
                  i === 0 || i === path.length - 1 ? null : (
                    <Marker
                      key={`${route.id}-${i}`}
                      position={latLng(p, view)}
                      icon={handleIcon}
                      draggable
                      title={`Ponto ${i} de ${route.name}. Duplo clique para remover.`}
                      eventHandlers={{
                        dragend: (e) =>
                          onPath(
                            route.id,
                            path.map((v, index) => (index === i ? point(e.target.getLatLng(), view) : v))
                          ),
                        dblclick: () =>
                          onPath(
                            route.id,
                            path.filter((_, index) => index !== i)
                          ),
                      }}
                    />
                  )
                )}
            </React.Fragment>
          );
        })}
        {connection && pointer && (
          <Polyline
            positions={[latLng(connection.position, view), latLng(pointer, view)]}
            pathOptions={{ color: theme.colors.primary.text, dashArray: '6 6', weight: 2 }}
            interactive={false}
          />
        )}
        {view === 'topology' &&
          mapAnchors
            .filter(
              (anchor) =>
                editing ||
                anchor.routeId === selectedRoute ||
                !viewport ||
                viewport.contains(latLng(anchor.position, view))
            )
            .map((anchor) => {
              const markerWidth = parseFloat(theme.spacing(32));
              const markerHeight = parseFloat(theme.spacing(14));
              const coordinate =
                anchor.geographicPoint &&
                Number.isFinite(anchor.geographicPoint.lat) &&
                Number.isFinite(anchor.geographicPoint.lng)
                  ? `${anchor.geographicPoint.lat.toFixed(5)}, ${anchor.geographicPoint.lng.toFixed(5)}`
                  : 'Sem ponto geográfico';
              const icon = L.divIcon({
                className: `jmap-node ${styles.node}`,
                iconSize: [markerWidth * markerScale, markerHeight * markerScale],
                iconAnchor: [(markerWidth * markerScale) / 2, (markerHeight * markerScale) / 2],
                html: `<div class="${styles.nodeCard}" style="width:${markerWidth}px;height:${markerHeight}px;transform:scale(${markerScale});transform-origin:top left;border-top-color:${theme.colors.warning.text}"><small>EXTREMIDADE DO MAPA</small><strong>${escape(anchor.name)}</strong><span>Vínculo pendente</span><small>${escape(coordinate)}</small></div>`,
              });
              return (
                <Marker
                  key={anchor.id}
                  position={latLng(anchor.position, view)}
                  icon={icon}
                  alt={anchor.name}
                  title={`${anchor.name} · Vínculo pendente`}
                  keyboard
                  draggable={editing && tool === 'move'}
                  eventHandlers={{
                    click: () => onSelectRoute(anchor.routeId),
                    dragend: (event) => onMoveMapAnchor(anchor, point(event.target.getLatLng(), view)),
                  }}
                />
              );
            })}
        {visibleNodes
          .filter(
            (node) => editing || node.id === selectedNode || !viewport || viewport.contains(latLng(node.position, view))
          )
          .map((node) => {
            const markerWidth = parseFloat(theme.spacing(node.equipment ? 24 : 30));
            const markerHeight = parseFloat(theme.spacing(node.equipment ? 14 : 16));
            const status = node.equipment ? equipmentStatus(node.equipment, readings) : popStatus(node.pop, readings);
            const type = node.equipment?.type?.toLowerCase() ?? '';
            const fallback = type.includes('olt')
              ? 'pop-olt.svg'
              : type.includes('switch')
                ? 'sw.png'
                : node.equipment
                  ? 'pop-router.svg'
                  : 'pop-datacenter.svg';
            const supplied = node.equipment ? '' : node.pop.iconUrl;
            const imageUrl = supplied ? supplied : `public/plugins/jakson-jmap-panel/img/${fallback}`;
            const showName = view === 'topology' || node.pop.showName !== false;
            const group = groups.get(node.pop.id);
            const internal = group?.localRoutes.length ?? 0;
            const failures = group?.localRoutes.filter((r) => routeStatus(r, readings) === 'down').length ?? 0;
            const summary = node.equipment
              ? `${node.equipment.type || 'Equipamento'} · ${node.pop.name}`
              : `${node.pop.equipments.length} equipamentos${internal ? ` · ${internal} links internos` : ''}`;
            const compactPop = view === 'topology' && !node.equipment && options.topologyPopStyle !== 'card';
            const compactSize = Number(theme.spacing(9).replace('px', ''));
            const compactWidth = Number(theme.spacing(22).replace('px', ''));
            const compactHeight = Number(theme.spacing(15).replace('px', ''));
            const icon = L.divIcon({
              className: `jmap-node ${styles.node} ${selectedNode === node.id || connection?.id === node.id ? styles.selected : ''}`,
              iconSize: compactPop
                ? [compactWidth, compactHeight]
                : [markerWidth * markerScale, markerHeight * markerScale],
              iconAnchor: compactPop
                ? [compactWidth / 2, compactHeight - compactSize / 2]
                : [(markerWidth * markerScale) / 2, (markerHeight * markerScale) / 2],
              html: compactPop
                ? `<div class="${styles.popIcon}"><strong>${escape(node.name || 'Sem nome')}</strong><span style="color:${statusColor(status, theme)}">${escape(statusLabel[status])}</span><div style="border-color:${statusColor(status, theme)}"><img src="${escape(normalizePopIconUrl(imageUrl))}" alt="" draggable="false" /></div></div>`
                : `<div class="${styles.nodeCard} ${!node.equipment ? styles.popCard : ''}" style="width:${markerWidth}px;height:${markerHeight}px;transform:scale(${markerScale});transform-origin:top left;border-top-color:${statusColor(status, theme)}"><div class="${styles.identity}"><img src="${escape(normalizePopIconUrl(imageUrl))}" alt="" draggable="false" /><div><small>${node.equipment ? 'EQUIPAMENTO' : 'PONTO DE PRESENÇA'}</small><strong>${showName ? escape(node.name || 'Sem nome') : ''}</strong></div></div><span class="${styles.nodeStatus}" style="color:${statusColor(status, theme)}">${escape(statusLabel[status])}</span><span>${escape(summary)}</span>${!node.equipment ? `<small class="${styles.hint}" style="color:${failures ? theme.colors.error.text : theme.colors.text.secondary}">${failures ? `${failures} link(s) interno(s) em falha` : expanded.has(node.pop.id) ? 'Equipamentos expandidos' : 'Selecione para expandir'}</small>` : ''}</div>`,
            });
            return (
              <Marker
                key={node.id}
                position={latLng(node.position, view)}
                icon={icon}
                title={`${node.name} · ${statusLabel[status]}`}
                alt={node.name}
                keyboard
                draggable={
                  editing &&
                  tool === 'move' &&
                  !(node.equipment ? node.equipment.topologyLocked : node.pop.topologyLocked)
                }
                eventHandlers={{
                  click: () => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onSelectNode(node.id);
                    if (editing && tool === 'connect') {
                      if (!connectionRef.current) {
                        connectionRef.current = node;
                        setConnection(node);
                      } else {
                        finishConnection(node);
                      }
                    }
                  },
                  mousedown: () => {
                    if (editing && tool === 'connect' && !connectionRef.current) {
                      connectionRef.current = node;
                      setConnection(node);
                    }
                  },
                  mouseup: () => {
                    if (editing && tool === 'connect') {
                      finishConnection(node);
                    }
                  },
                  dragend: (e) => {
                    onMove(node, point(e.target.getLatLng(), view));
                  },
                  dblclick: () => {
                    if (view === 'topology' && !node.equipment && !editing) {
                      onTogglePop(node.pop.id);
                    }
                  },
                }}
              />
            );
          })}
        {view === 'map' && <FireLayer fire={props.fire} />}
        {view === 'map' && <RainLayer rain={props.rain} />}
      </MapContainer>
    </div>
  );
}

function getStyles(theme: GrafanaTheme2) {
  return {
    container: css({ position: 'absolute', inset: 0, zIndex: 0 }),
    map: css({
      height: '100%',
      width: '100%',
      '&&': { backgroundColor: theme.colors.background.canvas },
      fontFamily: theme.typography.fontFamily,
      '.leaflet-control-attribution': {
        background: theme.colors.background.primary,
        color: theme.colors.text.secondary,
      },
      '.leaflet-control-attribution a': { color: theme.colors.text.link },
    }),
    topology: css({
      '&&': {
        backgroundImage: `radial-gradient(${theme.colors.border.medium} 1px, transparent 1px)`,
        backgroundSize: `${theme.spacing(3)} ${theme.spacing(3)}`,
      },
    }),
    muted: css({
      '.leaflet-tile-pane': {
        filter: theme.isDark ? 'invert(1) hue-rotate(180deg) saturate(0.2) brightness(0.65)' : 'saturate(0.25)',
      },
    }),
    group: css({ strokeDasharray: '5 5' }),
    tooltip: css({
      '&&': {
        background: theme.colors.background.primary,
        color: theme.colors.text.primary,
        border: `1px solid ${theme.colors.border.medium}`,
        padding: theme.spacing(1, 1.5),
        boxShadow: theme.shadows.z2,
        fontSize: theme.typography.bodySmall.fontSize,
      },
    }),
    node: css({
      '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}`, outlineOffset: theme.spacing(0.5) },
    }),
    nodeCard: css({
      '&&': { display: 'flex' },
      alignItems: 'stretch',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: theme.spacing(0.5),
      color: theme.colors.text.primary,
      background: `linear-gradient(135deg, ${theme.colors.background.secondary}, ${theme.colors.background.primary})`,
      borderRadius: theme.shape.radius.default,
      border: `1px solid ${theme.colors.border.medium}`,
      borderTopWidth: theme.spacing(0.25),
      padding: theme.spacing(1.25, 1.5),
      boxShadow: theme.shadows.z2,
      img: { width: theme.spacing(4), height: theme.spacing(4), objectFit: 'contain' },
      strong: {
        fontSize: theme.typography.body.fontSize,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      },
      span: {
        fontSize: theme.typography.bodySmall.fontSize,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      small: { fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary },
      '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}`, outlineOffset: theme.spacing(0.5) },
    }),
    popIcon: css({
      height: theme.spacing(15),
      justifyContent: 'flex-end',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: theme.spacing(0.5),
      color: theme.colors.text.primary,
      '> div': {
        width: theme.spacing(9),
        height: theme.spacing(9),
        padding: theme.spacing(1),
        background: theme.colors.background.primary,
        border: `2px solid ${theme.colors.border.medium}`,
        borderRadius: theme.shape.radius.circle,
        boxShadow: theme.shadows.z2,
      },
      img: { width: '100%', height: '100%', objectFit: 'contain' },
      strong: {
        fontSize: theme.typography.bodySmall.fontSize,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        background: theme.colors.background.primary,
        padding: theme.spacing(0, 0.5),
        borderRadius: theme.shape.radius.default,
      },
      span: {
        fontSize: theme.typography.bodySmall.fontSize,
        background: theme.colors.background.primary,
        padding: theme.spacing(0, 0.5),
        borderRadius: theme.shape.radius.default,
      },
    }),
    identity: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      '> div': { display: 'flex', flexDirection: 'column', minWidth: 0 },
      small: { letterSpacing: '0.06em', fontSize: theme.typography.bodySmall.fontSize },
    }),
    popCard: css({
      strong: { fontSize: theme.typography.h5.fontSize, fontWeight: theme.typography.fontWeightMedium },
      img: { width: theme.spacing(5), height: theme.spacing(5) },
    }),
    nodeStatus: css({ fontWeight: theme.typography.fontWeightMedium }),
    hint: css({ display: 'block', borderTop: `1px solid ${theme.colors.border.weak}`, paddingTop: theme.spacing(0.5) }),
    selected: css({
      '> div': {
        borderColor: theme.colors.primary.text,
        boxShadow: `0 0 0 2px ${theme.colors.primary.transparent}`,
      },
    }),
    handle: css({
      background: theme.colors.primary.text,
      border: `2px solid ${theme.colors.background.primary}`,
      borderRadius: theme.shape.radius.default,
    }),
    flow: css({
      strokeDasharray: '12 8',
      animation: 'jmap-network-flow 2s linear infinite',
      '@keyframes jmap-network-flow': { to: { strokeDashoffset: -40 } },
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
    }),
  };
}
