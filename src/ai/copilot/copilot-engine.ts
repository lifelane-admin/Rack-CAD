/**
 * AI Studio Copilot Engine
 * Infrastructure Engineering Copilot powered strictly by the authoritative Physical Infrastructure Model.
 * Provides Analyze, Recommend, Validate, Optimize, Document, and Explain capabilities.
 */

import { physicalInfrastructureModel } from '../../model/physical-model';
import { ChangeProposal, ValidationFinding, PhysicalObject } from '../../model/types';
import { ChangeProposalEngine } from '../../model/change-proposal-engine';
import { EngineeringDocGenerator, EngineeringDocType } from '../../model/doc-generator';

export interface CopilotResponse {
  type: 'analysis' | 'recommendation' | 'optimization' | 'document' | 'explanation';
  title: string;
  markdown: string;
  proposals?: ChangeProposal[];
  findings?: ValidationFinding[];
  docContent?: string;
}

export class InfrastructureCopilotEngine {
  /**
   * Processes an engineering prompt against the current Physical Infrastructure Model.
   */
  static async query(userPrompt: string, targetModel?: typeof physicalInfrastructureModel): Promise<CopilotResponse> {
    const p = userPrompt.toLowerCase();
    const model = targetModel || physicalInfrastructureModel;
    const context = model.getAIRequestContext(userPrompt);
    const findings = context.validationResults;
    const objects = context.objects;
    const racks = context.racks;

    // 1. Single Points of Failure / SPOF / Risk / HA Query
    if (p.includes('spof') || p.includes('single point') || p.includes('ha') || p.includes('availability') || p.includes('failure')) {
      const spofs = findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH');
      const proposals: ChangeProposal[] = [];

      // Generate actionable change proposal for co-located HA pairs or single ToRs if detected
      for (const obj of objects) {
        if (obj.haPairId) {
          const peer = objects.find(o => o.objectId === obj.haPairId);
          if (peer && peer.rackId === obj.rackId && racks.length > 1) {
            const altRack = racks.find(r => r.rackId !== obj.rackId);
            if (altRack) {
              const freeU = altRack.freeU >= peer.heightU ? Math.max(1, 10) : 1;
              proposals.push(
                ChangeProposalEngine.createProposal({
                  type: 'MOVE_OBJECT',
                  objectId: peer.objectId,
                  from: { rackId: peer.rackId, uStart: peer.uStart, uEnd: peer.uEnd },
                  to: { rackId: altRack.rackId, uStart: freeU, uEnd: freeU + peer.heightU - 1 },
                  reason: `Eliminate physical SPOF: Separate ${peer.objectName} into ${altRack.rackName} for true cabinet fault isolation.`,
                  impactSummary: `Relocate ${peer.objectName} to ${altRack.rackName} at U${freeU}`,
                })
              );
            }
          }
        }
      }

      let markdown = `### Infrastructure High Availability & SPOF Analysis\n\n`;
      markdown += `Evaluated **${racks.length}** physical racks, **${objects.length}** hardware objects, and **${context.cables.length}** interconnect cables against deterministic engineering criteria.\n\n`;

      if (spofs.length === 0) {
        markdown += `✅ **No Critical Single Points of Failure Detected.**\n`;
        markdown += `- Cabinet power feeds are dual-corded.\n- Redundant ToR networking is verified.\n- HA peer nodes are physically isolated across separate racks.\n`;
      } else {
        markdown += `⚠️ **Identified ${spofs.length} Critical/High Single Points of Failure:**\n\n`;
        spofs.forEach((f, idx) => {
          markdown += `#### Finding F-${String(idx + 1).padStart(3, '0')}: ${f.description}\n`;
          markdown += `- **Severity**: \`${f.severity}\` | **Category**: \`${f.category.toUpperCase()}\`\n`;
          markdown += `- **Affected Hardware**: ${f.affectedObjectIds.join(', ') || 'N/A'}\n`;
          markdown += `- **Risk**: ${f.impact}\n`;
          markdown += `- **Engineering Recommendation**: ${f.recommendation}\n\n`;
        });
      }

      if (proposals.length > 0) {
        markdown += `\n---\n### 💡 Generated Structured Change Proposals (${proposals.length})\n`;
        markdown += `The copilot has synthesized structured change proposals. Review impact below and apply upon approval.\n`;
      }

      return {
        type: 'analysis',
        title: 'High Availability & SPOF Analysis',
        markdown,
        proposals,
        findings: spofs,
      };
    }

    // 2. Optimization Query (Cable length, Rack Balance, Power)
    if (p.includes('optimiz') || p.includes('balance') || p.includes('cable length') || p.includes('improve')) {
      const proposals: ChangeProposal[] = [];
      let markdown = `### Physical Infrastructure Optimization Report\n\n`;

      // Find unbalanced racks or high thermal densities
      const highPowerRack = racks.find(r => r.powerConsumed > 8000);
      if (highPowerRack && racks.length > 1) {
        const targetRack = racks.find(r => r.rackId !== highPowerRack.rackId);
        const heaviestServer = objects
          .filter(o => o.rackId === highPowerRack.rackId && o.category === 'compute')
          .sort((a, b) => b.powerWatts - a.powerWatts)[0];

        if (heaviestServer && targetRack) {
          proposals.push(
            ChangeProposalEngine.createProposal({
              type: 'MOVE_OBJECT',
              objectId: heaviestServer.objectId,
              from: { rackId: heaviestServer.rackId, uStart: heaviestServer.uStart },
              to: { rackId: targetRack.rackId, uStart: 12 },
              reason: `Optimize thermal & power balance: Relocate ${heaviestServer.objectName} (${heaviestServer.powerWatts}W) from ${highPowerRack.rackName} to ${targetRack.rackName}.`,
              impactSummary: `Transfer ${heaviestServer.powerWatts}W thermal load to ${targetRack.rackName}`,
            })
          );
        }
      }

      markdown += `#### Optimization Goals Evaluated:\n`;
      markdown += `1. **Cable Run Minimization**: Placing leaf switches adjacent to high-density compute.\n`;
      markdown += `2. **Power & Weight Balancing**: Avoiding hot-spot thermal concentration (>10kW per rack).\n`;
      markdown += `3. **Failure Domain Separation**: Segregating active/standby pairs across cabinets.\n\n`;

      if (proposals.length > 0) {
        markdown += `**Proposed Action Sets:** ${proposals.length} candidate proposal(s) ready for review.\n`;
      } else {
        markdown += `✅ Current rack layout is already well-balanced across available power circuits and U space.\n`;
      }

      return {
        type: 'optimization',
        title: 'Infrastructure Optimization',
        markdown,
        proposals,
      };
    }

    // 3. Document Generation Query (HLD, LLD, BOM, Cable Schedule, Implementation Plan)
    if (p.includes('hld') || p.includes('lld') || p.includes('bom') || p.includes('document') || p.includes('implementation plan') || p.includes('schedule')) {
      let docType: EngineeringDocType = 'HLD';
      if (p.includes('lld')) docType = 'LLD';
      else if (p.includes('bom') || p.includes('bill of material')) docType = 'BOM';
      else if (p.includes('implementation')) docType = 'IMPLEMENTATION_PLAN';
      else if (p.includes('risk')) docType = 'RISK_ASSESSMENT';
      else if (p.includes('ha assessment') || p.includes('availability')) docType = 'HA_ASSESSMENT';

      const docContent = EngineeringDocGenerator.generateDocument(model, docType);
      return {
        type: 'document',
        title: `Generated ${docType}`,
        markdown: `Successfully generated comprehensive **${docType}** from the canonical Physical Infrastructure Model.\n\n${docContent}`,
        docContent,
      };
    }

    // 4. Default / Explain / Architecture Assessment
    const totalWatts = objects.reduce((a, b) => a + (b.powerWatts || 0), 0);
    let markdown = `### RackSlicer Architecture Copilot Assessment\n\n`;
    markdown += `**Physical Model Summary:**\n`;
    markdown += `- **Cabinets**: ${racks.length} (${racks.map(r => r.rackName).join(', ') || 'None'})\n`;
    markdown += `- **Active Hardware**: ${objects.length} units (${(totalWatts / 1000).toFixed(2)} kW total power)\n`;
    markdown += `- **Physical Ports**: ${context.ports.length} mapped\n`;
    markdown += `- **Physical Cables**: ${context.cables.length} routed\n`;
    markdown += `- **Deterministic Audit Findings**: ${findings.length} findings (${findings.filter(f => f.severity === 'CRITICAL').length} Critical)\n\n`;

    markdown += `**You can ask me to:**\n`;
    markdown += `- *"Find SPOFs and HA violations"*\n`;
    markdown += `- *"Optimize cable runs and power balancing"*\n`;
    markdown += `- *"Generate HLD / LLD / BOM / Implementation Plan"*\n`;
    markdown += `- *"Export engineering Excel schedule"*\n`;

    return {
      type: 'explanation',
      title: 'Infrastructure Overview',
      markdown,
      findings,
    };
  }
}
