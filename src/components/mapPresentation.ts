import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';

/** Presentation stays scoped to the original map, including its existing detail cards. */
export function mapPresentation(theme: GrafanaTheme2) {
  return {
    root: css({
      '.jmap-tooltip.leaflet-tooltip': {
        background: theme.colors.background.primary,
        color: theme.colors.text.primary,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.shape.radius.default,
        boxShadow: theme.shadows.z2,
        padding: theme.spacing(0.75, 1),
        margin: 0,
        fontFamily: theme.typography.fontFamily,
        lineHeight: theme.typography.body.lineHeight,
      },
      '.jmap-tooltip.leaflet-tooltip:before': { borderRightColor: theme.colors.border.medium },
      '.jmap-route--online, .jmap-route--alert': { filter: 'none' },
      '.jmap-route--down': { filter: 'none', animation: 'none', strokeOpacity: 1 },
      '.jmap-route--unknown': { strokeDasharray: '3 8', animation: 'none' },
      '.jmap-pop-icon': {
        border: `1px solid ${theme.colors.border.medium}`,
        background: theme.colors.background.primary,
        boxShadow: theme.shadows.z1,
      },
      '.jmap-pop-icon--down': {
        borderColor: theme.colors.error.main,
        background: theme.colors.background.primary,
        boxShadow: theme.shadows.z1,
        animation: 'none',
      },
      '.jmap-autofocus-panel': {
        background: `${theme.colors.background.primary} !important`,
        color: `${theme.colors.text.primary} !important`,
        fontFamily: `${theme.typography.fontFamily} !important`,
        boxShadow: `${theme.shadows.z2} !important`,
        borderColor: `${theme.colors.error.border} !important`,
      },
      'button:focus-visible': { outline: `2px solid ${theme.colors.primary.text}`, outlineOffset: theme.spacing(0.25) },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': { animation: 'none !important', transition: 'none !important' },
      },
    }),
    mutedMap: css({
      '.leaflet-tile-pane': {
        filter: theme.isDark
          ? 'invert(1) hue-rotate(180deg) saturate(0.2) brightness(0.65)'
          : 'saturate(0.2) contrast(0.95)',
      },
    }),
    popLabel: css({
      '&&': { maxWidth: theme.spacing(25), fontSize: theme.typography.bodySmall.fontSize, boxSizing: 'border-box' },
      '&::before': { display: 'none' },
    }),
    labelTitle: css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.75),
      fontWeight: theme.typography.fontWeightMedium,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      span: { width: theme.spacing(0.75), height: theme.spacing(0.75), borderRadius: '50%', flexShrink: 0 },
    }),
    dialogHeading: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing(2),
      paddingBottom: theme.spacing(1.5),
      borderBottom: `1px solid ${theme.colors.border.weak}`,
      h3: { margin: 0, fontSize: theme.typography.h4.fontSize, fontWeight: theme.typography.fontWeightMedium },
      small: { display: 'block', color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize },
    }),
    equipmentGrid: css({
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${theme.spacing(38)}), 1fr))`,
      gap: theme.spacing(2),
    }),
    equipmentCard: css({
      border: `1px solid ${theme.colors.border.medium}`,
      borderTopWidth: theme.spacing(0.25),
      borderRadius: theme.shape.radius.default,
      padding: theme.spacing(2),
      background: `linear-gradient(145deg, ${theme.colors.background.secondary}, ${theme.colors.background.primary})`,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(1.5),
      minWidth: 0,
    }),
    equipmentHeading: css({
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: theme.spacing(1),
      '> div': { display: 'flex', alignItems: 'center', gap: theme.spacing(1.25), minWidth: 0, flex: '1 1 auto' },
      img: { width: theme.spacing(4.5), height: theme.spacing(4.5), objectFit: 'contain' },
      strong: { display: 'block', overflowWrap: 'anywhere', fontSize: theme.typography.body.fontSize },
      small: { color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize },
    }),
    statusBadge: css({
      display: 'inline-flex',
      alignItems: 'center',
      gap: theme.spacing(0.75),
      border: '1px solid currentColor',
      borderRadius: theme.shape.radius.default,
      padding: theme.spacing(0.5, 1),
      fontSize: theme.typography.bodySmall.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      '&:before': {
        content: '""',
        width: theme.spacing(0.75),
        height: theme.spacing(0.75),
        background: 'currentColor',
        borderRadius: '50%',
      },
    }),
    tools: css({
      position: 'absolute',
      top: theme.spacing(1.5),
      right: theme.spacing(1.5),
      maxWidth: 'calc(100% - 64px)',
      zIndex: 1001,
    }),
    metricGrid: css({
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${theme.spacing(16)}), 1fr))`,
      gap: theme.spacing(1),
    }),
    metricCard: css({
      minWidth: 0,
      padding: theme.spacing(1.5),
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      background: theme.colors.background.canvas,
    }),
    metricHeading: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(0.5),
      fontSize: theme.typography.bodySmall.fontSize,
      color: theme.colors.text.secondary,
    }),
    metricValue: css({
      fontSize: theme.typography.h3.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.colors.text.primary,
      fontVariantNumeric: 'tabular-nums',
      overflowWrap: 'anywhere',
      lineHeight: theme.typography.h3.lineHeight,
    }),
    trend: css({ marginTop: theme.spacing(1.5), opacity: 0.75 }),
    backdrop: css`
      && {
        padding: ${theme.spacing(2)};
        background: ${theme.colors.action.disabledBackground};
        backdrop-filter: blur(4px);
      }
      > div {
        border-radius: ${theme.shape.radius.default} !important;
        box-shadow: ${theme.shadows.z3};
        max-height: calc(100% - ${theme.spacing(2)}) !important;
        overflow-y: auto !important;
        max-width: 100%;
        padding: ${theme.spacing(2.5)} !important;
        > * {
          flex-shrink: 0;
        }
      }
    `,
  };
}
