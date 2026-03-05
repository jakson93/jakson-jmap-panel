export type MapProvider =
  | 'osm'
  | 'osm_hot'
  | 'carto_light'
  | 'carto_dark'
  | 'carto_voyager'
  | 'google_roadmap'
  | 'google_satellite'
  | 'google_hybrid'
  | 'google_terrain';

export type RoutePoint = {
  lat: number;
  lng: number;
};

export type RouteMetric = {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  zabbixItem?: string;
};

export type TransportInterfaceMetric = {
  id: string;
  label: string;
  description?: string;
  item?: string;
};

export type TransportInterface = {
  id: string;
  name: string;
  description?: string;
  side?: 'A' | 'B' | 'C' | 'D' | 'E';
  txItem?: string;
  rxItem?: string;
  rxTimeShift?: string;
  showTx?: boolean;
  showRx?: boolean;
  metrics: TransportInterfaceMetric[];
};

export type TransportTrunk = {
  id: string;
  name: string;
  description?: string;
  interfaces: TransportInterface[];
};

export type RouteExtraMetric = {
  id: string;
  name: string;
  description?: string;
  item?: string;
  showInDetails?: boolean;
};

export type RouteColors = {
  online: string;
  alert: string;
  down: string;
};

export type RouteThresholds = {
  enabled?: boolean;
  rxLow?: number;
  txLow?: number;
  bandwidthHigh?: number;
  flappingWindowMin?: number;
  flappingCount?: number;
};

export type Route = {
  id: string;
  name: string;
  distanceKm?: number;
  interfaceItem?: string;
  onlineValue?: string;
  capacityItem?: string;
  metrics: RouteMetric[];
  extraMetrics: RouteExtraMetric[];
  trunks: TransportTrunk[];
  thresholds?: RouteThresholds;
  colors: RouteColors;
  points: RoutePoint[];
};

export type PopMetric = {
  id: string;
  name: string;
  description?: string;
  item?: string;
  showInDetails?: boolean;
};

export type PopEquipment = {
  id: string;
  name: string;
  ip?: string;
  type?: string;
  statusItem?: string;
  onlineValue?: string;
  cpuItem?: string;
  cpuShow?: boolean;
  memoryItem?: string;
  memoryShow?: boolean;
  temperatureItem?: string;
  temperatureShow?: boolean;
  uptimeItem?: string;
  uptimeShow?: boolean;
  observation?: string;
  observationShow?: boolean;
  metrics: PopMetric[];
};

export type Pop = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  iconUrl?: string;
  iconSizePx?: number;
  iconScaleMode?: 'fixed' | 'map';
  coverageRadiusMeters?: number;
  coverageColor?: string;
  coverageOpacity?: number;
  equipments: PopEquipment[];
};

export interface PanelOptions {
  centerLat: number;
  centerLng: number;
  zoom: number;
  mapProvider: MapProvider;
  transportLineAnimation?: 'flow' | 'pulse' | 'static';
  routes: Route[];
  captureNow?: boolean;
  pops: Pop[];
}
