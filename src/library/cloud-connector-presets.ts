// Quick-apply connector "types" — one click sets color+style+width to a matching bundle,
// mirroring the kind of legend a real architecture diagram ships with (Production/Subnet/
// Region-Environment/Disaster-Recovery/UAT, each its own color+dash pattern+weight). Still just
// sets the same CloudConnector.style/color/width fields a user could set individually — not a
// separate "type" the data model has to track, so a preset is a starting point, not a lock-in.
import { CloudConnector } from '../core/types';

export interface CloudConnectorPreset {
  id: string;
  label: string;
  color: string;
  style: NonNullable<CloudConnector['style']>;
  width: number;
}

export const CLOUD_CONNECTOR_PRESETS: CloudConnectorPreset[] = [
  { id: 'production', label: 'Production', color: '#1a1a1a', style: 'solid', width: 2 },
  { id: 'subnet', label: 'Subnet', color: '#4285F4', style: 'dotted', width: 2 },
  { id: 'region-environment', label: 'Region / Environment', color: '#2dd4a8', style: 'long-dash', width: 2 },
  { id: 'disaster-recovery', label: 'Disaster Recovery', color: '#3b6fd6', style: 'dash-dot', width: 2 },
  { id: 'uat', label: 'UAT', color: '#2f6fed', style: 'solid', width: 3 },
];

export function getCloudConnectorPreset(id: string): CloudConnectorPreset | undefined {
  return CLOUD_CONNECTOR_PRESETS.find(p => p.id === id);
}
