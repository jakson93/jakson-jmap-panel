import React from 'react';
import { SignalTrendChart } from './SignalTrendChart';
import { buildSignalSeries, signalWindow } from '../signalHistory';
import { ConfiguredMapView } from './ConfiguredMapView';
import { FireControls, FireLayer } from './FireLayer';
import { FireMonitoring } from './useFireMonitoring';
import { RainMonitoring } from './useRainMonitoring';
import { RainLayer, RainControls } from './RainLayer';
import { normalizePopIconUrl } from '../iconUrl';
import L from 'leaflet';
import { DataFrame, FieldType, LoadingState, PanelData, TimeRange, TimeZone } from '@grafana/data';
import { useTheme2, useStyles2, Icon } from '@grafana/ui';
import { mapPresentation } from './mapPresentation';
import { MapLabels } from './MapLabels';
import {
  readTelemetry,
  routeStatus,
  popStatus,
  equipmentStatus,
  statusLabel as telemetryStatusLabel,
  statusColor as telemetryStatusColor,
} from '../networkTelemetry';
import { ViewportCapture } from './ViewportCapture';
import { OperationalConsole } from './OperationalConsole';
import { useOperationalReadings } from './useOperationalReadings';
import { emptyFilter, filterNetwork, routeHistory } from '../operationalModel';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { PanelOptions, NetworkFilter, SavedNetworkView } from '../types';
import { setLastMapView } from '../mapState';

type Props = {
  options: PanelOptions;
  onOptionsChange: (options: PanelOptions) => void;
  data: PanelData;
  timeRange: TimeRange;
  timeZone?: TimeZone;
  initialRouteId?: string;
  initialPopId?: string;
  tools?: React.ReactNode;
  fire?: FireMonitoring;
  rain?: RainMonitoring;
  filter?: NetworkFilter;
  onFilter?: (filter: NetworkFilter) => void;
  onRestore?: (view: SavedNetworkView) => void;
};

const DEFAULT_CENTER_LAT = -23.5505;
const DEFAULT_CENTER_LNG = -46.6333;
const DEFAULT_ZOOM = 12;

const toRad = (v: number) => (v * Math.PI) / 180;

const distanceKm = (points: Array<{ lat: number; lng: number }>): number => {
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

type SeriesWithTime = {
  values: number[];
  times: number[];
};

const buildItemValueMap = readTelemetry;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = String(value).replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const escapeHtmlAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildItemSeriesMap = (series: DataFrame[]) => {
  const values = new Map<string, number[]>();

  const addSeries = (label?: string, seriesValues?: number[]) => {
    const key = label?.trim();
    if (!key || !seriesValues || seriesValues.length === 0 || values.has(key)) {
      return;
    }
    values.set(key, seriesValues);
  };

  series.forEach((frame) => {
    if (!frame.fields?.length) {
      return;
    }
    const valueFields = frame.fields.filter((field) => field.type !== FieldType.time);
    if (valueFields.length === 0) {
      return;
    }

    valueFields.forEach((field) => {
      const seriesValues = Array.from(field.values)
        .map((value) => toNumber(value))
        .filter((value): value is number => value !== null);
      if (seriesValues.length === 0) {
        return;
      }

      const trimmed = seriesValues.slice(-300);
      addSeries(field.name, trimmed);
      addSeries(field.config?.displayNameFromDS, trimmed);
      addSeries(field.config?.displayName, trimmed);
      if (valueFields.length === 1) {
        addSeries(frame.name, trimmed);
      }
    });
  });

  return values;
};

const buildItemSeriesWithTimeMap = (series: DataFrame[]) => {
  const values = new Map<string, SeriesWithTime>();

  const addSeries = (label?: string, seriesValues?: SeriesWithTime) => {
    const key = label?.trim();
    if (!key || !seriesValues || seriesValues.values.length === 0 || values.has(key)) {
      return;
    }
    values.set(key, seriesValues);
  };

  series.forEach((frame) => {
    if (!frame.fields?.length) {
      return;
    }
    const timeField = frame.fields.find((field) => field.type === FieldType.time);
    if (!timeField) {
      return;
    }
    const valueFields = frame.fields.filter((field) => field.type !== FieldType.time);
    if (valueFields.length === 0) {
      return;
    }

    valueFields.forEach((field) => {
      const count = Math.min(field.values.length, timeField.values.length);
      const seriesValues: SeriesWithTime = { values: [], times: [] };
      for (let i = 0; i < count; i++) {
        const rawValue = toNumber(field.values[i]);
        const rawTime = Number(timeField.values[i]);
        if (rawValue === null || !Number.isFinite(rawTime)) {
          continue;
        }
        seriesValues.values.push(rawValue);
        seriesValues.times.push(rawTime);
      }
      if (seriesValues.values.length === 0) {
        return;
      }
      addSeries(field.name, seriesValues);
      addSeries(field.config?.displayNameFromDS, seriesValues);
      addSeries(field.config?.displayName, seriesValues);
      if (valueFields.length === 1) {
        addSeries(frame.name, seriesValues);
      }
    });
  });

  return values;
};

const addItemKey = (set: Set<string>, item?: string) => {
  const key = item?.trim();
  if (key) {
    set.add(key);
  }
};

const collectMapItemKeys = (routes: PanelOptions['routes']) => {
  const keys = new Set<string>();
  routes.forEach((route) => {
    addItemKey(keys, route.interfaceItem);
    route.metrics.forEach((metric) => {
      if (metric.id === 'download' || metric.id === 'upload' || metric.id === 'rx' || metric.id === 'tx') {
        addItemKey(keys, metric.zabbixItem);
      }
    });
    route.trunks.forEach((trunk) => {
      trunk.interfaces.forEach((iface) => {
        addItemKey(keys, iface.rxItem);
        addItemKey(keys, iface.txItem);
      });
    });
  });
  return keys;
};

const collectDetailItemKeys = (
  selectedRoute: PanelOptions['routes'][number] | null,
  selectedPop: PanelOptions['pops'][number] | null
) => {
  const keys = new Set<string>();
  if (selectedRoute) {
    selectedRoute.metrics.forEach((metric) => addItemKey(keys, metric.zabbixItem));
    selectedRoute.extraMetrics.forEach((metric) => addItemKey(keys, metric.item));
    selectedRoute.trunks.forEach((trunk) => {
      trunk.interfaces.forEach((iface) => {
        addItemKey(keys, iface.txItem);
        addItemKey(keys, iface.rxItem);
        iface.metrics.forEach((metric) => addItemKey(keys, metric.item));
      });
    });
  }
  if (selectedPop) {
    selectedPop.equipments.forEach((equipment) => {
      addItemKey(keys, equipment.statusItem);
      addItemKey(keys, equipment.cpuItem);
      addItemKey(keys, equipment.memoryItem);
      addItemKey(keys, equipment.temperatureItem);
      addItemKey(keys, equipment.uptimeItem);
      equipment.metrics.forEach((metric) => addItemKey(keys, metric.item));
    });
  }
  return keys;
};

const frameMatchesItems = (frame: DataFrame, itemKeys: Set<string>) => {
  if (itemKeys.size === 0) {
    return false;
  }
  const frameName = frame.name?.trim();
  if (frameName && itemKeys.has(frameName)) {
    return true;
  }
  return frame.fields.some((field) => {
    const name = field.name?.trim();
    const dsName = field.config?.displayNameFromDS?.trim();
    const displayName = field.config?.displayName?.trim();
    return (
      (name ? itemKeys.has(name) : false) ||
      (dsName ? itemKeys.has(dsName) : false) ||
      (displayName ? itemKeys.has(displayName) : false)
    );
  });
};

const filterSeriesByItems = (series: DataFrame[], itemKeys: Set<string>) =>
  series.filter((frame) => frameMatchesItems(frame, itemKeys));

type SparklineProps = { values?: number[]; width?: number; height?: number; color: string };
const Sparkline = ({ values, width = 200, height = 60, color }: SparklineProps) => {
  const theme = useTheme2();
  if (!values || values.length < 2) {
    return <div style={{ fontSize: theme.typography.bodySmall.fontSize, color: 'inherit' }}>--</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = max === min ? height / 2 : height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', maxWidth: '100%' }}
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
};

function CaptureLeafletView() {
  useMapEvents({
    moveend: (e) => {
      const map = e.target;
      const c = map.getCenter();
      setLastMapView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    },
    zoomend: (e) => {
      const map = e.target;
      const c = map.getCenter();
      setLastMapView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    },
  });

  return null;
}

function CaptureMapInteraction({ onInteract }: { onInteract: () => void }) {
  useMapEvents({
    mousedown: onInteract,
    dragstart: onInteract,
    zoomstart: onInteract,
    movestart: onInteract,
    click: onInteract,
  });
  return null;
}

function EnableMiddleMousePan() {
  const map = useMap();

  React.useEffect(() => {
    const container = map.getContainer();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const stopDrag = () => {
      dragging = false;
      container.style.cursor = '';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 1) {
        return;
      }

      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      container.style.cursor = 'grabbing';
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      event.preventDefault();
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!dragging) {
        return;
      }

      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      if (deltaX !== 0 || deltaY !== 0) {
        map.panBy([deltaX, deltaY], { animate: false });
      }

      event.preventDefault();
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 1 && dragging) {
        stopDrag();
        event.preventDefault();
      }
    };

    const onBlur = () => {
      if (dragging) {
        stopDrag();
      }
    };

    const preventAuxClick = (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault();
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('auxclick', preventAuxClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);

    return () => {
      stopDrag();
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('auxclick', preventAuxClick);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [map]);

  return null;
}

function EnsureHitboxPane({ onReady }: { onReady: () => void }) {
  const map = useMap();
  React.useEffect(() => {
    if (!map.getPane('hitboxPane')) {
      const pane = map.createPane('hitboxPane');
      pane.style.zIndex = '450';
      pane.style.pointerEvents = 'auto';
    }
    onReady();
  }, [map, onReady]);
  return null;
}

function CaptureMapRef({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  React.useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  React.useEffect(() => {
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resize.observe(map.getContainer());
    return () => resize.disconnect();
  }, [map]);
  return null;
}

function CaptureMapZoom({ onZoom }: { onZoom: (zoom: number) => void }) {
  useMapEvents({
    zoom: (e) => {
      onZoom(e.target.getZoom());
    },
    zoomend: (e) => {
      onZoom(e.target.getZoom());
    },
  });

  return null;
}

export function MapView({
  options,
  onOptionsChange,
  data,
  timeRange,
  timeZone,
  initialRouteId,
  initialPopId,
  tools,
  fire,
  rain,
  filter: externalFilter,
  onFilter,
  onRestore,
}: Props) {
  const theme = useTheme2();
  const [localFilter, setLocalFilter] = React.useState<NetworkFilter>(emptyFilter);
  const filter = externalFilter ?? localFilter;
  const { readings: operationalReadings, referenceTime } = useOperationalReadings(
    data,
    timeRange,
    options.staleAfterSeconds,
    timeZone
  );
  const filtered = React.useMemo(
    () => filterNetwork(options, filter, operationalReadings),
    [options, filter, operationalReadings]
  );
  const presentation = useStyles2(mapPresentation);
  const centerLat = Number.isFinite(options.centerLat) ? options.centerLat : DEFAULT_CENTER_LAT;
  const centerLng = Number.isFinite(options.centerLng) ? options.centerLng : DEFAULT_CENTER_LNG;
  const zoom = Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM;
  const transportLineAnimation = options.transportLineAnimation ?? 'flow';
  const transportLineWeight = Math.max(1, Math.min(10, options.transportLineWeight ?? 4));
  const transportAnimationSpeed = Math.max(1, Math.min(10, options.transportAnimationSpeed ?? 5));
  const center: [number, number] = [centerLat, centerLng];
  const mapRef = React.useRef<L.Map | null>(null);
  const fullscreenRef = React.useRef(false);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(initialRouteId ?? null);
  const [selectedPopId, setSelectedPopId] = React.useState<string | null>(initialPopId ?? null);
  const [selectedLinkSide, setSelectedLinkSide] = React.useState<string | null>(null);
  const [rxHistory, setRxHistory] = React.useState<{
    name: string;
    item: string;
  } | null>(null);
  const [viewport, setViewport] = React.useState<L.LatLngBounds>();
  const [currentZoom, setCurrentZoom] = React.useState(zoom);
  const [visibleLabels, setVisibleLabels] = React.useState<Set<string>>(new Set());
  const [hitboxReady, setHitboxReady] = React.useState(false);
  const [statsCollapsed, setStatsCollapsed] = React.useState(true);
  const [eventSearch, setEventSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const linkCardRef = React.useRef<HTMLDivElement | null>(null);
  const leftListRef = React.useRef<HTMLDivElement | null>(null);
  const rightListRef = React.useRef<HTMLDivElement | null>(null);
  const linkCenterRef = React.useRef<HTMLDivElement | null>(null);
  const [linkLayout, setLinkLayout] = React.useState({ leftX: 0, rightX: 0, top: 0, height: 0, leftListTop: 0 });
  React.useEffect(() => {
    if (!selectedRouteId && !selectedPopId && !rxHistory) {
      return;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialogs = containerRef.current?.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs?.[dialogs.length - 1];
    const mapContainer = mapRef.current?.getContainer();
    if (mapContainer) {
      mapContainer.inert = true;
    }
    const focusable = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]') ?? []).filter(
        (element) => !element.hasAttribute('disabled') && element.getClientRects().length > 0
      );
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (rxHistory) {
          setRxHistory(null);
        } else if (selectedPopId) {
          setSelectedPopId(null);
        } else {
          setSelectedRouteId(null);
        }
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (mapContainer) {
        mapContainer.inert = false;
      }
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [selectedRouteId, selectedPopId, rxHistory]);
  const mapZoomScale = Math.pow(2, currentZoom - zoom);
  const dataSeries = React.useMemo(() => data?.series ?? [], [data?.series]);

  React.useEffect(() => {
    const handler = () => {
      const map = mapRef.current;
      if (!map) {
        return;
      }
      const isFullscreen = Boolean(document.fullscreenElement);
      if (fullscreenRef.current !== isFullscreen) {
        fullscreenRef.current = isFullscreen;
        setTimeout(() => {
          map.invalidateSize();
          const current = map.getCenter();
          map.setView([current.lat, current.lng], map.getZoom(), { animate: false });
        }, 120);
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  React.useEffect(() => {
    const update = () => {
      if (!linkCardRef.current || !leftListRef.current || !rightListRef.current || !linkCenterRef.current) {
        return;
      }
      const containerRect = linkCardRef.current.getBoundingClientRect();
      const leftRect = leftListRef.current.getBoundingClientRect();
      const rightRect = rightListRef.current.getBoundingClientRect();
      const centerRect = linkCenterRef.current.getBoundingClientRect();
      setLinkLayout({
        leftX: leftRect.right - centerRect.left,
        rightX: rightRect.left - centerRect.left,
        top: leftRect.top - containerRect.top,
        height: leftRect.height,
        leftListTop: leftRect.top - containerRect.top,
      });
    };

    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      if (linkCardRef.current) {
        ro.observe(linkCardRef.current);
      }
      if (leftListRef.current) {
        ro.observe(leftListRef.current);
      }
      if (rightListRef.current) {
        ro.observe(rightListRef.current);
      }
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [selectedRouteId]);

  const tileConfig = (() => {
    switch (options.mapProvider) {
      case 'google_roadmap':
        return {
          url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
          subdomains: ['0', '1', '2', '3'],
          attribution: 'Google',
        };
      case 'google_satellite':
        return {
          url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
          subdomains: ['0', '1', '2', '3'],
          attribution: 'Google',
        };
      case 'google_hybrid':
        return {
          url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          subdomains: ['0', '1', '2', '3'],
          attribution: 'Google',
        };
      case 'google_terrain':
        return {
          url: 'https://mt{s}.google.com/vt/lyrs=t&x={x}&y={y}&z={z}',
          subdomains: ['0', '1', '2', '3'],
          attribution: 'Google',
        };
      case 'osm_hot':
        return {
          url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
          subdomains: ['a', 'b', 'c'],
          attribution: '? OpenStreetMap, HOT',
        };
      case 'carto_light':
        return {
          url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          subdomains: ['a', 'b', 'c', 'd'],
          attribution: '? OpenStreetMap, ? CARTO',
        };
      case 'carto_dark':
        return {
          url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          subdomains: ['a', 'b', 'c', 'd'],
          attribution: '? OpenStreetMap, ? CARTO',
        };
      case 'carto_voyager':
        return {
          url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          subdomains: ['a', 'b', 'c', 'd'],
          attribution: '? OpenStreetMap, ? CARTO',
        };
      case 'osm':
      default:
        return {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          subdomains: ['a', 'b', 'c'],
          attribution: '? OpenStreetMap',
        };
    }
  })();

  React.useEffect(() => {
    if (!options.captureNow) {
      return;
    }
    const ownMap = mapRef.current;
    if (ownMap) {
      const center = ownMap.getCenter();
      onOptionsChange({
        ...options,
        centerLat: center.lat,
        centerLng: center.lng,
        zoom: ownMap.getZoom(),
        captureNow: false,
      });
      return;
    }
    onOptionsChange({ ...options, captureNow: false });
  }, [onOptionsChange, options]);

  const routes = React.useMemo(() => options.routes ?? [], [options.routes]);
  const pops = React.useMemo(() => options.pops ?? [], [options.pops]);
  const labelMode = options.mapLabelMode ?? 'smart';
  const updateVisibleLabels = React.useCallback(
    (ids: Set<string>) =>
      setVisibleLabels((previous) =>
        previous.size === ids.size && [...ids].every((id) => previous.has(id)) ? previous : ids
      ),
    []
  );

  const focusRoute = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    if (!route || !mapRef.current) {
      return;
    }
    if (route.points.length > 1) {
      const bounds = L.latLngBounds(route.points.map((p) => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    }
  };

  const selectedRoute = React.useMemo(
    () => (selectedRouteId ? (routes.find((route) => route.id === selectedRouteId) ?? null) : null),
    [routes, selectedRouteId]
  );
  const selectedPop = selectedPopId ? (pops.find((pop) => pop.id === selectedPopId) ?? null) : null;
  const selectedRouteDistance = selectedRoute ? distanceKm(selectedRoute.points) : 0;
  const routeById = React.useMemo(() => new Map(routes.map((route) => [route.id, route] as const)), [routes]);
  const activeItemKeys = React.useMemo(() => {
    const keys = collectMapItemKeys(routes);
    pops.forEach((pop) => pop.equipments.forEach((equipment) => addItemKey(keys, equipment.statusItem)));
    if (selectedRoute || selectedPop || rxHistory) {
      collectDetailItemKeys(selectedRoute, selectedPop).forEach((key) => keys.add(key));
    }
    return keys;
  }, [routes, pops, rxHistory, selectedPop, selectedRoute]);
  const activeSeries = React.useMemo(
    () => filterSeriesByItems(dataSeries, activeItemKeys),
    [activeItemKeys, dataSeries]
  );
  const itemValueMap = React.useMemo(
    () => buildItemValueMap(activeSeries, theme, timeZone),
    [activeSeries, theme, timeZone]
  );
  const itemSeriesMap = React.useMemo(() => buildItemSeriesMap(activeSeries), [activeSeries]);
  const rxSeries = React.useMemo(() => buildSignalSeries(activeSeries), [activeSeries]);
  const itemSeriesTimeMap = React.useMemo(() => buildItemSeriesWithTimeMap(activeSeries), [activeSeries]);

  const formatBitsPerSec = React.useCallback((value: number | null | undefined): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '--';
    }
    const units = ['b/s', 'Kb/s', 'Mb/s', 'Gb/s', 'Tb/s'];
    let unitIndex = 0;
    let v = value;
    while (v >= 1000 && unitIndex < units.length - 1) {
      v /= 1000;
      unitIndex++;
    }
    return `${v.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
  }, []);

  const getMetricValue = React.useCallback(
    (item?: string) => (item ? itemValueMap.get(item) : undefined),
    [itemValueMap]
  );
  const selectedRouteCapacity = selectedRoute?.capacityManualText
    ? { text: selectedRoute.capacityManualText }
    : undefined;

  const getNumericValue = React.useCallback(
    (item?: string) => {
      const entry = item ? itemValueMap.get(item) : undefined;
      if (!entry) {
        return null;
      }
      return toNumber(entry.raw) ?? toNumber(entry.text);
    },
    [itemValueMap]
  );

  const getRouteMetricNumeric = React.useCallback(
    (route: (typeof routes)[number], metricId: string) => {
      const metric = route.metrics.find((m) => m.id === metricId);
      return metric?.zabbixItem ? getNumericValue(metric.zabbixItem) : null;
    },
    [getNumericValue]
  );

  const getRouteMetricBits = React.useCallback(
    (route: (typeof routes)[number], metricId: string): string => {
      const numericValue = getRouteMetricNumeric(route, metricId);
      return formatBitsPerSec(numericValue);
    },
    [getRouteMetricNumeric, formatBitsPerSec]
  );

  const getLastChangeMinutes = (item?: string, seriesTimeMap?: Map<string, { values: number[]; times: number[] }>) => {
    if (!item || !seriesTimeMap) {
      return null;
    }
    const series = seriesTimeMap.get(item);
    if (!series || series.values.length < 2) {
      return null;
    }
    const values = series.values;
    const times = series.times;
    const lastValue = values[values.length - 1];
    for (let i = values.length - 2; i >= 0; i--) {
      if (values[i] !== lastValue) {
        const latestTime = times[times.length - 1];
        const changeTime = times[i + 1];
        return latestTime ? (latestTime - changeTime) / 60000 : null;
      }
    }
    return null;
  };

  const computeRouteStatus = React.useCallback(
    (route: (typeof routes)[number]) => routeStatus(route, operationalReadings),
    [operationalReadings]
  );
  const computePopStatus = React.useCallback(
    (pop: (typeof pops)[number]) => popStatus(pop, operationalReadings),
    [operationalReadings]
  );

  const selectedRouteStatus = selectedRoute ? computeRouteStatus(selectedRoute) : 'unknown';
  const mapLabels = React.useMemo(
    () =>
      filtered.pops
        .filter((p) => p.showName !== false)
        .map((pop) => ({
          id: pop.id,
          name: pop.name || 'Sem nome',
          lat: pop.lat,
          lng: pop.lng,
          iconSize: Math.min(
            256,
            Math.max(8, (pop.iconSizePx ?? 32) * (pop.iconScaleMode === 'fixed' ? 1 : mapZoomScale))
          ),
          priority: selectedPopId === pop.id ? 3 : computePopStatus(pop) === 'down' ? 2 : 0,
        })),
    [filtered.pops, mapZoomScale, selectedPopId, computePopStatus]
  );
  const selectedRouteStatusLabel = telemetryStatusLabel[selectedRouteStatus];
  const selectedOutage =
    selectedRoute && selectedRouteStatus === 'down'
      ? [
          ...routeHistory(
            selectedRoute,
            operationalReadings,
            timeRange.from.valueOf(),
            referenceTime,
            (options.staleAfterSeconds ?? 300) * 1000
          ).incidents,
        ]
          .reverse()
          .find((event) => event.end === undefined)
      : undefined;
  const selectedRouteDownTime = selectedOutage ? (referenceTime - selectedOutage.start) / 60000 : null;
  const normalizedEventSearch = eventSearch.trim().toLowerCase();
  const routeIncidentItems = React.useMemo(() => {
    const toPriority = (status: string) => {
      if (status === 'down') {
        return 0;
      }
      if (status === 'alert') {
        return 1;
      }
      if (status === 'online') {
        return 2;
      }
      return 3;
    };

    return routes
      .map((route) => {
        const status = computeRouteStatus(route);
        const statusColor =
          status === 'unknown' || status === 'maintenance' ? telemetryStatusColor(status, theme) : route.colors[status];
        const statusLabel = telemetryStatusLabel[status];

        return {
          id: route.id,
          name: route.name || 'Sem nome',
          status,
          statusLabel,
          statusColor,
          priority: toPriority(status),
        };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [computeRouteStatus, routes, theme]);

  const visibleRouteIncidents = React.useMemo(() => {
    if (!normalizedEventSearch) {
      return routeIncidentItems;
    }

    return routeIncidentItems.filter((item) => {
      const routeName = item.name.toLowerCase();
      const statusLabel = item.statusLabel.toLowerCase();
      return routeName.includes(normalizedEventSearch) || statusLabel.includes(normalizedEventSearch);
    });
  }, [normalizedEventSearch, routeIncidentItems]);

  const topRxSignals = React.useMemo(() => {
    return routes
      .flatMap((route) => {
        return (route.trunks ?? []).flatMap((trunk) =>
          (trunk.interfaces ?? []).map((iface) => {
            const rxItem = iface.rxItem?.trim();
            const rxNumeric = rxItem ? getNumericValue(rxItem) : null;
            const rxDisplay = rxItem ? getMetricValue(rxItem) : undefined;

            return {
              id: `${route.id}:${trunk.id}:${iface.id}`,
              routeId: route.id,
              routeName: route.name || 'Sem nome',
              trunkName: trunk.name || 'Trunk',
              interfaceName: iface.name || 'Interface',
              rxNumeric,
              rxText: rxDisplay?.text ?? '--',
            };
          })
        );
      })
      .filter((item) => item.rxNumeric !== null)
      .sort((a, b) => (a.rxNumeric ?? Number.POSITIVE_INFINITY) - (b.rxNumeric ?? Number.POSITIVE_INFINITY))
      .slice(0, 3);
  }, [getMetricValue, getNumericValue, routes]);

  const formatMinutes = (value: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--';
    }
    if (value < 60) {
      return `${Math.round(value)}m`;
    }
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return `${hours}h ${minutes}m`;
  };

  return (
    <div
      ref={containerRef}
      className={presentation.root}
      data-testid="jmap-original-map"
      style={{ height: '100%', minHeight: tools ? theme.spacing(48) : undefined, width: '100%', display: 'flex' }}
    >
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        {(tools || fire?.enabled || rain?.enabled) && (
          <div className={presentation.tools}>
            {tools}
            {rain && (
              <RainControls
                rain={rain}
                onLocate={(lat, lng) => mapRef.current?.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 12))}
              />
            )}
            {fire && (
              <FireControls
                fire={fire}
                onLocate={(lat, lng) => mapRef.current?.flyTo([lat, lng], Math.max(12, mapRef.current.getZoom()))}
              />
            )}
          </div>
        )}
        <style>
          {`
          .jmap-popup .leaflet-popup-content-wrapper,
          .jmap-tooltip.leaflet-tooltip {
            background: #0f172a;
            color: #e2e8f0;
            border: 1px solid rgba(148, 163, 184, 0.25);
            box-shadow: 0 10px 20px rgba(0,0,0,0.35);
          }
          .jmap-popup .leaflet-popup-tip,
          .jmap-tooltip.leaflet-tooltip:before {
            background: #0f172a;
            border: 1px solid rgba(148, 163, 184, 0.25);
          }
          .jmap-popup .leaflet-popup-content,
          .jmap-tooltip.leaflet-tooltip {
            margin: 12px 14px;
          }
          .jmap-route {
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-width: var(--route-weight, 4px);
          }
          .jmap-route--online {
            stroke-dasharray: 14 10;
            filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.35));
          }
          .jmap-route--alert {
            stroke-dasharray: 8 10;
            filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.45));
            animation: jmap-alert-glow var(--anim-duration, 1s) ease-in-out infinite;
          }
          .jmap-route--mode-flow {
            animation: jmap-flow var(--anim-duration, 1.4s) linear infinite;
          }
          .jmap-route--mode-static {
            stroke-dasharray: none;
          }
          .jmap-route--down {
            stroke-dasharray: 6 8;
            animation: jmap-pulse var(--anim-duration, 1.4s) ease-in-out infinite;
            filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.55));
          }
          .jmap-down-alert {
            animation: jmap-down-alert-pulse var(--anim-duration, 0.8s) ease-in-out infinite;
          }
          .jmap-map-container {
            --route-weight: ${transportLineWeight}px;
            --anim-duration: ${2.4 - transportAnimationSpeed * 0.2}s;
          }
          @keyframes jmap-alert-glow {
            0%, 100% { filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.45)); }
            50% { filter: drop-shadow(0 0 14px rgba(245, 158, 11, 0.8)); }
          }
          @keyframes jmap-down-alert-pulse {
            0%, 100% { 
              filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.55)); 
              stroke-width: var(--route-weight, 4px);
            }
            50% { 
              filter: drop-shadow(0 0 18px rgba(239, 68, 68, 0.95)); 
              stroke-width: calc(var(--route-weight, 4px) + 3px);
            }
          }
          @keyframes jmap-flow {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -48; }
          }
          @keyframes jmap-pulse {
            0%, 100% { stroke-opacity: 0.35; stroke-width: var(--route-weight, 4px); }
            50% { stroke-opacity: 1; stroke-width: calc(var(--route-weight, 4px) + 2px); }
          }
          .jmap-tooltip {
            pointer-events: none;
          }
          .jmap-pop-icon {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            box-shadow: none;
          }
          .jmap-pop-icon__img {
            width: 28px;
            height: 28px;
            object-fit: contain;
          }
          .jmap-pop-icon--down {
            background: rgba(15, 23, 42, 0.9);
            border: 2px solid rgba(239, 68, 68, 0.95);
            border-color: rgba(239, 68, 68, 0.95);
            box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.9), 0 0 18px rgba(239, 68, 68, 0.4);
            animation: jmap-pop-down-pulse 1.3s ease-in-out infinite;
          }
          .jmap-pop-icon--fallback::before {
            content: 'POP';
            font-size: 10px;
            font-weight: 700;
            color: #e2e8f0;
            letter-spacing: 0.3px;
          }
          @keyframes jmap-pop-down-pulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.9), 0 0 12px rgba(239, 68, 68, 0.28); }
            50% { transform: scale(1.08); box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.9), 0 0 22px rgba(239, 68, 68, 0.6); }
          }
          .jmap-fiber-line {
            animation: jmap-fiber-flow 1.2s linear infinite;
          }
          @keyframes jmap-fiber-flow {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -28; }
          }
          @keyframes jmap-incident-pulse {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.18); opacity: 1; }
          }
          @keyframes jmap-incident-soft-pulse {
            0%, 100% { transform: scale(1); opacity: 0.82; }
            50% { transform: scale(1.08); opacity: 0.96; }
          }
          @keyframes jmap-hologram-fade {
            0% { opacity: 0; transform: translateY(20px) scale(0.95); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes jmap-hologram-scan {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
          @keyframes jmap-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}
        </style>

        <button
          type="button"
          aria-label="Fullscreen"
          title="Fullscreen"
          onClick={() => {
            const container = containerRef.current ?? mapRef.current?.getContainer();
            if (!container) {
              return;
            }
            if (!document.fullscreenElement) {
              container.requestFullscreen?.();
              const map = mapRef.current;
              if (map) {
                setTimeout(() => {
                  map.invalidateSize();
                  const current = map.getCenter();
                  map.setView([current.lat, current.lng], map.getZoom(), { animate: false });
                }, 120);
              }
              return;
            }
            document.exitFullscreen?.();
          }}
          style={{
            position: 'absolute',
            top: 78,
            left: 12,
            zIndex: 1000,
            width: 32,
            height: 32,
            borderRadius: 4,
            border: '1px solid rgba(0,0,0,0.2)',
            background: '#fff',
            color: '#1f2937',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            fontSize: 16,
          }}
        >
          <Icon name="expand-arrows" />
        </button>

        {selectedRoute && (
          <div
            className={presentation.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes da rota"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1200,
              background: 'rgba(2, 6, 23, 0.58)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              style={{
                width: 'min(980px, 94vw)',
                maxHeight: '82vh',
                background: theme.colors.background.primary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: 12,
                padding: 16,
                color: theme.colors.text.primary,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                overflow: 'hidden',
              }}
            >
              <div className={presentation.dialogHeading}>
                <div>
                  <small>ROTA DE TRANSPORTE</small>
                  <h3>{selectedRoute.name || 'Sem nome'}</h3>
                  <small>Distancia total: {selectedRouteDistance.toFixed(2)} km</small>
                </div>
                <button
                  onClick={() => setSelectedRouteId(null)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${theme.colors.border.weak}`,
                    color: theme.colors.text.primary,
                    padding: '4px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
              </div>

              <div className={presentation.equipmentGrid}>
                <div
                  style={{
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 10,
                    padding: 10,
                    background: theme.colors.background.secondary,
                  }}
                >
                  <div
                    style={{
                      fontSize: theme.typography.bodySmall.fontSize,
                      textTransform: 'uppercase',
                      color: theme.colors.text.secondary,
                    }}
                  >
                    Status
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: theme.typography.bodySmall.fontSize,
                        fontWeight: 700,
                        background:
                          selectedRouteStatus === 'online'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : selectedRouteStatus === 'down'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                        border:
                          selectedRouteStatus === 'online'
                            ? '1px solid rgba(16, 185, 129, 0.35)'
                            : selectedRouteStatus === 'down'
                              ? '1px solid rgba(239, 68, 68, 0.35)'
                              : '1px solid rgba(245, 158, 11, 0.35)',
                      }}
                    >
                      {selectedRouteStatusLabel}
                    </span>
                  </div>
                  {selectedRouteDownTime !== null && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: theme.typography.bodySmall.fontSize,
                          color: '#fca5a5',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginBottom: 4,
                        }}
                      >
                        {selectedOutage?.boundedStart ? 'Tempo mínimo observado em falha' : 'Tempo observado em falha'}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#f87171' }}>
                        {formatMinutes(selectedRouteDownTime)}
                      </div>
                      <div
                        style={{
                          fontSize: theme.typography.bodySmall.fontSize,
                          color: theme.colors.text.secondary,
                          marginTop: 4,
                        }}
                      >
                        {selectedRouteDownTime < 60
                          ? 'Menos de 1 hora'
                          : selectedRouteDownTime < 1440
                            ? `${Math.floor(selectedRouteDownTime / 60)}h ${Math.round(selectedRouteDownTime % 60)}m`
                            : `${Math.floor(selectedRouteDownTime / 1440)}d ${Math.floor((selectedRouteDownTime % 1440) / 60)}h`}
                      </div>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 10,
                    padding: 10,
                    background: theme.colors.background.secondary,
                  }}
                >
                  <div
                    style={{
                      fontSize: theme.typography.bodySmall.fontSize,
                      textTransform: 'uppercase',
                      color: theme.colors.text.secondary,
                    }}
                  >
                    Capacidade total
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{selectedRouteCapacity?.text ?? '--'}</div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  flexShrink: 0,
                  paddingRight: 4,
                }}
              >
                <div className={presentation.metricGrid}>
                  {[
                    ...selectedRoute.metrics
                      .filter((metric) => metric.enabled && metric.zabbixItem)
                      .map((metric) => ({ id: `route-${metric.id}`, name: metric.label, item: metric.zabbixItem })),
                    ...selectedRoute.extraMetrics
                      .filter((metric) => metric.showInDetails !== false && metric.item)
                      .map((metric) => ({ ...metric, id: `extra-${metric.id}` })),
                    ...selectedRoute.trunks.flatMap((trunk) =>
                      trunk.interfaces.flatMap((iface) =>
                        iface.metrics
                          .filter((metric) => metric.item)
                          .map((metric) => ({
                            id: JSON.stringify([trunk.id, iface.id, metric.id]),
                            name: `${trunk.name} / ${iface.name} · ${metric.label}`,
                            item: metric.item,
                          }))
                      )
                    ),
                  ].map((metric) => (
                    <div key={metric.id} className={presentation.metricCard}>
                      <div className={presentation.metricHeading}>
                        <span>{metric.name || 'Métrica'}</span>
                        <span className={presentation.metricValue}>{getMetricValue(metric.item)?.text ?? '--'}</span>
                      </div>
                      <div className={presentation.trend}>
                        <Sparkline
                          values={metric.item ? itemSeriesMap.get(metric.item) : undefined}
                          width={240}
                          height={parseFloat(theme.spacing(3))}
                          color={theme.colors.primary.text}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 10,
                    padding: 12,
                    background: theme.colors.background.secondary,
                    position: 'relative',
                  }}
                  ref={linkCardRef}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Sinais em tempo real (TX/RX)</div>
                  {(() => {
                    const trunks = selectedRoute.trunks ?? [];
                    if (trunks.length === 0) {
                      return (
                        <div style={{ fontSize: 12, color: theme.colors.text.secondary }}>Nenhum trunk cadastrado</div>
                      );
                    }
                    const leftTrunk = trunks[0];
                    const rightTrunk = trunks[1] ?? null;
                    const allSides = [
                      ...leftTrunk.interfaces.map((iface) => iface.side).filter(Boolean),
                      ...(rightTrunk?.interfaces.map((iface) => iface.side).filter(Boolean) ?? []),
                    ] as Array<'A' | 'B' | 'C' | 'D' | 'E'>;
                    const sides = Array.from(new Set(allSides));
                    const leftBySide = new Map(
                      sides.map((side) => [side, leftTrunk.interfaces.find((i) => i.side === side)])
                    );
                    const rightBySide = rightTrunk
                      ? new Map(sides.map((side) => [side, rightTrunk.interfaces.find((i) => i.side === side)]))
                      : new Map();
                    const rowHeight = 46;
                    const rowGap = 8;
                    const rowsHeight = sides.length * rowHeight + Math.max(0, sides.length - 1) * rowGap;
                    return (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: rightTrunk ? '1fr 260px 1fr' : '1fr',
                          gridTemplateRows: rightTrunk ? 'auto 1fr' : 'auto',
                          gap: 12,
                          alignItems: 'stretch',
                        }}
                      >
                        <div style={{ gridColumn: '1 / 2', gridRow: '1 / 2' }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{leftTrunk.name || 'Cidade 1'}</div>
                          {leftTrunk.description ? (
                            <div
                              style={{
                                fontSize: theme.typography.bodySmall.fontSize,
                                color: theme.colors.text.secondary,
                                marginTop: 2,
                              }}
                            >
                              {leftTrunk.description}
                            </div>
                          ) : null}
                        </div>
                        <div
                          ref={leftListRef}
                          style={{ marginTop: 8, display: 'grid', gap: rowGap, gridColumn: '1 / 2', gridRow: '2 / 3' }}
                        >
                          {sides.map((side) => {
                            const iface = leftBySide.get(side);
                            const txValue = iface?.txItem ? getMetricValue(iface.txItem) : undefined;
                            const rxValue = iface?.rxItem ? getMetricValue(iface.rxItem) : undefined;
                            return (
                              <button
                                key={`left-${side}`}
                                type="button"
                                onClick={() => {
                                  setSelectedLinkSide(side);
                                  if (iface?.rxItem) {
                                    setRxHistory({
                                      name: iface.name || 'Interface',
                                      item: iface.rxItem,
                                    });
                                  }
                                }}
                                style={{
                                  height: rowHeight,
                                  border: `1px solid ${theme.colors.border.weak}`,
                                  borderRadius: 8,
                                  padding: '6px 8px',
                                  background:
                                    selectedLinkSide === side
                                      ? theme.colors.background.canvas
                                      : theme.colors.background.primary,
                                  color: theme.colors.text.primary,
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}>
                                  <div style={{ fontWeight: 600 }}>
                                    {iface?.name || '--'}{' '}
                                    <span style={{ color: theme.colors.text.secondary }}>({side})</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                                    <span>
                                      TX: <strong>{txValue?.text ?? 'Sem dados'}</strong>
                                    </span>
                                    <span>
                                      RX:{' '}
                                      <strong
                                        style={{
                                          color:
                                            iface?.rxItem && (getNumericValue(iface.rxItem) ?? Infinity) <= -35
                                              ? theme.colors.error.text
                                              : theme.colors.text.primary,
                                        }}
                                      >
                                        {rxValue?.text ?? 'Sem dados'}
                                      </strong>
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {rightTrunk && (
                          <>
                            <div style={{ gridColumn: '3 / 4', gridRow: '1 / 2' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'right' }}>
                                {rightTrunk.name || 'Cidade 2'}
                              </div>
                              {rightTrunk.description ? (
                                <div
                                  style={{
                                    fontSize: theme.typography.bodySmall.fontSize,
                                    color: theme.colors.text.secondary,
                                    marginTop: 2,
                                    textAlign: 'right',
                                  }}
                                >
                                  {rightTrunk.description}
                                </div>
                              ) : null}
                            </div>
                            <div
                              ref={rightListRef}
                              style={{
                                marginTop: 8,
                                display: 'grid',
                                gap: rowGap,
                                gridColumn: '3 / 4',
                                gridRow: '2 / 3',
                              }}
                            >
                              {sides.map((side) => {
                                const iface = rightBySide.get(side);
                                const txValue = iface?.txItem ? getMetricValue(iface.txItem) : undefined;
                                const rxValue = iface?.rxItem ? getMetricValue(iface.rxItem) : undefined;
                                return (
                                  <button
                                    key={`right-${side}`}
                                    type="button"
                                    onClick={() => {
                                      setSelectedLinkSide(side);
                                      if (iface?.rxItem) {
                                        setRxHistory({
                                          name: iface.name || 'Interface',
                                          item: iface.rxItem,
                                        });
                                      }
                                    }}
                                    style={{
                                      height: rowHeight,
                                      border: `1px solid ${theme.colors.border.weak}`,
                                      borderRadius: 8,
                                      padding: '6px 8px',
                                      background:
                                        selectedLinkSide === side
                                          ? theme.colors.background.canvas
                                          : theme.colors.background.primary,
                                      color: theme.colors.text.primary,
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <div
                                      style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}
                                    >
                                      <div style={{ fontWeight: 600 }}>
                                        {iface?.name || '--'}{' '}
                                        <span style={{ color: theme.colors.text.secondary }}>({side})</span>
                                      </div>
                                      <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                                        <span>
                                          TX: <strong>{txValue?.text ?? 'Sem dados'}</strong>
                                        </span>
                                        <span>
                                          RX:{' '}
                                          <strong
                                            style={{
                                              color:
                                                iface?.rxItem && (getNumericValue(iface.rxItem) ?? Infinity) <= -35
                                                  ? theme.colors.error.text
                                                  : theme.colors.text.primary,
                                            }}
                                          >
                                            {rxValue?.text ?? 'Sem dados'}
                                          </strong>
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <div
                              ref={linkCenterRef}
                              style={{
                                gridColumn: '2 / 3',
                                gridRow: '2 / 3',
                                position: 'relative',
                                minHeight: rowsHeight,
                                marginTop: 8,
                                pointerEvents: 'none',
                              }}
                            >
                              <svg
                                width={Math.max(0, linkLayout.rightX - linkLayout.leftX)}
                                height={rowsHeight}
                                viewBox={`0 0 ${Math.max(0, linkLayout.rightX - linkLayout.leftX)} ${rowsHeight}`}
                                preserveAspectRatio="none"
                                style={{
                                  position: 'absolute',
                                  left: linkLayout.leftX,
                                  top: 0,
                                }}
                              >
                                {sides.map((side, idx) => {
                                  const leftIface = leftBySide.get(side);
                                  const rightIface = rightBySide.get(side);
                                  if (!leftIface || !rightIface) {
                                    return null;
                                  }
                                  const leftRx = leftIface.rxItem ? getNumericValue(leftIface.rxItem) : null;
                                  const rightRx = rightIface.rxItem ? getNumericValue(rightIface.rxItem) : null;
                                  const down =
                                    (leftRx !== null && leftRx <= -35) || (rightRx !== null && rightRx <= -35);
                                  const y = idx * (rowHeight + rowGap) + rowHeight / 2;
                                  const width = Math.max(0, linkLayout.rightX - linkLayout.leftX);
                                  const color = down ? theme.colors.error.text : theme.colors.success.text;
                                  return (
                                    <g key={`link-${side}`}>
                                      <line
                                        x1={0}
                                        y1={y}
                                        x2={width}
                                        y2={y}
                                        stroke={color}
                                        strokeWidth={2.5}
                                        strokeDasharray="8 6"
                                        className="jmap-fiber-line"
                                      />
                                      <circle cx={0} cy={y} r="4" fill={color} />
                                      <circle cx={width} cy={y} r="4" fill={color} />
                                      <text
                                        x={width / 2}
                                        y={y - 6}
                                        textAnchor="middle"
                                        fill={theme.colors.text.secondary}
                                        fontSize="10"
                                      >
                                        {side}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {rxHistory && (
          <div
            className={presentation.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Histórico do sinal RX"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1250,
              background: 'rgba(2, 6, 23, 0.58)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              style={{
                width: 'min(760px, 92vw)',
                maxHeight: '80vh',
                overflowY: 'auto',
                background: theme.colors.background.primary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: 12,
                padding: 16,
                color: theme.colors.text.primary,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {(() => {
                const filteredSeries = signalWindow(
                  rxSeries.get(rxHistory.item),
                  timeRange.from.valueOf(),
                  timeRange.to.valueOf()
                );
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        Histórico RX · {rxHistory.name}
                        {null}
                      </div>
                      <button
                        onClick={() => setRxHistory(null)}
                        style={{
                          background: 'transparent',
                          border: `1px solid ${theme.colors.border.weak}`,
                          color: theme.colors.text.primary,
                          padding: '4px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                      >
                        Fechar
                      </button>
                    </div>
                    <div style={{ border: `1px solid ${theme.colors.border.weak}`, borderRadius: 10, padding: 12 }}>
                      <SignalTrendChart
                        series={filteredSeries}
                        from={timeRange.from.valueOf()}
                        to={timeRange.to.valueOf()}
                        timeZone={timeZone}
                      />
                      <div
                        style={{
                          fontSize: theme.typography.bodySmall.fontSize,
                          color: theme.colors.text.secondary,
                          marginTop: 6,
                        }}
                      >
                        Periodo do painel: {timeRange.from.format('DD/MM/YYYY HH:mm')} ate{' '}
                        {timeRange.to.format('DD/MM/YYYY HH:mm')}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {selectedPop && (
          <div
            className={presentation.backdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Equipamentos do POP"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1200,
              background: 'rgba(2, 6, 23, 0.58)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
          >
            <div
              style={{
                width: 'min(980px, 94vw)',
                maxHeight: '82vh',
                background: theme.colors.background.primary,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: 12,
                padding: 16,
                color: theme.colors.text.primary,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                overflow: 'hidden',
              }}
            >
              <div className={presentation.dialogHeading}>
                <div>
                  <small>PONTO DE PRESENÇA · {selectedPop.equipments.length} EQUIPAMENTOS</small>
                  <h3>{selectedPop.name || 'Sem nome'}</h3>
                  <small>
                    {selectedPop.lat.toFixed(4)}, {selectedPop.lng.toFixed(4)}
                  </small>
                </div>
                <button
                  onClick={() => setSelectedPopId(null)}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${theme.colors.border.weak}`,
                    color: theme.colors.text.primary,
                    padding: '4px 10px',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
              </div>

              <div className={presentation.equipmentGrid}>
                {(selectedPop.equipments ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: theme.colors.text.secondary }}>Nenhum equipamento cadastrado</div>
                ) : (
                  selectedPop.equipments.map((equipment) => {
                    const statusValue = equipment.statusItem ? getMetricValue(equipment.statusItem) : undefined;
                    const status = equipmentStatus(equipment, operationalReadings);
                    const lastChange = getLastChangeMinutes(equipment.statusItem, itemSeriesTimeMap);
                    const customMetrics = equipment.metrics ?? [];
                    const builtInMetrics = [
                      { id: 'builtin-cpu', name: 'CPU', item: equipment.cpuItem, showInDetails: equipment.cpuShow },
                      {
                        id: 'builtin-memory',
                        name: 'Memória',
                        item: equipment.memoryItem,
                        showInDetails: equipment.memoryShow,
                      },
                      {
                        id: 'builtin-temperature',
                        name: 'Temperatura',
                        item: equipment.temperatureItem,
                        showInDetails: equipment.temperatureShow,
                      },
                      {
                        id: 'builtin-uptime',
                        name: 'Uptime',
                        item: equipment.uptimeItem,
                        showInDetails: equipment.uptimeShow,
                      },
                    ].filter((metric) => !customMetrics.some((custom) => custom.item === metric.item));
                    const visibleMetrics = [...builtInMetrics, ...customMetrics].filter(
                      (metric) => metric.showInDetails !== false && metric.item
                    );

                    return (
                      <div
                        key={equipment.id}
                        className={presentation.equipmentCard}
                        style={{
                          borderTopColor:
                            status === 'online'
                              ? theme.colors.success.text
                              : status === 'down'
                                ? theme.colors.error.text
                                : theme.colors.text.secondary,
                        }}
                      >
                        <div className={presentation.equipmentHeading}>
                          <div>
                            <img
                              alt=""
                              src={`public/plugins/jakson-jmap-panel/img/${equipment.type?.toLowerCase().includes('olt') ? 'pop-olt.svg' : equipment.type?.toLowerCase().includes('switch') ? 'sw.png' : 'pop-router.svg'}`}
                            />
                            <div>
                              <strong>{equipment.name || 'Equipamento'}</strong>
                              <small>
                                {equipment.ip || '--'} {equipment.type ? `• ${equipment.type}` : ''}
                              </small>
                            </div>
                          </div>
                          <span
                            className={presentation.statusBadge}
                            style={{
                              color:
                                status === 'online'
                                  ? theme.colors.success.text
                                  : status === 'down'
                                    ? theme.colors.error.text
                                    : theme.colors.text.secondary,
                            }}
                          >
                            {telemetryStatusLabel[status]}
                          </span>
                        </div>

                        <div
                          style={{ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }}
                        >
                          Status: <span style={{ color: theme.colors.text.primary }}>{statusValue?.text ?? '--'}</span>
                          {lastChange !== null && (
                            <span style={{ marginLeft: 8 }}>Última mudança: {formatMinutes(lastChange)}</span>
                          )}
                        </div>

                        {equipment.observationShow !== false && equipment.observation?.trim() && (
                          <div
                            style={{
                              border: `1px solid ${theme.colors.border.weak}`,
                              borderRadius: 8,
                              padding: 8,
                              background: theme.colors.background.primary,
                              fontSize: 12,
                            }}
                          >
                            <div
                              style={{
                                fontSize: theme.typography.bodySmall.fontSize,
                                textTransform: 'uppercase',
                                color: theme.colors.text.secondary,
                              }}
                            >
                              Observação
                            </div>
                            <div>{equipment.observation}</div>
                          </div>
                        )}

                        {visibleMetrics.length > 0 && (
                          <div className={presentation.metricGrid}>
                            {visibleMetrics.map((metric) => {
                              const value = metric.item ? getMetricValue(metric.item) : undefined;
                              const series = metric.item ? itemSeriesMap.get(metric.item) : undefined;
                              return (
                                <div key={metric.id} className={presentation.metricCard}>
                                  <div className={presentation.metricHeading}>
                                    <span>{metric.name || 'Metrica'}</span>
                                    <span className={presentation.metricValue}>{value?.text ?? '--'}</span>
                                  </div>
                                  <div className={presentation.trend}>
                                    <Sparkline
                                      values={series}
                                      width={240}
                                      height={parseFloat(theme.spacing(3))}
                                      color={theme.colors.primary.text}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        <MapContainer
          center={center}
          zoom={zoom}
          zoomSnap={0.25}
          zoomDelta={0.25}
          style={{ height: '100%', width: '100%' }}
          className={`jmap-map-container ${options.mapTone !== 'original' && !['google_satellite', 'google_hybrid', 'carto_dark'].includes(options.mapProvider) ? presentation.mutedMap : ''}`}
        >
          {labelMode === 'smart' && (
            <MapLabels
              labels={mapLabels}
              fontSize={parseFloat(String(theme.typography.bodySmall.fontSize))}
              fontFamily={theme.typography.fontFamily}
              maxWidth={parseFloat(theme.spacing(25))}
              padding={parseFloat(theme.spacing(1))}
              gap={parseFloat(theme.spacing(1))}
              onVisible={updateVisibleLabels}
            />
          )}
          <ConfiguredMapView lat={centerLat} lng={centerLng} zoom={zoom} />
          <ViewportCapture onBounds={setViewport} />
          <CaptureLeafletView />
          <CaptureMapInteraction onInteract={() => {}} />
          <CaptureMapRef
            onReady={(map) => {
              mapRef.current = map;
              setCurrentZoom(map.getZoom());
            }}
          />
          <CaptureMapZoom onZoom={setCurrentZoom} />
          <EnableMiddleMousePan />
          <EnsureHitboxPane onReady={() => setHitboxReady(true)} />
          <TileLayer
            key={options.mapProvider}
            url={tileConfig.url}
            subdomains={tileConfig.subdomains}
            attribution={tileConfig.attribution}
            maxZoom={20}
            crossOrigin
          />
          {filtered.routes.map((route) => {
            if (
              route.points.length <= 1 ||
              (viewport &&
                !viewport.intersects(L.latLngBounds(route.points.map((p) => [p.lat, p.lng] as L.LatLngTuple))))
            ) {
              return null;
            }
            const status = computeRouteStatus(route);
            const statusColor =
              status === 'unknown' || status === 'maintenance'
                ? telemetryStatusColor(status, theme)
                : route.colors[status];
            const statusClass =
              status === 'unknown'
                ? 'jmap-route--unknown'
                : status === 'online'
                  ? 'jmap-route--online'
                  : status === 'down'
                    ? 'jmap-route--down'
                    : 'jmap-route--alert';
            const modeClass = transportLineAnimation === 'static' ? 'jmap-route--mode-static' : 'jmap-route--mode-flow';
            const dashArray =
              transportLineAnimation === 'static' && status !== 'down'
                ? undefined
                : status === 'online'
                  ? '14 10'
                  : status === 'down'
                    ? '6 8'
                    : '8 10';
            return (
              <React.Fragment key={route.id}>
                <Polyline
                  positions={route.points.map((p) => [p.lat, p.lng])}
                  interactive={false}
                  pathOptions={{ color: theme.colors.background.canvas, opacity: 0.8, weight: transportLineWeight + 3 }}
                />
                <Polyline
                  positions={route.points.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: statusColor,
                    className: `jmap-route ${statusClass} ${modeClass}`.trim(),
                    dashArray,
                    weight: transportLineWeight,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                  eventHandlers={{
                    click: () => {
                      setSelectedPopId(null);
                      setSelectedRouteId(route.id);
                    },
                  }}
                />
                {hitboxReady && (
                  <Polyline
                    positions={route.points.map((p) => [p.lat, p.lng])}
                    pane="hitboxPane"
                    pathOptions={{
                      color: 'transparent',
                      opacity: 0,
                      weight: 18,
                    }}
                    eventHandlers={{
                      click: () => {
                        setSelectedPopId(null);
                        setSelectedRouteId(route.id);
                      },
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
          {filtered.pops
            .filter((pop) => !viewport || viewport.contains([pop.lat, pop.lng]))
            .map((pop) => {
              const popStatus = computePopStatus(pop);
              const iconUrl = normalizePopIconUrl(
                pop.iconUrl || 'public/plugins/jakson-jmap-panel/img/pop-datacenter.svg'
              );
              const safeIconUrl = iconUrl ? escapeHtmlAttr(iconUrl) : '';
              const baseIconSizePx = Math.min(128, Math.max(16, pop.iconSizePx ?? 32));
              const iconScaleMode = pop.iconScaleMode === 'fixed' ? 'fixed' : 'map';
              const iconZoomScale = iconScaleMode === 'fixed' ? 1 : mapZoomScale;
              const iconSizePx = Math.min(256, Math.max(8, Math.round(baseIconSizePx * iconZoomScale)));
              const iconInnerSizePx = Math.max(6, Math.round(iconSizePx * 0.875));
              const iconRadiusPx = Math.max(4, Math.round(iconSizePx * 0.2));
              const tooltipOffsetX = Math.round(iconSizePx / 2) + parseFloat(theme.spacing(1));
              const hitboxRadius = Math.max(10, Math.round(iconSizePx * 0.75));
              const statusClass = popStatus === 'down' ? 'jmap-pop-icon--down' : '';
              const popColor =
                popStatus === 'down'
                  ? theme.colors.error.text
                  : popStatus === 'online'
                    ? theme.colors.success.text
                    : theme.colors.text.secondary;
              const icon = iconUrl
                ? L.divIcon({
                    className: '',
                    html: `<div class="jmap-pop-icon ${statusClass}" style="width:${iconSizePx}px;height:${iconSizePx}px;border-radius:${iconRadiusPx}px;border-color:${popColor};">
                  <img class="jmap-pop-icon__img" style="width:${iconInnerSizePx}px;height:${iconInnerSizePx}px;" src="${safeIconUrl}" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.onerror=null;this.style.display='none';if(this.parentElement){this.parentElement.classList.add('jmap-pop-icon--fallback');}" />
                 </div>`,
                    iconSize: [iconSizePx, iconSizePx],
                    iconAnchor: [iconSizePx / 2, iconSizePx / 2],
                  })
                : L.divIcon({
                    className: '',
                    html: `<div class="jmap-pop-icon ${statusClass}" style="width:${iconSizePx}px;height:${iconSizePx}px;border-radius:50%;"></div>`,
                    iconSize: [iconSizePx, iconSizePx],
                    iconAnchor: [iconSizePx / 2, iconSizePx / 2],
                  });
              return (
                <React.Fragment key={pop.id}>
                  {pop.showName !== false && (
                    <Marker
                      position={[pop.lat, pop.lng]}
                      icon={icon}
                      title={pop.name || 'Sem nome'}
                      alt={pop.name || 'Sem nome'}
                      eventHandlers={{
                        click: () => {
                          setSelectedRouteId(null);
                          setSelectedPopId(pop.id);
                        },
                      }}
                    >
                      <Tooltip
                        key={`${labelMode}-${visibleLabels.has(pop.id)}`}
                        className={`jmap-tooltip ${presentation.popLabel}`}
                        direction="right"
                        permanent={labelMode === 'smart' ? visibleLabels.has(pop.id) : labelMode !== 'hover'}
                        offset={[tooltipOffsetX, 0]}
                        interactive={false}
                      >
                        <div className={presentation.labelTitle}>
                          <span style={{ background: popColor }} />
                          {pop.name || 'Sem nome'}
                        </div>
                        {(labelMode === 'details' || labelMode === 'hover') && (
                          <div
                            style={{
                              color:
                                popStatus === 'down'
                                  ? theme.colors.error.text
                                  : popStatus === 'online'
                                    ? theme.colors.success.text
                                    : theme.colors.text.secondary,
                              fontSize: theme.typography.bodySmall.fontSize,
                            }}
                          >
                            {pop.equipments.length} equipamento(s) ·{' '}
                            {popStatus === 'down' ? 'Indisponível' : popStatus === 'online' ? 'Online' : 'Sem dados'}
                          </div>
                        )}
                      </Tooltip>
                    </Marker>
                  )}
                  {pop.showName === false && (
                    <Marker
                      position={[pop.lat, pop.lng]}
                      icon={icon}
                      title={pop.name || 'Sem nome'}
                      alt={pop.name || 'Sem nome'}
                      eventHandlers={{
                        click: () => {
                          setSelectedRouteId(null);
                          setSelectedPopId(pop.id);
                        },
                      }}
                    />
                  )}
                  {hitboxReady && (
                    <CircleMarker
                      center={[pop.lat, pop.lng]}
                      radius={hitboxRadius}
                      pane="hitboxPane"
                      pathOptions={{ color: 'transparent', fillOpacity: 0, opacity: 0 }}
                      interactive
                      bubblingMouseEvents={false}
                      eventHandlers={{
                        click: () => {
                          setSelectedRouteId(null);
                          setSelectedPopId(pop.id);
                        },
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          {fire && <FireLayer fire={fire} />}
          {rain && <RainLayer rain={rain} />}
        </MapContainer>
        {!selectedRouteId && !selectedPopId && (
          <OperationalConsole
            options={options}
            queryError={data.state === LoadingState.Error}
            readings={operationalReadings}
            referenceTime={referenceTime}
            timeRange={timeRange}
            filter={filter}
            onFilter={onFilter ?? setLocalFilter}
            view="map"
            expandedPops={[]}
            onRestore={(saved) => {
              (onFilter ?? setLocalFilter)(saved.filter);
              onRestore?.(saved);
            }}
            onOptionsChange={onOptionsChange}
            onLocate={(id) => {
              const route = routes.find((r) => r.id === id);
              if (route) {
                focusRoute(id);
              }
            }}
            onDetails={(id) => {
              setSelectedRouteId(id);
              setSelectedPopId(null);
            }}
          />
        )}
        <button
          type="button"
          onClick={() => setStatsCollapsed((prev) => !prev)}
          aria-label={statsCollapsed ? 'Abrir painel de incidentes' : 'Fechar painel de incidentes'}
          style={{
            position: 'absolute',
            right: theme.spacing(1),
            top: '50%',
            transform: 'translateY(-50%)',
            background: theme.colors.background.secondary,
            border: `1px solid ${theme.colors.border.weak}`,
            color: theme.colors.text.primary,
            padding: theme.spacing(0.5),
            borderRadius: 999,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            zIndex: 600,
          }}
        >
          {statsCollapsed ? '>' : '<'}
        </button>
      </div>

      <div
        style={{
          width: statsCollapsed ? 0 : 320,
          transition: 'width 0.2s ease',
          background: theme.colors.background.secondary,
          borderLeft: statsCollapsed ? 'none' : `1px solid ${theme.colors.border.weak}`,
          color: theme.colors.text.primary,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {!statsCollapsed && (
          <div
            style={{
              padding: theme.spacing(1.5),
              display: 'flex',
              flexDirection: 'column',
              gap: theme.spacing(1),
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>Estatisticas do Transporte</div>
            <input
              type="text"
              value={eventSearch}
              onChange={(e) => setEventSearch(e.currentTarget.value)}
              placeholder="Buscar rota ou status"
              style={{
                background: theme.colors.background.primary,
                border: `1px solid ${theme.colors.border.weak}`,
                color: theme.colors.text.primary,
                padding: theme.spacing(1),
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing(0.75) }}>
              <div style={{ fontSize: theme.typography.bodySmall.fontSize, fontWeight: 600 }}>
                Top 3 piores sinais RX
              </div>
              {topRxSignals.length === 0 ? (
                <div style={{ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }}>
                  Nenhum item RX encontrado.
                </div>
              ) : (
                topRxSignals.map((item) => (
                  <button
                    key={`rx-${item.id}`}
                    type="button"
                    onClick={() => {
                      setSelectedPopId(null);
                      setSelectedRouteId(item.routeId);
                      focusRoute(item.routeId);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing(1),
                      padding: theme.spacing(0.75),
                      borderRadius: 8,
                      border: `1px solid ${theme.colors.border.weak}`,
                      background: theme.colors.background.primary,
                      color: theme.colors.text.primary,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#f59e0b',
                        boxShadow: '0 0 0 4px rgba(245, 158, 11, 0.18)',
                        animation: 'jmap-incident-soft-pulse 2.2s ease-in-out infinite',
                        flex: '0 0 auto',
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'grid',
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.routeName}
                      </span>
                      <span
                        style={{
                          fontSize: theme.typography.bodySmall.fontSize,
                          color: theme.colors.text.secondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.trunkName} • {item.interfaceName}
                      </span>
                    </span>
                    <span style={{ fontSize: theme.typography.bodySmall.fontSize, fontWeight: 700, color: '#f59e0b' }}>
                      {item.rxText}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }}>
              <div style={{ fontSize: theme.typography.bodySmall.fontSize, fontWeight: 600 }}>Todas as rotas</div>
              {visibleRouteIncidents.length === 0 && (
                <div style={{ fontSize: theme.typography.bodySmall.fontSize, color: theme.colors.text.secondary }}>
                  Nenhuma rota encontrada.
                </div>
              )}
              {visibleRouteIncidents.map((item) => {
                const route = routeById.get(item.id);
                const downloadText = route ? getRouteMetricBits(route, 'download') : '--';
                const uploadText = route ? getRouteMetricBits(route, 'upload') : '--';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedPopId(null);
                      setSelectedRouteId(item.id);
                      focusRoute(item.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: theme.spacing(1),
                      padding: theme.spacing(1),
                      borderRadius: 10,
                      border: `1px solid ${theme.colors.border.weak}`,
                      background: theme.colors.background.primary,
                      color: theme.colors.text.primary,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: item.statusColor,
                        boxShadow: `0 0 0 4px ${item.statusColor}22`,
                        animation: 'jmap-incident-pulse 1.2s ease-in-out infinite',
                        flex: '0 0 auto',
                      }}
                    />
                    <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: theme.spacing(1),
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {item.name}
                        </div>
                        <span
                          style={{
                            fontSize: theme.typography.bodySmall.fontSize,
                            fontWeight: 700,
                            color: item.statusColor,
                            textTransform: 'uppercase',
                            letterSpacing: 0.3,
                            flex: '0 0 auto',
                          }}
                        >
                          {item.statusLabel}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: theme.spacing(0.75),
                          fontSize: theme.typography.bodySmall.fontSize,
                          color: theme.colors.text.secondary,
                        }}
                      >
                        <div
                          style={{
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: theme.colors.background.secondary,
                            border: `1px solid ${theme.colors.border.weak}`,
                          }}
                        >
                          <span style={{ display: 'block', marginBottom: 2 }}>Download</span>
                          <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>{downloadText}</span>
                        </div>
                        <div
                          style={{
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: theme.colors.background.secondary,
                            border: `1px solid ${theme.colors.border.weak}`,
                          }}
                        >
                          <span style={{ display: 'block', marginBottom: 2 }}>Upload</span>
                          <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>{uploadText}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
