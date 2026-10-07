import React from 'react';
import L from 'leaflet';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { useStyles2, useTheme2 } from '@grafana/ui';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CanvasPoint, MapProvider, NetworkView, PanelOptions } from '../types';
import { NetworkNode, insertBend, routePath } from '../networkModel';
import { Readings, equipmentStatus, popStatus, routeStatus, statusColor, statusLabel } from '../networkTelemetry';

export type EditTool = 'move' | 'connect' | 'route';
type Props = {
  options: PanelOptions;
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
  initialNodes: NetworkNode[];
  onPointer: (p: CanvasPoint) => void;
  onCancel: () => void;
  onZoom: (zoom: number) => void;
}) {
  const map = useMap();
  const initial = React.useRef(initialNodes);
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
    if (view === 'topology' && initial.current.length) {
      map.fitBounds(L.latLngBounds(initial.current.map((n) => latLng(n.position, view))), {
        padding: [100, 90],
        maxZoom: 0,
      });
    }
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(map.getContainer());
    return () => resize.disconnect();
  }, [map, view]);
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
  } = props;
  const theme = useTheme2();
  const styles = useStyles2(getStyles);
  const [connection, setConnection] = React.useState<NetworkNode>();
  const connectionRef = React.useRef<NetworkNode>();
  const suppressClick = React.useRef(false);
  const [pointer, setPointer] = React.useState<CanvasPoint>();
  const [zoom, setZoom] = React.useState(0);
  const mapRef = React.useRef<L.Map>();
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
  const markerWidth = parseFloat(theme.spacing(view === 'map' ? 18 : 22));
  const markerHeight = parseFloat(theme.spacing(11));
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
        className={styles.map}
      >
        <MapLifecycle
          view={view}
          initialNodes={nodes}
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
        {(options.routes ?? []).map((route) => {
          const path = routePath(route, options, view, nodes);
          if (path.length < 2) {
            return null;
          }
          const status = routeStatus(route, readings);
          const color =
            route.id === selectedRoute
              ? theme.colors.primary.text
              : status === 'unknown'
                ? theme.colors.text.secondary
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
                pathOptions={{
                  color,
                  weight: options.transportLineWeight ?? 3,
                  dashArray: status === 'down' || status === 'unknown' ? '6 8' : undefined,
                  className: options.transportLineAnimation === 'flow' && status === 'online' ? styles.flow : undefined,
                }}
                eventHandlers={{ click }}
              />
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
        {nodes.map((node) => {
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
          const imageUrl =
            supplied && /^(https?:\/\/|\/|public\/)/i.test(supplied)
              ? supplied
              : `public/plugins/jakson-jmap-panel/img/${fallback}`;
          const showName = view === 'topology' || node.pop.showName !== false;
          const icon = L.divIcon({
            className: `jmap-node ${styles.node} ${selectedNode === node.id || connection?.id === node.id ? styles.selected : ''}`,
            iconSize: [markerWidth * markerScale, markerHeight * markerScale],
            iconAnchor: [(markerWidth * markerScale) / 2, (markerHeight * markerScale) / 2],
            html: `<div class="${styles.nodeCard}" style="width:${markerWidth}px;height:${markerHeight}px;transform:scale(${markerScale});transform-origin:top left"><img src="${escape(imageUrl)}" alt="" draggable="false" /><strong>${showName ? escape(node.name || 'Sem nome') : ''}</strong><span style="color:${statusColor(status, theme)}">${escape(statusLabel[status])}${node.equipment ? ` · ${escape(node.pop.name)}` : ' · POP'}</span></div>`,
          });
          return (
            <Marker
              key={node.id}
              position={latLng(node.position, view)}
              icon={icon}
              title={`${node.name} · ${statusLabel[status]}`}
              alt={node.name}
              keyboard
              draggable={editing && tool === 'move'}
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
              }}
            />
          );
        })}
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
      '&&': { background: theme.colors.background.canvas },
      fontFamily: theme.typography.fontFamily,
      '.leaflet-control-attribution': {
        background: theme.colors.background.primary,
        color: theme.colors.text.secondary,
      },
      '.leaflet-control-attribution a': { color: theme.colors.text.link },
    }),
    node: css({
      '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}`, outlineOffset: theme.spacing(0.5) },
    }),
    nodeCard: css({
      '&&': { display: 'flex' },
      alignItems: 'center',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: theme.spacing(0.25),
      color: theme.colors.text.primary,
      background: theme.colors.background.primary,
      borderRadius: theme.shape.radius.default,
      border: `1px solid ${theme.colors.border.medium}`,
      padding: theme.spacing(0.75),
      boxShadow: theme.shadows.z1,
      img: { width: theme.spacing(5), height: theme.spacing(4), objectFit: 'contain' },
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
      '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}`, outlineOffset: theme.spacing(0.5) },
    }),
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
