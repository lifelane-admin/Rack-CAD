/**
 * RackSlicer AI — Requirement Completeness Engine
 *
 * Implements the master gate:
 * Parses raw natural language prompts, classifies information into
 * Known, Unknown, and Assumptions. Never silently invents important requirements.
 * Allows users to edit assumptions, give feedback, and provide custom specification inputs.
 */

import { RequirementSpec, AssumptionItem } from './types';

export class RequirementCompletenessEngine {
  /**
   * Parse an incoming user prompt into a structured RequirementSpec.
   */
  public static parsePrompt(prompt: string): RequirementSpec {
    const text = prompt.toLowerCase();

    // 1. Detect platform
    let platform: RequirementSpec['platform'] = 'Bare Metal';
    if (text.includes('hyper-v') || text.includes('hyperv') || text.includes('windows server')) {
      platform = 'Microsoft Hyper-V';
    } else if (text.includes('proxmox')) {
      platform = 'Proxmox';
    } else if (text.includes('vmware') || text.includes('vsphere') || text.includes('esxi')) {
      platform = 'VMware vSphere';
    } else if (text.includes('nutanix') || text.includes('ahv')) {
      platform = 'Nutanix AHV';
    } else if (text.includes('k8s') || text.includes('kubernetes') || text.includes('openshift')) {
      platform = 'Kubernetes';
    } else if (text.includes('openstack')) {
      platform = 'OpenStack';
    }

    // 1b. Detect rack count
    let rackCount = 1;
    if (text.includes('two rack') || text.includes('2 rack') || text.includes('dual rack') || text.includes('dual-rack') || text.includes('two identical rack') || text.includes('2 identical rack')) {
      rackCount = 2;
    } else {
      const rackMatch = text.match(/(\d+)\s*[-]?\s*rack/i);
      if (rackMatch) rackCount = parseInt(rackMatch[1], 10);
    }

    // 2. Detect node count
    let nodeCount = 2; // sensible base default
    const wordMap: Record<string, number> = {
      one: 1,
      single: 1,
      two: 2,
      dual: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      eight: 8,
    };

    const numMatch = text.match(/(\d+)\s*[-]?\s*(?:node|server|host)/i);
    if (numMatch) {
      const perRack = parseInt(numMatch[1], 10);
      nodeCount = (text.includes('each rack') || text.includes('per rack') || rackCount > 1) ? perRack * rackCount : perRack;
    } else {
      const wordMatch = text.match(/\b(one|two|three|four|five|six|eight|dual|single)\s*[-]?\s*(?:node|server|host)/i);
      if (wordMatch) {
        const perRack = wordMap[wordMatch[1].toLowerCase()] || 2;
        nodeCount = (text.includes('each rack') || text.includes('per rack') || rackCount > 1) ? perRack * rackCount : perRack;
      } else if (platform === 'Proxmox' || platform === 'Kubernetes') {
        nodeCount = 3 * rackCount; // default per rack
      }
    }

    // 3. Detect storage
    let storageType: RequirementSpec['storageType'] = 'Ceph All-NVMe';
    if (text.includes('san') || text.includes('iscsi')) {
      storageType = 'SAN iSCSI';
    } else if (text.includes('fibre') || text.includes('fc')) {
      storageType = 'SAN FC';
    } else if (text.includes('ceph')) {
      storageType = text.includes('hybrid') ? 'Ceph Hybrid' : 'Ceph All-NVMe';
    } else if (text.includes('nvme-of') || text.includes('nvme over fabric')) {
      storageType = 'NVMe-oF';
    } else if (text.includes('zfs') || text.includes('local')) {
      storageType = 'Local ZFS';
    } else if (platform === 'Microsoft Hyper-V' || platform === 'VMware vSphere') {
      storageType = 'SAN iSCSI';
    } else if (platform === 'Proxmox') {
      storageType = 'Ceph All-NVMe';
    }

    // 4. Detect storage capacity
    let usableStorageTb = 0;
    const tbMatch = text.match(/(\d+)\s*(?:tb|terabyte)/i);
    if (tbMatch) {
      usableStorageTb = parseInt(tbMatch[1], 10);
    }

    // 5. Detect RAM
    let ramGbPerNode = 0;
    const ramMatch = text.match(/(\d+)\s*(?:gb|gigabyte)\s*(?:ram|memory)/i);
    if (ramMatch) {
      ramGbPerNode = parseInt(ramMatch[1], 10);
    }

    // 6. Detect network fabric
    let networkFabric: RequirementSpec['networkFabric'] = '25GbE Redundant';
    if (text.includes('100g') || text.includes('100gbe')) {
      networkFabric = '100GbE Spine-Leaf';
    } else if (text.includes('10g') || text.includes('10gbe')) {
      networkFabric = '10GbE Standard';
    } else if (text.includes('infiniband') || text.includes('ib')) {
      networkFabric = 'InfiniBand';
    }

    // 7. Detect availability & power
    const isHA = text.includes('ha') || text.includes('redundant') || text.includes('high availability') || nodeCount >= 2;
    const availability: RequirementSpec['availability'] = isHA ? 'High Availability (N+1)' : 'Standard';
    const powerFeed: RequirementSpec['powerFeed'] = text.includes('3-phase') ? 'A/B/C 3-Phase' : 'A/B Redundant';

    // Build known map
    const workloadName = platform !== 'Bare Metal' ? `${platform} Virtualization Cluster` : 'Compute Cluster';
    const known: Record<string, string | number> = {
      Workload: workloadName,
      Platform: platform,
      Racks: rackCount > 1 ? `${rackCount} Identical Racks (HA Topology)` : '1 Rack',
      Nodes: rackCount > 1 ? `${nodeCount} Total Nodes (${nodeCount / rackCount} per rack)` : nodeCount,
    };
    if (usableStorageTb > 0) known['Storage Capacity'] = `${usableStorageTb} TB Usable`;
    if (ramGbPerNode > 0) known['RAM per Node'] = `${ramGbPerNode} GB`;
    if (text.includes('25gbe') || text.includes('100gbe') || text.includes('10gbe')) {
      known['Network Fabric'] = networkFabric;
    }

    // Build unknown list
    const unknown: string[] = [];
    if (ramGbPerNode === 0) unknown.push('RAM Capacity per Node');
    if (usableStorageTb === 0) unknown.push('Usable Storage Capacity');
    if (!text.includes('25gbe') && !text.includes('100gbe') && !text.includes('10gbe')) {
      unknown.push('Network Fabric Speed');
    }
    unknown.push('Growth & Headroom Allowance');

    // Build clarifying questions with Custom Input support
    const clarifications: RequirementSpec['clarifications'] = [];

    if (ramGbPerNode === 0) {
      clarifications.push({
        questionId: 'q_ram',
        question: 'What is the required RAM capacity per node?',
        description: 'Determines VM consolidation ratio and memory channel population.',
        options: ['128 GB RAM', '256 GB RAM (Recommended)', '512 GB RAM', '768 GB RAM'],
        selectedAnswer: '256 GB RAM (Recommended)',
        isCustom: false,
        customValue: '',
      });
    }

    if (usableStorageTb === 0) {
      clarifications.push({
        questionId: 'q_storage',
        question: `How much usable storage capacity is required for ${storageType}?`,
        description: 'Raw capacity will be calculated based on 3x replication or RAID-6/10 rules.',
        options: ['20 TB Usable', '50 TB Usable (Recommended)', '100 TB Usable', '200 TB Usable'],
        selectedAnswer: '50 TB Usable (Recommended)',
        isCustom: false,
        customValue: '',
      });
    }

    if (!text.includes('25gbe') && !text.includes('100gbe')) {
      clarifications.push({
        questionId: 'q_network',
        question: 'Which network fabric speed and redundancy level do you need?',
        description: 'Crucial for Live Migration, storage synchronization, and east-west throughput.',
        options: ['Dual 25GbE Redundant ToR (Recommended)', 'Dual 10GbE SFP+', '100GbE Spine-Leaf (High Throughput)'],
        selectedAnswer: 'Dual 25GbE Redundant ToR (Recommended)',
        isCustom: false,
        customValue: '',
      });
    }

    clarifications.push({
      questionId: 'q_growth',
      question: 'What is the expected 12-month compute & storage growth headroom?',
      description: 'Used for PDU sizing, spare U-space reservations, and port headroom.',
      options: ['15% Moderate Growth', '25% Standard Enterprise (Recommended)', '40% Rapid Scaling'],
      selectedAnswer: '25% Standard Enterprise (Recommended)',
      isCustom: false,
      customValue: '',
    });

    // Build editable assumptions
    const assumptions: AssumptionItem[] = [
      {
        id: 'asm_cabinet',
        text: 'Standard 42U/48U EIA-310 19-inch cabinet deployment',
        enabled: true,
        category: 'facility',
      },
      {
        id: 'asm_power',
        text: 'Dual redundant A/B power feeds with 16A/32A metered PDUs',
        enabled: true,
        category: 'power',
      },
    ];

    if (nodeCount === 2) {
      assumptions.push({
        id: 'asm_spare',
        text: '2-Node active-active failover cluster (Strict 2 nodes, witness/quorum via storage/cloud)',
        enabled: true,
        category: 'capacity',
        userComment: 'Strict 2 nodes as requested. No extra hot spare added.',
      });
    } else {
      assumptions.push({
        id: 'asm_spare',
        text: 'N+1 compute node tolerance for hypervisor maintenance',
        enabled: true,
        category: 'redundancy',
      });
    }

    return {
      rawPrompt: prompt,
      workload: workloadName,
      platform,
      rackCount,
      nodeCount,
      ramGbPerNode: ramGbPerNode || 256,
      storageType,
      usableStorageTb: usableStorageTb || 50,
      networkFabric,
      availability,
      powerFeed,
      growthHeadroomPercent: 25,
      deploymentTarget: 'Primary DC',
      isComplete: false,
      known,
      unknown,
      assumptions,
      clarifications,
    };
  }

  /**
   * Applies user-selected or custom clarification answers to update the specification.
   */
  public static applyClarifications(
    spec: RequirementSpec,
    answers: Record<string, string>,
    customFlags?: Record<string, boolean>
  ): RequirementSpec {
    const updated = { ...spec };

    for (const q of updated.clarifications) {
      if (answers[q.questionId] !== undefined) {
        q.selectedAnswer = answers[q.questionId];
        if (customFlags && customFlags[q.questionId]) {
          q.isCustom = true;
          q.customValue = answers[q.questionId];
        }
      }
    }

    // Apply RAM
    const ramAnswer = answers['q_ram'] || '';
    const ramCustomMatch = ramAnswer.match(/(\d+)\s*(?:gb|gigabyte|tb|terabyte)?/i);
    if (ramCustomMatch) {
      let val = parseInt(ramCustomMatch[1], 10);
      if (ramAnswer.toLowerCase().includes('tb')) val *= 1024;
      updated.ramGbPerNode = val;
    }

    // Apply Storage
    const storageAnswer = answers['q_storage'] || '';
    const storageCustomMatch = storageAnswer.match(/(\d+)\s*(?:tb|terabyte|gb)?/i);
    if (storageCustomMatch) {
      let val = parseInt(storageCustomMatch[1], 10);
      if (storageAnswer.toLowerCase().includes('gb')) val = Math.round(val / 1024);
      updated.usableStorageTb = val;
    }

    // Apply Network
    const netAnswer = answers['q_network'] || '';
    if (netAnswer.includes('100GbE') || netAnswer.includes('100g')) updated.networkFabric = '100GbE Spine-Leaf';
    else if (netAnswer.includes('10GbE') || netAnswer.includes('10g')) updated.networkFabric = '10GbE Standard';
    else if (netAnswer.includes('25GbE') || netAnswer.includes('25g')) updated.networkFabric = '25GbE Redundant';
    else if (netAnswer.trim().length > 0) updated.networkFabric = 'Custom';

    // Apply Growth
    const growthAnswer = answers['q_growth'] || '';
    const growthMatch = growthAnswer.match(/(\d+)\s*%/);
    if (growthMatch) {
      updated.growthHeadroomPercent = parseInt(growthMatch[1], 10);
    }

    // Update known and unknown
    updated.known['RAM per Node'] = `${updated.ramGbPerNode} GB`;
    updated.known['Storage Capacity'] = `${updated.usableStorageTb} TB Usable (${updated.storageType})`;
    updated.known['Network Fabric'] = updated.networkFabric === 'Custom' ? answers['q_network'] : updated.networkFabric;
    updated.known['Growth Headroom'] = `${updated.growthHeadroomPercent}%`;
    updated.unknown = [];
    updated.isComplete = true;

    return updated;
  }

  /**
   * Updates an assumption (toggle enabled, edit text, add user comment).
   */
  public static updateAssumption(
    spec: RequirementSpec,
    assumptionId: string,
    updates: Partial<AssumptionItem>
  ): RequirementSpec {
    const updated = { ...spec };
    updated.assumptions = updated.assumptions.map((a) => {
      if (a.id === assumptionId) {
        return { ...a, ...updates };
      }
      return a;
    });

    // If spare assumption is disabled and nodes were bumped, keep user's exact count
    const spareAsm = updated.assumptions.find((a) => a.id === 'asm_spare');
    if (spareAsm && !spareAsm.enabled && updated.known['Nodes']) {
      // Ensure nodeCount strictly equals user's explicit count
      updated.nodeCount = typeof updated.known['Nodes'] === 'number' ? updated.known['Nodes'] : parseInt(String(updated.known['Nodes']), 10);
    }

    return updated;
  }

  /**
   * Adds a new custom assumption.
   */
  public static addAssumption(spec: RequirementSpec, text: string): RequirementSpec {
    const updated = { ...spec };
    const newId = `asm_custom_${Date.now()}`;
    updated.assumptions.push({
      id: newId,
      text,
      enabled: true,
      category: 'custom',
    });
    return updated;
  }

  /**
   * Removes an assumption.
   */
  public static removeAssumption(spec: RequirementSpec, assumptionId: string): RequirementSpec {
    const updated = { ...spec };
    updated.assumptions = updated.assumptions.filter((a) => a.id !== assumptionId);
    return updated;
  }

  /**
   * Directly updates a known property (e.g. user changing Platform or Node count).
   */
  public static updateKnownProperty(
    spec: RequirementSpec,
    key: string,
    value: string | number
  ): RequirementSpec {
    const updated = { ...spec };
    updated.known[key] = value;

    if (key === 'Nodes') {
      const n = typeof value === 'number' ? value : parseInt(value, 10);
      updated.nodeCount = isNaN(n) ? 2 : n;
    } else if (key === 'Platform') {
      updated.platform = value as any;
      updated.workload = `${value} Virtualization Cluster`;
      updated.known['Workload'] = updated.workload;
    } else if (key === 'Workload') {
      updated.workload = String(value);
    }

    return updated;
  }
}
