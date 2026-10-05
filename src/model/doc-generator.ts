/**
 * Engineering Document Generator
 * Generates HLD, LLD, Implementation Plan, BOM, and HA/Risk Assessments directly from the Physical Infrastructure Model.
 */

import { PhysicalInfrastructureModel } from './physical-model';
import { USpaceEngine } from './u-space-engine';

export type EngineeringDocType =
  | 'HLD'
  | 'LLD'
  | 'IMPLEMENTATION_PLAN'
  | 'BOM'
  | 'HA_ASSESSMENT'
  | 'RISK_ASSESSMENT';

export class EngineeringDocGenerator {
  static generateDocument(model: PhysicalInfrastructureModel, type: EngineeringDocType): string {
    switch (type) {
      case 'HLD':
        return this.generateHLD(model);
      case 'LLD':
        return this.generateLLD(model);
      case 'IMPLEMENTATION_PLAN':
        return this.generateImplementationPlan(model);
      case 'BOM':
        return this.generateBOM(model);
      case 'HA_ASSESSMENT':
        return this.generateHAAssessment(model);
      case 'RISK_ASSESSMENT':
        return this.generateRiskAssessment(model);
    }
  }

  private static generateHLD(model: PhysicalInfrastructureModel): string {
    const project = model.getProject();
    const racks = model.getRacks();
    const objects = model.getObjects();
    const totalWatts = objects.reduce((a, b) => a + (b.powerWatts || 0), 0);

    return `# HIGH LEVEL DESIGN (HLD)
**Project**: ${project.projectName} (${project.projectId})
**Date**: ${new Date().toLocaleDateString()}
**Version**: ${project.version}

---

## 1. Executive Summary & Objective
This High Level Design specifies the physical and electrical infrastructure architecture for ${project.projectName}. The infrastructure is engineered deterministically using the RackSlicer Physical Infrastructure Model to guarantee zero single-points-of-failure (SPOF) and enforce high-density thermal and power redundancy.

## 2. Infrastructure Scale & Capacity
- **Total Cabinets**: ${racks.length} physical racks
- **Total Deployed Chassis**: ${objects.length} units
- **Total Peak Power Draw**: ${(totalWatts / 1000).toFixed(2)} kW
- **Compute Systems**: ${objects.filter(o => o.category === 'compute').length} servers
- **Network Fabric**: ${objects.filter(o => o.category === 'network').length} switching nodes
- **Storage Appliances**: ${objects.filter(o => o.category === 'storage').length} arrays

## 3. High Availability Architecture
- **Cabinet Diversity**: Mission-critical cluster nodes are distributed across isolated cabinets (Rack A & Rack B).
- **Power Architecture**: Redundant A/B utility feeds supplying independent 0U intelligent PDUs.
- **Network Fabric**: Dual Top-of-Rack (ToR) leaf switching architecture with cross-rack inter-switch links (ISL).
`;
  }

  private static generateLLD(model: PhysicalInfrastructureModel): string {
    const project = model.getProject();
    const racks = model.getRacks();
    const objects = model.getObjects();
    const ports = model.getPorts();
    const cables = model.getCables();

    let doc = `# LOW LEVEL DESIGN (LLD)
**Project**: ${project.projectName}
**Date**: ${new Date().toLocaleDateString()}

---

## 1. Physical Cabinet Elevations & Slotting
`;

    for (const r of racks) {
      const objsInRack = objects.filter(o => o.rackId === r.rackId);
      const metrics = USpaceEngine.calculateMetrics(r, objsInRack);
      doc += `### Cabinet: ${r.rackName} (${r.rackId})\n`;
      doc += `- **Dimensions**: ${r.rackWidth}mm (W) × ${r.rackDepth}mm (D) × ${r.rackSizeU}U\n`;
      doc += `- **Utilization**: ${metrics.usedU} / ${r.rackSizeU} RU (${metrics.utilizationPercent}%)\n`;
      doc += `- **Power & Weight**: ${(metrics.powerWatts / 1000).toFixed(2)} kW | ${metrics.weightKg} kg\n\n`;
      doc += `| U Position | Device | Model | Category | Power (W) |\n`;
      doc += `|---|---|---|---|---|\n`;

      objsInRack.sort((a, b) => b.uStart - a.uStart).forEach(o => {
        doc += `| U${o.uStart}-U${o.uEnd} | ${o.objectName} | ${o.model} | ${o.category.toUpperCase()} | ${o.powerWatts}W |\n`;
      });
      doc += `\n`;
    }

    doc += `## 2. Port & Cabling Interconnect Schedule
Total Cabling Runs: ${cables.length}

| Cable ID | Source | Port | Destination | Port | Media | Color | Length |\n|---|---|---|---|---|---|---|---|\n`;
    cables.forEach(c => {
      doc += `| ${c.cableId} | ${c.sourceObject} | ${c.sourcePort} | ${c.destinationObject} | ${c.destinationPort} | ${c.media} | ${c.color} | ${c.length}m |\n`;
    });

    return doc;
  }

  private static generateImplementationPlan(model: PhysicalInfrastructureModel): string {
    const racks = model.getRacks();
    const objects = model.getObjects();
    const cables = model.getCables();

    return `# PHYSICAL INFRASTRUCTURE IMPLEMENTATION PLAN
**Target Architecture**: ${racks.length} Racks, ${objects.length} Chassis, ${cables.length} Cable Runs

---

### Phase 1: Physical Framing & Power Provisioning
1. Position and anchor cabinets (${racks.map(r => r.rackName).join(', ')}).
2. Install dual 0U Vertical PDUs (PDU-A on left wall, PDU-B on right wall).
3. Connect PDU feeds to upstream 32A utility circuits and verify Phase balancing.

### Phase 2: Structural Cable Managers & Patch Panels
1. Mount 4-inch/6-inch Vertical Cable Managers (VCM) and overhead cable ladders.
2. Verify airflow clearances and cold-aisle containment perimeters.

### Phase 3: Hardware Unboxing, Rail-Mounting & Physical Slotting
${objects.map((o, idx) => `${idx + 1}. Mount **${o.objectName}** (${o.model}) into **${o.rackId}** at **U${o.uStart}-U${o.uEnd}**.`).join('\n')}

### Phase 4: Structured Cabling & Labeling
1. Dress and route power cables through chassis ear holes to PDU outlets.
2. Route network uplinks through VCM channels; terminate data and management runs.
3. Apply laser-printed wrap-around cable labels on both endpoints.
`;
  }

  private static generateBOM(model: PhysicalInfrastructureModel): string {
    const objects = model.getObjects();
    const cables = model.getCables();

    const bomMap = new Map<string, { category: string; manufacturer: string; model: string; qty: number; watts: number }>();
    for (const o of objects) {
      const key = `${o.manufacturer}|${o.model}`;
      const cur = bomMap.get(key) || { category: o.category, manufacturer: o.manufacturer, model: o.model, qty: 0, watts: 0 };
      cur.qty++;
      cur.watts += o.powerWatts || 0;
      bomMap.set(key, cur);
    }

    let doc = `# BILL OF MATERIALS (BOM)
**Generated**: ${new Date().toLocaleDateString()}

---

## 1. Active & Passive Hardware
| Item | Category | Manufacturer | Model | Qty | Total Power (W) |
|---|---|---|---|---|---|
`;

    let itemIdx = 1;
    for (const b of bomMap.values()) {
      doc += `| ${itemIdx++} | ${b.category.toUpperCase()} | ${b.manufacturer} | ${b.model} | ${b.qty} | ${b.watts}W |\n`;
    }

    doc += `\n## 2. Structured Cabling & Accessories\n`;
    doc += `- **Total Patch Cables**: ${cables.length} runs\n`;
    doc += `- **Copper Ethernet (Cat6A)**: ${cables.filter(c => c.media === 'Copper').length} units\n`;
    doc += `- **Fiber Optic (OM4/OS2)**: ${cables.filter(c => c.media === 'Fiber').length} units\n`;
    doc += `- **Direct Attach Copper (DAC)**: ${cables.filter(c => c.media === 'DAC').length} units\n`;

    return doc;
  }

  private static generateHAAssessment(model: PhysicalInfrastructureModel): string {
    const findings = model.validate().filter(f => f.category === 'ha' || f.category === 'power');
    const objects = model.getObjects();
    const haNodes = objects.filter(o => o.haPairId);

    return `# HIGH AVAILABILITY (HA) & FAULT DOMAIN ASSESSMENT
**Evaluated Systems**: ${objects.length} Devices | ${haNodes.length} HA-Configured Nodes

---

## 1. Fault Domain Status
- **Cabinet-Level Redundancy**: ${findings.some(f => f.category === 'ha') ? '⚠️ VIOLATION DETECTED' : '✅ VERIFIED DIVERSE'}
- **Power Feed Redundancy**: ${findings.some(f => f.category === 'power' && f.severity === 'CRITICAL') ? '⚠️ SINGLE PDU SPOF' : '✅ A/B FEEDS ENFORCED'}

## 2. Identified Availability Risks
${findings.length === 0 ? 'No high-availability risks detected. Architecture satisfies enterprise fault domain isolation.' : findings.map(f => `- **[${f.severity}]** ${f.description}\n  *Mitigation*: ${f.recommendation}`).join('\n\n')}
`;
  }

  private static generateRiskAssessment(model: PhysicalInfrastructureModel): string {
    const findings = model.validate();
    return `# INFRASTRUCTURE RISK ASSESSMENT & GAP ANALYSIS
**Audit Timestamp**: ${new Date().toISOString()}
**Total Audit Findings**: ${findings.length}

---

| Severity | Category | Description | Impact | Recommendation |
|---|---|---|---|---|
${findings.map(f => `| **${f.severity}** | ${f.category.toUpperCase()} | ${f.description} | ${f.impact} | ${f.recommendation} |`).join('\n')}
`;
  }
}
