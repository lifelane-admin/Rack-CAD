/**
 * Structured Change Proposal Engine
 * Manages the AI recommendation lifecycle: Propose -> Validate -> User Review -> Apply / Reject.
 * Never allows AI to modify the Physical Infrastructure Model directly without approval.
 */

import {
  ChangeProposal,
  ProposalType,
  PhysicalObject,
  PhysicalRack,
  PhysicalCable,
  PhysicalPower,
} from './types';
import { USpaceEngine } from './u-space-engine';

export interface ProposalSimulationResult {
  valid: boolean;
  errors: string[];
  impact: {
    uChangeRack1?: number;
    uChangeRack2?: number;
    cableRoutesChanged?: number;
    powerMappingsChanged?: number;
    haStatus?: string;
    summary: string;
  };
}

export class ChangeProposalEngine {
  private static proposalCounter = 1;

  static generateProposalId(): string {
    return `PROP-${String(this.proposalCounter++).padStart(3, '0')}`;
  }

  /**
   * Creates a structured proposal with simulated impact analysis.
   */
  static createProposal(params: {
    type: ProposalType;
    objectId: string;
    from?: Record<string, any>;
    to?: Record<string, any>;
    reason: string;
    impactSummary?: string;
  }): ChangeProposal {
    return {
      proposalId: this.generateProposalId(),
      type: params.type,
      objectId: params.objectId,
      from: params.from,
      to: params.to,
      reason: params.reason,
      impact: {
        summary: params.impactSummary || 'Infrastructure configuration update',
      },
      status: 'proposed',
    };
  }

  /**
   * Simulates and validates a proposal against current model state before user review.
   */
  static simulateProposal(
    proposal: ChangeProposal,
    racks: PhysicalRack[],
    objects: PhysicalObject[],
    cables: PhysicalCable[],
    power: PhysicalPower[]
  ): ProposalSimulationResult {
    const errors: string[] = [];
    const targetObj = objects.find(o => o.objectId === proposal.objectId);

    if (!targetObj && proposal.type !== 'ADD_OBJECT') {
      return {
        valid: false,
        errors: [`Target object ${proposal.objectId} not found in physical model.`],
        impact: { summary: 'Invalid proposal target' },
      };
    }

    if (proposal.type === 'MOVE_OBJECT') {
      const destRackId = proposal.to?.rackId;
      const destU = proposal.to?.uStart;
      const destRack = racks.find(r => r.rackId === destRackId);

      if (!destRack) {
        errors.push(`Destination rack ${destRackId} does not exist.`);
      } else if (destU === undefined || !targetObj) {
        errors.push(`Missing destination U coordinates.`);
      } else {
        const uValidation = USpaceEngine.validatePlacement(destRack, objects, {
          objectId: targetObj.objectId,
          uStart: destU,
          heightU: targetObj.heightU,
        });

        if (!uValidation.valid) {
          errors.push(...uValidation.errors);
        }
      }

      // Calculate cable and power impact
      const connectedCables = cables.filter(
        c => c.sourceObject === proposal.objectId || c.destinationObject === proposal.objectId
      );
      const connectedPower = power.filter(p => p.objectId === proposal.objectId);

      const isInterRackMove = targetObj && destRackId && targetObj.rackId !== destRackId;

      return {
        valid: errors.length === 0,
        errors,
        impact: {
          uChangeRack1: targetObj ? -targetObj.heightU : 0,
          uChangeRack2: targetObj ? targetObj.heightU : 0,
          cableRoutesChanged: isInterRackMove ? connectedCables.length : 0,
          powerMappingsChanged: isInterRackMove ? connectedPower.length : 0,
          haStatus: isInterRackMove ? 'Improved (Physical cabinet separation)' : 'Unchanged',
          summary: isInterRackMove
            ? `Move ${targetObj?.objectName} from ${targetObj?.rackId} to ${destRackId}: ${connectedCables.length} cable(s) re-routed, ${connectedPower.length} power circuit(s) re-mapped.`
            : `Reposition ${targetObj?.objectName} to U${destU}.`,
        },
      };
    }

    return {
      valid: true,
      errors: [],
      impact: {
        summary: proposal.reason,
      },
    };
  }
}
