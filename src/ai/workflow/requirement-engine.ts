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

    // 2. Detect explicit inventory & hardware counts
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

    const parseWordOrDigit = (matchStr: string | undefined): number => {
      if (!matchStr) return 0;
      const parsed = parseInt(matchStr, 10);
      if (!isNaN(parsed)) return parsed;
      return wordMap[matchStr.toLowerCase()] || 1;
    };

    const inventory: NonNullable<RequirementSpec['inventory']> = {};

    // Servers
    const serverMatch = text.match(/\b(\d+|one|two|three|four|five|six|eight|dual|single)\s*(?:dell|hp|lenovo|supermicro)?\s*(?:node|server|host)s?/i);
    let nodeCount = 2;
    if (serverMatch) {
      const cnt = parseWordOrDigit(serverMatch[1]);
      nodeCount = (text.includes('each rack') || text.includes('per rack') || rackCount > 1) ? cnt * rackCount : cnt;
      inventory.servers = { count: cnt, brand: text.includes('dell') ? 'Dell PowerEdge' : text.includes('hp') ? 'HPE ProLiant' : undefined };
    } else if (platform === 'Proxmox' || platform === 'Kubernetes') {
      nodeCount = 3 * rackCount;
    }

    // SAN
    const sanMatch = text.match(/\b(\d+|one|single|two|dual)\s*san\b/i);
    if (sanMatch) {
      inventory.san = { count: parseWordOrDigit(sanMatch[1]) };
    }

    // Switches
    const switchMatch = text.match(/\b(\d+|one|single|two|dual)\s*switches?\b/i);
    if (switchMatch) {
      inventory.switches = { count: parseWordOrDigit(switchMatch[1]) };
    }

    // Firewalls
    const fwMatch = text.match(/\b(\d+|one|single|two|dual)\s*firewalls?\b/i);
    if (fwMatch) {
      inventory.firewalls = { count: parseWordOrDigit(fwMatch[1]) };
    }

    // UPS
    const upsMatch = text.match(/\b(\d+|one|single|two|dual)\s*ups\b/i);
    if (upsMatch) {
      inventory.ups = { count: parseWordOrDigit(upsMatch[1]) };
    }

    // 2b. Parse requested networks
    const requestedNetworks: string[] = [];
    if (text.includes('management') || text.includes('mgmt')) requestedNetworks.push('Management (Out-of-Band / iDRAC)');
    if (text.includes('vm') || text.includes('guest')) requestedNetworks.push('VM Traffic Network');
    if (text.includes('migration') || text.includes('vmotion')) requestedNetworks.push('Live Migration');
    if (text.includes('heartbeat') || text.includes('quorum')) requestedNetworks.push('Cluster Heartbeat / Quorum');
    if (text.includes('backup') || text.includes('dr')) requestedNetworks.push('Backup & Replication');
    if (text.includes('storage') || text.includes('iscsi') || text.includes('san')) requestedNetworks.push('Storage Network (iSCSI / MPIO)');

    // 2c. Parse user non-purchase constraint
    const userConstraints: string[] = [];
    if (text.includes("don't want to buy") || text.includes("dont want to buy") || text.includes("use what i already have") || text.includes("already have")) {
      userConstraints.push('Strict Inventory Constraint: Reuse existing hardware only. Do not add mandatory purchased equipment unless explicitly approved.');
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
    const powerFeed: RequirementSpec['powerFeed'] = inventory.ups?.count === 1 ? 'Single Feed' : text.includes('3-phase') ? 'A/B/C 3-Phase' : 'A/B Redundant';

    // 8. Build Limitation Report (SPOF & Redundancy Analysis)
    const limitationReport: NonNullable<RequirementSpec['limitationReport']> = [];

    if (inventory.ups?.count === 1) {
      limitationReport.push({
        id: 'lim_spof_power',
        category: 'Power',
        title: 'Single UPS Unit — Critical Power Single Point of Failure (SPOF)',
        hardwareGiven: '1x UPS Battery Backup Unit',
        status: 'FAIL_SPOF',
        limitationText: 'Only 1 UPS is provided. Utility AC loss or UPS battery/inverter fault will shut down all 3 servers, SAN, switches, and firewalls concurrently. Dual Feed A/B power fault-tolerance is IMPOSSIBLE with 1 UPS.',
        recommendationToFix: 'Add 1x Secondary UPS (UPS-02) to establish independent A/B power feeds.',
      });
    }

    if (inventory.san?.count === 1) {
      limitationReport.push({
        id: 'lim_spof_san',
        category: 'Storage',
        title: 'Single SAN Array — Enclosure & Midplane Single Point of Failure',
        hardwareGiven: '1x Shared SAN Storage Array',
        status: 'WARN_CHASSIS',
        limitationText: '1 SAN array provides shared block storage. While dual internal controllers prevent controller-level downtime, a physical SAN enclosure failure or midplane short will halt all cluster storage access.',
        recommendationToFix: 'Add a 2nd SAN array with synchronous block replication or deploy host-based SDS (Ceph / vSAN / ZFS).',
      });
    }

    if (inventory.switches?.count === 2) {
      limitationReport.push({
        id: 'lim_ha_network',
        category: 'Network',
        title: 'Dual Switch Fabric — 802.1Q Network Partitioning',
        hardwareGiven: '2x Managed ToR Switches',
        status: 'PASS_HA',
        limitationText: `2 switches operate in MLAG / LACP active-active pair. The ${requestedNetworks.length > 0 ? requestedNetworks.length : 6} requested networks will be partitioned using IEEE 802.1Q VLANs (10-60) across dual 10G/25G host bonds.`,
        recommendationToFix: 'Configure 802.1Q VLAN trunking and enable LACP bonding on host NIC ports.',
      });
    }

    if (inventory.firewalls?.count === 2) {
      limitationReport.push({
        id: 'lim_ha_firewall',
        category: 'Security',
        title: 'Dual Firewall Active/Passive HA Pair',
        hardwareGiven: '2x Next-Gen Firewalls',
        status: 'PASS_HA',
        limitationText: '2 firewalls operate in Active/Passive High Availability mode with stateful session synchronization over dedicated sync links.',
        recommendationToFix: 'Connect dedicated HA sync cable between Firewalls and trunk LAN/WAN interfaces to Switch 1 & Switch 2.',
      });
    }

    // Build known map
    const workloadName = platform !== 'Bare Metal' ? `${platform} Virtualization Cluster` : 'Compute Cluster';
    const known: Record<string, string | number> = {
      Workload: workloadName,
      Platform: platform,
      Racks: rackCount > 1 ? `${rackCount} Identical Racks (HA Topology)` : '1 Rack',
      Nodes: rackCount > 1 ? `${nodeCount} Total Nodes (${nodeCount / rackCount} per rack)` : `${nodeCount} Server Nodes`,
    };

    if (inventory.servers || inventory.san || inventory.switches || inventory.firewalls || inventory.ups) {
      const parts: string[] = [];
      if (inventory.servers) parts.push(`${inventory.servers.count}x ${inventory.servers.brand || 'Server'}`);
      if (inventory.san) parts.push(`${inventory.san.count}x SAN Storage`);
      if (inventory.switches) parts.push(`${inventory.switches.count}x Switches`);
      if (inventory.firewalls) parts.push(`${inventory.firewalls.count}x Firewalls`);
      if (inventory.ups) parts.push(`${inventory.ups.count}x UPS`);
      known['Existing Inventory'] = parts.join(', ');
    }

    if (requestedNetworks.length > 0) {
      known['Logical Networks'] = `${requestedNetworks.length} Networks (${requestedNetworks.join(', ')})`;
    }

    if (userConstraints.length > 0) {
      known['Design Constraint'] = 'Reuse Existing Inventory Only (Zero Extra Purchases)';
    }

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
    ];

    if (inventory.ups?.count === 1) {
      assumptions.push({
        id: 'asm_single_ups',
        text: 'Single UPS power distribution (Note: Power Feed B redundancy limited by 1x UPS hardware)',
        enabled: true,
        category: 'power',
        userComment: 'Single UPS specified by user constraint. Identified as SPOF in Limitation Report.',
      });
    } else {
      assumptions.push({
        id: 'asm_power',
        text: 'Dual redundant A/B power feeds with 16A/32A metered PDUs',
        enabled: true,
        category: 'power',
      });
    }

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
      inventory,
      requestedNetworks,
      userConstraints,
      limitationReport,
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
