import React from 'react';
import L from 'leaflet';
import { DataFrame, Field, FieldType, PanelData, TimeZone, getDisplayProcessor } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { PanelOptions } from '../types';
import { getLastMapView, setLastMapView } from '../mapState';

type Props = {
  options: PanelOptions;
  onOptionsChange: (options: PanelOptions) => void;
  data: PanelData;
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

type ItemFormatter = (value: number) => string;

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

const buildItemFormatterMap = (series: DataFrame[], theme: ReturnType<typeof useTheme2>, timeZone?: TimeZone) => {
  const formatters = new Map<string, ItemFormatter>();

  const addFormatter = (label?: string, formatter?: ItemFormatter) => {
    const key = label?.trim();
    if (!key || !formatter || formatters.has(key)) {
      return;
    }
    formatters.set(key, formatter);
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

    const processor = getDisplayProcessor({ field: valueField, theme, timeZone });
    const formatter: ItemFormatter = (value: number) => processor(value).text ?? String(value);

    addFormatter(frame.name, formatter);
    addFormatter(valueField.name, formatter);
    addFormatter(valueField.config?.displayNameFromDS, formatter);
    addFormatter(valueField.config?.displayName, formatter);
  });

  return formatters;
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

const average = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

const range = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, spread: max - min };
};

const normalizeValue = (value: unknown) => String(value ?? '').trim().toLowerCase();

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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getPointAlongRoute = (points: Array<{ lat: number; lng: number }>, fraction: number) => {
  if (points.length === 0) {
    return null;
  }
  if (points.length === 1) {
    return points[0];
  }
  const clamped = clamp01(fraction);
  if (clamped === 0) {
    return points[0];
  }
  if (clamped === 1) {
    return points[points.length - 1];
  }
  const total = distanceKm(points);
  if (total === 0) {
    return points[0];
  }
  const target = total * clamped;
  let acc = 0;
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
    const seg = 6371 * c;
    if (acc + seg >= target) {
      const ratio = seg === 0 ? 0 : (target - acc) / seg;
      return {
        lat: a.lat + (b.lat - a.lat) * ratio,
        lng: a.lng + (b.lng - a.lng) * ratio,
      };
    }
    acc += seg;
  }
  return points[points.length - 1];
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

type HistoryWindow = {
  label: string;
  days: number;
  min: number | null;
  max: number | null;
  avg: number | null;
};

type HistoryLineChartProps = {
  series?: { values: number[]; times: number[] };
  width: number;
  height: number;
  color: string;
};

const HistoryLineChart = ({ series, width, height, color }: HistoryLineChartProps) => {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  if (!series || series.values.length < 2) {
    return <div style={{ fontSize: 12 }}>--</div>;
  }

  const smoothWindow = 50;
  const smoothValues = series.values.map((_, idx) => {
    const start = Math.max(0, idx - smoothWindow + 1);
    const slice = series.values.slice(start, idx + 1);
    const sum = slice.reduce((acc, v) => acc + v, 0);
    return sum / slice.length;
  });

  const values = smoothValues;
  const times = series.times;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const tickStep = 2;
  const tickMin = Math.floor(min / tickStep) * tickStep;
  const tickMax = Math.ceil(max / tickStep) * tickStep;
  const range = tickMax - tickMin || tickStep;

  const marginLeft = 66;
  const marginBottom = 18;
  const plotWidth = Math.max(1, width - marginLeft - 6);
  const plotHeight = Math.max(1, height - marginBottom - 6);
  const tickCount = 5;

  const points = values
    .map((value, index) => {
      const x = marginLeft + (index / (values.length - 1)) * plotWidth;
      const y = 4 + plotHeight - ((value - tickMin) / range) * plotHeight;
      return { x, y };
    })
    .map((p) => `${p.x},${p.y}`)
    .join(' ');

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = e.clientX - rect.left - marginLeft;
    const clampedX = Math.max(0, Math.min(plotWidth, rawX));
    const idx = Math.round((clampedX / plotWidth) * (values.length - 1));
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    setHoverIndex(clamped);
  };

  const hover = hoverIndex !== null ? hoverIndex : null;
  const hoverPoint =
    hover !== null
      ? {
          x: marginLeft + (hover / (values.length - 1)) * plotWidth,
          y: 4 + plotHeight - ((values[hover] - tickMin) / range) * plotHeight,
        }
      : null;

  const tooltip =
    hover !== null
      ? {
          value: values[hover].toFixed(2),
          time: new Date(times[hover]).toLocaleString(),
        }
      : null;

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {Array.from({ length: tickCount + 1 }).map((_, i) => {
          const y = 4 + (plotHeight / tickCount) * i;
          const value = tickMax - (range / tickCount) * i;
          return (
            <g key={`grid-${i}`}>
              <line
                x1={marginLeft}
                y1={y}
                x2={marginLeft + plotWidth}
                y2={y}
                stroke="rgba(148,163,184,0.18)"
              />
              <text
                x={marginLeft - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(226,232,240,0.7)"
              >
                {value.toFixed(2)} dBm
              </text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke={color} strokeWidth={2} />
        {hoverPoint && (
          <>
            <line
              x1={hoverPoint.x}
              y1={4}
              x2={hoverPoint.x}
              y2={4 + plotHeight}
              stroke="rgba(148,163,184,0.45)"
            />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={4} fill={color} />
          </>
        )}
      </svg>
      {tooltip && hoverPoint && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(hoverPoint.x + 8, 0), width - 160),
            top: Math.max(hoverPoint.y - 32, 0),
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            color: '#e2e8f0',
            pointerEvents: 'none',
            width: 150,
          }}
        >
          <div>RX: {tooltip.value}</div>
          <div style={{ color: '#94a3b8' }}>{tooltip.time}</div>
        </div>
      )}
    </div>
  );
};

type DualHistoryChartProps = {
  primary?: { values: number[]; times: number[] };
  secondary?: { values: number[]; times: number[] };
  width?: number;
  height: number;
  primaryColor: string;
  secondaryColor: string;
  formatPrimary?: (value: number | null) => string;
  formatSecondary?: (value: number | null) => string;
};

const DualHistoryChart = ({
  primary,
  secondary,
  width,
  height,
  primaryColor,
  secondaryColor,
  formatPrimary,
  formatSecondary,
}: DualHistoryChartProps) => {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const base = primary?.values?.length ? primary : secondary;
  const renderWidth = width ?? (containerWidth > 0 ? containerWidth : 520);

  React.useEffect(() => {
    if (width !== undefined) {
      return;
    }
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const update = () => setContainerWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [width]);

  if (!base || base.values.length < 2 || renderWidth <= 0) {
    return <div style={{ fontSize: 12 }}>--</div>;
  }

  const allValues = [...(primary?.values ?? []), ...(secondary?.values ?? [])];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const buildPoints = (series?: { values: number[] }) => {
    if (!series || series.values.length < 2) {
      return '';
    }
    return series.values
      .map((value, index) => {
        const x = (index / (series.values.length - 1)) * renderWidth;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');
  };

  const buildAreaPoints = (series?: { values: number[] }) => {
    if (!series || series.values.length < 2) {
      return '';
    }
    const linePoints = series.values
      .map((value, index) => {
        const x = (index / (series.values.length - 1)) * renderWidth;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      })
      .join(' ');
    return `${linePoints} ${renderWidth},${height} 0,${height}`;
  };

  const primaryPoints = buildPoints(primary);
  const secondaryPoints = buildPoints(secondary);
  const primaryArea = buildAreaPoints(primary);
  const secondaryArea = buildAreaPoints(secondary);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * (base.values.length - 1));
    const clamped = Math.max(0, Math.min(base.values.length - 1, idx));
    setHoverIndex(clamped);
  };

  const hover = hoverIndex !== null ? hoverIndex : null;
  const hoverPoint =
    hover !== null
      ? {
          x: (hover / (base.values.length - 1)) * renderWidth,
          y: height - ((base.values[hover] - min) / range) * height,
        }
      : null;

  const hoverTime = hover !== null ? base.times[hover] : null;
  const primaryValue = hover !== null && primary?.values ? primary.values[Math.min(hover, primary.values.length - 1)] : null;
  const secondaryValue =
    hover !== null && secondary?.values ? secondary.values[Math.min(hover, secondary.values.length - 1)] : null;

  const clipId = React.useMemo(() => `dual-chart-clip-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: width ?? '100%', height, overflow: 'hidden' }}>
      <svg
        width={renderWidth}
        height={height}
        viewBox={`0 0 ${renderWidth} ${height}`}
        style={{ display: 'block' }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={renderWidth} height={height} />
          </clipPath>
        </defs>
        {secondaryArea && (
          <polygon
            points={secondaryArea}
            fill={secondaryColor}
            opacity={0.12}
            clipPath={`url(#${clipId})`}
          />
        )}
        {primaryArea && (
          <polygon
            points={primaryArea}
            fill={primaryColor}
            opacity={0.12}
            clipPath={`url(#${clipId})`}
          />
        )}
        {secondaryPoints && (
          <polyline
            points={secondaryPoints}
            fill="none"
            stroke={secondaryColor}
            strokeWidth={2}
            clipPath={`url(#${clipId})`}
          />
        )}
        {primaryPoints && (
          <polyline
            points={primaryPoints}
            fill="none"
            stroke={primaryColor}
            strokeWidth={2}
            clipPath={`url(#${clipId})`}
          />
        )}
        {hoverPoint && (
          <>
            <line x1={hoverPoint.x} y1={0} x2={hoverPoint.x} y2={height} stroke="rgba(148,163,184,0.45)" />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r={4} fill={primaryColor} />
          </>
        )}
      </svg>
      {hover !== null && hoverPoint && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(hoverPoint.x + 8, 0), renderWidth - 180),
            top: Math.max(hoverPoint.y - 36, 0),
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            color: '#e2e8f0',
            pointerEvents: 'none',
            width: 170,
          }}
        >
          {hoverTime && <div style={{ color: '#94a3b8' }}>{new Date(hoverTime).toLocaleString()}</div>}
          <div>Download: {formatPrimary ? formatPrimary(primaryValue) : primaryValue !== null ? primaryValue.toFixed(1) : '--'}</div>
          <div>Upload: {formatSecondary ? formatSecondary(secondaryValue) : secondaryValue !== null ? secondaryValue.toFixed(1) : '--'}</div>
        </div>
      )}
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

export function MapView({ options, onOptionsChange, data, timeZone }: Props) {
  const theme = useTheme2();
  const centerLat = Number.isFinite(options.centerLat) ? options.centerLat : DEFAULT_CENTER_LAT;
  const centerLng = Number.isFinite(options.centerLng) ? options.centerLng : DEFAULT_CENTER_LNG;
  const zoom = Number.isFinite(options.zoom) ? options.zoom : DEFAULT_ZOOM;
  const center: [number, number] = [centerLat, centerLng];
  const [search, setSearch] = React.useState('');
  const [filterTerm, setFilterTerm] = React.useState('');
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const mapRef = React.useRef<L.Map | null>(null);
  const [selectedRouteId, setSelectedRouteId] = React.useState<string | null>(null);
  const [selectedPopId, setSelectedPopId] = React.useState<string | null>(null);
  const [rxHistory, setRxHistory] = React.useState<{
    name: string;
    series?: { values: number[]; times: number[] };
  } | null>(null);
  const [badgeScaleOverride, setBadgeScaleOverride] = React.useState(1);
  const [dashTick, setDashTick] = React.useState(0);
  const [hitboxReady, setHitboxReady] = React.useState(false);
  const [lastInteraction, setLastInteraction] = React.useState(0);
  const [autoFocusIndex, setAutoFocusIndex] = React.useState(0);
  const [statsCollapsed, setStatsCollapsed] = React.useState(true);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const normalizedSearch = filterTerm.trim().toLowerCase();
  const itemValueMap = React.useMemo(
    () => buildItemValueMap(data?.series ?? [], theme, timeZone),
    [data, theme, timeZone]
  );
  const itemFormatterMap = React.useMemo(
    () => buildItemFormatterMap(data?.series ?? [], theme, timeZone),
    [data, theme, timeZone]
  );
  const itemSeriesMap = React.useMemo(() => buildItemSeriesMap(data?.series ?? []), [data]);
  const itemSeriesTimeMap = React.useMemo(() => buildItemSeriesWithTimeMap(data?.series ?? []), [data]);
  const autoFocusPauseMs = 15000;
  const autoFocusIntervalMs = 8000;
  const autoFocusMaxZoom = 12;

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


  const defaultIcon = L.divIcon({
    className: '',
    html: '<div style="width:10px;height:10px;border-radius:50%;background:#60a5fa;border:2px solid #1f2937;"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

  const routes = options.routes ?? [];
  const pops = options.pops ?? [];

  const filteredRoutes = normalizedSearch
    ? routes.filter((route) => route.name.toLowerCase().includes(normalizedSearch))
    : routes;
  const filteredPops = normalizedSearch
    ? pops.filter((pop) => pop.name.toLowerCase().includes(normalizedSearch))
    : pops;

  const suggestionRoutes = normalizedSearch
    ? filteredRoutes
    : routes;
  const suggestionPops = normalizedSearch
    ? filteredPops
    : pops;

  const focusRoute = (routeId: string) => {
    const route = routes.find((r) => r.id === routeId);
    if (!route || !mapRef.current) {
      return;
    }
    if (route.points.length > 1) {
      const bounds = L.latLngBounds(route.points.map((p) => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [24, 24] });
    } else if (route.points.length === 1) {
      mapRef.current.setView([route.points[0].lat, route.points[0].lng], Math.max(zoom, 13));
    }
  };

  const focusPop = (popId: string) => {
    const pop = pops.find((p) => p.id === popId);
    if (!pop || !mapRef.current) {
      return;
    }
    mapRef.current.setView([pop.lat, pop.lng], Math.max(zoom, 13));
  };

  const totalKm = routes.reduce((acc, route) => acc + distanceKm(route.points), 0);

  const activeRoutes = routes.filter((route) => route.points.length >= 2).length;
  const selectedRoute = selectedRouteId ? routes.find((route) => route.id === selectedRouteId) ?? null : null;
  const selectedPop = selectedPopId ? pops.find((pop) => pop.id === selectedPopId) ?? null : null;
  const selectedRouteDistance = selectedRoute ? distanceKm(selectedRoute.points) : 0;

  const getMetricValue = React.useCallback(
    (item?: string) => (item ? itemValueMap.get(item) : undefined),
    [itemValueMap]
  );

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
  const getRouteMetricValue = React.useCallback(
    (route: typeof routes[number], metricId: string) => {
      const metric = route.metrics.find((m) => m.id === metricId);
      return metric?.zabbixItem ? getMetricValue(metric.zabbixItem) : undefined;
    },
    [getMetricValue]
  );

  const getRouteMetricNumeric = React.useCallback(
    (route: typeof routes[number], metricId: string) => {
      const metric = route.metrics.find((m) => m.id === metricId);
      return metric?.zabbixItem ? getNumericValue(metric.zabbixItem) : null;
    },
    [getNumericValue]
  );

  const computeRouteStatus = React.useCallback(
    (route: typeof routes[number]) => {
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
          : downloadValue ?? uploadValue ?? null;
      const flappingWindowMs = (thresholds.flappingWindowMin ?? 0) * 60000;
      const flappingCount = thresholds.flappingCount ?? 0;
      const series = route.interfaceItem ? itemSeriesTimeMap.get(route.interfaceItem) : undefined;
      const flaps = series && flappingWindowMs > 0 ? countFlaps(series, flappingWindowMs) : 0;

      const inAlert =
        (thresholds.rxLow !== undefined && rxValue !== null && rxValue <= thresholds.rxLow) ||
        (thresholds.txLow !== undefined && txValue !== null && txValue <= thresholds.txLow) ||
        (thresholds.bandwidthHigh !== undefined && bandwidthValue !== null && bandwidthValue >= thresholds.bandwidthHigh) ||
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
  const downRoutes = routes.filter((route) => route.points.length > 1 && computeRouteStatus(route) === 'down');
  const statusCounts = routes.reduce(
    (acc, route) => {
      const status = computeRouteStatus(route);
      acc.total += 1;
      if (status === 'online') {
        acc.online += 1;
      } else if (status === 'down') {
        acc.down += 1;
      } else if (status === 'alert') {
        acc.alert += 1;
      } else {
        acc.unknown += 1;
      }
      return acc;
    },
    { total: 0, online: 0, alert: 0, down: 0, unknown: 0 }
  );

  const availabilityStats = React.useMemo(() => {
    const windows = [
      { label: '24h', ms: 24 * 60 * 60 * 1000 },
      { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
      { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
    ];

    const routeSeries = routes
      .map((route) => {
        const itemKey = route.interfaceItem ?? '';
        const series = itemSeriesTimeMap.get(itemKey);
        const expected = toNumber(route.onlineValue ?? '1');
        if (!series || expected === null) {
          return null;
        }
        return { route, series, expected };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    let latestTime = 0;
    routeSeries.forEach(({ series }) => {
      const last = series.times[series.times.length - 1];
      if (last && last > latestTime) {
        latestTime = last;
      }
    });

    const availability = windows.map((window) => {
      if (!latestTime || routeSeries.length === 0) {
        return { label: window.label, pct: null, downMinutes: null, samples: 0 };
      }
      const windowStart = latestTime - window.ms;
      let online = 0;
      let total = 0;
      let downMs = 0;

      routeSeries.forEach(({ series, expected }) => {
        const values = series.values;
        const times = series.times;
        for (let i = 0; i < values.length; i++) {
          const time = times[i];
          if (time < windowStart) {
            continue;
          }
          total += 1;
          if (values[i] === expected) {
            online += 1;
          }
          if (i < values.length - 1) {
            const nextTime = times[i + 1];
            if (values[i] !== expected && nextTime > windowStart) {
              const start = Math.max(time, windowStart);
              const end = Math.min(nextTime, latestTime);
              downMs += Math.max(0, end - start);
            }
          }
        }
      });

      const pct = total > 0 ? (online / total) * 100 : null;
      const downMinutes = downMs > 0 ? downMs / 60000 : null;
      return { label: window.label, pct, downMinutes, samples: total };
    });

    const recentChanges = routeSeries
      .map(({ route, series }) => {
        const values = series.values;
        const times = series.times;
        if (values.length < 2) {
          return null;
        }
        const lastValue = values[values.length - 1];
        for (let i = values.length - 2; i >= 0; i--) {
          if (values[i] !== lastValue) {
            const changeTime = times[i + 1];
            const minutesAgo = latestTime ? (latestTime - changeTime) / 60000 : null;
            return { name: route.name || 'Sem nome', minutesAgo };
          }
        }
        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => (a.minutesAgo ?? Infinity) - (b.minutesAgo ?? Infinity))
      .slice(0, 3);

    return { availability, recentChanges };
  }, [routes, itemSeriesTimeMap]);

  const opticalStats = React.useMemo(() => {
    const txValues: number[] = [];
    const rxValues: number[] = [];
    const routeRxStats: Array<{ name: string; min: number; spread: number }> = [];

    routes.forEach((route) => {
      const perRouteRx: number[] = [];
      (route.trunks ?? []).forEach((trunk) => {
        trunk.interfaces.forEach((iface) => {
          if (iface.txItem) {
            const series = itemSeriesMap.get(iface.txItem);
            if (series) {
              txValues.push(...series);
            }
          }
          if (iface.rxItem) {
            const series = itemSeriesMap.get(iface.rxItem);
            if (series) {
              rxValues.push(...series);
              perRouteRx.push(...series);
            }
          }
        });
      });
      const routeRange = range(perRouteRx);
      if (routeRange) {
        routeRxStats.push({
          name: route.name || 'Sem nome',
          min: routeRange.min,
          spread: routeRange.spread,
        });
      }
    });

    const txRange = range(txValues);
    const rxRange = range(rxValues);
    const txAvg = average(txValues);
    const rxAvg = average(rxValues);
    const worstRx = [...routeRxStats].sort((a, b) => a.min - b.min).slice(0, 3);
    const worstOsc = [...routeRxStats].sort((a, b) => b.spread - a.spread).slice(0, 3);

    return {
      tx: { min: txRange?.min ?? null, max: txRange?.max ?? null, avg: txAvg },
      rx: { min: rxRange?.min ?? null, max: rxRange?.max ?? null, avg: rxAvg },
      worstRx,
      worstOsc,
    };
  }, [routes, itemSeriesMap]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setDashTick((prev) => (prev + 1) % 4000);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (downRoutes.length === 0) {
      return;
    }
    setAutoFocusIndex(0);
  }, [downRoutes.length]);

  React.useEffect(() => {
    if (downRoutes.length === 0) {
      return;
    }
    const interval = setInterval(() => {
      setAutoFocusIndex((prev) => (prev + 1) % downRoutes.length);
    }, autoFocusIntervalMs);
    return () => clearInterval(interval);
  }, [downRoutes.length, autoFocusIntervalMs]);

  React.useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    if (selectedRouteId) {
      return;
    }
    if (downRoutes.length === 0) {
      return;
    }
    const now = Date.now();
    if (now - lastInteraction < autoFocusPauseMs) {
      return;
    }
    const target = downRoutes[autoFocusIndex % downRoutes.length];
    if (!target) {
      return;
    }
    const bounds = L.latLngBounds(target.points.map((p) => [p.lat, p.lng]));
    mapRef.current.flyToBounds(bounds, { padding: [80, 80], maxZoom: autoFocusMaxZoom });
  }, [
    autoFocusIndex,
    autoFocusMaxZoom,
    autoFocusPauseMs,
    downRoutes,
    lastInteraction,
    selectedRouteId,
  ]);

  const formatNumber = (value: number | null, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '--';
    }
    return value.toFixed(digits);
  };

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

  const getLastChangeMinutes = (item?: string) => {
    if (!item) {
      return null;
    }
    const series = itemSeriesTimeMap.get(item);
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

  const getSeriesTimeUnit = (latestTime: number) => (latestTime < 1_000_000_000_000 ? 's' : 'ms');

  const buildHistoryWindows = (series?: { values: number[]; times: number[] }): HistoryWindow[] => {
    if (!series || series.values.length === 0) {
      return [
        { label: 'Atual', days: 0, min: null, max: null, avg: null },
        { label: '15 dias', days: 15, min: null, max: null, avg: null },
        { label: '30 dias', days: 30, min: null, max: null, avg: null },
      ];
    }
    const latestTime = series.times[series.times.length - 1];
    const latestValue = series.values[series.values.length - 1];
    const unitMultiplier = getSeriesTimeUnit(latestTime) === 's' ? 1 : 1000;

    const computeWindow = (days: number) => {
      const windowStart = latestTime - days * 24 * 60 * 60 * unitMultiplier;
      const values: number[] = [];
      for (let i = 0; i < series.values.length; i++) {
        if (series.times[i] >= windowStart) {
          values.push(series.values[i]);
        }
      }
      if (values.length === 0) {
        return { min: null, max: null, avg: null };
      }
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
      return { min, max, avg };
    };

    const lastWindow = computeWindow(15);
    const monthWindow = computeWindow(30);

    return [
      { label: 'Atual', days: 0, min: latestValue, max: latestValue, avg: latestValue },
      { label: '15 dias', days: 15, ...lastWindow },
      { label: '30 dias', days: 30, ...monthWindow },
    ];
  };

  const filterSeriesByDays = (series?: { values: number[]; times: number[] }) => series;

  const matchMetric = (metrics: Array<{ name?: string; item?: string }>, tokens: string[]) => {
    const lowerTokens = tokens.map((token) => token.toLowerCase());
    return metrics.find((metric) => {
      const name = metric.name?.toLowerCase() ?? '';
      return lowerTokens.some((token) => name.includes(token));
    });
  };

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative' }}>
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
          }
          .jmap-route--online {
            stroke-dasharray: 14 10;
            animation: jmap-flow 1.2s linear infinite;
            filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.35));
          }
          .jmap-route--alert {
            stroke-dasharray: 8 10;
            animation: jmap-flow 1.8s linear infinite;
            filter: drop-shadow(0 0 6px rgba(245, 158, 11, 0.45));
          }
          .jmap-route--down {
            stroke-dasharray: 6 8;
            animation: jmap-flow 0.9s linear infinite, jmap-pulse 1.4s ease-in-out infinite;
            filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.55));
          }
          @keyframes jmap-flow {
            0% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: -48; }
          }
          @keyframes jmap-pulse {
            0%, 100% { stroke-opacity: 0.35; stroke-width: 4; }
            50% { stroke-opacity: 1; stroke-width: 6; }
          }
          .jmap-transport-badge {
            animation: jmap-badge-pulse 1.6s ease-in-out infinite;
            pointer-events: none;
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
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.35);
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
          @keyframes jmap-badge-pulse {
            0%, 100% { box-shadow: 0 10px 22px rgba(0,0,0,0.28); }
            50% { box-shadow: 0 14px 26px rgba(16, 185, 129, 0.25); }
          }
        `}
      </style>
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          background: 'rgba(17, 24, 39, 0.75)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 6,
          padding: '6px 10px',
          color: '#e2e8f0',
          fontSize: 12,
        }}
      >
        <input
          type="text"
          placeholder="Buscar rotas e POPs..."
          value={search}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setSearch(value);
            setFilterTerm(value);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#e2e8f0',
            outline: 'none',
            width: 220,
          }}
        />
        {showSuggestions && (suggestionRoutes.length > 0 || suggestionPops.length > 0) && (
          <div
            style={{
              marginTop: 6,
              maxHeight: 220,
              overflowY: 'auto',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: 6,
              padding: 6,
            }}
          >
            {suggestionRoutes.map((route) => (
              <div
                key={`route-${route.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  focusRoute(route.id);
                  setSearch(route.name);
                  setFilterTerm('');
                }}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              >
                Rota: {route.name || 'Sem nome'}
              </div>
            ))}
            {suggestionPops.map((pop) => (
              <div
                key={`pop-${pop.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  focusPop(pop.id);
                  setSearch(pop.name);
                  setFilterTerm('');
                }}
                style={{
                  padding: '6px 8px',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              >
                POP: {pop.name || 'Sem nome'}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 52,
          zIndex: 1000,
          background: 'rgba(17, 24, 39, 0.75)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 8,
          padding: '8px 10px',
          color: '#e2e8f0',
          fontSize: 12,
          minWidth: 220,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Calibrar escala do badge</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0.01}
            max={3}
            step={0.01}
            value={badgeScaleOverride}
            onChange={(e) => setBadgeScaleOverride(Number(e.currentTarget.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 48, textAlign: 'right' }}>{badgeScaleOverride.toFixed(2)}x</span>
        </div>
      </div>

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
                  <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>
                    Interface de status: {selectedRoute.interfaceItem || '--'}
                  </div>
                </div>
              </div>

            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
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
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Sinais em tempo real (TX/RX)</div>
                {(selectedRoute.trunks ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: theme.colors.text.secondary }}>Nenhum trunk cadastrado</div>
                ) : (
                  selectedRoute.trunks.map((trunk) => (
                    <div key={trunk.id} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{trunk.name || 'Trunk sem nome'}</div>
                      {trunk.description ? (
                        <div style={{ fontSize: 11, color: theme.colors.text.secondary, marginTop: 2 }}>
                          {trunk.description}
                        </div>
                      ) : null}
                      {trunk.interfaces.length === 0 ? (
                        <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>Sem interfaces</div>
                      ) : (
                        trunk.interfaces.map((iface) => {
                          const txValue = iface.txItem ? getMetricValue(iface.txItem) : undefined;
                          const rxValue = iface.rxItem ? getMetricValue(iface.rxItem) : undefined;
                          return (
                            <div
                              key={iface.id}
                              style={{
                                border: `1px solid ${theme.colors.border.weak}`,
                                borderRadius: 8,
                                padding: 8,
                                marginTop: 8,
                                background: theme.colors.background.primary,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 12,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                                    {iface.name || 'Interface'} {iface.side ? `(${iface.side})` : ''}
                                  </div>
                                  {iface.description ? (
                                    <div style={{ fontSize: 11, color: theme.colors.text.secondary }}>
                                      {iface.description}
                                    </div>
                                  ) : null}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                                  {iface.showTx === false ? null : (
                                    <span>
                                      TX: <span style={{ fontWeight: 600 }}>{txValue?.text ?? '--'}</span>
                                    </span>
                                  )}
                                  {iface.showRx === false ? null : (
                                    <span>
                                      RX: <span style={{ fontWeight: 600 }}>{rxValue?.text ?? '--'}</span>
                                    </span>
                                  )}
                                  {iface.showRx !== false && iface.rxItem && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const series = itemSeriesTimeMap.get(iface.rxItem ?? '');
                                        setRxHistory({
                                          name: iface.name || 'Interface',
                                          series,
                                        });
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: `1px solid ${theme.colors.border.weak}`,
                                        color: theme.colors.text.primary,
                                        fontSize: 10,
                                        padding: '2px 6px',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Historico
                                    </button>
                                  )}
                                </div>
                              </div>
                              {(iface.metrics ?? []).length > 0 && (
                                <div style={{ marginTop: 6 }}>
                                  {(iface.metrics ?? []).map((metric) => {
                                    const value = metric.item ? getMetricValue(metric.item) : undefined;
                                    return (
                                      <div
                                        key={metric.id}
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          fontSize: 11,
                                          color: theme.colors.text.secondary,
                                        }}
                                      >
                                        <span>{metric.label || 'Metrica'}</span>
                                        <span style={{ color: theme.colors.text.primary, fontWeight: 600 }}>
                                          {value?.text ?? '--'}
                                        </span>
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
                  ))
                )}
              </div>

              <div
                style={{
                  border: `1px solid ${theme.colors.border.weak}`,
                  borderRadius: 10,
                  padding: 12,
                  background: theme.colors.background.secondary,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Download / Upload em tempo real
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
                  <div>Download: {getRouteMetricValue(selectedRoute, 'download')?.text ?? '--'}</div>
                  <div>Upload: {getRouteMetricValue(selectedRoute, 'upload')?.text ?? '--'}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, marginBottom: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.colors.success.main }} />
                    Download
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.colors.warning.main }} />
                    Upload
                  </span>
                </div>
                {(() => {
                  const downloadItem = selectedRoute.metrics.find((m) => m.id === 'download')?.zabbixItem;
                  const uploadItem = selectedRoute.metrics.find((m) => m.id === 'upload')?.zabbixItem;
                  const downloadFormatter = downloadItem ? itemFormatterMap.get(downloadItem) : undefined;
                  const uploadFormatter = uploadItem ? itemFormatterMap.get(uploadItem) : undefined;
                  return (
                    <DualHistoryChart
                      primary={itemSeriesTimeMap.get(downloadItem ?? '')}
                      secondary={itemSeriesTimeMap.get(uploadItem ?? '')}
                      height={140}
                      primaryColor={theme.colors.success.main}
                      secondaryColor={theme.colors.warning.main}
                      formatPrimary={(value) =>
                        value === null || value === undefined
                          ? '--'
                          : downloadFormatter
                            ? downloadFormatter(value)
                            : value.toFixed(1)
                      }
                      formatSecondary={(value) =>
                        value === null || value === undefined
                          ? '--'
                          : uploadFormatter
                            ? uploadFormatter(value)
                            : value.toFixed(1)
                      }
                    />
                  );
                })()}
                <div style={{ fontSize: 10, color: theme.colors.text.secondary, marginTop: 6 }}>
                  Janela de tempo segue o intervalo do Grafana.
                </div>
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
              const filteredSeries = filterSeriesByDays(rxHistory.series);
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
              <HistoryLineChart
                series={filteredSeries}
                width={680}
                height={180}
                color={theme.colors.success.main}
              />
              <div style={{ fontSize: 10, color: theme.colors.text.secondary, marginTop: 6 }}>
                Janela segue o intervalo do Grafana.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {buildHistoryWindows(filteredSeries).map((entry) => (
                <div
                  key={entry.label}
                  style={{
                    border: `1px solid ${theme.colors.border.weak}`,
                    borderRadius: 10,
                    padding: 10,
                    background: theme.colors.background.secondary,
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.colors.text.secondary }}>
                    {entry.label}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Min: {entry.min !== null ? entry.min.toFixed(2) : '--'}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Max: {entry.max !== null ? entry.max.toFixed(2) : '--'}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Med: {entry.avg !== null ? entry.avg.toFixed(2) : '--'}
                  </div>
                </div>
              ))}
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
                <div style={{ fontSize: 12, color: theme.colors.text.secondary }}>
                  Nenhum equipamento cadastrado
                </div>
              ) : (
                selectedPop.equipments.map((equipment) => {
                  const statusValue = equipment.statusItem ? getMetricValue(equipment.statusItem) : undefined;
                  const status = resolveRouteStatus(
                    equipment.statusItem,
                    equipment.onlineValue ?? '1',
                    itemValueMap
                  );
                  const lastChange = getLastChangeMinutes(equipment.statusItem);
                  const baseMetrics = equipment.metrics ?? [];
                  const cpuMetric = equipment.cpuItem ? { id: 'cpu', item: equipment.cpuItem } : matchMetric(baseMetrics, ['cpu']);
                  const memMetric = equipment.memoryItem
                    ? { id: 'memory', item: equipment.memoryItem }
                    : matchMetric(baseMetrics, ['mem', 'memory', 'ram']);
                  const tempMetric = equipment.temperatureItem
                    ? { id: 'temp', item: equipment.temperatureItem }
                    : matchMetric(baseMetrics, ['temp', 'temperatura', 'temperature']);
                  const uptimeMetric = equipment.uptimeItem
                    ? { id: 'uptime', item: equipment.uptimeItem }
                    : matchMetric(baseMetrics, ['uptime', 'tempo ligado']);
                  const systemMetricIds = new Set(
                    [cpuMetric, memMetric, tempMetric, uptimeMetric]
                      .filter((metric): metric is { id: string; item?: string } => Boolean(metric && 'id' in metric))
                      .map((metric) => metric.id)
                  );
                  const visibleMetrics = baseMetrics.filter(
                    (metric) => (metric.showInDetails ?? true) && metric.item
                  );

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

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
                        {[
                          {
                            label: 'CPU',
                            metric: equipment.cpuShow === false ? undefined : cpuMetric,
                            color: theme.colors.success.main,
                          },
                          {
                            label: 'Memória',
                            metric: equipment.memoryShow === false ? undefined : memMetric,
                            color: theme.colors.warning.main,
                          },
                          {
                            label: 'Temperatura',
                            metric: equipment.temperatureShow === false ? undefined : tempMetric,
                            color: theme.colors.info.main,
                          },
                          {
                            label: 'Uptime',
                            metric: equipment.uptimeShow === false ? undefined : uptimeMetric,
                            color: theme.colors.primary.main,
                          },
                        ].map((entry) => {
                          const value = entry.metric?.item ? getMetricValue(entry.metric.item) : undefined;
                          const series = entry.metric?.item ? itemSeriesMap.get(entry.metric.item) : undefined;
                          return (
                            <div
                              key={entry.label}
                              style={{
                                border: `1px solid ${theme.colors.border.weak}`,
                                borderRadius: 10,
                                padding: 8,
                                background: theme.colors.background.primary,
                                minHeight: 110,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                              }}
                            >
                              <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.colors.text.secondary }}>
                                {entry.label}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{value?.text ?? '--'}</div>
                              <Sparkline values={series} width={180} height={44} color={entry.color} />
                            </div>
                          );
                        })}
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
                          <div style={{ fontSize: 11, textTransform: 'uppercase', color: theme.colors.text.secondary }}>
                            Observação
                          </div>
                          <div>{equipment.observation}</div>
                        </div>
                      )}

                      {visibleMetrics.filter((metric) => !systemMetricIds.has(metric.id)).length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {visibleMetrics
                            .filter((metric) => !systemMetricIds.has(metric.id))
                            .map((metric) => {
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
                                    <Sparkline values={series} width={240} height={60} color={theme.colors.success.main} />
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

      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          zIndex: 1000,
          background: 'rgba(17, 24, 39, 0.75)',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          borderRadius: 8,
          padding: '10px 12px',
          color: '#e2e8f0',
          fontSize: 12,
          minWidth: 320,
          maxHeight: statsCollapsed ? 44 : 360,
          overflowY: statsCollapsed ? 'hidden' : 'auto',
          transition: 'max-height 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: statsCollapsed ? 0 : 8 }}>
          <span style={{ fontWeight: 600, flex: 1 }}>Estatisticas do transporte</span>
          <button
            type="button"
            onClick={() => setStatsCollapsed((prev) => !prev)}
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              color: '#e2e8f0',
              padding: '2px 8px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {statsCollapsed ? 'Mostrar' : 'Ocultar'}
          </button>
        </div>
        {!statsCollapsed && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Extensao total</div>
            <div style={{ fontWeight: 600 }}>{totalKm.toFixed(1)} km</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Total de rotas</div>
            <div style={{ fontWeight: 600 }}>{statusCounts.total}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Rotas ativas</div>
            <div style={{ fontWeight: 600 }}>{activeRoutes}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Down</div>
            <div style={{ fontWeight: 600, color: '#f87171' }}>{statusCounts.down}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Degradadas</div>
            <div style={{ fontWeight: 600, color: '#f59e0b' }}>{statusCounts.alert}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Sem dados</div>
            <div style={{ fontWeight: 600, color: '#fbbf24' }}>{statusCounts.unknown}</div>
          </div>
          </div>
        )}

        {!statsCollapsed && (
          <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Eventos recentes</div>
          {availabilityStats.recentChanges.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Sem mudancas recentes</div>
          ) : (
            availabilityStats.recentChanges.map((entry) => (
              <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{entry.name}</span>
                <span>{entry.minutesAgo !== null ? formatMinutes(entry.minutesAgo) : '--'}</span>
              </div>
            ))
          )}
          </div>
        )}

        {!statsCollapsed && (
          <div style={{ borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Top criticos (RX)</div>
          {opticalStats.worstRx.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Sem dados RX</div>
          ) : (
            opticalStats.worstRx.map((entry) => (
              <div key={`rx-${entry.name}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{entry.name}</span>
                <span>{formatNumber(entry.min)} dBm</span>
              </div>
            ))
          )}
          <div style={{ fontSize: 11, fontWeight: 600, margin: '8px 0 6px' }}>Top oscilacao (RX)</div>
          {opticalStats.worstOsc.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Sem dados de oscilacao</div>
          ) : (
            opticalStats.worstOsc.map((entry) => (
              <div key={`osc-${entry.name}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{entry.name}</span>
                <span>{formatNumber(entry.spread)} dB</span>
              </div>
            ))
          )}
          </div>
        )}
      </div>

      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        <CaptureLeafletView />
        <CaptureMapInteraction onInteract={() => setLastInteraction(Date.now())} />
        <CaptureMapRef onReady={(map) => (mapRef.current = map)} />
        <EnsureHitboxPane onReady={() => setHitboxReady(true)} />
        <TileLayer
          key={options.mapProvider}
          url={tileConfig.url}
          subdomains={tileConfig.subdomains}
          attribution={tileConfig.attribution}
          maxZoom={20}
          crossOrigin
        />
        {filteredRoutes.map((route) => {
          if (route.points.length <= 1) {
            return null;
          }
          const status = computeRouteStatus(route);
          const statusColor =
            status === 'online' ? route.colors.online : status === 'down' ? route.colors.down : route.colors.alert;
          const statusClass =
            status === 'online' ? 'jmap-route--online' : status === 'down' ? 'jmap-route--down' : 'jmap-route--alert';
          const dashArray = status === 'online' ? '14 10' : status === 'down' ? '6 8' : '8 10';
          const speed = status === 'online' ? 2 : status === 'down' ? 3.5 : 1.5;
          const dashOffset = -(dashTick * speed) % 240;
          const downloadValue = getRouteMetricValue(route, 'download');
          const uploadValue = getRouteMetricValue(route, 'upload');
          const midpoint = getPointAlongRoute(route.points, 0.5);
          const badgeWidth = 200 * badgeScaleOverride;
          const badgeHeight = 80 * badgeScaleOverride;
          const badgePadding = 8 * badgeScaleOverride;
          const badgeRadius = 16 * badgeScaleOverride;
          const titleSize = 10 * badgeScaleOverride;
          const rowSize = 11 * badgeScaleOverride;
          const pillSize = 10 * badgeScaleOverride;
          const pillPaddingX = 6 * badgeScaleOverride;
          const pillPaddingY = 2 * badgeScaleOverride;
          return (
            <React.Fragment key={route.id}>
              <Polyline
                positions={route.points.map((p) => [p.lat, p.lng])}
                pathOptions={{
                  color: statusColor,
                  className: `jmap-route ${statusClass}`,
                  dashArray,
                  dashOffset: `${dashOffset}`,
                  weight: 4,
                }}
              />
              {midpoint && (
                <>
                  <Marker
                    position={[midpoint.lat, midpoint.lng]}
                    icon={L.divIcon({
                      className: '',
                      html: `
                        <div class="jmap-transport-badge" style="width:${badgeWidth}px;height:${badgeHeight}px;padding:${badgePadding}px;border-radius:${badgeRadius}px;background:${theme.colors.background.secondary};border:1px solid ${theme.colors.border.medium};display:flex;flex-direction:column;gap:${4 * badgeScaleOverride}px;align-items:center;box-sizing:border-box;">
                          <div style="font-size:${titleSize}px;text-transform:uppercase;letter-spacing:.6px;color:${theme.colors.text.secondary};">Download / Upload</div>
                          <div style="display:flex;gap:${8 * badgeScaleOverride}px;font-size:${rowSize}px;color:${theme.colors.text.primary};">
                            <span>Download</span>
                            <span style="font-weight:600">${downloadValue?.text ?? '--'}</span>
                            <span>Upload</span>
                            <span style="font-weight:600">${uploadValue?.text ?? '--'}</span>
                          </div>
                          <div style="padding:${pillPaddingY}px ${pillPaddingX}px;border-radius:999px;font-size:${pillSize}px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;border:1px solid ${statusColor};color:${statusColor};">
                          ${status === 'online' ? 'Online' : status === 'down' ? 'Down' : status === 'alert' ? 'Degradado' : 'Sem dados'}
                        </div>
                        </div>
                      `,
                      iconSize: [badgeWidth, badgeHeight],
                      iconAnchor: [badgeWidth / 2, badgeHeight / 2],
                    })}
                  />
                  {hitboxReady && (
                    <CircleMarker
                      center={[midpoint.lat, midpoint.lng]}
                      radius={Math.max(26, Math.min(60, badgeWidth / 2))}
                      pane="hitboxPane"
                      pathOptions={{ color: 'transparent', fillOpacity: 0, opacity: 0 }}
                      interactive
                      bubblingMouseEvents={false}
                      eventHandlers={{
                        click: () => {
                          setSelectedPopId(null);
                          setSelectedRouteId(route.id);
                        },
                      }}
                    />
                  )}
                </>
              )}
            </React.Fragment>
          );
        })}
        {filteredPops.map((pop) => {
          const iconUrl = normalizePopIconUrl(pop.iconUrl);
          const safeIconUrl = iconUrl ? escapeHtmlAttr(iconUrl) : '';
          const icon = iconUrl
            ? L.divIcon({
                className: '',
                html: `<div class="jmap-pop-icon">
                  <img class="jmap-pop-icon__img" src="${safeIconUrl}" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.onerror=null;this.style.display='none';if(this.parentElement){this.parentElement.classList.add('jmap-pop-icon--fallback');}" />
                </div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
              })
            : defaultIcon;
          return (
            <React.Fragment key={pop.id}>
              <Marker position={[pop.lat, pop.lng]} icon={icon}>
                <Tooltip className="jmap-tooltip" direction="top" permanent offset={[0, -30]} interactive={false}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{pop.name || 'Sem nome'}</div>
                </Tooltip>
              </Marker>
              {hitboxReady && (
                <CircleMarker
                  center={[pop.lat, pop.lng]}
                  radius={22}
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
    </div>
  );
}
