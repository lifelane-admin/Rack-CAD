/**
 * Architecture Event System for the Physical Infrastructure Model
 */

import {
  PhysicalRack,
  PhysicalObject,
  PhysicalPort,
  PhysicalCable,
  PhysicalPower,
  ChangeProposal,
  ValidationFinding,
} from './types';

export type ArchitectureEventType =
  | 'OBJECT_CREATED'
  | 'OBJECT_MOVED'
  | 'OBJECT_DELETED'
  | 'PORT_CREATED'
  | 'PORT_CONNECTED'
  | 'PORT_DISCONNECTED'
  | 'CABLE_CREATED'
  | 'CABLE_DELETED'
  | 'POWER_MAPPING_CHANGED'
  | 'HA_CHANGED'
  | 'RACK_CHANGED'
  | 'RACK_DELETED'
  | 'ARCHITECTURE_UPDATED'
  | 'VALIDATION_COMPLETED'
  | 'AI_PROPOSAL_CREATED'
  | 'AI_PROPOSAL_APPROVED'
  | 'AI_PROPOSAL_REJECTED';

export interface ArchitectureEventPayloads {
  OBJECT_CREATED: { object: PhysicalObject };
  OBJECT_MOVED: { objectId: string; fromRack: string; fromU: number; toRack: string; toU: number };
  OBJECT_DELETED: { objectId: string };
  PORT_CREATED: { port: PhysicalPort };
  PORT_CONNECTED: { sourcePortId: string; destPortId: string; cableId: string };
  PORT_DISCONNECTED: { portId: string; cableId: string };
  CABLE_CREATED: { cable: PhysicalCable };
  CABLE_DELETED: { cableId: string };
  POWER_MAPPING_CHANGED: { power: PhysicalPower };
  HA_CHANGED: { objectId: string; haPairId?: string; failureDomain?: string };
  RACK_CHANGED: { rack: PhysicalRack };
  RACK_DELETED: { rackId: string };
  ARCHITECTURE_UPDATED: { timestamp: string };
  VALIDATION_COMPLETED: { findings: ValidationFinding[] };
  AI_PROPOSAL_CREATED: { proposal: ChangeProposal };
  AI_PROPOSAL_APPROVED: { proposal: ChangeProposal };
  AI_PROPOSAL_REJECTED: { proposal: ChangeProposal };
}

export type ArchitectureEventListener<T extends ArchitectureEventType> = (
  payload: ArchitectureEventPayloads[T]
) => void;

export class ArchitectureEventBus {
  private listeners = new Map<ArchitectureEventType, Set<Function>>();

  on<T extends ArchitectureEventType>(event: T, listener: ArchitectureEventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<T extends ArchitectureEventType>(event: T, payload: ArchitectureEventPayloads[T]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`Error executing listener for ${event}:`, err);
      }
    }
  }
}

export const architectureEvents = new ArchitectureEventBus();
