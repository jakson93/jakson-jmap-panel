import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button } from '@grafana/ui';

export const CaptureButtonEditor: React.FC<StandardEditorProps<boolean>> = ({ onChange }) => {
  return (
    <Button icon="compass" onClick={() => onChange(true)}>
      Capturar Coordenadas do Mapa
    </Button>
  );
};
