import { DeviceData, CableData, RackData, Point } from '../core/types';

export interface RackContextPort {
  id: string;
  name: string;
  type: string;
  side: string;
  connected: boolean;
}

export interface RackContextDevice {
  id: string;
  type: string;
  model: string;
  ruStart: number;
  ruEnd: number;
  ports: RackContextPort[];
  power?: number;
  weight?: number;
}

export interface RackContextRack {
  id: string;
  name: string;
  units: number;
  devices: RackContextDevice[];
  pdus: { side: string; watts: number }[];
}

export interface RackContextCable {
  id: string;
  type: string;
  color: string;
  fromPort: string;
  toPort: string | null;
  routingMode: string;
  anchors: Point[];
}

export interface RackContext {
  racks: RackContextRack[];
  cables: RackContextCable[];
  validation: { alerts: { severity: string; message: string }[] };
  selectedId?: string;
}

export interface RackDiff {
  explanation: string;
  diff: {
    addDevices?: DeviceData[];
    removeDevices?: string[];
    updateDevices?: (Partial<DeviceData> & { id: string })[];
    addCables?: CableData[];
    removeCables?: string[];
    updateCables?: (Partial<CableData> & { id: string })[];
    updateAnchors?: { cableId: string; anchors: Point[] }[];
    addRacks?: RackData[];
    updateRacks?: (Partial<RackData> & { id: string })[];
  } | null;
}

export interface AIHint {
  severity: 'info' | 'warning' | 'error' | 'tip';
  message: string;
  diff?: RackDiff['diff'];
}

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AIProviderName = 'claude' | 'local' | 'rules';

export interface AIProvider {
  name: AIProviderName;
  isAvailable(): Promise<boolean>;
  getHints(context: RackContext, selectedId?: string): Promise<AIHint[]>;
  chat(context: RackContext, messages: AIMessage[]): AsyncIterable<string>;
  parseDiff(raw: string): RackDiff;
}
