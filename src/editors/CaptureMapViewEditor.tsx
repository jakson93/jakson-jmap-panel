// src/editors/CaptureMapViewEditor.tsx
import React from 'react';
import { Button } from '@grafana/ui';
import { getLastMapView } from '../mapState';

// Props "any" pra não brigar com tipos do Grafana enquanto a gente valida o fluxo.
export const CaptureMapViewEditor = (props: any) => {
  const onCapture = () => {
    const v = getLastMapView();
    if (!v) {
      // Se ainda não teve render do mapa/move, não tem o que capturar
      alert('Mapa ainda não forneceu centro/zoom. Interaja com o mapa e tente novamente.');
      return;
    }

    // O editor tem acesso ao contexto com options e onOptionsChange
    const ctx = props?.context;
    const options = ctx?.options;

    if (!ctx?.onOptionsChange || !options) {
      alert('Não consegui acessar o contexto do painel.');
      return;
    }

    ctx.onOptionsChange({
      ...options,
      centerLat: v.lat,
      centerLng: v.lng,
      zoom: v.zoom,
    });
  };

  return (
    <Button icon="crosshair" onClick={onCapture}>
      Capturar Coordenadas do Mapa
    </Button>
  );
};
