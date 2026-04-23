// src/components/SimplePanel.tsx
import React from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions } from '../types';
import { MapView } from './MapView';

type Props = PanelProps<PanelOptions>;

export const SimplePanel: React.FC<Props> = ({ options, onOptionsChange, data, timeZone, timeRange }) => {
  return (
    <MapView options={options} onOptionsChange={onOptionsChange} data={data} timeZone={timeZone} timeRange={timeRange} />
  );
};
