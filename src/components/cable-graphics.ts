// ── Shared Cable Graphics & Photorealistic SVG Definitions ──────────────────

export type PortBadgeType = 'rj45' | 'power' | 'fiber' | 'sfp' | 'serial' | 'sas' | 'video' | 'usb';

export const SVG_DEFS_RAW = `
  <defs>
    <linearGradient id="metal-finish" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="25%" stop-color="#E2E8F0" />
      <stop offset="60%" stop-color="#94A3B8" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>
    <linearGradient id="silver-prong" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#CBD5E1" />
      <stop offset="40%" stop-color="#FFFFFF" />
      <stop offset="80%" stop-color="#94A3B8" />
      <stop offset="100%" stop-color="#64748B" />
    </linearGradient>
    <linearGradient id="gold-contact" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FEF08A" />
      <stop offset="40%" stop-color="#F59E0B" />
      <stop offset="100%" stop-color="#B45309" />
    </linearGradient>
    <linearGradient id="polycarb" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95" />
      <stop offset="40%" stop-color="#94A3B8" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#334155" stop-opacity="0.95" />
    </linearGradient>
    <linearGradient id="pvc-blue" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#60A5FA" />
      <stop offset="40%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#1D4ED8" />
    </linearGradient>
    <linearGradient id="pvc-red" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F87171" />
      <stop offset="40%" stop-color="#EF4444" />
      <stop offset="100%" stop-color="#B91C1C" />
    </linearGradient>
    <linearGradient id="pvc-black" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#4B5563" />
      <stop offset="40%" stop-color="#1F2937" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="pvc-aqua" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#67E8F9" />
      <stop offset="40%" stop-color="#06B6D4" />
      <stop offset="100%" stop-color="#0891B2" />
    </linearGradient>
    <linearGradient id="pvc-orange" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FDBA74" />
      <stop offset="40%" stop-color="#F97316" />
      <stop offset="100%" stop-color="#C2410C" />
    </linearGradient>
    <linearGradient id="pvc-magenta" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F472B6" />
      <stop offset="40%" stop-color="#EC4899" />
      <stop offset="100%" stop-color="#BE185D" />
    </linearGradient>
    <linearGradient id="pvc-green-earth" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#4ADE80" />
      <stop offset="40%" stop-color="#16A34A" />
      <stop offset="100%" stop-color="#15803D" />
    </linearGradient>
    <linearGradient id="vga-blue" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="40%" stop-color="#0284C7" />
      <stop offset="100%" stop-color="#0369A1" />
    </linearGradient>
    <linearGradient id="ceramic-ferrule" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="50%" stop-color="#F1F5F9" />
      <stop offset="100%" stop-color="#CBD5E1" />
    </linearGradient>
    <linearGradient id="lc-body-grey" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#F8FAFC" />
      <stop offset="40%" stop-color="#E2E8F0" />
      <stop offset="100%" stop-color="#94A3B8" />
    </linearGradient>
  </defs>
`;

export function getPortBadgeSvg(badgeType: PortBadgeType): string {
  switch (badgeType) {
    case 'power':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <polygon points="4,4 16,4 18,7 18,16 2,16 2,7" fill="#1e2430" stroke="#f59e0b" stroke-width="1.3"/>
        <rect x="9" y="6" width="2" height="3" fill="#ffffff" rx="0.5"/>
        <rect x="5" y="10" width="3" height="2" fill="#ffffff" rx="0.5"/>
        <rect x="12" y="10" width="3" height="2" fill="#ffffff" rx="0.5"/>
      </svg>`;
    case 'fiber':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <rect x="2" y="5" width="16" height="10" rx="2" fill="#1e2430" stroke="#00e5ff" stroke-width="1.3"/>
        <circle cx="7" cy="10" r="2.2" fill="#00e5ff"/>
        <circle cx="13" cy="10" r="2.2" fill="#00e5ff"/>
      </svg>`;
    case 'sfp':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <rect x="2" y="5" width="16" height="10" rx="1.5" fill="#1e2430" stroke="#38bdf8" stroke-width="1.3"/>
        <path d="M6 5v10" stroke="#38bdf8" stroke-width="1.2"/>
        <path d="M14 8l-3 3-2-2" stroke="#fbbf24" stroke-width="1.3"/>
      </svg>`;
    case 'serial':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <polygon points="3,6 17,6 15,14 5,14" fill="#1e2430" stroke="#94a3b8" stroke-width="1.3"/>
        <circle cx="7" cy="9" r="0.9" fill="#facc15"/>
        <circle cx="10" cy="9" r="0.9" fill="#facc15"/>
        <circle cx="13" cy="9" r="0.9" fill="#facc15"/>
        <circle cx="8.5" cy="11.5" r="0.9" fill="#facc15"/>
        <circle cx="11.5" cy="11.5" r="0.9" fill="#facc15"/>
      </svg>`;
    case 'sas':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <rect x="2" y="5" width="16" height="10" rx="1.5" fill="#1e2430" stroke="#22c55e" stroke-width="1.3"/>
        <line x1="6" y1="8" x2="14" y2="8" stroke="#22c55e" stroke-width="1.2"/>
        <line x1="6" y1="12" x2="14" y2="12" stroke="#22c55e" stroke-width="1.2"/>
      </svg>`;
    case 'video':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <polygon points="3,6 17,6 16,14 4,14" fill="#1e2430" stroke="#38bdf8" stroke-width="1.3"/>
        <rect x="6" y="8" width="8" height="4" rx="0.5" fill="#0284c7"/>
      </svg>`;
    case 'usb':
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <rect x="3" y="6" width="14" height="8" rx="1.5" fill="#1e2430" stroke="#c084fc" stroke-width="1.3"/>
        <rect x="6" y="8.5" width="3" height="3" fill="#e2e8f0"/>
        <rect x="11" y="8.5" width="3" height="3" fill="#e2e8f0"/>
      </svg>`;
    default: // rj45
      return `<svg viewBox="0 0 20 20" width="16" height="16" fill="none">
        <rect x="2" y="3" width="16" height="14" rx="2" fill="#1e2430" stroke="#3b82f6" stroke-width="1.3"/>
        <path d="M6 17v-4h8v4" stroke="#3b82f6" stroke-width="1.3"/>
        <line x1="6" y1="6.5" x2="6" y2="9.5" stroke="#fbbf24" stroke-width="1.3"/>
        <line x1="8.5" y1="6.5" x2="8.5" y2="9.5" stroke="#fbbf24" stroke-width="1.3"/>
        <line x1="11.5" y1="6.5" x2="11.5" y2="9.5" stroke="#fbbf24" stroke-width="1.3"/>
        <line x1="14" y1="6.5" x2="14" y2="9.5" stroke="#fbbf24" stroke-width="1.3"/>
      </svg>`;
  }
}

export function getCableGraphicSvg(type: string, width = 85, height = 18): string {
  let inner = '';
  switch (type) {
    case 'general':
      inner = `
        <rect x="2" y="6" width="18" height="16" rx="2" fill="url(#polycarb)" stroke="#64748B" stroke-width="0.8" />
        <rect x="5" y="4" width="12" height="3" rx="0.5" fill="#CBD5E1" />
        <line x1="5" y1="8" x2="5" y2="12" stroke="#F59E0B" stroke-width="1.5" />
        <line x1="8" y1="8" x2="8" y2="12" stroke="#F59E0B" stroke-width="1.5" />
        <line x1="11" y1="8" x2="11" y2="12" stroke="#F59E0B" stroke-width="1.5" />
        <line x1="14" y1="8" x2="14" y2="12" stroke="#F59E0B" stroke-width="1.5" />
        <path d="M 20 7 L 34 9 L 34 19 L 20 21 Z" fill="url(#pvc-blue)" stroke="#1D4ED8" stroke-width="0.5" />
        <rect x="34" y="10.5" width="86" height="7" rx="3.5" fill="url(#pvc-blue)" />
        <rect x="34" y="11" width="86" height="1.8" fill="#FFFFFF" opacity="0.35" />
      `;
      break;

    case 'power':
      inner = `
        <path d="M 2 11 L 8 6 L 36 6 C 39 6, 42 9, 42 12 L 42 16 C 42 19, 39 22, 36 22 L 8 22 L 2 17 Z" fill="url(#pvc-red)" stroke="#991B1B" stroke-width="0.8" />
        <rect x="12" y="8.5" width="22" height="11" rx="1.5" fill="#7F1D1D" />
        <rect x="15" y="10.5" width="3" height="3.5" rx="0.5" fill="url(#silver-prong)" />
        <rect x="15" y="14" width="3" height="3.5" rx="0.5" fill="url(#silver-prong)" />
        <rect x="24" y="12" width="3" height="4" rx="0.5" fill="url(#silver-prong)" />
        <path d="M 42 9 L 52 10.5 L 52 17.5 L 42 19 Z" fill="url(#pvc-red)" stroke="#7F1D1D" stroke-width="0.5" />
        <rect x="52" y="10.5" width="68" height="7" rx="3.5" fill="url(#pvc-red)" />
        <line x1="52" y1="12" x2="120" y2="12" stroke="#FECACA" stroke-width="1.2" opacity="0.6" />
      `;
      break;

    case 'power-redundant':
      inner = `
        <path d="M 2 11 L 8 6 L 36 6 C 39 6, 42 9, 42 12 L 42 16 C 42 19, 39 22, 36 22 L 8 22 L 2 17 Z" fill="url(#pvc-blue)" stroke="#1E3A8A" stroke-width="0.8" />
        <rect x="12" y="8.5" width="22" height="11" rx="1.5" fill="#1E3A8A" />
        <rect x="15" y="10.5" width="3" height="3.5" rx="0.5" fill="url(#silver-prong)" />
        <rect x="15" y="14" width="3" height="3.5" rx="0.5" fill="url(#silver-prong)" />
        <rect x="24" y="12" width="3" height="4" rx="0.5" fill="url(#silver-prong)" />
        <path d="M 42 9 L 52 10.5 L 52 17.5 L 42 19 Z" fill="url(#pvc-blue)" stroke="#1E3A8A" stroke-width="0.5" />
        <rect x="52" y="10.5" width="68" height="7" rx="3.5" fill="url(#pvc-blue)" />
        <line x1="52" y1="12" x2="120" y2="12" stroke="#BFDBFE" stroke-width="1.2" opacity="0.6" />
      `;
      break;

    case 'c19-power':
      inner = `
        <rect x="2" y="5.5" width="42" height="17" rx="2" fill="url(#pvc-black)" stroke="#000000" stroke-width="0.8" />
        <rect x="6" y="8" width="22" height="12" rx="1" fill="#030712" />
        <rect x="9" y="9.5" width="4" height="2" fill="url(#silver-prong)" />
        <rect x="9" y="16.5" width="4" height="2" fill="url(#silver-prong)" />
        <rect x="18" y="13" width="4" height="2" fill="url(#silver-prong)" />
        <path d="M 44 8 L 52 10 L 52 18 L 44 20 Z" fill="url(#pvc-black)" stroke="#000000" stroke-width="0.5" />
        <rect x="52" y="9.5" width="68" height="9" rx="4.5" fill="url(#pvc-black)" stroke="#374151" stroke-width="0.5" />
        <line x1="52" y1="11.5" x2="120" y2="11.5" stroke="#9CA3AF" stroke-width="1.2" opacity="0.4" />
      `;
      break;

    case 'ground':
      inner = `
        <path d="M 4 9 L 24 9 C 30 9, 34 11.5, 34 14 C 34 16.5, 30 19, 24 19 L 4 19 Z" fill="url(#gold-contact)" stroke="#78350F" stroke-width="0.6" />
        <circle cx="10" cy="14" r="2.5" fill="#111827" stroke="#78350F" stroke-width="0.5" />
        <circle cx="20" cy="14" r="2.5" fill="#111827" stroke="#78350F" stroke-width="0.5" />
        <rect x="34" y="10.5" width="86" height="7" rx="3.5" fill="url(#pvc-green-earth)" />
        <line x1="34" y1="14" x2="120" y2="14" stroke="#FEF08A" stroke-width="2.2" />
      `;
      break;

    case 'om4':
      inner = `
        <rect x="2" y="7" width="5" height="4" rx="0.5" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="2" y="17" width="5" height="4" rx="0.5" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="7" y="5.5" width="22" height="17" rx="1.5" fill="url(#lc-body-grey)" stroke="#475569" stroke-width="0.6" />
        <rect x="29" y="7" width="14" height="4" rx="1" fill="#E2E8F0" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="29" y="17" width="14" height="4" rx="1" fill="#E2E8F0" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="43" y="7.5" width="77" height="3" rx="1.5" fill="url(#pvc-aqua)" />
        <rect x="43" y="17.5" width="77" height="3" rx="1.5" fill="url(#pvc-aqua)" />
      `;
      break;

    case 'om5':
      inner = `
        <rect x="2" y="7" width="5" height="4" rx="0.5" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="2" y="17" width="5" height="4" rx="0.5" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="7" y="5.5" width="22" height="17" rx="1.5" fill="url(#pvc-blue)" stroke="#1D4ED8" stroke-width="0.6" />
        <rect x="29" y="7" width="14" height="4" rx="1" fill="url(#pvc-blue)" stroke="#1E3A8A" stroke-width="0.4" />
        <rect x="29" y="17" width="14" height="4" rx="1" fill="url(#pvc-blue)" stroke="#1E3A8A" stroke-width="0.4" />
        <rect x="43" y="7.5" width="77" height="3" rx="1.5" fill="url(#pvc-orange)" />
        <rect x="43" y="17.5" width="77" height="3" rx="1.5" fill="url(#pvc-orange)" />
      `;
      break;

    case 'sc-fiber':
      inner = `
        <rect x="2" y="11.5" width="6" height="5" rx="0.5" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="8" y="7.5" width="28" height="13" rx="1.5" fill="url(#pvc-blue)" stroke="#1D4ED8" stroke-width="0.6" />
        <path d="M 36 10 L 46 11.5 L 46 16.5 L 36 18 Z" fill="url(#pvc-blue)" stroke="#1E3A8A" stroke-width="0.4" />
        <rect x="46" y="12" width="74" height="4" rx="2" fill="url(#pvc-orange)" />
      `;
      break;

    case 'mpo-trunk':
      inner = `
        <rect x="2" y="7" width="6" height="14" rx="0.5" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="8" y="5" width="30" height="18" rx="2" fill="url(#pvc-aqua)" stroke="#0891B2" stroke-width="0.6" />
        <rect x="38" y="8" width="12" height="12" rx="1" fill="#1E293B" />
        <rect x="50" y="9.5" width="70" height="9" rx="4.5" fill="url(#pvc-magenta)" />
      `;
      break;

    case 'st-fiber':
      inner = `
        <rect x="2" y="11.5" width="10" height="5" rx="1" fill="url(#ceramic-ferrule)" stroke="#94A3B8" stroke-width="0.4" />
        <rect x="12" y="8.5" width="18" height="11" rx="2" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="30" y="10.5" width="20" height="7" rx="1" fill="#1E293B" stroke="#0F172A" stroke-width="0.4" />
        <rect x="50" y="12" width="70" height="4" rx="2" fill="url(#pvc-orange)" />
      `;
      break;

    case 'serial-rs232':
      inner = `
        <polygon points="2,7 14,7 18,11 18,17 14,21 2,21" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="18" y="5" width="30" height="18" rx="2" fill="#64748B" stroke="#334155" stroke-width="0.6" />
        <rect x="48" y="11" width="72" height="6" rx="3" fill="#334155" />
      `;
      break;

    case 'serial-console':
      inner = `
        <rect x="2" y="6" width="18" height="16" rx="2" fill="url(#polycarb)" stroke="#64748B" stroke-width="0.8" />
        <path d="M 20 8 L 32 10 L 32 18 L 20 20 Z" fill="#0284C7" />
        <rect x="32" y="10.5" width="88" height="7" rx="1" fill="#38BDF8" stroke="#0284C7" stroke-width="0.5" />
      `;
      break;

    case 'dac-twinax':
    case 'dac-sfp28':
      inner = `
        <path d="M 2 14 C 2 9, 10 9, 12 9 L 12 11 C 10 11, 4 11, 4 14 C 4 17, 10 17, 12 17 L 12 19 C 10 19, 2 19, 2 14 Z" fill="#38BDF8" />
        <rect x="12" y="6.5" width="42" height="15" rx="1.5" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="54" y="9.5" width="66" height="9" rx="4.5" fill="url(#pvc-black)" stroke="#000000" stroke-width="0.5" />
      `;
      break;

    case 'dac-qsfp28':
      inner = `
        <path d="M 2 14 C 2 7, 10 7, 12 7 L 12 9 C 10 9, 4 9, 4 14 C 4 19, 10 19, 12 19 L 12 21 C 10 21, 2 21, 2 14 Z" fill="#F97316" />
        <rect x="12" y="4" width="46" height="20" rx="2" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="58" y="8" width="62" height="12" rx="5" fill="url(#pvc-black)" stroke="#000000" stroke-width="0.5" />
      `;
      break;

    case 'dac-breakout':
      inner = `
        <rect x="2" y="5" width="36" height="18" rx="2" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="38" y="7" width="14" height="14" rx="2" fill="#0F172A" />
        <line x1="52" y1="9" x2="120" y2="6" stroke="#1F2937" stroke-width="2" />
        <line x1="52" y1="12" x2="120" y2="11" stroke="#1F2937" stroke-width="2" />
        <line x1="52" y1="16" x2="120" y2="17" stroke="#1F2937" stroke-width="2" />
        <line x1="52" y1="19" x2="120" y2="22" stroke="#1F2937" stroke-width="2" />
      `;
      break;

    case 'mini-sas-hd':
      inner = `
        <path d="M 2 14 C 2 8, 12 8, 14 8 L 14 10 C 12 10, 4 10, 4 14 C 4 18, 12 18, 14 18 L 14 20 C 12 20, 2 20, 2 14 Z" fill="#22C55E" />
        <rect x="14" y="5.5" width="48" height="17" rx="1.5" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="62" y="10" width="58" height="8" rx="3" fill="url(#pvc-black)" />
      `;
      break;

    case 'slimsas':
      inner = `
        <rect x="4" y="7.5" width="45" height="13" rx="1.5" fill="#1E293B" stroke="#475569" stroke-width="0.6" />
        <rect x="8" y="9.5" width="12" height="9" rx="1" fill="#38BDF8" />
        <rect x="49" y="11" width="71" height="6" rx="2" fill="#334155" />
      `;
      break;

    case 'qsfp-dd':
      inner = `
        <path d="M 2 14 C 2 6, 12 6, 14 6 L 14 8 C 12 8, 4 8, 4 14 C 4 20, 12 20, 14 20 L 14 22 C 12 22, 2 22, 2 14 Z" fill="#A855F7" />
        <rect x="14" y="3" width="48" height="22" rx="2" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="62" y="7.5" width="58" height="13" rx="5" fill="url(#pvc-black)" />
      `;
      break;

    case 'vga-dsub':
      inner = `
        <polygon points="2,6 14,6 18,10 18,18 14,22 2,22" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="18" y="4" width="30" height="20" rx="2" fill="url(#vga-blue)" stroke="#0284C7" stroke-width="0.6" />
        <rect x="48" y="10.5" width="72" height="7" rx="3.5" fill="url(#pvc-black)" />
      `;
      break;

    case 'hdmi':
      inner = `
        <polygon points="2,9 2,19 6,19 8,22 18,22 18,6 8,6 6,9" fill="url(#gold-contact)" stroke="#78350F" stroke-width="0.6" />
        <path d="M 18 5 L 44 5 C 47 5, 48 8, 48 11 L 48 17 C 48 20, 47 23, 44 23 L 18 23 Z" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
        <text x="24" y="16" fill="#94A3B8" font-family="sans-serif" font-size="6.5" font-weight="800">HDMI</text>
        <rect x="48" y="10.5" width="72" height="7" rx="3.5" fill="url(#pvc-black)" />
      `;
      break;

    case 'displayport':
      inner = `
        <polygon points="2,7 14,7 18,11 18,21 2,21" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="18" y="5" width="30" height="18" rx="2" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
        <rect x="48" y="10.5" width="72" height="7" rx="3.5" fill="url(#pvc-black)" />
      `;
      break;

    case 'rj11-sensor':
      inner = `
        <rect x="2" y="6" width="14" height="16" rx="1.5" fill="url(#polycarb)" stroke="#475569" stroke-width="0.6" />
        <rect x="16" y="10.5" width="104" height="7" rx="1" fill="#475569" stroke="#1E293B" stroke-width="0.4" />
      `;
      break;

    case 'usb-a':
      inner = `
        <rect x="2" y="8" width="22" height="12" rx="1" fill="url(#metal-finish)" stroke="#334155" stroke-width="0.6" />
        <rect x="24" y="7" width="14" height="14" rx="1.5" fill="#1E293B" />
        <rect x="38" y="11.5" width="82" height="5" rx="2.5" fill="url(#pvc-black)" />
      `;
      break;

    case 'usb-c':
      inner = `
        <rect x="2" y="10" width="18" height="8" rx="4" fill="url(#metal-finish)" stroke="#475569" stroke-width="0.6" />
        <path d="M 20 8 L 38 8 C 40 8, 42 10, 42 12 L 42 16 C 42 18, 40 20, 38 20 L 20 20 Z" fill="#1E293B" stroke="#334155" stroke-width="0.6" />
        <rect x="42" y="11.2" width="78" height="5.6" rx="2.8" fill="url(#pvc-black)" />
      `;
      break;

    default:
      inner = `
        <rect x="2" y="6" width="18" height="16" rx="2" fill="url(#polycarb)" stroke="#64748B" stroke-width="0.8" />
        <path d="M 20 7 L 34 9 L 34 19 L 20 21 Z" fill="url(#pvc-blue)" stroke="#1D4ED8" stroke-width="0.5" />
        <rect x="34" y="10.5" width="86" height="7" rx="3.5" fill="url(#pvc-blue)" />
      `;
  }

  return `
    <svg viewBox="0 0 125 28" width="${width}" height="${height}" fill="none" style="display:block; overflow:visible;">
      ${SVG_DEFS_RAW}
      ${inner}
    </svg>
  `;
}

export interface CableCatalogItem {
  id: string;
  type: string;
  name: string;
  label: string;
  subLabel: string;
  portBadgeType: PortBadgeType;
  defaultColor: string;
  termination: string;
  description: string;
  isPower?: boolean;
  category: string;
}

export const CABLE_CATEGORIES: { category: string; items: CableCatalogItem[] }[] = [
  {
    category: 'Copper Ethernet',
    items: [
      { id: 'cable-cat6', type: 'general', name: 'ethernet (cat6 / cat6a)', label: 'Ethernet', subLabel: 'ethernet (cat6 / cat6a)', portBadgeType: 'rj45', defaultColor: '#2563eb', termination: 'RJ45 Modular', description: '1G/10GBase-T', category: 'Copper Ethernet' },
    ]
  },
  {
    category: 'Power Infrastructure',
    items: [
      { id: 'cable-c13-pwr', type: 'power', name: 'power (c13-primary)', label: 'Power Primary', subLabel: 'power (c13-primary)', portBadgeType: 'power', defaultColor: '#dc2626', termination: 'IEC C13/C14', description: 'Primary AC Feed', isPower: true, category: 'Power Infrastructure' },
      { id: 'cable-c13-red', type: 'power-redundant', name: 'power-redundant', label: 'Power Redundant', subLabel: 'power-redundant', portBadgeType: 'power', defaultColor: '#2563eb', termination: 'IEC C13/C14', description: 'Secondary AC Feed', isPower: true, category: 'Power Infrastructure' },
      { id: 'cable-c19-pwr', type: 'c19-power', name: 'high-amp (c19/c20)', label: 'High Amp Power', subLabel: 'high-amp (c19/c20)', portBadgeType: 'power', defaultColor: '#1e2024', termination: 'IEC C19/C20', description: 'High-Amp 16A Feed', isPower: true, category: 'Power Infrastructure' },
      { id: 'cable-ground', type: 'ground', name: 'rack-chassis-ground', label: 'Chassis Ground', subLabel: 'rack-chassis-ground', portBadgeType: 'power', defaultColor: '#16a34a', termination: 'Dual Copper Lug', description: 'Chassis Earth Bonding', isPower: true, category: 'Power Infrastructure' },
    ]
  },
  {
    category: 'Optical Fiber',
    items: [
      { id: 'cable-om4-lc', type: 'om4', name: 'fiber-om4-duplex (lc-lc)', label: 'Fiber OM4 Duplex', subLabel: 'fiber-om4-duplex (lc-lc)', portBadgeType: 'fiber', defaultColor: '#06b6d4', termination: 'LC Duplex', description: 'Multimode OM4 50/125µ', category: 'Optical Fiber' },
      { id: 'cable-os2-lc', type: 'om5', name: 'fiber-os2-singlemode', label: 'Fiber OS2 Singlemode', subLabel: 'fiber-os2-singlemode', portBadgeType: 'fiber', defaultColor: '#ea580c', termination: 'LC Duplex', description: 'Single-Mode OS2 9/125µ', category: 'Optical Fiber' },
      { id: 'cable-sc-single', type: 'sc-fiber', name: 'fiber-simplex (sc-single)', label: 'Fiber Simplex', subLabel: 'fiber-simplex (sc-single)', portBadgeType: 'fiber', defaultColor: '#ea580c', termination: 'SC Simplex', description: 'Single-Mode SC', category: 'Optical Fiber' },
      { id: 'cable-mpo-12', type: 'mpo-trunk', name: 'mpo/mtp-12 (trunk-spine)', label: 'MPO/MTP-12 Trunk', subLabel: 'mpo/mtp-12 (trunk-spine)', portBadgeType: 'fiber', defaultColor: '#db2777', termination: 'MPO/MTP-12', description: '12-Fiber Trunk Spine', category: 'Optical Fiber' },
      { id: 'cable-st-fiber', type: 'st-fiber', name: 'st-fiber (bayonet-twist)', label: 'ST Bayonet Fiber', subLabel: 'st-fiber (bayonet-twist)', portBadgeType: 'fiber', defaultColor: '#ea580c', termination: 'ST Bayonet', description: 'Legacy Twist-Lock Fiber', category: 'Optical Fiber' },
    ]
  },
  {
    category: 'Serial & Console',
    items: [
      { id: 'cable-serial-db9', type: 'serial-rs232', name: 'serial-rs232 (db9-null-modem)', label: 'Serial RS-232', subLabel: 'serial-rs232 (db9-null-modem)', portBadgeType: 'serial', defaultColor: '#64748b', termination: 'DB9 D-Sub', description: 'RS-232 Null Modem', category: 'Serial & Console' },
      { id: 'cable-cisco-roll', type: 'serial-console', name: 'serial-console (rollover)', label: 'Cisco Rollover', subLabel: 'serial-console (rollover)', portBadgeType: 'serial', defaultColor: '#38bdf8', termination: 'RJ45 Rollover', description: 'Cisco Out-of-Band', category: 'Serial & Console' },
    ]
  },
  {
    category: 'High-Speed DAC',
    items: [
      { id: 'cable-dac-sfp28', type: 'dac-twinax', name: 'dac-sfp28 (25g-twinax)', label: 'SFP28 DAC', subLabel: 'dac-sfp28 (25g-twinax)', portBadgeType: 'sfp', defaultColor: '#1e2024', termination: 'SFP28 Transceiver', description: '25GbE Passive Twinax', category: 'High-Speed DAC' },
      { id: 'cable-dac-qsfp28', type: 'dac-qsfp28', name: 'dac-qsfp28 (100g-fabric)', label: 'QSFP28 DAC', subLabel: 'dac-qsfp28 (100g-fabric)', portBadgeType: 'sfp', defaultColor: '#1e2024', termination: 'QSFP28 Transceiver', description: '100GbE Spine/Fabric', category: 'High-Speed DAC' },
      { id: 'cable-dac-breakout', type: 'dac-breakout', name: 'dac-breakout (100g to 4×25g)', label: '100G Breakout DAC', subLabel: 'dac-breakout (100g to 4x25g)', portBadgeType: 'sfp', defaultColor: '#1e2024', termination: 'QSFP28 to 4xSFP28', description: '100G to 4x25G Split', category: 'High-Speed DAC' },
    ]
  },
  {
    category: 'Storage & Bus',
    items: [
      { id: 'cable-mini-sas', type: 'mini-sas-hd', name: 'mini-sas-hd (sff-8644)', label: 'Mini-SAS HD', subLabel: 'mini-sas-hd (sff-8644)', portBadgeType: 'sas', defaultColor: '#1e2024', termination: 'SFF-8644 HD', description: '12Gb/s External SAS', category: 'Storage & Bus' },
      { id: 'cable-slimsas', type: 'slimsas', name: 'slimsas / mcio (pcie gen5)', label: 'SlimSAS / MCIO', subLabel: 'slimsas / mcio (pcie gen5)', portBadgeType: 'sas', defaultColor: '#334155', termination: 'SlimSAS / MCIO', description: 'PCIe Gen5 / NVMe Direct', category: 'Storage & Bus' },
      { id: 'cable-qsfp-dd', type: 'qsfp-dd', name: 'qsfp-dd (400g/800g pam4)', label: 'QSFP-DD 400G', subLabel: 'qsfp-dd (400g/800g pam4)', portBadgeType: 'sas', defaultColor: '#1e2024', termination: 'QSFP-DD Module', description: '400G/800G PAM4 Interconnect', category: 'Storage & Bus' },
    ]
  },
  {
    category: 'KVM & Video',
    items: [
      { id: 'cable-vga', type: 'vga-dsub', name: 'vga-dsub (kvm-video)', label: 'VGA D-Sub', subLabel: 'vga-dsub (kvm-video)', portBadgeType: 'video', defaultColor: '#0284c7', termination: 'VGA D-Sub 15-pin', description: 'Analog KVM Console', category: 'KVM & Video' },
      { id: 'cable-hdmi', type: 'hdmi', name: 'hdmi-digital-video', label: 'HDMI Video', subLabel: 'hdmi-digital-video', portBadgeType: 'video', defaultColor: '#1e2024', termination: 'HDMI Type-A', description: 'Digital Video Feed', category: 'KVM & Video' },
      { id: 'cable-dp', type: 'displayport', name: 'displayport (dp-gpu)', label: 'DisplayPort', subLabel: 'displayport (dp-gpu)', portBadgeType: 'video', defaultColor: '#1e2024', termination: 'DisplayPort 1.4', description: 'Workstation / GPU Output', category: 'KVM & Video' },
    ]
  },
  {
    category: 'Sensors & Debug',
    items: [
      { id: 'cable-rj11', type: 'rj11-sensor', name: 'rj11/rj12 (env-sensors)', label: 'RJ11/RJ12 Sensor', subLabel: 'rj11/rj12 (env-sensors)', portBadgeType: 'usb', defaultColor: '#475569', termination: 'RJ11/RJ12 Modular', description: 'Temp / Humidity Probe', category: 'Sensors & Debug' },
      { id: 'cable-usba', type: 'usb-a', name: 'usb-a (front-service-port)', label: 'USB Type-A', subLabel: 'usb-a (front-service-port)', portBadgeType: 'usb', defaultColor: '#1e2024', termination: 'USB Type-A 3.0', description: 'Front Service & Diagnostic', category: 'Sensors & Debug' },
      { id: 'cable-usbc', type: 'usb-c', name: 'usb-type-c (debug-console)', label: 'USB Type-C', subLabel: 'usb-type-c (debug-console)', portBadgeType: 'usb', defaultColor: '#1e2024', termination: 'USB-C Universal', description: 'High-Speed Debug Interface', category: 'Sensors & Debug' },
    ]
  }
];

export const ALL_CABLE_ITEMS: CableCatalogItem[] = CABLE_CATEGORIES.flatMap(cat => cat.items);
