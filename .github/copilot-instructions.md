# Grafana Panel Plugin Development Guide

## Project Overview
This is a Grafana panel plugin (`jakson-jmap-panel`) that provides interactive map visualizations using React Leaflet. The plugin renders maps with configurable center, zoom, and tile providers, capturing user interactions for option persistence.

## Architecture
- **Entry Point**: `src/module.ts` exports a `PanelPlugin` instance configured with `SimplePanel` component and options builder.
- **Main Component**: `src/components/SimplePanel.tsx` renders `MapView` with panel options.
- **Map Rendering**: `src/components/MapView.tsx` uses `react-leaflet` for map display and event capture.
- **Options Management**: `src/components/PanelOptionsEditor.tsx` provides UI for configuring map settings, including a "capture" feature to save current map view.
- **State Handling**: `src/mapState.ts` manages transient map view state for option synchronization.

## Key Patterns
- Use `@grafana/ui` components (e.g., `InlineField`, `Select`, `Button`) for consistent Grafana styling.
- Leverage `useTheme2()` for theming; avoid hardcoded colors/spacing.
- Employ Emotion CSS-in-JS with `useStyles2()` for component styling.
- Handle complex options via `builder.addCustomEditor()` in `module.ts` for custom editors like `PanelOptionsEditor`.
- Capture map interactions using `useMapEvents` from `react-leaflet` to update shared state.

## Development Workflows
- **Build**: `npm run build` compiles TypeScript and bundles assets to `dist/`.
- **Type Check**: `npm run typecheck` validates TypeScript without emitting files.
- **Lint**: `npm run lint` enforces code style using ESLint config from `.config/`.
- **Test**: `npm run test:ci` runs Jest unit tests in CI mode.
- **Sign Plugin**: `npm run sign` signs the built plugin for Grafana marketplace.

## Conventions
- Strict TypeScript with functional React components.
- Options defined in `src/types.ts` as interfaces (e.g., `PanelOptions` with `centerLat`, `centerLng`, `zoom`).
- Import `react-leaflet` components directly; include `leaflet.css` for styling.
- Use `MapContainer` with `center` as `[number, number]` tuple and `zoom` as number.
- Persist map state via `setLastMapView()` on move/zoom events for editor capture.

## Boundaries
- Frontend-only: No backend components or Go code.
- Maintain plugin ID (`jakson-jmap-panel`) and type (`panel`) in `plugin.json`.
- Preserve option schema backward compatibility; add migrations if needed.
- Avoid new dependencies unless Grafana-compatible and necessary.

## Examples
- Adding a new map provider: Update `mapProviders` array in `PanelOptionsEditor.tsx` and handle in `MapView.tsx` via conditional `TileLayer` URL.
- Extending options: Add fields to `PanelOptions` interface, update editor UI, and ensure `MapView` uses them (e.g., sidebar width for layout).

This guide focuses on map-specific implementations; refer to `AGENTS/instructions.md` for general Grafana plugin patterns.</content>
<parameter name="filePath">\\wsl$\Ubuntu\home\jakson\grafana-plugins\jakson-jmap-panel\.github\copilot-instructions.md