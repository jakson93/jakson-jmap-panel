import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Button } from '@grafana/ui';
import { SavedNetworkView } from '../types';

export function SavedViewsEditor({ value = [], onChange }: StandardEditorProps<SavedNetworkView[]>) {
  return (
    <div>
      <p>Crie uma visão em Analisar rede → Filtros e visões. Cada visão guarda filtros, modo e POPs expandidos.</p>
      {value.map((view) => (
        <div key={view.id}>
          <span>
            {view.name} · {view.view === 'map' ? 'Mapa' : 'Topologia'}{' '}
          </span>
          <Button size="sm" variant="secondary" onClick={() => onChange(value.filter((v) => v.id !== view.id))}>
            Excluir
          </Button>
        </div>
      ))}
    </div>
  );
}
