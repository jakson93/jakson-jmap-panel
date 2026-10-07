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
        padding: theme.spacing(1, 1.5),
        lineHeight: theme.typography.body.lineHeight,
      },
      '.jmap-tooltip.leaflet-tooltip:before': { borderTopColor: theme.colors.border.medium },
      '.jmap-route--online, .jmap-route--alert': { filter: 'none' },
      '.jmap-pop-icon--down': {
        borderColor: theme.colors.error.main,
        background: theme.colors.background.primary,
        boxShadow: theme.shadows.z1,
      },
      'button:focus-visible': { outline: `2px solid ${theme.colors.primary.text}`, outlineOffset: theme.spacing(0.25) },
      '@media (prefers-reduced-motion: reduce)': {
        '.jmap-route, .jmap-pop-icon, .jmap-fiber-line': { animation: 'none !important' },
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
      gridTemplateColumns: `repeat(auto-fit, minmax(${theme.spacing(18)}, 1fr))`,
      gap: theme.spacing(1),
    }),
    metricCard: css({
      minWidth: 0,
      padding: theme.spacing(1.5),
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      background: theme.colors.background.primary,
    }),
    metricHeading: css({
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing(0.5),
      fontSize: theme.typography.bodySmall.fontSize,
      color: theme.colors.text.secondary,
    }),
    metricValue: css({
      fontSize: theme.typography.h4.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      color: theme.colors.text.primary,
      fontVariantNumeric: 'tabular-nums',
      overflowWrap: 'anywhere',
    }),
    backdrop: css`
      && {
        padding: ${theme.spacing(2)};
        background: ${theme.colors.action.disabledBackground};
      }
      > div {
        border-radius: ${theme.shape.radius.default} !important;
        box-shadow: ${theme.shadows.z3};
        max-height: calc(100% - ${theme.spacing(2)}) !important;
        overflow-y: auto !important;
        max-width: 100%;
      }
    `,
  };
}
