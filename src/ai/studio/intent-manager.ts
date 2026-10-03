/**
 * RackSlicer AI Studio – Intent & Architecture Manager
 * Extracts structured Design Intent, manages adaptive follow-up questions,
 * architecture planning, and smart insights (What am I missing? / Find unnecessary).
 */

import { DesignIntent, ArchitecturePlan, WhatIfScenario } from './types';

export class StudioIntentManager {
  private currentIntent: DesignIntent;

  constructor() {
    this.currentIntent = {
      workload: 'Hyper-V Virtualization Cluster',
      users: 300,
      vms: 60,
      availability: 'High Availability',
      storageUsableTb: 100,
      preferredVendor: 'Dell',
      storageProtocol: 'iSCSI',
      budgetLevel: 'Medium',
      datacenter: 'Primary Datacenter',
      spareCapacityPercent: 20,
      powerFeedType: 'A/B Redundant',
      coolingStrategy: 'Room',
    };
  }

  getIntent(): DesignIntent {
    return { ...this.currentIntent };
  }

  updateIntent(partial: Partial<DesignIntent>): DesignIntent {
    this.currentIntent = { ...this.currentIntent, ...partial };
    return this.getIntent();
  }

  /**
   * Extracts structured Design Intent from natural language prompt.
   */
  parsePrompt(prompt: string): DesignIntent {
    const p = prompt.toLowerCase();

    // 1. Workload
    if (p.includes('proxmox') || p.includes('ceph')) {
      this.currentIntent.workload = 'Proxmox VE + Ceph Cluster';
    } else if (p.includes('hyper-v') || p.includes('windows server')) {
      this.currentIntent.workload = 'Microsoft Hyper-V Cluster';
    } else if (p.includes('vmware') || p.includes('vsphere') || p.includes('esxi')) {
      this.currentIntent.workload = 'VMware vSphere Cluster';
    } else if (p.includes('gpu') || p.includes('ai') || p.includes('llm') || p.includes('deep learning')) {
      this.currentIntent.workload = 'High-Density GPU AI Infrastructure';
    } else if (p.includes('database') || p.includes('sql') || p.includes('oracle')) {
      this.currentIntent.workload = 'Mission-Critical Database Fabric';
    }

    // 2. Users & VMs
    const userMatch = prompt.match(/(\d+)\s*(?:users?|seats|clients)/i);
    if (userMatch) this.currentIntent.users = parseInt(userMatch[1], 10);

    const vmMatch = prompt.match(/(\d+)\s*(?:vms?|virtual\s*machines?|instances)/i);
    if (vmMatch) this.currentIntent.vms = parseInt(vmMatch[1], 10);

    // 3. Storage
    const storageMatch = prompt.match(/(\d+)\s*(?:tb|terabytes?)/i);
    if (storageMatch) this.currentIntent.storageUsableTb = parseInt(storageMatch[1], 10);

    // 4. Vendor
    if (p.includes('dell')) this.currentIntent.preferredVendor = 'Dell';
    else if (p.includes('hpe') || p.includes('proliant')) this.currentIntent.preferredVendor = 'HPE';
    else if (p.includes('lenovo')) this.currentIntent.preferredVendor = 'Lenovo';
    else if (p.includes('cisco')) this.currentIntent.preferredVendor = 'Cisco';

    // 5. Availability
    if (p.includes('mission critical') || p.includes('fault tolerant') || p.includes('99.999')) {
      this.currentIntent.availability = 'Mission Critical';
    } else if (p.includes('ha') || p.includes('high availability') || p.includes('redundant')) {
      this.currentIntent.availability = 'High Availability';
    }

    return this.getIntent();
  }

  /**
   * Generates a logical architecture plan derived from the design intent.
   */
  generateArchitecturePlan(): ArchitecturePlan {
    const intent = this.currentIntent;
    const isGpu = intent.workload.includes('GPU');
    const isProxmox = intent.workload.includes('Proxmox');
    const isHighStorage = intent.storageUsableTb >= 80;

    const hostCount = Math.max(2, Math.ceil(intent.vms / 20) || (isProxmox ? 3 : 2));

    const components = [
      {
        id: 'arch-compute',
        category: 'compute' as const,
        name: `${intent.preferredVendor === 'No Preference' ? 'Enterprise' : intent.preferredVendor} Compute Hosts`,
        quantity: hostCount,
        purpose: `Run ${intent.vms} virtual machines with N+1 failover capacity for ${intent.users} users.`,
        reason: 'Dual Xeon/EPYC with 25GbE interfaces right-sized for compute density.',
        dependencies: ['arch-tor', 'arch-power'],
        status: 'recommended' as const,
        suggestedTemplateId: 'server-2u-enterprise',
        alternatives: [
          { templateId: 'server-1u', name: '1U High-Density Node', whyNotReason: 'Fewer PCIe expansion slots for 25GbE NICs.' },
          { templateId: 'server-4u', name: '4U Quad-Socket Server', whyNotReason: 'Over-provisioned for current VM footprint.' },
        ],
      },
      {
        id: 'arch-storage',
        category: 'storage' as const,
        name: isProxmox ? 'Ceph Distributed NVMe Pool' : 'Dual-Controller Enterprise SAN',
        quantity: 1,
        purpose: `Provide ${intent.storageUsableTb}TB usable capacity with multi-path I/O.`,
        reason: `${intent.storageProtocol} protocol over dual fabric for non-disruptive controller failover.`,
        dependencies: ['arch-tor'],
        status: 'recommended' as const,
        suggestedTemplateId: 'san-storage-2u',
        alternatives: [
          { templateId: 'nas-storage-1u', name: 'Single-Controller NAS', whyNotReason: 'Lacks dual active-active controller redundancy.' },
        ],
      },
      {
        id: 'arch-tor',
        category: 'network' as const,
        name: 'Dual Redundant ToR Switches',
        quantity: 2,
        purpose: 'Non-blocking 25GbE spine/leaf switching with MLAG/vPC pair.',
        reason: 'Eliminates network single point of failure (SPOF) with redundant uplinks.',
        dependencies: [],
        status: 'recommended' as const,
        suggestedTemplateId: 'rs-sw-32p',
        alternatives: [
          { templateId: 'switch-1g-24p', name: '1GbE Access Switch', whyNotReason: 'Bandwidth bottleneck for VM live migration and SAN I/O.' },
        ],
      },
      {
        id: 'arch-security',
        category: 'security' as const,
        name: 'Next-Gen Firewall HA Pair',
        quantity: 1,
        purpose: 'Perimeter inspection, micro-segmentation, and IPsec VPN termination.',
        reason: 'Stateful failover ensures continuous connectivity during firmware updates.',
        dependencies: ['arch-tor'],
        status: 'recommended' as const,
        suggestedTemplateId: 'firewall-1u-enterprise',
        alternatives: [
          { templateId: 'router-basic', name: 'Basic Gateway Router', whyNotReason: 'Lacks deep packet inspection and HA synchronization.' },
        ],
      },
      {
        id: 'arch-power',
        category: 'power' as const,
        name: 'A/B Redundant Zero-U Vertical PDUs',
        quantity: 2,
        purpose: 'Distribute 30A 208/240V circuits to dual server and switch power supplies.',
        reason: 'True 2N power path separation ensures no downtime on single feed outage.',
        dependencies: [],
        status: 'recommended' as const,
        suggestedTemplateId: 'pdu-vertical-30a',
        alternatives: [
          { templateId: 'pdu-1u-basic', name: 'Single 1U PDU', whyNotReason: 'Zero power path redundancy; single breaker trip drops whole rack.' },
        ],
      },
      {
        id: 'arch-cabling',
        category: 'cabling' as const,
        name: 'Structured 25G DAC & CAT6A Wiring',
        quantity: hostCount * 4 + 8,
        purpose: 'Interconnect compute, storage, ToR, and management out-of-band.',
        reason: 'Low-latency passive DAC twinax cables reduce transceiver power dissipation.',
        dependencies: ['arch-compute', 'arch-tor'],
        status: 'recommended' as const,
        suggestedTemplateId: 'cable-dac-om4',
        alternatives: [
          { templateId: 'cable-cat5e', name: 'CAT5e Patch Cords', whyNotReason: 'Cannot reliably negotiate 10G/25G line rates.' },
        ],
      },
    ];

    const totalUnits = hostCount * 2 + 2 + 2 + 1; // Servers + SAN + Switches + Firewall
    const totalWatts = hostCount * 450 + 650 + 350 + 150; // Estimated power
    const heatLoadBtu = Math.round(totalWatts * 3.412);

    return {
      title: `${intent.workload} (${intent.availability})`,
      summary: `Right-sized architecture featuring ${hostCount} compute hosts, ${intent.storageUsableTb}TB ${intent.storageProtocol} storage, dual 25GbE ToR switching, and 2N A/B power feeds.`,
      components,
      calculatedMetrics: {
        totalUnits,
        totalWatts,
        heatLoadBtu,
        portCount: hostCount * 4 + 8,
        cableCount: hostCount * 4 + 8,
      },
    };
  }

  /**
   * "What am I missing?" analyzer.
   */
  getMissingAnalysis(): { title: string; severity: 'warning' | 'info'; reason: string; recommendation: string }[] {
    return [
      {
        title: 'Dedicated Out-of-Band (OOB) Management Switch',
        severity: 'warning',
        reason: 'Server iDRAC/iLO ports should be physically segregated from VM data traffic.',
        recommendation: 'Add a 1U 24-Port Gigabit management switch at U40.',
      },
      {
        title: 'Horizontal Brush Cable Management Panels',
        severity: 'info',
        reason: 'Passing DAC and fiber cables between switches and servers requires strain relief.',
        recommendation: 'Add 1U brush panels between ToR Switch A and B.',
      },
      {
        title: 'PDU Circuit Breaker Metering & Environmental Sensors',
        severity: 'info',
        reason: 'Monitoring temperature and inlet CFM prevents thermal runaway.',
        recommendation: 'Specify intelligent metered PDUs with dual humidity/temperature probes.',
      },
    ];
  }

  /**
   * "What is excess?" analyzer.
   */
  getExcessAnalysis(): { title: string; reason: string; recommendation: string }[] {
    return [
      {
        title: 'Oversized 48-Port Switch Selection',
        reason: 'Current cluster topology only utilizes 18 network ports across compute and storage.',
        recommendation: 'Right-size to a 24-port or 32-port 25GbE switch to save ~120W of idle power.',
      },
      {
        title: 'Unused Fiber Transceivers in Rack Run',
        reason: 'Within-rack connections under 3 meters run cooler on copper DAC Twinax than optical SFP28 transceivers.',
        recommendation: 'Replace optical transceivers with direct-attach copper (DAC) cables.',
      },
    ];
  }

  /**
   * Generates What-If alternative design scenarios.
   */
  getWhatIfScenarios(): WhatIfScenario[] {
    const plan = this.generateArchitecturePlan();
    const baseWatts = plan.calculatedMetrics.totalWatts;

    return [
      {
        id: 'scenario-a',
        name: 'Scenario A: Dell PowerEdge + iSCSI (Recommended)',
        description: 'Balanced enterprise architecture with dual ToR 25GbE and iSCSI SAN.',
        rackUsageU: 18,
        powerKw: Number((baseWatts / 1000).toFixed(2)),
        coolingBtu: plan.calculatedMetrics.heatLoadBtu,
        portUtilization: '18 / 32 Ports (56%)',
        equipmentCount: 9,
        estimatedCostUsd: 48500,
        redundancyScore: 'High (N+1 / 2N)',
      },
      {
        id: 'scenario-b',
        name: 'Scenario B: HPE ProLiant + Fibre Channel Fabric',
        description: 'Dedicated 32Gbps FC storage fabric for maximum deterministic low latency.',
        rackUsageU: 22,
        powerKw: Number(((baseWatts + 450) / 1000).toFixed(2)),
        coolingBtu: Math.round((baseWatts + 450) * 3.412),
        portUtilization: '26 / 48 Ports (54%)',
        equipmentCount: 11,
        estimatedCostUsd: 64200,
        redundancyScore: 'Mission Critical (2N Fabric)',
      },
      {
        id: 'scenario-c',
        name: 'Scenario C: Hyperconverged Infrastructure (HCI)',
        description: 'Ceph/vSAN node-local storage eliminating dedicated external SAN chassis.',
        rackUsageU: 14,
        powerKw: Number(((baseWatts - 250) / 1000).toFixed(2)),
        coolingBtu: Math.round((baseWatts - 250) * 3.412),
        portUtilization: '16 / 32 Ports (50%)',
        equipmentCount: 7,
        estimatedCostUsd: 41800,
        redundancyScore: 'High (Distributed Ceph)',
      },
    ];
  }
}
