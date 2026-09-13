/**
 * Datacenter Component Graphics & Photorealistic SVG Definitions
 * Extracted from Datacenter_ICons.svg (57 Industry Hardware Components across 9 Categories)
 */

export const DC_SVG_DEFS_RAW = `
  <defs>
    <!-- Canvas & Shading -->
    <linearGradient id="dc-bg-unified" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#14171A" />
      <stop offset="100%" stop-color="#0B0C0E" />
    </linearGradient>

    <!-- Global Drop Shadow -->
    <filter id="dc-hw-drop-shadow" x="-10%" y="-30%" width="130%" height="180%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.85" />
    </filter>

    <!-- Metal & Chassis Shading -->
    <linearGradient id="dc-chassis-dark" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#334155" />
      <stop offset="25%" stop-color="#1E293B" />
      <stop offset="100%" stop-color="#0F172A" />
    </linearGradient>

    <linearGradient id="dc-metal-finish" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="15%" stop-color="#E2E8F0" />
      <stop offset="50%" stop-color="#94A3B8" />
      <stop offset="85%" stop-color="#64748B" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <linearGradient id="dc-copper-bus" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FED7AA" />
      <stop offset="40%" stop-color="#F97316" />
      <stop offset="100%" stop-color="#9A3412" />
    </linearGradient>

    <linearGradient id="dc-fiber-yellow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="40%" stop-color="#EAB308" />
      <stop offset="100%" stop-color="#854D0E" />
    </linearGradient>

    <linearGradient id="dc-cool-cyan" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67E8F9" />
      <stop offset="40%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#0E7490" />
    </linearGradient>

    <linearGradient id="dc-fire-red" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F87171" />
      <stop offset="40%" stop-color="#DC2626" />
      <stop offset="100%" stop-color="#7F1D1D" />
    </linearGradient>

    <linearGradient id="dc-net-blue" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA" />
      <stop offset="40%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1E3A8A" />
    </linearGradient>

    <!-- 3D Isometric Cabinet Shading -->
    <linearGradient id="dc-3d-side" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="100%" stop-color="#0B0F17" />
    </linearGradient>
    <linearGradient id="dc-3d-top" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#475569" />
      <stop offset="100%" stop-color="#1E293B" />
    </linearGradient>
    <linearGradient id="dc-rail-silver" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#475569" />
      <stop offset="50%" stop-color="#94A3B8" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <!-- Procedural Patterns -->
    <pattern id="dc-wire-mesh" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M 0 3 L 6 3 M 3 0 L 3 6" stroke="#475569" stroke-width="0.8" />
    </pattern>
    <pattern id="dc-rack-perf" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="#0B0F17" />
      <circle cx="2" cy="2" r="0.75" fill="#64748B" opacity="0.65" />
    </pattern>
    <pattern id="dc-rack-honeycomb" width="8" height="14" patternUnits="userSpaceOnUse">
      <path d="M 4 0 L 8 2.3 L 8 6.9 L 4 9.2 L 0 6.9 L 0 2.3 Z M 4 13.8 L 8 11.5 L 8 6.9 L 4 4.6 L 0 6.9 L 0 11.5 Z" fill="#090D16" stroke="#38BDF8" stroke-width="0.75" opacity="0.85" />
    </pattern>
    <linearGradient id="dc-glass-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284C7" stop-opacity="0.35" />
      <stop offset="35%" stop-color="#38BDF8" stop-opacity="0.15" />
      <stop offset="55%" stop-color="#FFFFFF" stop-opacity="0.3" />
      <stop offset="75%" stop-color="#0F172A" stop-opacity="0.65" />
      <stop offset="100%" stop-color="#0284C7" stop-opacity="0.2" />
    </linearGradient>
    <pattern id="dc-srg-grid" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M 0 4 L 8 4 M 4 0 L 4 8" stroke="#F97316" stroke-width="0.9" />
    </pattern>
  </defs>
`;

export function ensureDcSvgDefs(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('dc-svg-defs-container')) return;

  const wrap = document.createElement('div');
  wrap.id = 'dc-svg-defs-container';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0">${DC_SVG_DEFS_RAW}</svg>`;
  document.body.appendChild(wrap);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureDcSvgDefs, { once: true });
  } else {
    ensureDcSvgDefs();
  }
}

export interface DcComponentItem {
  id: string;
  code: string;
  name: string;
  category: 'racks' | 'pathways' | 'power' | 'cooling' | 'monitoring' | 'security' | 'grounding' | 'patching';
  subCategory?: string;
  pathwayLevel?: 'underfloor' | 'overhead';
  presetId?: string;
  badgeType: 'rack' | 'pathway' | 'power' | 'cooling' | 'sensor' | 'security' | 'fire' | 'ground' | 'fiber';
  description: string;
  svgInner: string;
  viewBox?: string;
  widthMm?: number;
  depthMm?: number;
  heightU?: number;
}

export interface DcSubCategoryInfo {
  id: string;
  label: string;
}

export interface DcComponentCategoryGroup {
  id: string;
  label: string;
  icon: string;
  subCategories?: DcSubCategoryInfo[];
  items: DcComponentItem[];
}

export const ALL_DC_COMPONENTS: DcComponentItem[] = [
  // ── 1. RACKS & ENCLOSURES (REAL 3D GRAPHICS, ALL DOOR STYLES & DEPTHS) ──
  // ── 1.1 Single Door Server Cabinets ──
  {
    id: 'rack-server-42u',
    code: 'SR-42U',
    name: 'Standard Perforated Door Rack (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'server',
    badgeType: 'rack',
    presetId: 'apc-42u-server',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Enterprise 42U server cabinet with 80% open curved perforation door, 19" vertical rails with RU markings.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#475569" stroke-width="0.8" />
      <ellipse cx="38" cy="5.5" rx="7" ry="2" fill="#0B0F17" stroke="#38BDF8" stroke-width="0.5" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#334155" stroke-width="1" />
      <rect x="10" y="10" width="40" height="4" rx="0.5" fill="#0B0F17" />
      <line x1="12" y1="12" x2="48" y2="12" stroke="#38BDF8" stroke-width="0.8" stroke-dasharray="2 2" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="8" y="124" width="6" height="2" fill="#64748B" /><rect x="42" y="124" width="6" height="2" fill="#64748B" />
      <rect x="10" y="15" width="40" height="103" fill="#080C14" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="none" stroke="#475569" stroke-width="1.2" />
      <rect x="11" y="16" width="38" height="102" fill="url(#dc-rack-perf)" opacity="0.88" />
      <rect x="48" y="60" width="2" height="16" rx="0.6" fill="#CBD5E1" stroke="#475569" stroke-width="0.5" />
      <circle cx="49" cy="56" r="1.2" fill="#38BDF8" />
    `
  },
  {
    id: 'rack-server-42u-1070',
    code: 'SR-1070',
    name: 'APC NetShelter Perforated Rack (42U - 1070mm D)',
    category: 'racks',
    subCategory: 'server',
    badgeType: 'rack',
    presetId: 'apc-42u-server',
    widthMm: 600,
    depthMm: 1070,
    heightU: 42,
    description: 'Industry-standard APC NetShelter SX 1070mm deep server cabinet with 80% curved mesh door & cable channels.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#38BDF8" stroke-width="0.8" />
      <ellipse cx="38" cy="5.5" rx="7" ry="2" fill="#0B0F17" stroke="#38BDF8" stroke-width="0.5" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="1" />
      <rect x="10" y="10" width="40" height="4" rx="0.5" fill="#0B0F17" />
      <line x1="12" y1="12" x2="48" y2="12" stroke="#38BDF8" stroke-width="0.8" stroke-dasharray="2 2" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="15" width="40" height="103" fill="#080C14" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="none" stroke="#38BDF8" stroke-width="1.2" />
      <rect x="11" y="16" width="38" height="102" fill="url(#dc-rack-perf)" opacity="0.88" />
      <rect x="22" y="14" width="16" height="2" fill="#38BDF8" />
      <rect x="48" y="60" width="2.2" height="16" rx="0.6" fill="#E2E8F0" stroke="#0284C7" stroke-width="0.5" />
      <circle cx="49" cy="56" r="1.2" fill="#22C55E" />
    `
  },
  {
    id: 'rack-server-48u-1200',
    code: 'SR-48U-HD',
    name: 'Deep Enterprise Server Rack (48U - 1200mm D)',
    category: 'racks',
    subCategory: 'server',
    badgeType: 'rack',
    presetId: 'apc-48u-deep-server',
    widthMm: 600,
    depthMm: 1200,
    heightU: 48,
    description: 'Extra-tall 48U and deep 1200mm high-density blade compute rack with enlarged rear cable zone.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,6 15,2 65,2 56,6" fill="url(#dc-3d-top)" stroke="#F59E0B" stroke-width="0.8" />
      <ellipse cx="40" cy="4" rx="8" ry="2" fill="#0B0F17" stroke="#F59E0B" stroke-width="0.5" />
      <polygon points="56,6 65,2 65,121 56,124" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="6" width="50" height="118" rx="2" fill="url(#dc-chassis-dark)" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="10" y="8" width="42" height="4" rx="0.5" fill="#0B0F17" />
      <line x1="12" y1="10" x2="50" y2="10" stroke="#F59E0B" stroke-width="0.8" stroke-dasharray="2 2" />
      <rect x="4" y="124" width="54" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="13" width="42" height="108" fill="#080C14" />
      <rect x="10" y="13" width="4" height="108" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="16" x2="12" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2" />
      <rect x="48" y="13" width="4" height="108" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="50" y1="16" x2="50" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2" />
      <line x1="16" y1="13" x2="16" y2="120" stroke="#EF4444" stroke-width="0.8" opacity="0.9" />
      <line x1="46" y1="13" x2="46" y2="120" stroke="#EF4444" stroke-width="0.8" opacity="0.9" />
      <rect x="8" y="12" width="46" height="110" rx="1.5" fill="none" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="11" y="14" width="40" height="106" fill="url(#dc-rack-perf)" opacity="0.9" />
      <rect x="50" y="60" width="2.2" height="18" rx="0.6" fill="#F59E0B" />
      <circle cx="51" cy="55" r="1.2" fill="#22C55E" />
    `
  },
  {
    id: 'rack-hd-contained',
    code: 'HD-CHIMNEY',
    name: 'High-Density Chimney Exhaust Rack (48U - 1200mm D)',
    category: 'racks',
    subCategory: 'server',
    badgeType: 'rack',
    presetId: 'apc-48u-deep-server',
    widthMm: 750,
    depthMm: 1200,
    heightU: 48,
    description: 'High-density 48U compute rack with integrated top vertical exhaust chimney duct and air seals.',
    viewBox: '0 0 76 130',
    svgInner: `
      <!-- Top Chimney Exhaust Duct -->
      <polygon points="18,1 42,1 38,8 22,8" fill="#1E293B" stroke="#F59E0B" stroke-width="1" />
      <line x1="24" y1="1" x2="24" y2="8" stroke="#F59E0B" stroke-width="0.6" />
      <line x1="36" y1="1" x2="36" y2="8" stroke="#F59E0B" stroke-width="0.6" />
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#F59E0B" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="15" width="40" height="103" fill="#080C14" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="none" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="11" y="16" width="38" height="102" fill="url(#dc-rack-perf)" opacity="0.9" />
      <polygon points="30,22 34,28 26,28" fill="#EF4444" opacity="0.9" />
      <rect x="48" y="60" width="2" height="16" rx="0.6" fill="#F59E0B" />
    `
  },
  {
    id: 'rack-server-24u-800',
    code: 'SR-24U',
    name: 'Shallow Telecom Server Cabinet (24U - 800mm D)',
    category: 'racks',
    subCategory: 'server',
    badgeType: 'rack',
    presetId: '24u-mid-tower',
    widthMm: 600,
    depthMm: 800,
    heightU: 24,
    description: 'Compact 24U shallow depth cabinet (800mm) for edge closets, audio-video, and telecom rooms.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="8,28 16,23 60,23 52,28" fill="url(#dc-3d-top)" stroke="#64748B" stroke-width="0.8" />
      <polygon points="52,28 60,23 60,119 52,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="8" y="28" width="44" height="94" rx="2" fill="url(#dc-chassis-dark)" stroke="#64748B" stroke-width="1" />
      <rect x="6" y="122" width="48" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="12" y="32" width="36" height="86" fill="#080C14" />
      <rect x="12" y="32" width="3.5" height="86" fill="url(#dc-rail-silver)" />
      <line x1="14" y1="35" x2="14" y2="114" stroke="#38BDF8" stroke-width="1" stroke-dasharray="1.5 3" />
      <rect x="44.5" y="32" width="3.5" height="86" fill="url(#dc-rail-silver)" />
      <line x1="46" y1="35" x2="46" y2="114" stroke="#38BDF8" stroke-width="1" stroke-dasharray="1.5 3" />
      <rect x="10" y="30" width="40" height="90" rx="1.5" fill="none" stroke="#64748B" stroke-width="1" />
      <rect x="12" y="32" width="36" height="86" fill="url(#dc-rack-perf)" opacity="0.85" />
      <rect x="45" y="68" width="2" height="14" rx="0.5" fill="#E2E8F0" />
    `
  },

  // ── 1.2 Twin / Split Wardrobe Doors ──
  {
    id: 'rack-server-dualdoor',
    code: 'SR-DUAL',
    name: 'Twin Split-Door Server Rack (42U - 1070mm D)',
    category: 'racks',
    subCategory: 'twin_doors',
    badgeType: 'rack',
    presetId: 'apc-42u-split-mesh',
    widthMm: 600,
    depthMm: 1070,
    heightU: 42,
    description: 'Dual split wardrobe perforated doors for tight cold/hot aisle clearances with center dual swing-handles.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#38BDF8" stroke-width="0.8" />
      <ellipse cx="38" cy="5.5" rx="7" ry="2" fill="#0B0F17" stroke="#38BDF8" stroke-width="0.5" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="15" width="40" height="103" fill="#080C14" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <!-- Left Split Leaf -->
      <rect x="8" y="14" width="21" height="106" rx="1" fill="none" stroke="#475569" stroke-width="1" />
      <rect x="10" y="16" width="18" height="102" fill="url(#dc-rack-perf)" opacity="0.88" />
      <rect x="26.5" y="60" width="1.5" height="14" rx="0.4" fill="#38BDF8" />
      <!-- Right Split Leaf -->
      <rect x="31" y="14" width="21" height="106" rx="1" fill="none" stroke="#475569" stroke-width="1" />
      <rect x="32" y="16" width="18" height="102" fill="url(#dc-rack-perf)" opacity="0.88" />
      <rect x="32" y="60" width="1.5" height="14" rx="0.4" fill="#38BDF8" />
      <!-- Center Split Seam -->
      <line x1="30" y1="14" x2="30" y2="120" stroke="#0F172A" stroke-width="1.5" />
    `
  },
  {
    id: 'rack-split-perf-48u',
    code: 'SR-SPLIT-HD',
    name: 'Twin Split Perforated HD Rack (48U - 1200mm D)',
    category: 'racks',
    subCategory: 'twin_doors',
    badgeType: 'rack',
    presetId: 'apc-48u-deep-server',
    widthMm: 750,
    depthMm: 1200,
    heightU: 48,
    description: 'Deep 1200mm high-density blade compute rack with dual split perforated wardrobe doors.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,6 15,2 65,2 56,6" fill="url(#dc-3d-top)" stroke="#F59E0B" stroke-width="0.8" />
      <polygon points="56,6 65,2 65,121 56,124" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="6" width="50" height="118" rx="2" fill="url(#dc-chassis-dark)" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="4" y="124" width="54" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="13" width="42" height="108" fill="#080C14" />
      <rect x="10" y="13" width="4" height="108" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="16" x2="12" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2" />
      <rect x="48" y="13" width="4" height="108" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="50" y1="16" x2="50" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2" />
      <line x1="16" y1="13" x2="16" y2="120" stroke="#EF4444" stroke-width="0.8" opacity="0.9" />
      <line x1="46" y1="13" x2="46" y2="120" stroke="#EF4444" stroke-width="0.8" opacity="0.9" />
      <!-- Left Split Leaf -->
      <rect x="8" y="12" width="22" height="110" rx="1" fill="none" stroke="#F59E0B" stroke-width="1" />
      <rect x="10" y="14" width="19" height="106" fill="url(#dc-rack-perf)" opacity="0.9" />
      <rect x="27.5" y="62" width="1.5" height="16" rx="0.4" fill="#F59E0B" />
      <!-- Right Split Leaf -->
      <rect x="32" y="12" width="22" height="110" rx="1" fill="none" stroke="#F59E0B" stroke-width="1" />
      <rect x="33" y="14" width="19" height="106" fill="url(#dc-rack-perf)" opacity="0.9" />
      <rect x="33" y="62" width="1.5" height="16" rx="0.4" fill="#F59E0B" />
      <line x1="31" y1="12" x2="31" y2="122" stroke="#0F172A" stroke-width="1.5" />
    `
  },
  {
    id: 'rack-split-louv-42u',
    code: 'SR-SPLIT-LOUV',
    name: 'Twin Split Louvered Vented Door Rack (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'twin_doors',
    badgeType: 'rack',
    presetId: 'apc-42u-split-mesh',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Dual split louvered steel doors with angled airflow vents for directed floor cooling intake.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#64748B" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#64748B" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- Left Split Louver Leaf -->
      <rect x="8" y="14" width="21" height="106" rx="1" fill="#1E293B" stroke="#475569" stroke-width="1" />
      <line x1="11" y1="22" x2="26" y2="22" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="32" x2="26" y2="32" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="42" x2="26" y2="42" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="52" x2="26" y2="52" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="72" x2="26" y2="72" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="82" x2="26" y2="82" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="92" x2="26" y2="92" stroke="#38BDF8" stroke-width="1" />
      <line x1="11" y1="102" x2="26" y2="102" stroke="#38BDF8" stroke-width="1" />
      <rect x="26.5" y="60" width="1.5" height="14" rx="0.4" fill="#E2E8F0" />
      <!-- Right Split Louver Leaf -->
      <rect x="31" y="14" width="21" height="106" rx="1" fill="#1E293B" stroke="#475569" stroke-width="1" />
      <line x1="34" y1="22" x2="49" y2="22" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="32" x2="49" y2="32" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="42" x2="49" y2="42" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="52" x2="49" y2="52" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="72" x2="49" y2="72" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="82" x2="49" y2="82" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="92" x2="49" y2="92" stroke="#38BDF8" stroke-width="1" />
      <line x1="34" y1="102" x2="49" y2="102" stroke="#38BDF8" stroke-width="1" />
      <rect x="32" y="60" width="1.5" height="14" rx="0.4" fill="#E2E8F0" />
      <line x1="30" y1="14" x2="30" y2="120" stroke="#0F172A" stroke-width="1.5" />
    `
  },
  {
    id: 'rack-split-solid-42u',
    code: 'SR-SPLIT-SOLID',
    name: 'Twin Split Solid Steel Door Rack (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'twin_doors',
    badgeType: 'rack',
    presetId: 'apc-42u-split-mesh',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Heavy gauge twin split solid steel doors with perimeter gasket for contained / sealed airflow zones.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#64748B" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#64748B" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- Left Solid Leaf -->
      <rect x="8" y="14" width="21" height="106" rx="1" fill="url(#dc-chassis-dark)" stroke="#475569" stroke-width="1" />
      <rect x="11" y="20" width="15" height="40" rx="1" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
      <rect x="11" y="70" width="15" height="40" rx="1" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
      <rect x="26.5" y="60" width="1.5" height="14" rx="0.4" fill="#CBD5E1" />
      <!-- Right Solid Leaf -->
      <rect x="31" y="14" width="21" height="106" rx="1" fill="url(#dc-chassis-dark)" stroke="#475569" stroke-width="1" />
      <rect x="34" y="20" width="15" height="40" rx="1" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
      <rect x="34" y="70" width="15" height="40" rx="1" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
      <rect x="32" y="60" width="1.5" height="14" rx="0.4" fill="#CBD5E1" />
      <line x1="30" y1="14" x2="30" y2="120" stroke="#0F172A" stroke-width="1.5" />
    `
  },

  // ── 1.3 Honeycomb High-Airflow Mesh Doors ──
  {
    id: 'rack-server-honeycomb',
    code: 'SR-HNYCMB',
    name: 'Single Honeycomb High-Airflow Rack (42U - 1070mm D)',
    category: 'racks',
    subCategory: 'honeycomb',
    badgeType: 'rack',
    presetId: 'apc-48u-deep-server',
    widthMm: 600,
    depthMm: 1070,
    heightU: 42,
    description: 'High-density compute rack with 83% hexagonal honeycomb mesh door for maximum CFM server airflow.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#F59E0B" stroke-width="0.8" />
      <ellipse cx="38" cy="5.5" rx="7" ry="2" fill="#0B0F17" stroke="#F59E0B" stroke-width="0.5" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="15" width="40" height="103" fill="#080C14" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="none" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="11" y="16" width="38" height="102" fill="url(#dc-rack-honeycomb)" />
      <rect x="48" y="60" width="2.2" height="16" rx="0.6" fill="#F59E0B" />
      <circle cx="49" cy="56" r="1.2" fill="#22C55E" />
    `
  },
  {
    id: 'rack-split-honeycomb-48u',
    code: 'SR-HNY-DUAL',
    name: 'Twin Split Honeycomb HD Rack (48U - 1200mm D)',
    category: 'racks',
    subCategory: 'honeycomb',
    badgeType: 'rack',
    presetId: 'apc-48u-deep-server',
    widthMm: 750,
    depthMm: 1200,
    heightU: 48,
    description: 'Deep 1200mm extreme CFM compute rack with dual split hexagonal honeycomb doors.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,6 15,2 65,2 56,6" fill="url(#dc-3d-top)" stroke="#F59E0B" stroke-width="0.8" />
      <polygon points="56,6 65,2 65,121 56,124" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="6" width="50" height="118" rx="2" fill="url(#dc-chassis-dark)" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="4" y="124" width="54" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="13" width="42" height="108" fill="#080C14" />
      <rect x="10" y="13" width="4" height="108" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="16" x2="12" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2" />
      <rect x="48" y="13" width="4" height="108" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="50" y1="16" x2="50" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2" />
      <line x1="16" y1="13" x2="16" y2="120" stroke="#EF4444" stroke-width="0.8" opacity="0.9" />
      <line x1="46" y1="13" x2="46" y2="120" stroke="#EF4444" stroke-width="0.8" opacity="0.9" />
      <!-- Left Split Honeycomb Leaf -->
      <rect x="8" y="12" width="22" height="110" rx="1" fill="none" stroke="#F59E0B" stroke-width="1" />
      <rect x="10" y="14" width="19" height="106" fill="url(#dc-rack-honeycomb)" />
      <rect x="27.5" y="62" width="1.5" height="16" rx="0.4" fill="#F59E0B" />
      <!-- Right Split Honeycomb Leaf -->
      <rect x="32" y="12" width="22" height="110" rx="1" fill="none" stroke="#F59E0B" stroke-width="1" />
      <rect x="33" y="14" width="19" height="106" fill="url(#dc-rack-honeycomb)" />
      <rect x="33" y="62" width="1.5" height="16" rx="0.4" fill="#F59E0B" />
      <line x1="31" y1="12" x2="31" y2="122" stroke="#0F172A" stroke-width="1.5" />
    `
  },
  {
    id: 'rack-microhex-42u',
    code: 'SR-HNY-MICRO',
    name: 'Micro-Hex High-Density Filter Rack (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'honeycomb',
    badgeType: 'rack',
    presetId: 'apc-42u-server',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Fine micro-hex honeycomb mesh door combining particle filtration with high air throughput.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#06B6D4" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#06B6D4" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="15" width="40" height="103" fill="#080C14" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="none" stroke="#06B6D4" stroke-width="1" />
      <rect x="11" y="16" width="38" height="102" fill="url(#dc-rack-perf)" opacity="0.95" />
      <rect x="48" y="60" width="2" height="16" rx="0.6" fill="#00E5FF" />
      <circle cx="49" cy="56" r="1.2" fill="#00E5FF" />
    `
  },

  // ── 1.4 Glass & Solid Acoustic Cabinets ──
  {
    id: 'rack-server-glass',
    code: 'SR-GLASS',
    name: 'Acoustic Tempered Glass Viewing Rack (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'glass_solid',
    badgeType: 'rack',
    presetId: '24u-mid-tower',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Acoustic-dampened quiet cabinet with tempered safety glass viewing door, illuminated rack rails visible.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#94A3B8" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#94A3B8" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- Interior Mounted Equipment Glowing behind Glass -->
      <rect x="10" y="15" width="40" height="103" fill="#060A10" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.5" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <line x1="16" y1="15" x2="16" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <line x1="44" y1="15" x2="44" y2="118" stroke="#EF4444" stroke-width="0.8" opacity="0.85" />
      <rect x="15" y="24" width="30" height="8" rx="0.5" fill="#1E293B" />
      <circle cx="18" cy="28" r="1" fill="#22C55E" /><circle cx="21" cy="28" r="1" fill="#38BDF8" />
      <rect x="15" y="44" width="30" height="12" rx="0.5" fill="#1E293B" />
      <circle cx="18" cy="50" r="1" fill="#22C55E" />
      <rect x="15" y="70" width="30" height="16" rx="0.5" fill="#1E293B" />
      <circle cx="18" cy="78" r="1" fill="#22C55E" /><circle cx="21" cy="78" r="1" fill="#22C55E" />
      <!-- Tempered Glass Door & Diagonal Specular Reflections -->
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="url(#dc-glass-gradient)" stroke="#38BDF8" stroke-width="1.2" />
      <polygon points="10,14 26,14 14,120 10,120" fill="#FFFFFF" opacity="0.22" />
      <polygon points="30,14 38,14 24,120 18,120" fill="#FFFFFF" opacity="0.12" />
      <rect x="48" y="60" width="2" height="16" rx="0.6" fill="#E2E8F0" />
    `
  },
  {
    id: 'rack-split-glass-42u',
    code: 'SR-SPLIT-GLASS',
    name: 'Twin Split Glass Door Cabinet (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'glass_solid',
    badgeType: 'rack',
    presetId: 'apc-42u-split-mesh',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Dual split wardrobe tempered glass doors for high-visibility observation in tight aisle clearances.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#38BDF8" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="15" width="40" height="103" fill="#060A10" />
      <rect x="10" y="15" width="4" height="103" fill="url(#dc-rail-silver)" />
      <line x1="12" y1="18" x2="12" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="46" y="15" width="4" height="103" fill="url(#dc-rail-silver)" />
      <line x1="48" y1="18" x2="48" y2="114" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <!-- Left Split Glass Leaf -->
      <rect x="8" y="14" width="21" height="106" rx="1" fill="url(#dc-glass-gradient)" stroke="#38BDF8" stroke-width="1" />
      <polygon points="10,14 18,14 12,120 10,120" fill="#FFFFFF" opacity="0.25" />
      <rect x="26.5" y="60" width="1.5" height="14" rx="0.4" fill="#E2E8F0" />
      <!-- Right Split Glass Leaf -->
      <rect x="31" y="14" width="21" height="106" rx="1" fill="url(#dc-glass-gradient)" stroke="#38BDF8" stroke-width="1" />
      <polygon points="34,14 42,14 36,120 32,120" fill="#FFFFFF" opacity="0.25" />
      <rect x="32" y="60" width="1.5" height="14" rx="0.4" fill="#E2E8F0" />
      <line x1="30" y1="14" x2="30" y2="120" stroke="#0F172A" stroke-width="1.5" />
    `
  },
  {
    id: 'rack-solid-42u',
    code: 'SR-SOLID-42U',
    name: 'Industrial Solid Steel Cabinet (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'glass_solid',
    badgeType: 'rack',
    presetId: 'apc-42u-server',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'NEMA-rated sealed industrial solid steel cabinet with flush swing handle and keyed lock.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#64748B" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#64748B" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="8" y="14" width="44" height="106" rx="1.5" fill="url(#dc-chassis-dark)" stroke="#475569" stroke-width="1.2" />
      <!-- Embossed Stiffener Panels -->
      <rect x="12" y="20" width="36" height="42" rx="1.5" fill="#1E293B" stroke="#334155" stroke-width="0.8" />
      <rect x="12" y="70" width="36" height="42" rx="1.5" fill="#1E293B" stroke="#334155" stroke-width="0.8" />
      <rect x="48" y="60" width="2.2" height="16" rx="0.6" fill="#CBD5E1" stroke="#475569" stroke-width="0.5" />
      <circle cx="49" cy="56" r="1.2" fill="#EAB308" />
    `
  },

  // ── 1.5 Network & Open Frame Racks ──
  {
    id: 'rack-network-2post',
    code: 'NR-2POST',
    name: '2-Post Open Frame Relay Rack (45U - 800mm Base)',
    category: 'racks',
    subCategory: 'network',
    badgeType: 'rack',
    presetId: 'panduit-45u-network',
    widthMm: 800,
    depthMm: 800,
    heightU: 45,
    description: 'Open frame 2-post distribution relay rack with aluminum vertical channels and side cable rings.',
    viewBox: '0 0 76 130',
    svgInner: `
      <!-- Heavy Base Footplate -->
      <rect x="4" y="120" width="54" height="6" rx="1.5" fill="#0F172A" stroke="#38BDF8" stroke-width="1" />
      <rect x="8" y="122" width="8" height="3" fill="#64748B" /><rect x="46" y="122" width="8" height="3" fill="#64748B" />
      <!-- Left & Right Vertical Channel Posts -->
      <rect x="16" y="10" width="6" height="110" rx="1" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.8" />
      <line x1="19" y1="12" x2="19" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <rect x="40" y="10" width="6" height="110" rx="1" fill="url(#dc-rail-silver)" stroke="#475569" stroke-width="0.8" />
      <line x1="43" y1="12" x2="43" y2="118" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="1.5 2.5" />
      <!-- Top Crossbar & Side Cable Manager Fingers -->
      <rect x="14" y="8" width="34" height="4" rx="0.5" fill="#334155" stroke="#475569" stroke-width="0.8" />
      <rect x="8" y="24" width="6" height="14" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="8" y="54" width="6" height="14" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="8" y="84" width="6" height="14" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="48" y="24" width="6" height="14" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="48" y="54" width="6" height="14" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="48" y="84" width="6" height="14" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.5" />
    `
  },
  {
    id: 'rack-network-4post',
    code: 'NR-4POST',
    name: '4-Post Open Frame Lab Staging Rack (42U - 1000mm D)',
    category: 'racks',
    subCategory: 'network',
    badgeType: 'rack',
    presetId: 'startech-42u-openframe',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Heavy-duty 4-post open steel frame for lab staging, testing, and maximum unobstructed airflow.',
    viewBox: '0 0 76 130',
    svgInner: `
      <!-- Top Depth Crossbars -->
      <polygon points="12,12 20,6 56,6 48,12" fill="none" stroke="#64748B" stroke-width="1.2" />
      <!-- Rear Uprights -->
      <line x1="20" y1="6" x2="20" y2="118" stroke="#475569" stroke-width="2" />
      <line x1="56" y1="6" x2="56" y2="118" stroke="#475569" stroke-width="2" />
      <!-- Bottom Depth Crossbars -->
      <polygon points="12,120 20,114 56,114 48,120" fill="none" stroke="#64748B" stroke-width="1.2" />
      <!-- Front Uprights & RU Markers -->
      <rect x="10" y="10" width="5" height="112" rx="0.5" fill="url(#dc-rail-silver)" stroke="#38BDF8" stroke-width="0.8" />
      <line x1="12.5" y1="12" x2="12.5" y2="120" stroke="#38BDF8" stroke-width="1" stroke-dasharray="1.5 2.5" />
      <rect x="47" y="10" width="5" height="112" rx="0.5" fill="url(#dc-rail-silver)" stroke="#38BDF8" stroke-width="0.8" />
      <line x1="49.5" y1="12" x2="49.5" y2="120" stroke="#38BDF8" stroke-width="1" stroke-dasharray="1.5 2.5" />
      <!-- Middle Staging Crossbars -->
      <line x1="12" y1="46" x2="20" y2="40" stroke="#64748B" stroke-width="1.2" />
      <line x1="48" y1="46" x2="56" y2="40" stroke="#64748B" stroke-width="1.2" />
      <line x1="12" y1="86" x2="20" y2="80" stroke="#64748B" stroke-width="1.2" />
      <line x1="48" y1="86" x2="56" y2="80" stroke="#64748B" stroke-width="1.2" />
    `
  },
  {
    id: 'rack-network-cabinet',
    code: 'NR-SW800',
    name: 'Network Core Switch Cabinet (800mm Wide - 1000mm D)',
    category: 'racks',
    subCategory: 'network',
    badgeType: 'rack',
    presetId: 'eaton-48u-network',
    widthMm: 800,
    depthMm: 1000,
    heightU: 48,
    description: 'Extra-wide 800mm switching cabinet with oversized vertical cable manager bays and waterfall fingers.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="4,8 14,3 64,3 54,8" fill="url(#dc-3d-top)" stroke="#0284C7" stroke-width="0.8" />
      <polygon points="54,8 64,3 64,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="4" y="8" width="50" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#0284C7" stroke-width="1.2" />
      <rect x="2" y="122" width="54" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- Left Side Vertical Cable Duct Bay -->
      <rect x="6" y="14" width="7" height="104" rx="1" fill="#082F49" stroke="#38BDF8" stroke-width="0.6" />
      <line x1="6" y1="26" x2="13" y2="26" stroke="#FDE047" stroke-width="1.2" />
      <line x1="6" y1="46" x2="13" y2="46" stroke="#38BDF8" stroke-width="1.2" />
      <line x1="6" y1="66" x2="13" y2="66" stroke="#FDE047" stroke-width="1.2" />
      <line x1="6" y1="86" x2="13" y2="86" stroke="#38BDF8" stroke-width="1.2" />
      <line x1="6" y1="106" x2="13" y2="106" stroke="#38BDF8" stroke-width="1.2" />
      <!-- Center 19-inch Rail Bay -->
      <rect x="15" y="14" width="28" height="104" fill="#060A10" />
      <rect x="15" y="14" width="3.5" height="104" fill="url(#dc-rail-silver)" />
      <line x1="16.5" y1="16" x2="16.5" y2="116" stroke="#38BDF8" stroke-width="1" stroke-dasharray="1.5 2.5" />
      <rect x="39.5" y="14" width="3.5" height="104" fill="url(#dc-rail-silver)" />
      <line x1="41" y1="16" x2="41" y2="116" stroke="#38BDF8" stroke-width="1" stroke-dasharray="1.5 2.5" />
      <rect x="15" y="14" width="28" height="104" fill="url(#dc-rack-perf)" opacity="0.8" />
      <!-- Right Side Vertical Cable Duct Bay -->
      <rect x="45" y="14" width="7" height="104" rx="1" fill="#082F49" stroke="#38BDF8" stroke-width="0.6" />
      <line x1="45" y1="26" x2="52" y2="26" stroke="#38BDF8" stroke-width="1.2" />
      <line x1="45" y1="46" x2="52" y2="46" stroke="#FDE047" stroke-width="1.2" />
      <line x1="45" y1="66" x2="52" y2="66" stroke="#38BDF8" stroke-width="1.2" />
      <line x1="45" y1="86" x2="52" y2="86" stroke="#FDE047" stroke-width="1.2" />
      <line x1="45" y1="106" x2="52" y2="106" stroke="#38BDF8" stroke-width="1.2" />
    `
  },

  // ── 1.6 Colocation Multi-Bay Compartment Cabinets ──
  {
    id: 'rack-colo-2bay',
    code: 'COLO-2BAY',
    name: 'Colocation 2-Compartment Cabinet (2×20U - 1000mm D)',
    category: 'racks',
    subCategory: 'colo',
    badgeType: 'rack',
    presetId: 'apc-42u-colo-2',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Multi-tenant colocation cabinet with 2 secure independent 20U compartments with dedicated locks.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#A855F7" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#A855F7" stroke-width="1.2" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- Top 20U Compartment -->
      <rect x="8" y="14" width="44" height="48" rx="1" fill="#0B0F17" stroke="#A855F7" stroke-width="1" />
      <rect x="10" y="16" width="40" height="44" fill="url(#dc-rack-perf)" opacity="0.85" />
      <rect x="47" y="32" width="2.2" height="10" rx="0.5" fill="#E2E8F0" />
      <circle cx="48" cy="28" r="1.2" fill="#A855F7" />
      <!-- Center Solid Security Divider -->
      <rect x="6" y="63" width="48" height="4" fill="#A855F7" stroke="#6B21A8" stroke-width="0.5" />
      <!-- Bottom 20U Compartment -->
      <rect x="8" y="68" width="44" height="48" rx="1" fill="#0B0F17" stroke="#A855F7" stroke-width="1" />
      <rect x="10" y="70" width="40" height="44" fill="url(#dc-rack-perf)" opacity="0.85" />
      <rect x="47" y="86" width="2.2" height="10" rx="0.5" fill="#E2E8F0" />
      <circle cx="48" cy="82" r="1.2" fill="#A855F7" />
    `
  },
  {
    id: 'rack-colo-4bay',
    code: 'COLO-4BAY',
    name: 'Colocation 4-Compartment Cabinet (4×10U - 1000mm D)',
    category: 'racks',
    subCategory: 'colo',
    badgeType: 'rack',
    presetId: 'apc-42u-colo-4',
    widthMm: 600,
    depthMm: 1000,
    heightU: 42,
    description: 'Multi-tenant colocation cabinet with 4 secure isolated 10U compartments with separate keyless access.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#A855F7" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#A855F7" stroke-width="1.2" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- 4 Independent 10U Compartments -->
      <rect x="8" y="13" width="44" height="22" rx="0.5" fill="url(#dc-rack-perf)" stroke="#A855F7" stroke-width="0.8" />
      <rect x="47" y="20" width="2" height="6" fill="#E2E8F0" /><circle cx="48" cy="17" r="1" fill="#A855F7" />
      <line x1="6" y1="38" x2="54" y2="38" stroke="#A855F7" stroke-width="2" />
      <rect x="8" y="41" width="44" height="22" rx="0.5" fill="url(#dc-rack-perf)" stroke="#A855F7" stroke-width="0.8" />
      <rect x="47" y="48" width="2" height="6" fill="#E2E8F0" /><circle cx="48" cy="45" r="1" fill="#A855F7" />
      <line x1="6" y1="66" x2="54" y2="66" stroke="#A855F7" stroke-width="2" />
      <rect x="8" y="69" width="44" height="22" rx="0.5" fill="url(#dc-rack-perf)" stroke="#A855F7" stroke-width="0.8" />
      <rect x="47" y="76" width="2" height="6" fill="#E2E8F0" /><circle cx="48" cy="73" r="1" fill="#A855F7" />
      <line x1="6" y1="94" x2="54" y2="94" stroke="#A855F7" stroke-width="2" />
      <rect x="8" y="97" width="44" height="22" rx="0.5" fill="url(#dc-rack-perf)" stroke="#A855F7" stroke-width="0.8" />
      <rect x="47" y="104" width="2" height="6" fill="#E2E8F0" /><circle cx="48" cy="101" r="1" fill="#A855F7" />
    `
  },

  // ── 1.7 Wall Mount & Micro-DC Enclosures ──
  {
    id: 'rack-wallmount',
    code: 'WM-GLASS',
    name: 'Wall-Mount Glass Enclosure (12U - 500mm D)',
    category: 'racks',
    subCategory: 'enclosure',
    badgeType: 'rack',
    presetId: 'legrand-wallmount-12u',
    widthMm: 600,
    depthMm: 500,
    heightU: 12,
    description: 'Compact 12U wall-mount communications and edge computing enclosure with glass viewing door.',
    viewBox: '0 0 76 130',
    svgInner: `
      <!-- Wall Brackets -->
      <rect x="2" y="36" width="6" height="8" rx="1" fill="#475569" />
      <rect x="2" y="96" width="6" height="8" rx="1" fill="#475569" />
      <polygon points="8,40 16,35 58,35 50,40" fill="url(#dc-3d-top)" stroke="#94A3B8" stroke-width="0.8" />
      <polygon points="50,40 58,35 58,102 50,105" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="8" y="40" width="42" height="65" rx="2" fill="url(#dc-chassis-dark)" stroke="#94A3B8" stroke-width="1" />
      <!-- Glass Window -->
      <rect x="12" y="45" width="34" height="55" rx="1.5" fill="url(#dc-glass-gradient)" stroke="#38BDF8" stroke-width="0.8" />
      <polygon points="14,45 24,45 16,100 14,100" fill="#FFFFFF" opacity="0.25" />
      <circle cx="43" cy="72" r="1.5" fill="#E2E8F0" />
    `
  },
  {
    id: 'rack-wallmount-swing',
    code: 'WM-SWING',
    name: 'Double-Hinge Swing-Out Wall Cabinet (18U - 600mm D)',
    category: 'racks',
    subCategory: 'enclosure',
    badgeType: 'rack',
    presetId: 'tripp-18u-wallmount',
    widthMm: 600,
    depthMm: 600,
    heightU: 18,
    description: 'Double-hinged swing-out wall cabinet allowing fast rear equipment servicing and cable management.',
    viewBox: '0 0 76 130',
    svgInner: `
      <!-- Rear Swing Pivot Frame -->
      <rect x="4" y="32" width="8" height="76" rx="1" fill="#1E293B" stroke="#64748B" stroke-width="0.8" />
      <circle cx="8" cy="40" r="2" fill="#F59E0B" /><circle cx="8" cy="100" r="2" fill="#F59E0B" />
      <polygon points="12,32 20,27 60,27 52,32" fill="url(#dc-3d-top)" stroke="#38BDF8" stroke-width="0.8" />
      <polygon points="52,32 60,27 60,105 52,108" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="12" y="32" width="40" height="76" rx="2" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="1" />
      <rect x="15" y="36" width="34" height="68" fill="url(#dc-rack-perf)" opacity="0.88" />
      <circle cx="48" cy="70" r="1.8" fill="#E2E8F0" />
    `
  },
  {
    id: 'rack-micro-datacenter',
    code: 'MICRO-DC',
    name: 'Edge Micro Data Center Pod (All-in-One - 1200mm D)',
    category: 'racks',
    subCategory: 'enclosure',
    badgeType: 'rack',
    presetId: 'vertiv-smartcabinet-micro',
    widthMm: 800,
    depthMm: 1200,
    heightU: 42,
    description: 'Self-contained all-in-one micro data center enclosure with integrated DX cooling, UPS, and front status LCD.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="4,8 14,3 64,3 54,8" fill="url(#dc-3d-top)" stroke="#06B6D4" stroke-width="0.8" />
      <polygon points="54,8 64,3 64,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="4" y="8" width="50" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#06B6D4" stroke-width="1.2" />
      <rect x="2" y="122" width="54" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <!-- Left Rack Bay with Smart LCD Front Door -->
      <rect x="7" y="14" width="32" height="104" rx="1" fill="#080C14" stroke="#00E5FF" stroke-width="0.6" />
      <rect x="10" y="18" width="26" height="12" rx="1" fill="#000000" stroke="#06B6D4" stroke-width="0.6" />
      <text x="23" y="26" fill="#00E5FF" font-family="monospace" font-size="4.5" font-weight="700" text-anchor="middle">21.4°C</text>
      <text x="23" y="32" fill="#22C55E" font-family="monospace" font-size="3.5" font-weight="600" text-anchor="middle">4.2 kW</text>
      <rect x="10" y="34" width="26" height="80" fill="url(#dc-rack-perf)" opacity="0.85" />
      <!-- Right Integrated DX Cooling Bay -->
      <rect x="41" y="14" width="11" height="104" rx="1" fill="#0C4A6E" stroke="#06B6D4" stroke-width="0.8" />
      <circle cx="46.5" cy="30" r="3.5" fill="#082F49" stroke="#38BDF8" stroke-width="0.6" />
      <circle cx="46.5" cy="70" r="3.5" fill="#082F49" stroke="#38BDF8" stroke-width="0.6" />
      <polygon points="44.5,100 48.5,100 46.5,105" fill="#00E5FF" />
    `
  },

  // ── 1.8 Battery & Power Storage Racks ──
  {
    id: 'rack-battery-open',
    code: 'BATT-OPEN',
    name: 'Seismic Multi-Tier Open Battery Rack (42U - 800mm D)',
    category: 'racks',
    subCategory: 'battery',
    badgeType: 'power',
    presetId: 'eaton-batt-cabinet',
    widthMm: 800,
    depthMm: 800,
    heightU: 42,
    description: 'Multi-tier seismic-rated open steel battery rack with VRLA / Lithium modular battery strings.',
    viewBox: '0 0 76 130',
    svgInner: `
      <rect x="6" y="8" width="48" height="114" rx="2" fill="none" stroke="#64748B" stroke-width="1.2" />
      <!-- 4 Heavy Battery Shelves -->
      <rect x="10" y="18" width="40" height="18" rx="1" fill="#1E293B" stroke="#475569" stroke-width="0.8" />
      <circle cx="16" cy="24" r="1.5" fill="#EF4444" /><circle cx="26" cy="24" r="1.5" fill="#3B82F6" />
      <circle cx="34" cy="24" r="1.5" fill="#EF4444" /><circle cx="44" cy="24" r="1.5" fill="#3B82F6" />
      <rect x="10" y="44" width="40" height="18" rx="1" fill="#1E293B" stroke="#475569" stroke-width="0.8" />
      <circle cx="16" cy="50" r="1.5" fill="#EF4444" /><circle cx="26" cy="50" r="1.5" fill="#3B82F6" />
      <circle cx="34" cy="50" r="1.5" fill="#EF4444" /><circle cx="44" cy="50" r="1.5" fill="#3B82F6" />
      <rect x="10" y="70" width="40" height="18" rx="1" fill="#1E293B" stroke="#475569" stroke-width="0.8" />
      <circle cx="16" cy="76" r="1.5" fill="#EF4444" /><circle cx="26" cy="76" r="1.5" fill="#3B82F6" />
      <circle cx="34" cy="76" r="1.5" fill="#EF4444" /><circle cx="44" cy="76" r="1.5" fill="#3B82F6" />
      <rect x="10" y="96" width="40" height="18" rx="1" fill="#1E293B" stroke="#475569" stroke-width="0.8" />
      <circle cx="16" cy="102" r="1.5" fill="#EF4444" /><circle cx="26" cy="102" r="1.5" fill="#3B82F6" />
      <circle cx="34" cy="102" r="1.5" fill="#EF4444" /><circle cx="44" cy="102" r="1.5" fill="#3B82F6" />
      <rect x="4" y="122" width="52" height="4" fill="#334155" />
    `
  },
  {
    id: 'rack-battery-enclosed',
    code: 'BATT-ENC',
    name: 'Enclosed Li-Ion Battery Cabinet with BMS (42U - 800mm D)',
    category: 'racks',
    subCategory: 'battery',
    badgeType: 'power',
    presetId: 'eaton-batt-cabinet',
    widthMm: 800,
    depthMm: 800,
    heightU: 42,
    description: 'Heavy-gauge steel enclosed LiFePO4 battery cabinet with integrated BMS status LEDs.',
    viewBox: '0 0 76 130',
    svgInner: `
      <polygon points="6,8 14,3 62,3 54,8" fill="url(#dc-3d-top)" stroke="#EAB308" stroke-width="0.8" />
      <polygon points="54,8 62,3 62,119 54,122" fill="url(#dc-3d-side)" stroke="#1E293B" stroke-width="0.8" />
      <rect x="6" y="8" width="48" height="114" rx="2" fill="url(#dc-chassis-dark)" stroke="#EAB308" stroke-width="1" />
      <rect x="4" y="122" width="52" height="4" rx="1" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <rect x="10" y="14" width="40" height="104" rx="1" fill="#1E293B" stroke="#475569" stroke-width="0.8" />
      <!-- Battery Pack Drawers & BMS LEDs -->
      <line x1="10" y1="38" x2="50" y2="38" stroke="#475569" stroke-width="1" />
      <circle cx="16" cy="26" r="1.5" fill="#22C55E" /><circle cx="22" cy="26" r="1.5" fill="#22C55E" />
      <polygon points="40,24 45,24 42.5,29" fill="#EAB308" />
      <line x1="10" y1="64" x2="50" y2="64" stroke="#475569" stroke-width="1" />
      <circle cx="16" cy="52" r="1.5" fill="#22C55E" /><circle cx="22" cy="52" r="1.5" fill="#22C55E" />
      <line x1="10" y1="90" x2="50" y2="90" stroke="#475569" stroke-width="1" />
      <circle cx="16" cy="78" r="1.5" fill="#22C55E" /><circle cx="22" cy="78" r="1.5" fill="#22C55E" />
      <circle cx="16" cy="104" r="1.5" fill="#22C55E" /><circle cx="22" cy="104" r="1.5" fill="#22C55E" />
      <rect x="48" y="60" width="2" height="14" rx="0.5" fill="#E2E8F0" />
    `
  },

  // ── 2. CABLE DUCTS & PATHWAYS (UNDERFLOOR ESD & ROOF OVERHEAD) ───
  {
    id: 'duct-uf-cable',
    code: 'UF-DUCT',
    name: 'Underfloor Cable Duct',
    category: 'pathways',
    subCategory: 'underfloor',
    pathwayLevel: 'underfloor',
    badgeType: 'pathway',
    description: 'Underfloor enclosed cable ducting under ESD raised floor tiles.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="7" width="80" height="18" rx="2" fill="#1E293B" stroke="#475569" stroke-width="1" />
      <line x1="8" y1="16" x2="88" y2="16" stroke="#64748B" stroke-width="1" stroke-dasharray="3 2" />
      <line x1="28" y1="7" x2="28" y2="25" stroke="#334155" stroke-width="1" />
      <line x1="48" y1="7" x2="48" y2="25" stroke="#334155" stroke-width="1" />
      <line x1="68" y1="7" x2="68" y2="25" stroke="#334155" stroke-width="1" />
    `
  },
  {
    id: 'duct-uf-mesh',
    code: 'UF-MESH',
    name: 'Underfloor Wire Mesh Basket Tray',
    category: 'pathways',
    subCategory: 'underfloor',
    pathwayLevel: 'underfloor',
    badgeType: 'pathway',
    description: 'Heavy-gauge zinc-plated wire mesh basket tray for sub-floor cabling.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="7" width="80" height="18" fill="url(#dc-wire-mesh)" stroke="#64748B" stroke-width="1" />
      <line x1="8" y1="7" x2="88" y2="7" stroke="#94A3B8" stroke-width="2" />
      <line x1="8" y1="25" x2="88" y2="25" stroke="#94A3B8" stroke-width="2" />
    `
  },
  {
    id: 'duct-uf-solid',
    code: 'UF-SLD',
    name: 'Underfloor Solid Bottom Tray',
    category: 'pathways',
    subCategory: 'underfloor',
    pathwayLevel: 'underfloor',
    badgeType: 'pathway',
    description: 'Solid bottom steel cable tray with EMI/RFI shielding underfloor.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="7" width="80" height="18" rx="1.5" fill="url(#dc-metal-finish)" stroke="#334155" stroke-width="1" />
      <line x1="8" y1="10" x2="88" y2="10" stroke="#FFFFFF" stroke-width="1" opacity="0.6" />
      <line x1="8" y1="22" x2="88" y2="22" stroke="#475569" stroke-width="1" />
    `
  },
  {
    id: 'duct-uf-trench',
    code: 'UF-TRCH',
    name: 'Underfloor Floor Trench System',
    category: 'pathways',
    subCategory: 'underfloor',
    pathwayLevel: 'underfloor',
    badgeType: 'pathway',
    description: 'Heavy-duty concrete floor trench with removable checker-plate steel covers.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="5" width="80" height="22" rx="1" fill="#0A0B0C" stroke="#475569" stroke-width="1.2" />
      <line x1="8" y1="8" x2="88" y2="8" stroke="#E2E8F0" stroke-width="0.8" stroke-dasharray="2 3" />
      <line x1="8" y1="24" x2="88" y2="24" stroke="#E2E8F0" stroke-width="0.8" stroke-dasharray="2 3" />
      <line x1="20" y1="5" x2="20" y2="27" stroke="#334155" stroke-width="1" />
      <line x1="40" y1="5" x2="40" y2="27" stroke="#334155" stroke-width="1" />
      <line x1="60" y1="5" x2="60" y2="27" stroke="#334155" stroke-width="1" />
      <line x1="80" y1="5" x2="80" y2="27" stroke="#334155" stroke-width="1" />
    `
  },
  {
    id: 'duct-oh-ladder',
    code: 'OH-LADR',
    name: 'Overhead Ladder Rack',
    category: 'pathways',
    subCategory: 'overhead',
    pathwayLevel: 'overhead',
    badgeType: 'pathway',
    description: 'Structural overhead ladder rack runway suspended from ceiling unistrut.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="9" width="80" height="14" rx="1" fill="#0F172A" stroke="#475569" stroke-width="1" />
      <line x1="8" y1="10" x2="88" y2="10" stroke="#000000" stroke-width="2" />
      <line x1="8" y1="22" x2="88" y2="22" stroke="#000000" stroke-width="2" />
      <line x1="20" y1="10" x2="20" y2="22" stroke="#64748B" stroke-width="2" />
      <line x1="36" y1="10" x2="36" y2="22" stroke="#64748B" stroke-width="2" />
      <line x1="52" y1="10" x2="52" y2="22" stroke="#64748B" stroke-width="2" />
      <line x1="68" y1="10" x2="68" y2="22" stroke="#64748B" stroke-width="2" />
      <line x1="84" y1="10" x2="84" y2="22" stroke="#64748B" stroke-width="2" />
    `
  },
  {
    id: 'duct-oh-mesh',
    code: 'OH-MESH',
    name: 'Overhead Wire Mesh Tray',
    category: 'pathways',
    subCategory: 'overhead',
    pathwayLevel: 'overhead',
    badgeType: 'pathway',
    description: 'Suspended overhead wire mesh tray with quick-connect splice bars.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="7" width="80" height="18" fill="url(#dc-wire-mesh)" stroke="#38BDF8" stroke-width="1" />
      <line x1="8" y1="7" x2="88" y2="7" stroke="#0284C7" stroke-width="2" />
      <line x1="8" y1="25" x2="88" y2="25" stroke="#0284C7" stroke-width="2" />
    `
  },
  {
    id: 'duct-oh-duct',
    code: 'OH-DUCT',
    name: 'Overhead Cable Duct',
    category: 'pathways',
    subCategory: 'overhead',
    pathwayLevel: 'overhead',
    badgeType: 'pathway',
    description: 'Overhead aluminum trunking duct with partition dividers for power & data.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="7" width="80" height="18" rx="2" fill="url(#dc-metal-finish)" stroke="#475569" stroke-width="0.8" />
      <rect x="12" y="10" width="72" height="12" fill="#1E293B" />
      <line x1="12" y1="16" x2="84" y2="16" stroke="#94A3B8" stroke-width="1" stroke-dasharray="4 2" />
    `
  },
  {
    id: 'duct-oh-fiber',
    code: 'FBR-WAY',
    name: 'Overhead Fiber Raceway (Yellow Duct)',
    category: 'pathways',
    subCategory: 'overhead',
    pathwayLevel: 'overhead',
    badgeType: 'fiber',
    description: 'Dedicated yellow PVC fiber raceway routing system with bend radius control.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="8" width="80" height="16" rx="2" fill="url(#dc-fiber-yellow)" stroke="#A16207" stroke-width="1" />
      <line x1="8" y1="12" x2="88" y2="12" stroke="#FEF08A" stroke-width="1" />
      <line x1="8" y1="20" x2="88" y2="20" stroke="#713F12" stroke-width="1" />
      <rect x="44" y="6" width="8" height="20" rx="1" fill="#CA8A04" stroke="#713F12" stroke-width="0.5" />
    `
  },

  // ── 3. POWER DISTRIBUTION ─────────────────────────────────────────
  {
    id: 'pwr-switchgear-primary',
    code: 'SWGR-PRI',
    name: 'Primary Utility Switchgear (MV/LV)',
    category: 'power',
    subCategory: 'grid_switchgear',
    badgeType: 'power',
    presetId: 'schneider-mv-switchgear',
    widthMm: 1200,
    depthMm: 1200,
    heightU: 52,
    description: 'Main incoming medium/low voltage switchgear line-up with vacuum circuit breakers.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="3" width="36" height="26" rx="2" fill="url(#dc-metal-finish)" stroke="#334155" stroke-width="1" />
      <rect x="16" y="6" width="28" height="10" fill="#0F172A" />
      <line x1="18" y1="11" x2="42" y2="11" stroke="#EF4444" stroke-width="1.5" />
      <rect x="20" y="19" width="8" height="7" rx="1" fill="#334155" />
      <rect x="32" y="19" width="8" height="7" rx="1" fill="#334155" />
      <circle cx="24" cy="22" r="1" fill="#22C55E" /><circle cx="36" cy="22" r="1" fill="#EF4444" />
    `
  },
  {
    id: 'pwr-ats-main',
    code: 'ATS-MAIN',
    name: 'Automatic Transfer Switch (ATS)',
    category: 'power',
    subCategory: 'grid_switchgear',
    badgeType: 'power',
    presetId: 'schneider-ats-cabinet',
    widthMm: 800,
    depthMm: 800,
    heightU: 42,
    description: 'Main automatic transfer switch for seamless utility-to-generator transfer.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="3" width="32" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#EAB308" stroke-width="1" />
      <circle cx="23" cy="11" r="3.5" fill="#1E293B" stroke="#64748B" stroke-width="0.8" />
      <circle cx="37" cy="11" r="3.5" fill="#1E293B" stroke="#64748B" stroke-width="0.8" />
      <circle cx="30" cy="21" r="3.5" fill="#0284C7" stroke="#38BDF8" stroke-width="0.8" />
      <path d="M 23 11 L 30 21 M 37 11 L 30 21" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="1.5 1.5" />
    `
  },
  {
    id: 'pwr-ups-mod',
    code: 'UPS-MOD',
    name: 'Central Modular UPS System',
    category: 'power',
    subCategory: 'ups_backup',
    badgeType: 'power',
    presetId: 'ups-inrow-50kva',
    widthMm: 600,
    depthMm: 1100,
    heightU: 42,
    description: 'Scalable N+1 modular double-conversion online UPS system (50kVA - 500kVA).',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="3" width="36" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="1" />
      <rect x="16" y="6" width="28" height="8" rx="1" fill="#0F172A" />
      <path d="M 20 10 Q 23 7, 26 10 T 32 10" fill="none" stroke="#22C55E" stroke-width="1.2" />
      <circle cx="38" cy="10" r="1.5" fill="#22C55E" />
      <line x1="16" y1="17" x2="44" y2="17" stroke="#475569" stroke-width="1" />
      <line x1="16" y1="21" x2="44" y2="21" stroke="#475569" stroke-width="1" />
      <line x1="16" y1="25" x2="44" y2="25" stroke="#475569" stroke-width="1" />
    `
  },
  {
    id: 'pwr-batt-cab',
    code: 'BATT-CAB',
    name: 'Battery Cabinet / Bank',
    category: 'power',
    subCategory: 'ups_backup',
    badgeType: 'power',
    presetId: 'eaton-batt-cabinet',
    widthMm: 800,
    depthMm: 800,
    heightU: 42,
    description: 'Enclosed LiFePO4 or VRLA high-rate battery backup cabinet with BMS telemetry.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="3" width="32" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#64748B" stroke-width="1" />
      <rect x="18" y="6" width="24" height="20" rx="1" fill="#1E293B" />
      <line x1="18" y1="12" x2="42" y2="12" stroke="#475569" stroke-width="0.8" />
      <line x1="18" y1="18" x2="42" y2="18" stroke="#475569" stroke-width="0.8" />
      <polygon points="28,7 32,7 30,11" fill="#EAB308" />
      <polygon points="28,13 32,13 30,17" fill="#EAB308" />
      <polygon points="28,19 32,19 30,23" fill="#EAB308" />
    `
  },
  {
    id: 'pwr-pdu-floor',
    code: 'PDU-FLR',
    name: 'Power Distribution Unit (Floor PDU)',
    category: 'power',
    subCategory: 'distribution_pdu',
    badgeType: 'power',
    presetId: 'legrand-pdu-floor-150kva',
    widthMm: 800,
    depthMm: 1000,
    heightU: 42,
    description: 'Isolation transformer PDU with branch circuit monitoring and TVSS surge suppression.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="3" width="32" height="26" rx="2" fill="url(#dc-metal-finish)" stroke="#334155" stroke-width="1" />
      <rect x="18" y="6" width="24" height="12" rx="1" fill="#0F172A" />
      <circle cx="24" cy="12" r="2.5" fill="#EF4444" />
      <circle cx="30" cy="12" r="2.5" fill="#EAB308" />
      <circle cx="36" cy="12" r="2.5" fill="#3B82F6" />
      <rect x="18" y="20" width="24" height="6" fill="#1E293B" stroke="#475569" stroke-width="0.5" />
    `
  },
  {
    id: 'pwr-rpp-panel',
    code: 'RPP-PNL',
    name: 'Remote Power Panel (RPP)',
    category: 'power',
    subCategory: 'distribution_pdu',
    badgeType: 'power',
    presetId: 'pwr-rpp-100kva',
    widthMm: 600,
    depthMm: 800,
    heightU: 42,
    description: 'High-density sub-distribution circuit breaker panel (up to 168 poles).',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="15" y="4" width="30" height="24" rx="2" fill="url(#dc-metal-finish)" stroke="#334155" stroke-width="1" />
      <rect x="20" y="7" width="20" height="18" fill="#1E293B" />
      <line x1="25" y1="9" x2="25" y2="23" stroke="#F59E0B" stroke-width="1.2" />
      <line x1="30" y1="9" x2="30" y2="23" stroke="#F59E0B" stroke-width="1.2" />
      <line x1="35" y1="9" x2="35" y2="23" stroke="#F59E0B" stroke-width="1.2" />
    `
  },
  {
    id: 'pwr-bus-tap',
    code: 'BUS-TAP',
    name: 'Overhead Track Busway & Tapbox',
    category: 'power',
    subCategory: 'busway_rackpdu',
    badgeType: 'power',
    description: 'Continuous overhead power busway track with plug-in tap-off drop boxes.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="6" width="80" height="8" rx="1.5" fill="url(#dc-metal-finish)" stroke="#475569" stroke-width="0.8" />
      <line x1="8" y1="10" x2="88" y2="10" stroke="#F59E0B" stroke-width="1.2" />
      <rect x="40" y="14" width="16" height="14" rx="1.5" fill="#334155" stroke="#000000" stroke-width="0.8" />
      <circle cx="48" cy="21" r="2.5" fill="#EF4444" />
      <line x1="48" y1="12" x2="48" y2="14" stroke="#475569" stroke-width="2" />
    `
  },
  {
    id: 'pwr-epdu-0u',
    code: 'ePDU-0U',
    name: 'Rack Intelligent ePDU (0U Vertical)',
    category: 'power',
    subCategory: 'busway_rackpdu',
    badgeType: 'power',
    description: 'Switched & metered per-outlet 0U vertical rack power distribution unit.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="11" width="76" height="10" rx="2" fill="url(#dc-chassis-dark)" stroke="#475569" stroke-width="0.8" />
      <rect x="14" y="13" width="10" height="6" rx="0.5" fill="#000000" />
      <text x="19" y="18" fill="#38BDF8" font-family="monospace" font-size="5" text-anchor="middle">16A</text>
      <circle cx="34" cy="16" r="1.5" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <circle cx="44" cy="16" r="1.5" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <circle cx="54" cy="16" r="1.5" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <circle cx="64" cy="16" r="1.5" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <circle cx="74" cy="16" r="1.5" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
    `
  },
  {
    id: 'pwr-rack-ats',
    code: 'RACK-ATS',
    name: 'Rack Automatic Transfer Switch (1U)',
    category: 'power',
    subCategory: 'busway_rackpdu',
    badgeType: 'power',
    description: '1U dual-feed transfer switch providing redundant power to single-corded devices.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="10" width="76" height="12" rx="1.5" fill="url(#dc-chassis-dark)" stroke="#F59E0B" stroke-width="0.8" />
      <rect x="14" y="13" width="6" height="6" rx="0.5" fill="#22C55E" />
      <rect x="22" y="13" width="6" height="6" rx="0.5" fill="#334155" />
      <text x="32" y="18" fill="#E2E8F0" font-family="sans-serif" font-size="5" font-weight="700">SRC-A</text>
      <circle cx="56" cy="16" r="1.2" fill="#38BDF8" /><circle cx="62" cy="16" r="1.2" fill="#38BDF8" /><circle cx="68" cy="16" r="1.2" fill="#38BDF8" /><circle cx="74" cy="16" r="1.2" fill="#38BDF8" />
    `
  },

  // ── 4. COOLING & THERMAL MANAGEMENT ──────────────────────────────
  {
    id: 'cool-crac-dx',
    code: 'CRAC-DX',
    name: 'CRAC Unit (Direct Expansion DX)',
    category: 'cooling',
    subCategory: 'perimeter_air',
    badgeType: 'cooling',
    presetId: 'vertiv-liebert-crac-dx-50kw',
    widthMm: 1200,
    depthMm: 1000,
    heightU: 45,
    description: 'Perimeter direct expansion computer room air conditioner with EC fans.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="3" width="36" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#06B6D4" stroke-width="1.2" />
      <circle cx="30" cy="13" r="7" fill="#083344" stroke="#06B6D4" stroke-width="0.8" />
      <path d="M 30 6 L 30 20 M 23 13 L 37 13" stroke="#22D3EE" stroke-width="1" />
      <polygon points="27,24 33,24 30,27" fill="#06B6D4" />
    `
  },
  {
    id: 'cool-crah-cw',
    code: 'CRAH-CW',
    name: 'CRAH Unit (Chilled Water CW)',
    category: 'cooling',
    subCategory: 'perimeter_air',
    badgeType: 'cooling',
    presetId: 'schneider-crah-cw-100kw',
    widthMm: 1500,
    depthMm: 1000,
    heightU: 48,
    description: 'High-capacity chilled water air handler with modulating 2-way control valves.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="3" width="36" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#3B82F6" stroke-width="1.2" />
      <rect x="16" y="6" width="28" height="12" fill="#1E3A8A" opacity="0.6" />
      <path d="M 17 9 Q 20 6, 23 9 T 29 9 T 35 9 T 41 9" fill="none" stroke="#60A5FA" stroke-width="1" />
      <path d="M 17 14 Q 20 11, 23 14 T 29 14 T 35 14 T 41 14" fill="none" stroke="#60A5FA" stroke-width="1" />
      <polygon points="28,21 32,21 30,25" fill="#3B82F6" />
    `
  },
  {
    id: 'cool-irc-row',
    code: 'IRC-ROW',
    name: 'In-Row Cooling Unit (300/600mm)',
    category: 'cooling',
    subCategory: 'inrow_heatex',
    badgeType: 'cooling',
    presetId: 'cooling-inrow-dx-300',
    widthMm: 300,
    depthMm: 1200,
    heightU: 42,
    description: 'Precision in-row cooling unit placed directly between high-density server racks.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="18" y="3" width="24" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#06B6D4" stroke-width="1" />
      <rect x="21" y="6" width="18" height="20" fill="url(#dc-rack-perf)" />
      <polygon points="12,16 16,12 16,20" fill="#06B6D4" />
      <polygon points="48,16 44,12 44,20" fill="#06B6D4" />
    `
  },
  {
    id: 'cool-rdhx-cw',
    code: 'RDHx-CW',
    name: 'Rear Door Heat Exchanger (RDHx)',
    category: 'cooling',
    subCategory: 'inrow_heatex',
    badgeType: 'cooling',
    presetId: 'motovario-rdhx-liquid',
    widthMm: 600,
    depthMm: 250,
    heightU: 42,
    description: 'Passive or active liquid-cooled rear door replacing cabinet rear perforated door.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="16" y="4" width="26" height="24" rx="2" fill="#0F172A" stroke="#475569" stroke-width="1" />
      <rect x="42" y="4" width="6" height="24" rx="1" fill="#0284C7" stroke="#38BDF8" stroke-width="0.8" />
      <line x1="42" y1="8" x2="48" y2="8" stroke="#FFFFFF" stroke-width="0.8" />
      <line x1="42" y1="12" x2="48" y2="12" stroke="#FFFFFF" stroke-width="0.8" />
      <line x1="42" y1="16" x2="48" y2="16" stroke="#FFFFFF" stroke-width="0.8" />
      <line x1="42" y1="20" x2="48" y2="20" stroke="#FFFFFF" stroke-width="0.8" />
    `
  },
  {
    id: 'cool-cdu-liq',
    code: 'CDU-LIQ',
    name: 'Coolant Distribution Unit (CDU Liquid)',
    category: 'cooling',
    subCategory: 'liquid_direct',
    badgeType: 'cooling',
    presetId: 'cdu-liquid-distribution',
    widthMm: 800,
    depthMm: 1200,
    heightU: 42,
    description: 'Direct-to-chip secondary loop liquid coolant distribution pumping unit.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="3" width="32" height="26" rx="2" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="1" />
      <circle cx="24" cy="12" r="4" fill="#082F49" stroke="#38BDF8" stroke-width="0.8" />
      <circle cx="36" cy="12" r="4" fill="#082F49" stroke="#38BDF8" stroke-width="0.8" />
      <path d="M 18 22 C 24 18, 30 26, 42 22" fill="none" stroke="#06B6D4" stroke-width="1.8" />
    `
  },
  {
    id: 'cool-imm-tank',
    code: 'IMM-TANK',
    name: 'Immersion Cooling Tank (Dielectric)',
    category: 'cooling',
    subCategory: 'liquid_direct',
    badgeType: 'cooling',
    presetId: 'submer-smartpod-immersion',
    widthMm: 1200,
    depthMm: 2400,
    heightU: 48,
    description: 'Single-phase or two-phase dielectric liquid immersion cooling pod (up to 100kW+).',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="5" width="36" height="22" rx="2" fill="#083344" stroke="#06B6D4" stroke-width="1.2" />
      <rect x="16" y="8" width="5" height="14" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <rect x="24" y="8" width="5" height="14" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <rect x="32" y="8" width="5" height="14" fill="#334155" stroke="#94A3B8" stroke-width="0.4" />
      <line x1="12" y1="12" x2="48" y2="12" stroke="#67E8F9" stroke-width="0.8" opacity="0.6" stroke-dasharray="2 1" />
    `
  },
  {
    id: 'cool-hac-duct',
    code: 'HAC-DUCT',
    name: 'Hot Aisle Containment (HAC)',
    category: 'cooling',
    subCategory: 'containment_flow',
    badgeType: 'cooling',
    description: 'Hot aisle containment ceiling panels and end-of-row sliding partition doors.',
    viewBox: '0 0 60 32',
    svgInner: `
      <polygon points="12,25 24,5 36,5 48,25" fill="#7F1D1D" stroke="#EF4444" stroke-width="1" />
      <line x1="24" y1="5" x2="24" y2="25" stroke="#F87171" stroke-width="0.8" stroke-dasharray="2 2" />
      <line x1="36" y1="5" x2="36" y2="25" stroke="#F87171" stroke-width="0.8" stroke-dasharray="2 2" />
      <polygon points="26,14 34,14 30,9" fill="#EF4444" />
    `
  },
  {
    id: 'cool-cac-roof',
    code: 'CAC-ROOF',
    name: 'Cold Aisle Containment (CAC Roof)',
    category: 'cooling',
    subCategory: 'containment_flow',
    badgeType: 'cooling',
    description: 'Cold aisle roof plenum containment system with fusible drop-away ceiling panels.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="6" width="36" height="20" rx="1" fill="#0C4A6E" stroke="#38BDF8" stroke-width="1" />
      <line x1="12" y1="6" x2="48" y2="6" stroke="#FFFFFF" stroke-width="2" />
      <polygon points="26,13 34,13 30,18" fill="#38BDF8" />
    `
  },
  {
    id: 'cool-blk-pnl',
    code: 'BLK-PNL',
    name: 'Blanking Panels & Airflow Baffles',
    category: 'cooling',
    subCategory: 'containment_flow',
    badgeType: 'cooling',
    description: 'Snap-in toolless 1U/2U blanking panels preventing hot air recirculation.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="10" width="76" height="12" rx="1" fill="#020617" stroke="#475569" stroke-width="0.8" />
      <line x1="14" y1="16" x2="82" y2="16" stroke="#1E293B" stroke-width="2" />
      <circle cx="13" cy="16" r="1.2" fill="#94A3B8" /><circle cx="83" cy="16" r="1.2" fill="#94A3B8" />
    `
  },

  // ── 5. MONITORING & DCIM (SENSORS) ────────────────────────────────
  {
    id: 'env-temp',
    code: 'ENV-TEMP',
    name: 'Temperature Sensor Probe',
    category: 'monitoring',
    subCategory: 'env_probes',
    badgeType: 'sensor',
    description: 'Calibrated 1-Wire / Modbus rack intake and exhaust temperature probe.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="25" y="4" width="6" height="18" rx="3" fill="#334155" stroke="#CBD5E1" stroke-width="0.6" />
      <circle cx="28" cy="22" r="5" fill="#EF4444" stroke="#CBD5E1" stroke-width="0.6" />
      <line x1="28" y1="9" x2="28" y2="20" stroke="#EF4444" stroke-width="1.8" />
    `
  },
  {
    id: 'env-hum',
    code: 'ENV-HUM',
    name: 'Relative Humidity Sensor',
    category: 'monitoring',
    subCategory: 'env_probes',
    badgeType: 'sensor',
    description: 'Relative humidity (RH%) environmental sensor for aisle dew-point tracking.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="18" y="6" width="20" height="20" rx="2" fill="#0F172A" stroke="#0284C7" stroke-width="1" />
      <path d="M 28 10 C 28 10, 23 16, 23 19 C 23 21.5, 25.2 23, 28 23 C 30.8 23, 33 21.5, 33 19 C 33 16, 28 10, 28 10 Z" fill="#0284C7" />
    `
  },
  {
    id: 'env-leak',
    code: 'ENV-LEAK',
    name: 'Water Leak Rope / Spot Sensor',
    category: 'monitoring',
    subCategory: 'env_probes',
    badgeType: 'sensor',
    description: 'Conductive polymer water leak detection sensing rope along CRAC / floor perimeter.',
    viewBox: '0 0 96 32',
    svgInner: `
      <path d="M 8 16 Q 28 6, 48 16 T 88 16" fill="none" stroke="#F59E0B" stroke-width="3" stroke-linecap="round" />
      <path d="M 8 16 Q 28 6, 48 16 T 88 16" fill="none" stroke="#000000" stroke-width="1.2" stroke-dasharray="2 2" />
      <circle cx="48" cy="16" r="3" fill="#38BDF8" />
    `
  },
  {
    id: 'env-dp',
    code: 'ENV-DP',
    name: 'Differential Air Pressure Sensor',
    category: 'monitoring',
    subCategory: 'telemetry_meters',
    badgeType: 'sensor',
    description: 'Underfloor plenum to room differential static air pressure sensor.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="6" width="28" height="20" rx="2" fill="#0F172A" stroke="#475569" stroke-width="1" />
      <line x1="8" y1="12" x2="14" y2="12" stroke="#94A3B8" stroke-width="2" />
      <line x1="8" y1="20" x2="14" y2="20" stroke="#94A3B8" stroke-width="2" />
      <text x="28" y="19" fill="#38BDF8" font-family="sans-serif" font-size="7" font-weight="700" text-anchor="middle">ΔP</text>
    `
  },
  {
    id: 'pwr-mtr',
    code: 'PWR-MTR',
    name: 'Inline Power & Energy Meter',
    category: 'monitoring',
    subCategory: 'telemetry_meters',
    badgeType: 'sensor',
    description: 'High-precision Class 0.5S digital multi-function power & harmonic meter.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="18" y="5" width="20" height="22" rx="2" fill="url(#dc-chassis-dark)" stroke="#A855F7" stroke-width="1" />
      <rect x="21" y="8" width="14" height="8" rx="0.5" fill="#000000" />
      <text x="28" y="14" fill="#4ADE80" font-family="monospace" font-size="5" text-anchor="middle">kW·h</text>
      <circle cx="23" cy="21" r="1" fill="#A855F7" />
      <circle cx="28" cy="21" r="1" fill="#A855F7" />
      <circle cx="33" cy="21" r="1" fill="#A855F7" />
    `
  },
  {
    id: 'env-air',
    code: 'ENV-AIR',
    name: 'Airflow Velocity Sensor',
    category: 'monitoring',
    subCategory: 'telemetry_meters',
    badgeType: 'sensor',
    description: 'Thermal anemometer airflow speed sensor measuring tile CFM delivery.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="8" width="24" height="16" rx="2" fill="#0F172A" stroke="#06B6D4" stroke-width="1" />
      <circle cx="26" cy="16" r="5" fill="none" stroke="#22D3EE" stroke-width="0.8" />
      <path d="M 26 11 L 26 21 M 21 16 L 31 16" stroke="#22D3EE" stroke-width="0.8" />
      <line x1="38" y1="16" x2="48" y2="16" stroke="#38BDF8" stroke-width="2" />
      <polygon points="46,13 52,16 46,19" fill="#38BDF8" />
    `
  },

  // ── 6. STRUCTURED CABLING & PATCHING ──────────────────────────────
  {
    id: 'patch-fbr-enc',
    code: 'FBR-ENC',
    name: 'Fiber Optic Enclosure (LC / SC)',
    category: 'patching',
    subCategory: 'fiber_cassettes',
    badgeType: 'fiber',
    description: '1U/2U sliding rack-mount optical distribution patch panel with LC duplex adapters.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="9" width="76" height="14" rx="1.5" fill="url(#dc-chassis-dark)" stroke="#38BDF8" stroke-width="0.8" />
      <rect x="16" y="12" width="6" height="8" rx="0.5" fill="#0284C7" /><rect x="24" y="12" width="6" height="8" rx="0.5" fill="#0284C7" />
      <rect x="32" y="12" width="6" height="8" rx="0.5" fill="#0284C7" /><rect x="40" y="12" width="6" height="8" rx="0.5" fill="#0284C7" />
      <rect x="52" y="12" width="6" height="8" rx="0.5" fill="#0284C7" /><rect x="60" y="12" width="6" height="8" rx="0.5" fill="#0284C7" />
    `
  },
  {
    id: 'patch-mpo-panel',
    code: 'MPO-PANEL',
    name: 'HD MPO/MTP Cassette Panel (1U)',
    category: 'patching',
    subCategory: 'fiber_cassettes',
    badgeType: 'fiber',
    description: 'Ultra high-density plug-and-play MTP/MPO breakout cassette panel for 400G spine-leaf.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="9" width="76" height="14" rx="1.5" fill="url(#dc-chassis-dark)" stroke="#475569" stroke-width="0.8" />
      <rect x="16" y="11" width="16" height="10" rx="1" fill="#082F49" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="40" y="11" width="16" height="10" rx="1" fill="#082F49" stroke="#38BDF8" stroke-width="0.5" />
      <rect x="64" y="11" width="16" height="10" rx="1" fill="#082F49" stroke="#38BDF8" stroke-width="0.5" />
      <circle cx="24" cy="16" r="1.5" fill="#F43F5E" /><circle cx="48" cy="16" r="1.5" fill="#F43F5E" /><circle cx="72" cy="16" r="1.5" fill="#F43F5E" />
    `
  },
  {
    id: 'patch-hcm-1u',
    code: 'HCM-1U',
    name: 'Horizontal Cable Manager (1U/2U)',
    category: 'patching',
    subCategory: 'cable_organizers',
    badgeType: 'pathway',
    description: 'Horizontal cable manager with pass-through rings and front snap-on cover.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="9" width="76" height="14" rx="1.5" fill="#0F172A" stroke="#475569" stroke-width="1" />
      <rect x="14" y="6" width="3" height="7" fill="#64748B" /><rect x="22" y="6" width="3" height="7" fill="#64748B" />
      <rect x="30" y="6" width="3" height="7" fill="#64748B" /><rect x="38" y="6" width="3" height="7" fill="#64748B" />
      <rect x="46" y="6" width="3" height="7" fill="#64748B" /><rect x="54" y="6" width="3" height="7" fill="#64748B" />
      <rect x="62" y="6" width="3" height="7" fill="#64748B" /><rect x="70" y="6" width="3" height="7" fill="#64748B" />
      <circle cx="48" cy="16" r="3" fill="#1E293B" stroke="#475569" stroke-width="0.8" />
    `
  },
  {
    id: 'patch-vco-duct',
    code: 'VCO-DUCT',
    name: 'Vertical Cable Organizer (Finger Duct)',
    category: 'patching',
    subCategory: 'cable_organizers',
    badgeType: 'pathway',
    description: 'High-capacity vertical cable manager with slotted fingers and dual-hinging door.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="22" y="3" width="16" height="26" rx="1.5" fill="#0F172A" stroke="#475569" stroke-width="1" />
      <line x1="16" y1="7" x2="22" y2="7" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="16" y1="12" x2="22" y2="12" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="16" y1="17" x2="22" y2="17" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="16" y1="22" x2="22" y2="22" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="38" y1="7" x2="44" y2="7" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="38" y1="12" x2="44" y2="12" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="38" y1="17" x2="44" y2="17" stroke="#94A3B8" stroke-width="1.5" />
      <line x1="38" y1="22" x2="44" y2="22" stroke="#94A3B8" stroke-width="1.5" />
    `
  },

  // ── 7. FIRE & LIFE SAFETY ─────────────────────────────────────────
  {
    id: 'fire-vesda',
    code: 'FA-VESDA',
    name: 'Aspirating Smoke Detector (VESDA)',
    category: 'security',
    subCategory: 'fire_safety',
    badgeType: 'fire',
    description: 'Very Early Warning Aspirating Smoke Detection (VESDA) system with multi-pipe sampling.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="14" y="4" width="32" height="24" rx="2" fill="url(#dc-metal-finish)" stroke="#DC2626" stroke-width="1" />
      <rect x="18" y="7" width="24" height="6" fill="#0F172A" />
      <line x1="20" y1="10" x2="38" y2="10" stroke="#22C55E" stroke-width="1.2" />
      <line x1="20" y1="28" x2="20" y2="30" stroke="#94A3B8" stroke-width="2" />
      <line x1="26" y1="28" x2="26" y2="30" stroke="#94A3B8" stroke-width="2" />
    `
  },
  {
    id: 'fire-smoke',
    code: 'FA-SMK',
    name: 'Optical / Ionization Smoke Detector',
    category: 'security',
    subCategory: 'fire_safety',
    badgeType: 'fire',
    description: 'Ceiling and sub-floor addressable photoelectric smoke detector.',
    viewBox: '0 0 60 32',
    svgInner: `
      <circle cx="28" cy="16" r="12" fill="url(#dc-metal-finish)" stroke="#CBD5E1" stroke-width="0.8" />
      <circle cx="28" cy="16" r="7" fill="#0F172A" stroke="#DC2626" stroke-width="0.8" />
      <circle cx="28" cy="16" r="2" fill="#EF4444" />
    `
  },
  {
    id: 'fire-cyl',
    code: 'FS-CYL',
    name: 'Clean Agent Cylinder (Novec/FM-200)',
    category: 'security',
    subCategory: 'fire_safety',
    badgeType: 'fire',
    description: 'High-pressure clean agent fire suppression storage cylinder with actuator valve.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="22" y="7" width="16" height="21" rx="6" fill="#DC2626" stroke="#991B1B" stroke-width="0.8" />
      <rect x="27" y="3" width="6" height="4" fill="url(#dc-metal-finish)" />
      <circle cx="30" cy="5" r="1" fill="#000000" />
      <line x1="33" y1="4" x2="38" y2="4" stroke="#94A3B8" stroke-width="1.5" />
    `
  },
  {
    id: 'fire-noz',
    code: 'FS-NOZ',
    name: 'Overhead Discharge Nozzle',
    category: 'security',
    subCategory: 'fire_safety',
    badgeType: 'fire',
    description: '360-degree engineered clean agent gas discharge nozzle.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="25" y="4" width="8" height="6" fill="#DC2626" />
      <polygon points="21,10 37,10 40,16 18,16" fill="url(#dc-metal-finish)" stroke="#DC2626" stroke-width="0.5" />
      <line x1="29" y1="16" x2="29" y2="22" stroke="#DC2626" stroke-width="1.5" />
      <polygon points="29,22 25,26 33,26" fill="#DC2626" />
    `
  },
  {
    id: 'fire-sprnk',
    code: 'FS-SPRNK',
    name: 'Pre-Action Dry Pipe Sprinkler',
    category: 'security',
    subCategory: 'fire_safety',
    badgeType: 'fire',
    description: 'Double-interlock pre-action dry sprinkler head preventing accidental water discharge.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="25" y="4" width="8" height="6" fill="url(#dc-metal-finish)" stroke="#475569" stroke-width="0.5" />
      <path d="M 23 10 L 29 20 L 35 10 Z" fill="none" stroke="#64748B" stroke-width="1.2" />
      <rect x="28" y="12" width="2" height="6" rx="1" fill="#EF4444" />
      <line x1="21" y1="20" x2="37" y2="20" stroke="#475569" stroke-width="2" />
    `
  },
  {
    id: 'fire-epo',
    code: 'EPO-BTN',
    name: 'Emergency Power Off (EPO)',
    category: 'security',
    subCategory: 'fire_safety',
    badgeType: 'fire',
    description: 'Guarded mushroom pushbutton for emergency power disconnection in fire alarms.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="18" y="5" width="22" height="22" rx="2" fill="#EAB308" stroke="#CA8A04" stroke-width="1" />
      <circle cx="29" cy="16" r="7" fill="#DC2626" stroke="#991B1B" stroke-width="0.8" />
    `
  },

  // ── 8. PHYSICAL SECURITY ──────────────────────────────────────────
  {
    id: 'sec-cam-fix',
    code: 'CAM-FIX',
    name: 'Fixed IP Bullet CCTV Camera',
    category: 'security',
    subCategory: 'cctv_surveillance',
    badgeType: 'security',
    description: 'High-definition fixed IP security camera monitoring aisle corridors.',
    viewBox: '0 0 60 32',
    svgInner: `
      <polygon points="12,12 32,7 32,25 12,20" fill="url(#dc-metal-finish)" stroke="#334155" stroke-width="0.8" />
      <rect x="32" y="10" width="10" height="12" fill="#1E293B" />
      <line x1="28" y1="24" x2="28" y2="28" stroke="#64748B" stroke-width="2" />
      <circle cx="13" cy="16" r="2" fill="#0284C7" />
    `
  },
  {
    id: 'sec-cam-ptz',
    code: 'CAM-PTZ',
    name: 'PTZ Dome Camera',
    category: 'security',
    subCategory: 'cctv_surveillance',
    badgeType: 'security',
    description: '360° pan-tilt-zoom dome camera for wide data hall surveillance.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="16" y="6" width="24" height="6" rx="1" fill="url(#dc-metal-finish)" stroke="#475569" stroke-width="0.5" />
      <path d="M 18 12 A 10 10 0 0 0 38 12 Z" fill="#0F172A" stroke="#334155" stroke-width="0.8" />
      <circle cx="28" cy="14" r="3.5" fill="#1E293B" stroke="#38BDF8" stroke-width="0.8" />
      <circle cx="29" cy="13.5" r="1" fill="#FFFFFF" />
    `
  },
  {
    id: 'sec-bio',
    code: 'SEC-BIO',
    name: 'Biometric Access Scanner (Iris/FP)',
    category: 'security',
    subCategory: 'access_control',
    badgeType: 'security',
    description: 'High-security biometric iris & fingerprint reader for data hall entry.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="18" y="4" width="20" height="24" rx="2" fill="#0F172A" stroke="#38BDF8" stroke-width="1" />
      <rect x="22" y="8" width="12" height="12" rx="1" fill="#082F49" />
      <circle cx="28" cy="14" r="3.5" fill="none" stroke="#22D3EE" stroke-width="0.8" stroke-dasharray="1.5 1.5" />
      <circle cx="28" cy="24" r="1.2" fill="#22C55E" />
    `
  },
  {
    id: 'sec-rfid',
    code: 'SEC-RFID',
    name: 'RFID Smart Card Reader',
    category: 'security',
    subCategory: 'access_control',
    badgeType: 'security',
    description: 'Proximity RFID/NFC contactless badge access reader with LED indicator.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="20" y="4" width="16" height="24" rx="2" fill="#0F172A" stroke="#475569" stroke-width="1" />
      <circle cx="28" cy="9" r="2" fill="#22C55E" />
      <path d="M 24 16 A 5 5 0 0 1 32 16 M 25 19 A 3 3 0 0 1 31 19" fill="none" stroke="#64748B" stroke-width="1" />
    `
  },
  {
    id: 'sec-rack-lock',
    code: 'SEC-RKLK',
    name: 'Electronic Rack Handle / Lock',
    category: 'security',
    subCategory: 'access_control',
    badgeType: 'security',
    description: 'Smart electronic swing-handle lock with card reader integration for cabinet-level security.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="23" y="3" width="10" height="26" rx="2" fill="#0F172A" stroke="#475569" stroke-width="0.8" />
      <rect x="25" y="6" width="6" height="12" rx="1" fill="#334155" />
      <circle cx="28" cy="22" r="1.5" fill="#38BDF8" />
    `
  },
  {
    id: 'sec-mantrap',
    code: 'SEC-MTRP',
    name: 'Security Mantrap / Interlock Door',
    category: 'security',
    subCategory: 'access_control',
    badgeType: 'security',
    description: 'Dual-door interlocked security portal with anti-tailgating weight verification.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="12" y="4" width="32" height="24" rx="2" fill="none" stroke="#22C55E" stroke-width="1.2" stroke-dasharray="3 1.5" />
      <line x1="12" y1="9" x2="20" y2="4" stroke="#22C55E" stroke-width="1.8" />
      <line x1="44" y1="23" x2="36" y2="28" stroke="#22C55E" stroke-width="1.8" />
      <circle cx="28" cy="16" r="2" fill="#38BDF8" />
    `
  },
  {
    id: 'sec-mag-lock',
    code: 'SEC-MAG',
    name: 'Magnetic Lock & Tamper Switch',
    category: 'security',
    subCategory: 'access_control',
    badgeType: 'security',
    description: 'Electromagnetic fail-secure door hold lock with tamper alarm contacts.',
    viewBox: '0 0 60 32',
    svgInner: `
      <rect x="18" y="7" width="8" height="18" rx="1" fill="url(#dc-metal-finish)" stroke="#475569" stroke-width="0.5" />
      <rect x="30" y="7" width="8" height="18" rx="1" fill="url(#dc-metal-finish)" stroke="#475569" stroke-width="0.5" />
      <line x1="26" y1="12" x2="30" y2="12" stroke="#EF4444" stroke-width="1" stroke-dasharray="1 1" />
      <line x1="26" y1="20" x2="30" y2="20" stroke="#EF4444" stroke-width="1" stroke-dasharray="1 1" />
    `
  },

  // ── 9. GROUNDING & EARTHING ───────────────────────────────────────
  {
    id: 'gnd-tmgb',
    code: 'GND-TMGB',
    name: 'Main Grounding Busbar (TMGB)',
    category: 'grounding',
    subCategory: 'busbars',
    badgeType: 'ground',
    description: 'Telecommunications Main Grounding Busbar (TMGB) solid copper busbar.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="8" y="10" width="80" height="12" rx="1" fill="url(#dc-copper-bus)" stroke="#7C2D12" stroke-width="0.8" />
      <circle cx="16" cy="16" r="1.8" fill="#14171A" stroke="#7C2D12" stroke-width="0.5" />
      <circle cx="28" cy="16" r="1.8" fill="#14171A" stroke="#7C2D12" stroke-width="0.5" />
      <circle cx="40" cy="16" r="1.8" fill="#14171A" stroke="#7C2D12" stroke-width="0.5" />
      <circle cx="52" cy="16" r="1.8" fill="#14171A" stroke="#7C2D12" stroke-width="0.5" />
      <circle cx="64" cy="16" r="1.8" fill="#14171A" stroke="#7C2D12" stroke-width="0.5" />
      <circle cx="76" cy="16" r="1.8" fill="#14171A" stroke="#7C2D12" stroke-width="0.5" />
    `
  },
  {
    id: 'gnd-rgb',
    code: 'GND-RGB',
    name: 'Rack Grounding Busbar (RGB)',
    category: 'grounding',
    subCategory: 'busbars',
    badgeType: 'ground',
    description: 'Rack grounding copper strip with bonding jumpers for all mounted chassis.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="12" y="12" width="72" height="8" rx="0.5" fill="url(#dc-copper-bus)" stroke="#7C2D12" stroke-width="0.6" />
      <circle cx="20" cy="16" r="1.2" fill="#14171A" />
      <circle cx="30" cy="16" r="1.2" fill="#14171A" />
      <circle cx="40" cy="16" r="1.2" fill="#14171A" />
      <circle cx="50" cy="16" r="1.2" fill="#14171A" />
      <circle cx="60" cy="16" r="1.2" fill="#14171A" />
      <circle cx="70" cy="16" r="1.2" fill="#14171A" />
    `
  },
  {
    id: 'gnd-srg',
    code: 'GND-SRG',
    name: 'Signal Reference Grid (SRG)',
    category: 'grounding',
    subCategory: 'signal_grid',
    badgeType: 'ground',
    description: 'Sub-floor copper mesh signal reference grid mitigating high-frequency EMI noise.',
    viewBox: '0 0 96 32',
    svgInner: `
      <rect x="10" y="6" width="76" height="20" fill="url(#dc-srg-grid)" stroke="#C2410C" stroke-width="1" />
      <circle cx="26" cy="16" r="2.5" fill="#FDE047" stroke="#9A3412" stroke-width="0.8" />
      <circle cx="58" cy="16" r="2.5" fill="#FDE047" stroke="#9A3412" stroke-width="0.8" />
    `
  }
];

export const DC_COMPONENT_CATEGORIES: DcComponentCategoryGroup[] = [
  {
    id: 'racks',
    label: 'Racks & Enclosures',
    icon: '🖥️',
    subCategories: [
      { id: 'all', label: 'All Cabinets' },
      { id: 'server', label: 'Single Door Server Racks' },
      { id: 'twin_doors', label: 'Twin / Split Wardrobe Doors' },
      { id: 'honeycomb', label: 'Honeycomb High-Airflow' },
      { id: 'glass_solid', label: 'Glass & Solid Acoustic' },
      { id: 'network', label: 'Network & Open Frame' },
      { id: 'colo', label: 'Colocation Multi-Bay' },
      { id: 'enclosure', label: 'Wall Mount & Micro-DC' },
      { id: 'battery', label: 'Battery & Power Storage' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'racks')
  },
  {
    id: 'pathways',
    label: 'Cable Ducts & Pathways',
    icon: '⚡',
    subCategories: [
      { id: 'all', label: 'All Pathways' },
      { id: 'underfloor', label: '▼ Under ESD Floor' },
      { id: 'overhead', label: '▲ Overhead / Roof' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'pathways')
  },
  {
    id: 'power',
    label: 'Power Distribution',
    icon: '🔌',
    subCategories: [
      { id: 'all', label: 'All Power' },
      { id: 'grid_switchgear', label: 'Switchgear & ATS' },
      { id: 'ups_backup', label: 'Central UPS & Batteries' },
      { id: 'distribution_pdu', label: 'Floor PDU & RPP' },
      { id: 'busway_rackpdu', label: 'Busway & Rack ePDUs' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'power')
  },
  {
    id: 'cooling',
    label: 'Cooling & Thermal',
    icon: '❄️',
    subCategories: [
      { id: 'all', label: 'All Cooling' },
      { id: 'perimeter_air', label: 'Perimeter CRAC/CRAH' },
      { id: 'inrow_heatex', label: 'In-Row & Rear Door RDHx' },
      { id: 'liquid_direct', label: 'Liquid CDU & Immersion' },
      { id: 'containment_flow', label: 'Aisle Containment' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'cooling')
  },
  {
    id: 'monitoring',
    label: 'Sensors & DCIM',
    icon: '📡',
    subCategories: [
      { id: 'all', label: 'All Sensors' },
      { id: 'env_probes', label: 'Temp, Humidity & Leak' },
      { id: 'telemetry_meters', label: 'Airflow, ΔP & Power' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'monitoring')
  },
  {
    id: 'patching',
    label: 'Structured Cabling',
    icon: '🔗',
    subCategories: [
      { id: 'all', label: 'All Cabling' },
      { id: 'fiber_cassettes', label: 'Fiber & MPO Panels' },
      { id: 'cable_organizers', label: 'Cable Managers (1U/VCO)' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'patching')
  },
  {
    id: 'security',
    label: 'Fire & Security',
    icon: '🛡️',
    subCategories: [
      { id: 'all', label: 'All Security' },
      { id: 'fire_safety', label: 'Fire & VESDA System' },
      { id: 'cctv_surveillance', label: 'CCTV Surveillance' },
      { id: 'access_control', label: 'Access Control & Mantrap' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'security')
  },
  {
    id: 'grounding',
    label: 'Grounding & SRG',
    icon: '⚡',
    subCategories: [
      { id: 'all', label: 'All Grounding' },
      { id: 'busbars', label: 'TMGB & RGB Busbars' },
      { id: 'signal_grid', label: 'Signal Reference Grid (SRG)' }
    ],
    items: ALL_DC_COMPONENTS.filter(c => c.category === 'grounding')
  }
];

export function getDcComponentGraphicSvg(componentId: string, width?: number, height?: number): string {
  const item = ALL_DC_COMPONENTS.find(c => c.id === componentId) || ALL_DC_COMPONENTS[0];
  const vb = item.viewBox || '0 0 60 32';
  const defaultW = item.category === 'racks' ? 70 : 75;
  const defaultH = item.category === 'racks' ? 115 : 24;
  const w = width ?? defaultW;
  const h = height ?? defaultH;
  return `
    <svg viewBox="${vb}" width="${w}" height="${h}" fill="none" xmlns="http://www.w3.org/2000/svg" style="overflow:visible; display:block;">
      <g filter="url(#dc-hw-drop-shadow)">
        ${item.svgInner}
      </g>
    </svg>
  `;
}

export function getDcComponentBadgeSvg(badgeType: string): string {
  switch (badgeType) {
    case 'power':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><polygon points="4,4 16,4 18,7 18,16 2,16 2,7" fill="#1e2430" stroke="#f59e0b" stroke-width="1.3"/><rect x="9" y="6" width="2" height="3" fill="#ffffff" rx="0.5"/><rect x="5" y="10" width="3" height="2" fill="#ffffff" rx="0.5"/><rect x="12" y="10" width="3" height="2" fill="#ffffff" rx="0.5"/></svg>`;
    case 'cooling':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><circle cx="10" cy="10" r="8" fill="#1e2430" stroke="#06b6d4" stroke-width="1.3"/><path d="M10 4v12M4 10h12M6 6l8 8M14 6l-8 8" stroke="#38bdf8" stroke-width="1.2"/></svg>`;
    case 'fiber':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><rect x="2" y="5" width="16" height="10" rx="2" fill="#1e2430" stroke="#00e5ff" stroke-width="1.3"/><circle cx="7" cy="10" r="2.2" fill="#00e5ff"/><circle cx="13" cy="10" r="2.2" fill="#00e5ff"/></svg>`;
    case 'sensor':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><circle cx="10" cy="10" r="7" fill="#1e2430" stroke="#a855f7" stroke-width="1.3"/><circle cx="10" cy="10" r="3" fill="#a855f7"/><path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="#c084fc" stroke-width="1.2"/></svg>`;
    case 'security':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M10 2L3 5v5c0 5 3.5 9 7 10 3.5-1 7-5 7-10V5l-7-3z" fill="#1e2430" stroke="#22c55e" stroke-width="1.3"/></svg>`;
    case 'fire':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M10 2c0 4-5 6-5 10a5 5 0 0 0 10 0c0-4-5-6-5-10z" fill="#1e2430" stroke="#ef4444" stroke-width="1.3"/></svg>`;
    case 'ground':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><line x1="10" y1="2" x2="10" y2="12" stroke="#f97316" stroke-width="1.5"/><line x1="4" y1="12" x2="16" y2="12" stroke="#f97316" stroke-width="1.5"/><line x1="6" y1="15" x2="14" y2="15" stroke="#f97316" stroke-width="1.5"/><line x1="8" y1="18" x2="12" y2="18" stroke="#f97316" stroke-width="1.5"/></svg>`;
    case 'pathway':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><rect x="3" y="5" width="14" height="10" rx="1.5" fill="#1e2430" stroke="#94a3b8" stroke-width="1.3"/><line x1="7" y1="5" x2="7" y2="15" stroke="#cbd5e1" stroke-width="1.2"/><line x1="13" y1="5" x2="13" y2="15" stroke="#cbd5e1" stroke-width="1.2"/></svg>`;
    default: // rack
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none"><rect x="4" y="2" width="12" height="16" rx="1.5" fill="#1e2430" stroke="#38bdf8" stroke-width="1.3"/><line x1="6" y1="6" x2="14" y2="6" stroke="#64748b" stroke-width="1"/><line x1="6" y1="10" x2="14" y2="10" stroke="#64748b" stroke-width="1"/><line x1="6" y1="14" x2="14" y2="14" stroke="#64748b" stroke-width="1"/></svg>`;
  }
}
