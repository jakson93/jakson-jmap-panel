// src/components/SimplePanel.tsx
import React from 'react';
import { PanelProps } from '@grafana/data';
import { PanelOptions } from '../types';
import { NetworkPanel } from './NetworkPanel';

type Props = PanelProps<PanelOptions>;

export const SimplePanel: React.FC<Props> = (props) => <NetworkPanel {...props} />;
