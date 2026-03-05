import { PanelPlugin } from '@grafana/data';
import { SimplePanel } from './components/SimplePanel';
import { CaptureButtonEditor } from './components/CaptureButtonEditor';
import { PopsEditor } from './components/PopsEditor';
import { RoutesEditor } from './components/RoutesEditor';
import { PanelOptions } from './types';

export const plugin = new PanelPlugin<PanelOptions>(SimplePanel).setPanelOptions((builder) => {
  builder.addCustomEditor({
    id: 'routes',
    path: 'routes',
    name: 'Rotas',
    description: 'Gerenciamento de rotas',
    category: ['Cadastro de Rotas'],
    editor: RoutesEditor,
    defaultValue: [],
  });

  builder.addCustomEditor({
    id: 'pops',
    path: 'pops',
    name: 'POPs',
    description: 'Gerenciamento de POPs',
    category: ['Cadastro de POP'],
    editor: PopsEditor,
    defaultValue: [],
  });

  builder.addSelect({
    path: 'mapProvider',
    name: 'Provedor de mapa',
    description: 'Escolha o provedor de tiles do mapa',
    category: ['Configuracao de Mapa'],
    settings: {
      options: [
        { label: 'OpenStreetMap', value: 'osm' },
        { label: 'OpenStreetMap HOT', value: 'osm_hot' },
        { label: 'CartoDB Light', value: 'carto_light' },
        { label: 'CartoDB Dark', value: 'carto_dark' },
        { label: 'CartoDB Voyager', value: 'carto_voyager' },
        { label: 'Google Roadmap', value: 'google_roadmap' },
        { label: 'Google Satellite', value: 'google_satellite' },
        { label: 'Google Hybrid', value: 'google_hybrid' },
        { label: 'Google Terrain', value: 'google_terrain' },
      ],
    },
    defaultValue: 'osm',
  });

  builder.addNumberInput({
    path: 'centerLat',
    name: 'Latitude central',
    description: 'Latitude do centro inicial do mapa',
    category: ['Configuracao de Mapa'],
    defaultValue: -23.5505,
    settings: {
      step: 0.000001,
    },
  });

  builder.addNumberInput({
    path: 'centerLng',
    name: 'Longitude central',
    description: 'Longitude do centro inicial do mapa',
    category: ['Configuracao de Mapa'],
    defaultValue: -46.6333,
    settings: {
      step: 0.000001,
    },
  });

  builder.addNumberInput({
    path: 'zoom',
    name: 'Zoom inicial',
    description: 'Nivel de zoom inicial do mapa (1-20)',
    category: ['Configuracao de Mapa'],
    defaultValue: 12,
    settings: {
      min: 1,
      max: 20,
    },
  });

  builder.addCustomEditor({
    id: 'captureNow',
    path: 'captureNow',
    name: 'Capturar do mapa atual',
    description: 'Captura as coordenadas e zoom do mapa atual no painel',
    category: ['Configuracao de Mapa'],
    editor: CaptureButtonEditor,
    defaultValue: false,
  });

  builder.addSelect({
    path: 'transportLineAnimation',
    name: 'Animacao das linhas',
    description: 'Escolha como as linhas de transporte devem se comportar no mapa',
    category: ['Configuracao de Mapa'],
    settings: {
      options: [
        { label: 'Fluxo direcional', value: 'flow' },
        { label: 'Pulso continuo', value: 'pulse' },
        { label: 'Linha estatica', value: 'static' },
      ],
    },
    defaultValue: 'flow',
  });

  return builder;
});
