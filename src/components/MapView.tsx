import React from 'react';
import L from 'leaflet';
import { DataFrame, Field, FieldType, PanelData, TimeRange, TimeZone, getDisplayProcessor } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { PanelOptions } from '../types';
import { getLastMapView, setLastMapView } from '../mapState';

type Props = {
  options: PanelOptions;
  onOptionsChange: (options: PanelOptions) => void;
  data: PanelData;
  timeRange: TimeRange;
  timeZone?: TimeZone;
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

const getLastFieldValue = (field: Field) => {
  for (let i = field.values.length - 1; i >= 0; i--) {
    const value = field.values.get(i);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return undefined;
};

type ItemValue = {
  text: string;
  raw: unknown;
};

type SeriesWithTime = {
  values: number[];
  times: number[];
};

const buildItemValueMap = (series: DataFrame[], theme: ReturnType<typeof useTheme2>, timeZone?: TimeZone) => {
  const values = new Map<string, ItemValue>();

  const addValue = (label?: string, displayText?: string, raw?: unknown) => {
    const key = label?.trim();
    if (!key || !displayText || values.has(key)) {
      return;
    }
    values.set(key, { text: displayText, raw });
  };

  series.forEach((frame) => {
    if (!frame.fields?.length) {
      return;
    }
    const valueField =
      frame.fields.find((field) => field.type === FieldType.number) ??
      frame.fields.find((field) => field.type !== FieldType.time);
    if (!valueField) {
      return;
    }

    const lastValue = getLastFieldValue(valueField);
    if (lastValue === undefined) {
      return;
    }

    const display = getDisplayProcessor({ field: valueField, theme, timeZone })(lastValue);
    const displayText = display.text ?? String(lastValue);

    addValue(frame.name, displayText, lastValue);
    addValue(valueField.name, displayText, lastValue);
    addValue(valueField.config?.displayNameFromDS, displayText, lastValue);
    addValue(valueField.config?.displayName, displayText, lastValue);
  });

  return values;
};

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

const normalizePopIconUrl = (value?: string) => {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return '';
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('/')) {
    return raw;
  }
  if (raw.startsWith('public/')) {
    return `/${raw}`;
  }
  return raw;
};

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
        const rawValue = toNumber(field.values.get(i));
        const rawTime = Number(timeField.values.get(i));
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

const normalizeValue = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const resolveRouteStatus = (interfaceItem?: string, onlineValue?: string, itemValueMap?: Map<string, ItemValue>) => {
  if (!interfaceItem || !itemValueMap) {
    return 'unknown';
  }
  const entry = itemValueMap.get(interfaceItem);
  if (!entry) {
    return 'unknown';
  }
  const expected = normalizeValue(onlineValue ?? '1');
  const rawNormalized = normalizeValue(entry.raw);
  const textNormalized = normalizeValue(entry.text);
  return rawNormalized === expected || textNormalized === expected ? 'online' : 'down';
};

const countFlaps = (series: { values: number[]; times: number[] }, windowMs: number) => {
  if (series.values.length < 2) {
    return 0;
  }
  const latestTime = series.times[series.times.length - 1];
  if (!latestTime) {
    return 0;
  }
  const windowStart = latestTime - windowMs;
  let count = 0;
  for (let i = series.values.length - 1; i > 0; i--) {
    if (series.times[i] < windowStart) {
      break;
    }
    if (series.values[i] !== series.values[i - 1]) {
      count += 1;
    }
  }
  return count;
};

type SparklineProps = {
  values?: number[];
  width?: number;
  height?: number;
  color: string;
};

const Sparkline = ({ values, width = 200, height = 60, color }: SparklineProps) => {
  if (!values || values.length < 2) {
    return <div style={{ fontSize: 11, color: 'inherit' }}>--</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
};

type SignalTrendChartProps = {
  series?: { values: number[]; times: number[] };
  width: number;
  height: number;
  color: string;
};

const SignalTrendChart = ({ series, width, height, color }: SignalTrendChartProps) => {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const normalizeTime = (value: number) => (value < 1_000_000_000_000 ? value * 1000 : value);

  const marginLeft = 72;
  const marginBottom = 24;
  const marginTop = 20;
  const plotWidth = Math.max(1, width - marginLeft - 6);
  const plotHeight = Math.max(1, height - marginBottom - marginTop);

  const values = series?.values ?? [];
  const times = (series?.times ?? []).map(normalizeTime);
  const validValues = values.filter((v): v is number => Number.isFinite(v));

  if (validValues.length === 0) {
    return <div style={{ fontSize: 12 }}>Sem dados</div>;
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;
  const minTime = times[0] ?? 0;
  const maxTime = times[times.length - 1] ?? minTime;
  const timeRange = maxTime - minTime || 1;

  const getY = (value: number) => marginTop + plotHeight - ((value - min) / range) * plotHeight;
  const getX = (time: number) => marginLeft + ((time - minTime) / timeRange) * plotWidth;

  const rawPoints = values.map((value, idx) => ({
    x: getX(times[idx] ?? minTime),
    y: getY(value),
    idx,
    time: times[idx] ?? minTime,
    value,
  }));

  const maxVisiblePoints = Math.max(32, Math.floor(plotWidth / 6));
  const simplifiedPoints =
    rawPoints.length <= maxVisiblePoints
      ? rawPoints
      : (() => {
          const bucketSize = Math.ceil(rawPoints.length / maxVisiblePoints);
          const reduced: typeof rawPoints = [];

          for (let start = 0; start < rawPoints.length; start += bucketSize) {
            const bucket = rawPoints.slice(start, start + bucketSize);
            if (bucket.length === 0) {
              continue;
            }

            const first = bucket[0];
            const last = bucket[bucket.length - 1];
            const minPoint = bucket.reduce((acc, point) => (point.value < acc.value ? point : acc), bucket[0]);
            const maxPoint = bucket.reduce((acc, point) => (point.value > acc.value ? point : acc), bucket[0]);

            [first, minPoint, maxPoint, last]
              .sort((a, b) => a.idx - b.idx)
              .forEach((point) => {
                if (!reduced.some((existing) => existing.idx === point.idx)) {
                  reduced.push(point);
                }
              });
          }

          return reduced;
        })();

  const linePath = simplifiedPoints.length >= 2 ? simplifiedPoints.map((p) => `${p.x},${p.y}`).join(' ') : '';
  const significantThreshold = Math.max(0.15, range * 0.12);
  const significantPoints = simplifiedPoints.filter((point, index, list) => {
    if (index === 0 || index === list.length - 1) {
      return false;
    }

    const prev = list[index - 1];
    const next = list[index + 1];
    const deltaPrev = Math.abs(point.value - prev.value);
    const deltaNext = Math.abs(point.value - next.value);
    const isPeak = point.value > prev.value && point.value > next.value;
    const isTrough = point.value < prev.value && point.value < next.value;

    return (isPeak || isTrough) && Math.max(deltaPrev, deltaNext) >= significantThreshold;
  });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < simplifiedPoints.length; i++) {
      const dist = Math.abs(simplifiedPoints[i].x - x);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = simplifiedPoints[i].idx;
      }
    }
    setHoverIndex(closestIdx);
  };

  const hoveredPoint =
    hoverIndex !== null && values[hoverIndex] !== undefined
      ? {
          value: values[hoverIndex],
          idx: hoverIndex,
          x: getX(times[hoverIndex] ?? minTime),
          y: getY(values[hoverIndex]),
          time: times[hoverIndex] ?? minTime,
        }
      : null;

  const axisTicks = Array.from({ length: 5 }, (_, idx) => minTime + (timeRange * idx) / 4);
  const yTicks = Array.from({ length: 5 }, (_, idx) => max - (range * idx) / 4);
  const formatTick = (time: number) =>
    new Date(time).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick, index) => {
          const y = getY(tick);
          return (
            <g key={`y-${index}`}>
              <line
                x1={marginLeft}
                y1={y}
                x2={width - 6}
                y2={y}
                stroke="rgba(148,163,184,0.12)"
                strokeWidth={1}
              />
              <text x={marginLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                {tick.toFixed(2)} dBm
              </text>
            </g>
          );
        })}
        {linePath && (
          <>
            <polyline
              points={linePath}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.72}
            />
            <line
              x1={marginLeft}
              y1={marginTop}
              x2={marginLeft}
              y2={height - marginBottom}
              stroke="rgba(148,163,184,0.2)"
              strokeWidth={1}
            />
            <line
              x1={marginLeft}
              y1={height - marginBottom}
              x2={width - 6}
              y2={height - marginBottom}
              stroke="rgba(148,163,184,0.2)"
              strokeWidth={1}
            />
          </>
        )}
        {significantPoints.map((point) => (
          <circle
            key={`sig-${point.idx}`}
            cx={point.x}
            cy={point.y}
            r={3.2}
            fill={color}
            fillOpacity={0.95}
            stroke="rgba(15, 23, 42, 0.9)"
            strokeWidth={1.5}
          />
        ))}
        {hoveredPoint && (
          <>
            <line
              x1={hoveredPoint.x}
              y1={marginTop}
              x2={hoveredPoint.x}
              y2={height - marginBottom}
              stroke="rgba(250, 204, 21, 0.35)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r={5}
              fill={color}
              stroke="#0f172a"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      {hoveredPoint && (
        <div
          style={{
            position: 'absolute',
            left: hoveredPoint.x - 45,
            bottom: height - marginBottom - 8,
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.98)',
            border: `1px solid ${color}`,
            borderRadius: 8,
            padding: '8px 12px',
            color: '#e2e8f0',
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: 9, marginBottom: 2 }}>{formatTick(hoveredPoint.time)}</div>
          <div>{hoveredPoint.value.toFixed(2)}</div>
          {significantPoints.some((point) => point.idx === hoveredPoint.idx) && (
            <div style={{ color: '#facc15', fontSize: 9, marginTop: 2 }}>Oscilacao relevante</div>
          )}
        </div>
      )}
      {axisTicks.map((tick, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: getX(tick) - 40,
            top: height - 20,
            width: 80,
            textAlign: 'center',
            fontSize: 10,
            color: '#94a3b8',
          }}
        >
          {formatTick(tick)}
        </div>
      ))}
    </div>
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
      pane.style.zIndex = '700';
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

export function MapView({ options, onOptionsChange, data, timeRange, timeZone }: Props) {
  const theme = useTheme2();
  const centerLat = Number.isFinite(options.centerLat) ? options.centerLat : DEFAULT_CENTER_LAT;
  const centerLng = Number.isFinite(options.centerLng) ? options.centerLng : DEFAULT_CENTER_LNG;
  const zoom = Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM;
  const transportLineAnimation = options.transportLineAnimation ?? 'flow';
  const transportLineWeight = Math.max(1, Math.min(10, options.transportLineWeight ?? 4));
  const transportAnimationSpeed = Math.max(1, Math.min(10, options.transportAnimationSpeed ?? 5));
  const center: [number, number] = [centerLat, centerLng];
  const mapRef = React.useRef<L.Map | null>(null);
  const fullscreenRef = React.useRef(false);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(null);
  const [selectedPopId, setSelectedPopId] = React.useState<string | null>(null);
  const [selectedLinkSide, setSelectedLinkSide] = React.useState<string | null>(null);
  const [rxHistory, setRxHistory] = React.useState<{
    name: string;
    series?: { values: number[]; times: number[] };
  } | null>(null);
  const [currentZoom, setCurrentZoom] = React.useState(zoom);
  const [dashTick, setDashTick] = React.useState(0);
  const [hitboxReady, setHitboxReady] = React.useState(false);
  const [activeDownRouteIndex, setActiveDownRouteIndex] = React.useState(0);
  const [statsCollapsed, setStatsCollapsed] = React.useState(true);
  const [eventSearch, setEventSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const linkCardRef = React.useRef<HTMLDivElement | null>(null);
  const leftListRef = React.useRef<HTMLDivElement | null>(null);
  const rightListRef = React.useRef<HTMLDivElement | null>(null);
  const linkCenterRef = React.useRef<HTMLDivElement | null>(null);
  const [linkLayout, setLinkLayout] = React.useState({ leftX: 0, rightX: 0, top: 0, height: 0, leftListTop: 0 });
  const mapZoomScale = Math.pow(2, currentZoom - zoom);
  const dataSeries = data?.series ?? [];

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
    const v = getLastMapView();
    if (v) {
      onOptionsChange({ ...options, centerLat: v.lat, centerLng: v.lng, zoom: v.zoom, captureNow: false });
      return;
    }
    onOptionsChange({ ...options, captureNow: false });
  }, [onOptionsChange, options]);

  const routes = options.routes ?? [];
  const pops = options.pops ?? [];

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

  const selectedRoute = selectedRouteId ? (routes.find((route) => route.id === selectedRouteId) ?? null) : null;
  const selectedPop = selectedPopId ? (pops.find((pop) => pop.id === selectedPopId) ?? null) : null;
  const selectedRouteDistance = selectedRoute ? distanceKm(selectedRoute.points) : 0;
  const routeById = React.useMemo(() => new Map(routes.map((route) => [route.id, route] as const)), [routes]);
  const activeItemKeys = React.useMemo(() => {
    const keys = collectMapItemKeys(routes);
    if (selectedRoute || selectedPop || rxHistory) {
      collectDetailItemKeys(selectedRoute, selectedPop).forEach((key) => keys.add(key));
    }
    return keys;
  }, [routes, rxHistory, selectedPop, selectedRoute]);
  const activeSeries = React.useMemo(
    () => filterSeriesByItems(dataSeries, activeItemKeys),
    [activeItemKeys, dataSeries]
  );
  const itemValueMap = React.useMemo(
    () => buildItemValueMap(activeSeries, theme, timeZone),
    [activeSeries, theme, timeZone]
  );
  const itemSeriesMap = React.useMemo(() => buildItemSeriesMap(activeSeries), [activeSeries]);
  const itemSeriesTimeMap = React.useMemo(() => buildItemSeriesWithTimeMap(activeSeries), [activeSeries]);

  const formatBitsPerSec = (value: number | null | undefined): string => {
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
  };

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
    (route: (typeof routes)[number]) => {
      const base = resolveRouteStatus(route.interfaceItem, route.onlineValue, itemValueMap);
      if (base === 'down') {
        return 'down';
      }
      const thresholds = route.thresholds;
      if (!thresholds?.enabled) {
        return base;
      }
      const rxValue = getRouteMetricNumeric(route, 'rx');
      const txValue = getRouteMetricNumeric(route, 'tx');
      const downloadValue = getRouteMetricNumeric(route, 'download');
      const uploadValue = getRouteMetricNumeric(route, 'upload');
      const bandwidthValue =
        downloadValue !== null && uploadValue !== null
          ? Math.max(downloadValue, uploadValue)
          : (downloadValue ?? uploadValue ?? null);
      const flappingWindowMs = (thresholds.flappingWindowMin ?? 0) * 60000;
      const flappingCount = thresholds.flappingCount ?? 0;
      const series = route.interfaceItem ? itemSeriesTimeMap.get(route.interfaceItem) : undefined;
      const flaps = series && flappingWindowMs > 0 ? countFlaps(series, flappingWindowMs) : 0;

      const inAlert =
        (thresholds.rxLow !== undefined && rxValue !== null && rxValue <= thresholds.rxLow) ||
        (thresholds.txLow !== undefined && txValue !== null && txValue <= thresholds.txLow) ||
        (thresholds.bandwidthHigh !== undefined &&
          bandwidthValue !== null &&
          bandwidthValue >= thresholds.bandwidthHigh) ||
        (flappingCount > 0 && flaps >= flappingCount);

      return inAlert ? 'alert' : base;
    },
    [getRouteMetricNumeric, itemSeriesTimeMap, itemValueMap]
  );

  const selectedRouteStatus = selectedRoute ? computeRouteStatus(selectedRoute) : 'unknown';
  const selectedRouteStatusLabel =
    selectedRouteStatus === 'online'
      ? 'Online'
      : selectedRouteStatus === 'down'
        ? 'Down'
        : selectedRouteStatus === 'alert'
          ? 'Degradado'
          : 'Sem dados';
  const selectedRouteDownTime =
    selectedRoute?.interfaceItem && selectedRouteStatus === 'down'
      ? getLastChangeMinutes(selectedRoute.interfaceItem, itemSeriesTimeMap)
      : null;
  const downRoutes = routes.filter((route) => route.points.length > 1 && computeRouteStatus(route) === 'down');
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
          status === 'online'
            ? route.colors.online
            : status === 'down'
              ? route.colors.down
              : status === 'alert'
                ? route.colors.alert
                : theme.colors.text.secondary;
        const statusLabel =
          status === 'online'
            ? 'Online'
            : status === 'down'
              ? 'Critico'
              : status === 'alert'
                ? 'Degradado'
                : 'Sem dados';

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
  }, [computeRouteStatus, routes, theme.colors.text.secondary]);

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

  React.useEffect(() => {
    const interval = setInterval(() => {
      setDashTick((prev) => (prev + transportAnimationSpeed) % 4000);
    }, 60);
    return () => clearInterval(interval);
  }, [transportAnimationSpeed]);

  React.useEffect(() => {
    if (downRoutes.length <= 1) {
      setActiveDownRouteIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setActiveDownRouteIndex((prev) => (prev + 1) % downRoutes.length);
    }, 30000);
    return () => clearInterval(interval);
  }, [downRoutes.length]);

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

  const getSeriesTimeUnit = (latestTime: number) => (latestTime < 1_000_000_000_000 ? 's' : 'ms');

  const filterSeriesByTimeRange = React.useCallback(
    (series?: { values: number[]; times: number[] }) => {
      if (!series || series.values.length === 0) {
        return series;
      }

      const fromMs = timeRange.from.valueOf();
      const toMs = timeRange.to.valueOf();
      const isSeconds = getSeriesTimeUnit(series.times[series.times.length - 1]) === 's';
      const rangeStart = isSeconds ? Math.floor(fromMs / 1000) : fromMs;
      const rangeEnd = isSeconds ? Math.ceil(toMs / 1000) : toMs;
      const filtered = { values: [] as number[], times: [] as number[] };

      for (let i = 0; i < series.values.length; i++) {
        const time = series.times[i];
        if (time >= rangeStart && time <= rangeEnd) {
          filtered.values.push(series.values[i]);
          filtered.times.push(time);
        }
      }

      return filtered.values.length > 0 ? filtered : series;
    },
    [timeRange.from, timeRange.to]
  );

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%', display: 'flex' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
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
          }
          .jmap-pop-icon__img {
            width: 28px;
            height: 28px;
            object-fit: contain;
          }
          .jmap-pop-icon--fallback::before {
            content: 'POP';
            font-size: 10px;
            font-weight: 700;
            color: #e2e8f0;
            letter-spacing: 0.3px;
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
          ⛶
        </button>

        {selectedRoute && (
          <div
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedRoute.name || 'Sem nome'}</div>
                  <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>
                    Distancia total: {selectedRouteDistance.toFixed(2)} km
                  </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                <div
                  style={{
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 10,
                    padding: 10,
                    background: theme.colors.background.secondary,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.colors.text.secondary }}>
                    Status
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: 11,
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
                          fontSize: 10,
                          color: '#fca5a5',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginBottom: 4,
                        }}
                      >
                        SLA - Tempo fora
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#f87171' }}>
                        {formatMinutes(selectedRouteDownTime)}
                      </div>
                      <div style={{ fontSize: 10, color: theme.colors.text.secondary, marginTop: 4 }}>
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
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.colors.text.secondary }}>
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
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
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
                            <div style={{ fontSize: 11, color: theme.colors.text.secondary, marginTop: 2 }}>
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
                                    const series = itemSeriesTimeMap.get(iface.rxItem ?? '');
                                    setRxHistory({
                                      name: iface.name || 'Interface',
                                      series,
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
                                      TX: <strong>{txValue?.text ?? '--'}</strong>
                                    </span>
                                    <span>
                                      RX: <strong>{rxValue?.text ?? '--'}</strong>
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
                                    fontSize: 11,
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
                                        const series = itemSeriesTimeMap.get(iface.rxItem ?? '');
                                        setRxHistory({
                                          name: iface.name || 'Interface',
                                          series,
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
                                          TX: <strong>{txValue?.text ?? '--'}</strong>
                                        </span>
                                        <span>
                                          RX: <strong>{rxValue?.text ?? '--'}</strong>
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
                                  const color = down ? '#ef4444' : '#22c55e';
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
                const filteredSeries = filterSeriesByTimeRange(rxHistory.series);
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>
                        Historico RX - {rxHistory.name}
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
                        width={680}
                        height={180}
                        color={theme.colors.success.main}
                      />
                      <div style={{ fontSize: 10, color: theme.colors.text.secondary, marginTop: 6 }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedPop.name || 'Sem nome'}</div>
                  <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>
                    {selectedPop.lat.toFixed(4)}, {selectedPop.lng.toFixed(4)}
                  </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                {(selectedPop.equipments ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: theme.colors.text.secondary }}>Nenhum equipamento cadastrado</div>
                ) : (
                  selectedPop.equipments.map((equipment) => {
                    const statusValue = equipment.statusItem ? getMetricValue(equipment.statusItem) : undefined;
                    const status = resolveRouteStatus(equipment.statusItem, equipment.onlineValue ?? '1', itemValueMap);
                    const lastChange = getLastChangeMinutes(equipment.statusItem, itemSeriesTimeMap);
                    const visibleMetrics =
                      equipment.metrics?.filter((metric) => (metric.showInDetails ?? true) && metric.item) ?? [];

                    return (
                      <div
                        key={equipment.id}
                        style={{
                          border: `1px solid ${theme.colors.border.weak}`,
                          borderRadius: 10,
                          padding: 12,
                          background: theme.colors.background.secondary,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{equipment.name || 'Equipamento'}</div>
                            <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>
                              {equipment.ip || '--'} {equipment.type ? `• ${equipment.type}` : ''}
                            </div>
                          </div>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              background:
                                status === 'online'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : status === 'down'
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : 'rgba(245, 158, 11, 0.15)',
                              border:
                                status === 'online'
                                  ? '1px solid rgba(16, 185, 129, 0.35)'
                                  : status === 'down'
                                    ? '1px solid rgba(239, 68, 68, 0.35)'
                                    : '1px solid rgba(245, 158, 11, 0.35)',
                            }}
                          >
                            {status === 'online' ? 'Online' : status === 'down' ? 'Down' : 'Sem dados'}
                          </span>
                        </div>

                        <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>
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
                              style={{ fontSize: 11, textTransform: 'uppercase', color: theme.colors.text.secondary }}
                            >
                              Observação
                            </div>
                            <div>{equipment.observation}</div>
                          </div>
                        )}

                        {visibleMetrics.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {visibleMetrics.map((metric) => {
                              const value = metric.item ? getMetricValue(metric.item) : undefined;
                              const series = metric.item ? itemSeriesMap.get(metric.item) : undefined;
                              return (
                                <div
                                  key={metric.id}
                                  style={{
                                    border: `1px solid ${theme.colors.border.weak}`,
                                    borderRadius: 8,
                                    padding: 8,
                                    background: theme.colors.background.primary,
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}
                                  >
                                    <span>{metric.name || 'Metrica'}</span>
                                    <span>{value?.text ?? '--'}</span>
                                  </div>
                                  <div style={{ marginTop: 6 }}>
                                    <Sparkline
                                      values={series}
                                      width={240}
                                      height={60}
                                      color={theme.colors.success.main}
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
          className="jmap-map-container"
        >
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
          {routes.map((route) => {
            if (route.points.length <= 1) {
              return null;
            }
            const status = computeRouteStatus(route);
            const statusColor =
              status === 'online' ? route.colors.online : status === 'down' ? route.colors.down : route.colors.alert;
            const statusClass =
              status === 'online' ? 'jmap-route--online' : status === 'down' ? 'jmap-route--down' : 'jmap-route--alert';
            const modeClass = transportLineAnimation === 'static' ? 'jmap-route--mode-static' : 'jmap-route--mode-flow';
            const dashArray =
              transportLineAnimation === 'static' && status !== 'down'
                ? undefined
                : status === 'online'
                  ? '14 10'
                  : status === 'down'
                    ? '6 8'
                    : '8 10';
            const speed = status === 'online' ? 2 : status === 'down' ? 3.5 : 1.5;
            const dashOffset = transportLineAnimation === 'flow' ? -(dashTick * speed) % 240 : 0;
            return (
              <React.Fragment key={route.id}>
                <Polyline
                  positions={route.points.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: statusColor,
                    className: `jmap-route ${statusClass} ${modeClass}`.trim(),
                    dashArray,
                    dashOffset: dashOffset ? `${dashOffset}` : undefined,
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
          {pops.map((pop) => {
            const iconUrl = normalizePopIconUrl(pop.iconUrl);
            const safeIconUrl = iconUrl ? escapeHtmlAttr(iconUrl) : '';
            const baseIconSizePx = Math.min(128, Math.max(16, pop.iconSizePx ?? 32));
            const iconScaleMode = pop.iconScaleMode === 'fixed' ? 'fixed' : 'map';
            const iconZoomScale = iconScaleMode === 'fixed' ? 1 : mapZoomScale;
            const iconSizePx = Math.min(256, Math.max(8, Math.round(baseIconSizePx * iconZoomScale)));
            const iconInnerSizePx = Math.max(6, Math.round(iconSizePx * 0.875));
            const iconRadiusPx = Math.max(4, Math.round(iconSizePx * 0.2));
            const tooltipOffsetY = -(Math.round(iconSizePx / 2) + Math.max(8, Math.round(iconSizePx * 0.4)));
            const tooltipFontSize = Math.max(9, Math.min(18, Math.round(11 * Math.sqrt(iconZoomScale))));
            const hitboxRadius = Math.max(10, Math.round(iconSizePx * 0.75));
            const coverageRadiusMeters = Math.max(0, pop.coverageRadiusMeters ?? 0);
            const coverageColor = pop.coverageColor || '#2563eb';
            const coverageOpacity = Math.min(1, Math.max(0, pop.coverageOpacity ?? 0.2));
            const icon = iconUrl
              ? L.divIcon({
                  className: '',
                  html: `<div class="jmap-pop-icon" style="width:${iconSizePx}px;height:${iconSizePx}px;border-radius:${iconRadiusPx}px;">
                  <img class="jmap-pop-icon__img" style="width:${iconInnerSizePx}px;height:${iconInnerSizePx}px;" src="${safeIconUrl}" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.onerror=null;this.style.display='none';if(this.parentElement){this.parentElement.classList.add('jmap-pop-icon--fallback');}" />
                </div>`,
                  iconSize: [iconSizePx, iconSizePx],
                  iconAnchor: [iconSizePx / 2, iconSizePx / 2],
                })
              : L.divIcon({
                  className: '',
                  html: `<div style="width:${iconSizePx}px;height:${iconSizePx}px;border-radius:50%;background:#60a5fa;border:2px solid #1f2937;"></div>`,
                  iconSize: [iconSizePx, iconSizePx],
                  iconAnchor: [iconSizePx / 2, iconSizePx / 2],
                });
            return (
              <React.Fragment key={pop.id}>
                {coverageRadiusMeters > 0 && (
                  <Circle
                    center={[pop.lat, pop.lng]}
                    radius={coverageRadiusMeters}
                    pathOptions={{
                      color: coverageColor,
                      weight: 1,
                      opacity: Math.min(1, coverageOpacity + 0.25),
                      fillColor: coverageColor,
                      fillOpacity: coverageOpacity,
                    }}
                    interactive={false}
                  />
                )}
                {pop.showName !== false && (
                  <Marker position={[pop.lat, pop.lng]} icon={icon}>
                    <Tooltip
                      className="jmap-tooltip"
                      direction="top"
                      permanent
                      offset={[0, tooltipOffsetY]}
                      interactive={false}
                    >
                      <div style={{ fontSize: tooltipFontSize, fontWeight: 600 }}>{pop.name || 'Sem nome'}</div>
                    </Tooltip>
                  </Marker>
                )}
                {pop.showName === false && (
                  <Marker position={[pop.lat, pop.lng]} icon={icon} />
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
        </MapContainer>
        {downRoutes.length > 0 &&
          !selectedRouteId &&
          (() => {
            const currentDownRoute = downRoutes[activeDownRouteIndex];
            if (!currentDownRoute) return null;
            const isMultiple = downRoutes.length > 1;
            return (
              <div
                className="jmap-autofocus-panel"
                style={{
                  position: 'absolute',
                  left: 20,
                  bottom: 20,
                  zIndex: 800,
                  minWidth: 280,
                  maxWidth: 340,
                  padding: '14px 18px',
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.88) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  borderRadius: 14,
                  boxShadow: '0 0 30px rgba(239, 68, 68, 0.25), inset 0 0 20px rgba(239, 68, 68, 0.08)',
                  backdropFilter: 'blur(12px)',
                  color: '#f1f5f9',
                  fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", sans-serif',
                  animation: 'jmap-hologram-fade 0.4s ease-out',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -2,
                    left: 20,
                    right: 20,
                    height: 3,
                    background: 'linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.8), transparent)',
                    borderRadius: 2,
                    animation: 'jmap-hologram-scan 2s ease-in-out infinite',
                  }}
                />
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}
                >
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#fca5a5',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {isMultiple ? 'Multiplas Rotas em Falha' : 'Rota em Falha'}
                  </div>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#ef4444',
                      boxShadow: '0 0 10px #ef4444',
                      animation: 'jmap-blink 1s ease-in-out infinite',
                    }}
                  />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                  {currentDownRoute.name || 'Sem nome'}
                </div>
                {isMultiple && (
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setActiveDownRouteIndex((prev) => (prev - 1 + downRoutes.length) % downRoutes.length)
                      }
                      style={{
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: 6,
                        padding: '4px 12px',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      ◀
                    </button>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {activeDownRouteIndex + 1} / {downRoutes.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDownRouteIndex((prev) => (prev + 1) % downRoutes.length)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.2)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: 6,
                        padding: '4px 12px',
                        color: '#fca5a5',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
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
              <div style={{ fontSize: 11, fontWeight: 600 }}>Top 3 piores sinais RX</div>
              {topRxSignals.length === 0 ? (
                <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>Nenhum item RX encontrado.</div>
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
                          fontSize: 10,
                          color: theme.colors.text.secondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.trunkName} • {item.interfaceName}
                      </span>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{item.rxText}</span>
                  </button>
                ))
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing(1) }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Todas as rotas</div>
              {visibleRouteIncidents.length === 0 && (
                <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>Nenhuma rota encontrada.</div>
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
                            fontSize: 10,
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
                          fontSize: 10,
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
