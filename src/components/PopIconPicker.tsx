import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Button, useStyles2 } from '@grafana/ui';
import { Pop } from '../types';
import { POP_ICON_PRESETS, normalizePopIconUrl } from '../iconUrl';

export function PopIconPicker({ pop, onChange }: { pop: Pop; onChange: (patch: Partial<Pop>) => void }) {
  const styles = useStyles2(getStyles);
  return (
    <section className={styles.picker} aria-label="Ícone do POP">
      <strong>Ícone do POP</strong>
      <small>O mesmo ícone é usado no mapa e no Cadastro de POP. Aplique o layout e salve o dashboard.</small>
      <div className={styles.presets}>
        <Button size="sm" variant={!pop.iconUrl ? 'primary' : 'secondary'} onClick={() => onChange({ iconUrl: '' })}>
          Padrão
        </Button>
        {POP_ICON_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-label={`Ícone ${preset.label}`}
            aria-pressed={normalizePopIconUrl(pop.iconUrl) === normalizePopIconUrl(preset.url)}
            onClick={() => onChange({ iconUrl: preset.url })}
          >
            <img src={normalizePopIconUrl(preset.url)} alt="" />
            {preset.label}
          </button>
        ))}
      </div>
      <label>
        URL do ícone
        <input
          value={pop.iconUrl ?? ''}
          placeholder="https://… ou img/meu-icone.svg"
          onChange={(e) => onChange({ iconUrl: e.currentTarget.value })}
        />
      </label>
    </section>
  );
}

function getStyles(theme: GrafanaTheme2) {
  return {
    picker: css({ display: 'grid', gap: theme.spacing(1), small: { color: theme.colors.text.secondary } }),
    presets: css({
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing(1),
      button: {
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(1),
        padding: theme.spacing(0.5, 1),
        background: theme.colors.background.secondary,
        color: theme.colors.text.primary,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.shape.radius.default,
        '&[aria-pressed=true]': { borderColor: theme.colors.primary.text },
        '&:focus-visible': { outline: `2px solid ${theme.colors.primary.text}` },
        img: { width: theme.spacing(4), height: theme.spacing(4), objectFit: 'contain' },
      },
    }),
  };
}
