// src/renderers/vendor-palette.ts
//
// Shared vendor-skin lookup for the Switch/Firewall configurators (Enterprise Switch/Firewall
// Physical SDKs). Vendor selection changes appearance only — accent color, LED tint, default
// brand text, and light-vs-dark chassis tone — never port geometry or capability.

import type { SwitchVendor, FirewallVendor, NacVendor } from '../core/types';

export interface VendorSkin {
  tone: 'light' | 'dark';
  accent: string;
  brandName: string;
}

const SWITCH_PALETTE: Record<SwitchVendor, VendorSkin> = {
  'cisco-catalyst': { tone: 'dark', accent: '#049fd9', brandName: 'Cisco Catalyst' },
  'cisco-nexus': { tone: 'dark', accent: '#049fd9', brandName: 'Cisco Nexus' },
  'aruba-cx': { tone: 'dark', accent: '#ff8300', brandName: 'Aruba CX' },
  'juniper-ex': { tone: 'dark', accent: '#84b135', brandName: 'Juniper EX' },
  'dell-powerswitch': { tone: 'dark', accent: '#0076ce', brandName: 'Dell PowerSwitch' },
  'fortiswitch': { tone: 'light', accent: '#ee3124', brandName: 'FortiSwitch' },
  'huawei': { tone: 'dark', accent: '#e60027', brandName: 'Huawei' },
  'extreme': { tone: 'dark', accent: '#6a2c8c', brandName: 'Extreme Networks' },
  'mikrotik': { tone: 'dark', accent: '#c7050a', brandName: 'MikroTik' },
  'ubiquiti': { tone: 'dark', accent: '#0559c9', brandName: 'Ubiquiti' },
  'netgear': { tone: 'dark', accent: '#9dc93d', brandName: 'Netgear' },
  'generic': { tone: 'dark', accent: '#5c9fe0', brandName: 'Rack Slicer' },
  'custom': { tone: 'dark', accent: '#8a95a5', brandName: 'Custom' },
};

const FIREWALL_PALETTE: Record<FirewallVendor, VendorSkin> = {
  'fortinet': { tone: 'light', accent: '#ee3124', brandName: 'Fortinet' },
  'cisco': { tone: 'dark', accent: '#049fd9', brandName: 'Cisco' },
  'paloalto': { tone: 'light', accent: '#fa582d', brandName: 'Palo Alto Networks' },
  'juniper': { tone: 'dark', accent: '#84b135', brandName: 'Juniper' },
  'sophos': { tone: 'light', accent: '#00d97e', brandName: 'Sophos' },
  'checkpoint': { tone: 'dark', accent: '#e2231a', brandName: 'Check Point' },
  'sonicwall': { tone: 'dark', accent: '#ff6d00', brandName: 'SonicWall' },
  'aruba': { tone: 'dark', accent: '#ff8300', brandName: 'Aruba' },
  'dell': { tone: 'dark', accent: '#0076ce', brandName: 'Dell' },
  'huawei': { tone: 'dark', accent: '#e60027', brandName: 'Huawei' },
  'generic': { tone: 'light', accent: '#3a3f46', brandName: 'Rack Slicer' },
};

const NAC_PALETTE: Record<NacVendor, VendorSkin> = {
  'generic': { tone: 'dark', accent: '#5c9fe0', brandName: 'Rack Slicer' },
  'forescout': { tone: 'dark', accent: '#00b2a9', brandName: 'ForeScout' },
  'cisco-ise': { tone: 'dark', accent: '#049fd9', brandName: 'Cisco ISE' },
  'aruba-clearpass': { tone: 'dark', accent: '#ff8300', brandName: 'Aruba ClearPass' },
};

export function switchVendorSkin(vendor: SwitchVendor | undefined): VendorSkin {
  return SWITCH_PALETTE[vendor ?? 'generic'] ?? SWITCH_PALETTE.generic;
}

export function firewallVendorSkin(vendor: FirewallVendor | undefined): VendorSkin {
  return FIREWALL_PALETTE[vendor ?? 'generic'] ?? FIREWALL_PALETTE.generic;
}

export function nacVendorSkin(vendor: NacVendor | undefined): VendorSkin {
  return NAC_PALETTE[vendor ?? 'generic'] ?? NAC_PALETTE.generic;
}
