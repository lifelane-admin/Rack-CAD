import React, { useState, useId } from "react";

/**
 * RackKit — shared primitives for all Rack Slicer devices.
 * Provides consistent geometry, the fixed-width chassis + mounting-blade system,
 * LEDs, and a reusable <defs> block so routers, firewalls, patch panels, PDUs,
 * UPS, KVM/console servers all share one photorealistic look.
 */

// ---- geometry ---------------------------------------------------------------
const U1 = 132;              // one rack unit (1U) height in user units
const RACK_W = 1240;         // fixed 19" flange-to-flange span
const MIN_BLADE_W = 34;      // ears never shrink below this
const EAR_W = 26;            // chassis-side mount zone
const PANEL_PAD = 22;

const LED_COLORS = {
  off: "#20262b", green: "#39ff8a", greenBlink: "#39ff8a", amber: "#ffb020",
  amberBlink: "#ffb020", blue: "#37b6ff", red: "#ff4d4d", redBlink: "#ff4d4d",
  white: "#f2f6ff", purple: "#b57bff", cyan: "#37e6d9",
};

// Given inner content width, compute chassis + blade widths for the fixed rack.
function fitToRack(contentW) {
  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + contentW;
  let bladeW = (RACK_W - chassisW) / 2;
  let totalW = RACK_W;
  if (bladeW < MIN_BLADE_W) { bladeW = MIN_BLADE_W; totalW = chassisW + bladeW * 2; }
  return { chassisW, bladeW, totalW, chassisX: bladeW, contentX: bladeW + EAR_W + PANEL_PAD };
}

// ---- shared <defs> ----------------------------------------------------------
function RackDefs({ uid, accent = "#37b6ff" }) {
  return (
    <defs>
      <linearGradient id={`chassis-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a4046" /><stop offset="0.06" stopColor="#2c3237" />
        <stop offset="0.5" stopColor="#23282c" /><stop offset="0.94" stopColor="#1b1f22" /><stop offset="1" stopColor="#141719" />
      </linearGradient>
      <linearGradient id={`blade-${uid}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#2a3035" /><stop offset="0.35" stopColor="#3a4247" />
        <stop offset="0.55" stopColor="#454d53" /><stop offset="0.8" stopColor="#2b3136" /><stop offset="1" stopColor="#1a1e21" />
      </linearGradient>
      <linearGradient id={`cage-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0c0e10" /><stop offset="0.12" stopColor="#2a2f34" />
        <stop offset="0.5" stopColor="#171b1e" /><stop offset="0.88" stopColor="#0a0c0d" /><stop offset="1" stopColor="#050607" />
      </linearGradient>
      <linearGradient id={`cageLip-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4b5258" /><stop offset="1" stopColor="#20252a" />
      </linearGradient>
      <radialGradient id={`cageInner-${uid}`} cx="0.5" cy="0.35" r="0.9">
        <stop offset="0" stopColor="#111417" /><stop offset="1" stopColor="#000000" />
      </radialGradient>
      <linearGradient id={`rjMouth-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d9d3c2" /><stop offset="0.5" stopColor="#b3ad9c" /><stop offset="1" stopColor="#7c7768" />
      </linearGradient>
      <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6d98a" /><stop offset="0.5" stopColor="#c9a24b" /><stop offset="1" stopColor="#7d6021" />
      </linearGradient>
      <linearGradient id={`sfpBody-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c7ced4" /><stop offset="0.14" stopColor="#8f979e" />
        <stop offset="0.5" stopColor="#5c646b" /><stop offset="0.86" stopColor="#3a4147" /><stop offset="1" stopColor="#24292e" />
      </linearGradient>
      <radialGradient id={`bore-${uid}`} cx="0.5" cy="0.4" r="0.75">
        <stop offset="0" stopColor="#1a2a3a" /><stop offset="0.7" stopColor="#060b12" /><stop offset="1" stopColor="#000" />
      </radialGradient>
      <linearGradient id={`accent-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={accent} stopOpacity="0.9" /><stop offset="1" stopColor={accent} stopOpacity="0.35" />
      </linearGradient>

      <filter id={`grain-${uid}`} x="-2%" y="-2%" width="104%" height="104%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9 0.012" numOctaves="2" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0" result="grain" />
        <feComposite in="grain" in2="SourceGraphic" operator="over" />
      </filter>
      <filter id={`ao-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.4" stdDeviation="1.6" floodColor="#000" floodOpacity="0.55" />
      </filter>
      <filter id={`innerShadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
        <feOffset dx="0" dy="1.6" /><feGaussianBlur stdDeviation="1.8" result="o" />
        <feComposite in="SourceGraphic" in2="o" operator="out" result="inv" />
        <feColorMatrix in="inv" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0" result="sh" />
        <feComposite in="sh" in2="SourceGraphic" operator="in" />
      </filter>
      <filter id={`sfpShadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#000" floodOpacity="0.6" />
      </filter>
      <filter id={`glow-${uid}`} x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="1.1" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

// ---- chassis + mounting blades ---------------------------------------------
function ChassisWithBlades({ uid, totalW, totalH, chassisX, chassisW, bladeW, ears = true }) {
  return (
    <>
      <g filter={`url(#ao-${uid})`}>
        <rect x={chassisX} y="1" width={chassisW} height={totalH - 2} rx="4" fill={`url(#chassis-${uid})`} stroke="#0c0f11" strokeWidth="1.2" />
        <rect x={chassisX} y="1" width={chassisW} height={totalH - 2} rx="4" fill="transparent" filter={`url(#grain-${uid})`} />
        <rect x={chassisX + 2} y="2.5" width={chassisW - 4} height="2" rx="1" fill="#454b51" opacity="0.55" />
      </g>
      {ears && [0, 1].map((side) => {
        const isLeft = side === 0;
        const bladeX = isLeft ? 0 : totalW - bladeW;
        const holeCx = isLeft ? Math.min(16, bladeW / 2) : bladeX + bladeW - Math.min(16, bladeW / 2);
        const bendX = isLeft ? bladeW - 2.5 : bladeX;
        // stack a hole per rack unit-ish; 2 per U looks right
        const holes = totalH > U1 * 1.6 ? [0.18, 0.4, 0.6, 0.82] : [0.34, 0.66];
        return (
          <g key={side} filter={`url(#ao-${uid})`}>
            <rect x={bladeX} y="0" width={bladeW} height={totalH} rx="2.5" fill={`url(#blade-${uid})`} stroke="#0c0f11" strokeWidth="1" />
            <rect x={bladeX} y="1" width={bladeW} height={totalH - 2} fill="transparent" filter={`url(#grain-${uid})`} opacity="0.7" />
            <rect x={bendX} y="4" width="2.5" height={totalH - 8} fill="#4c545b" opacity="0.55" />
            <rect x={isLeft ? bladeW - 1 : bladeX + bladeW - 1.4} y="4" width="1.2" height={totalH - 8} fill="#05070a" opacity="0.7" />
            {holes.map((f, i) => (
              <g key={i}>
                <rect x={holeCx - 4.5} y={totalH * f - 8} width="9" height="16" rx="4.5" fill="#0a0c0e" stroke="#525a61" strokeWidth="1" />
                <path d={`M ${holeCx - 3} ${totalH * f - 6} a 3 5 0 0 1 3 -2`} fill="none" stroke="#6a727a" strokeWidth="0.8" opacity="0.55" />
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
}

// ---- LED --------------------------------------------------------------------
function Led({ uid, cx, cy, state = "off", r = 1.6 }) {
  const base = state.replace("Blink", "");
  const color = LED_COLORS[base] || LED_COLORS.off;
  const on = base !== "off";
  const cls = state.endsWith("Blink") ? `blink-${uid}` : on ? `pulse-${uid}` : "";
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 0.7} fill="#04060a" stroke="#2a3036" strokeWidth="0.4" />
      <circle className={cls} cx={cx} cy={cy} r={r} fill={color} filter={on ? `url(#glow-${uid})` : undefined} opacity={on ? 1 : 0.35} />
      {on && <circle cx={cx - 0.4} cy={cy - 0.4} r={r * 0.35} fill="#fff" opacity="0.85" />}
    </g>
  );
}

function LedKeyframes({ uid }) {
  return (
    <style>{`
      .hov-${uid}{transition:opacity .12s ease}
      g[role="button"]:hover .hov-${uid}{opacity:.14}
      g[role="button"]:focus-visible .hov-${uid}{opacity:.22}
      @keyframes blink-${uid}{0%,49%{opacity:1}50%,100%{opacity:.12}}
      @keyframes pulse-${uid}{0%,100%{opacity:1}50%{opacity:.45}}
      .blink-${uid}{animation:blink-${uid} .9s steps(1) infinite}
      .pulse-${uid}{animation:pulse-${uid} 1.6s ease-in-out infinite}
      @media (prefers-reduced-motion: reduce){.blink-${uid},.pulse-${uid}{animation:none}}
    `}</style>
  );
}

// ---- brand wordmark ---------------------------------------------------------
function Brand({ x, y, accent = "#37b6ff", sub, size = 15 }) {
  return (
    <>
      <text x={x} y={y} fontSize={size} fontWeight="700" fill={accent} letterSpacing="1.4"
        fontFamily="'Roboto Condensed','DIN','Segoe UI',sans-serif">RACK SLICER</text>
      {sub && <text x={x} y={y + 14} fontSize="8.5" fill="#8b939a" letterSpacing="1.1"
        fontFamily="'Roboto Condensed','Segoe UI',sans-serif">{sub}</text>}
    </>
  );
}


/**
 * RackNetworking — 1U networking devices, one component many types.
 *
 * <RackNetworking type="router"        ports={8}  model="ENT-R8" />
 * <RackNetworking type="firewall"      ports={12} model="NGFW-12" variant="ngfw" />
 * <RackNetworking type="kvm"           ports={16} model="KVM-16" />
 * <RackNetworking type="console"       ports={16} model="CS-16" />
 * <RackNetworking type="patch"         ports={24} model="PP-24"  fiber={false} />
 *
 * All render at 1U with the shared ear/rack-width system.
 */

const RJ_W = 30, RJ_H = 40, RJ_GAP = 4, BLOCK_GAP = 15;
const SFP_W = 46, SFP_H = 42.5, SFP_GAP = 9;
const SEC_GAP = 24;

const ACCENTS = {
  router: "#37b6ff", firewall: "#ff5a5a", kvm: "#39ff8a",
  console: "#39ff8a", patch: "#b57bff",
};
const LABELS = {
  router: "ENTERPRISE ROUTER", firewall: "FIREWALL", kvm: "KVM SWITCH",
  console: "CONSOLE SERVER", patch: "PATCH PANEL",
};

// ---- RJ45 jack symbol (shared shape) ----
function Rj45Symbol({ uid, id }) {
  return (
    <symbol id={id} viewBox={`0 0 ${RJ_W} ${RJ_H}`}>
      <rect x="0.5" y="0.5" width={RJ_W - 1} height={RJ_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
      <rect x="1.5" y="1.5" width={RJ_W - 3} height={RJ_H - 3} rx="2" fill="none" stroke={`url(#cageLip-${uid})`} strokeWidth="1" opacity="0.8" />
      <g transform={`translate(${RJ_W / 2} ${RJ_H / 2 + 2})`}>
        <path d="M-10 -11 h20 v14 h-4 v4 a2 2 0 0 1 -2 2 h-4 a2 2 0 0 1 -2 -2 v-4 h-4 z"
          fill={`url(#rjMouth-${uid})`} stroke="#3a352a" strokeWidth="0.8" filter={`url(#innerShadow-${uid})`} />
        <rect x="-8" y="-9" width="16" height="9" rx="1" fill="#4a4638" opacity="0.55" />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={-7.4 + i * 1.85} y="-9" width="1.1" height="6.5" fill={`url(#gold-${uid})`} rx="0.3" />
        ))}
      </g>
    </symbol>
  );
}

// ---- Fiber SFP + LC coupler symbols ----
function SfpSymbol({ uid }) {
  return (
    <symbol id={`sfp-${uid}`} viewBox={`0 0 ${SFP_W} ${SFP_H}`}>
      <g filter={`url(#sfpShadow-${uid})`}>
        <rect x="0.5" y="0.5" width={SFP_W - 1} height={SFP_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
        <rect x="3.5" y="4" width={SFP_W - 7} height={SFP_H - 8} rx="2" fill={`url(#sfpBody-${uid})`} stroke="#1b2024" strokeWidth="0.8" />
        <rect x="5" y="5.4" width={SFP_W - 10} height="1.6" rx="0.8" fill="#e8edf1" opacity="0.55" />
        <rect x="5" y="4.2" width={SFP_W - 10} height="3.4" rx="1.4" fill="var(--bail,#37b6ff)" opacity="0.92" />
        <rect x={SFP_W / 2 - 9} y={SFP_H / 2 - 3.5} width="8" height="9" rx="1.6" fill="#0d1319" stroke="#454d54" strokeWidth="0.7" />
        <circle cx={SFP_W / 2 - 5} cy={SFP_H / 2 + 1} r="2.6" fill={`url(#bore-${uid})`} />
        <rect x={SFP_W / 2 + 1} y={SFP_H / 2 - 3.5} width="8" height="9" rx="1.6" fill="#0d1319" stroke="#454d54" strokeWidth="0.7" />
        <circle cx={SFP_W / 2 + 5} cy={SFP_H / 2 + 1} r="2.6" fill={`url(#bore-${uid})`} />
      </g>
    </symbol>
  );
}

// LC fiber coupler for fiber patch panels (duplex, beige)
function LcSymbol({ uid }) {
  const W = 40, H = 30;
  return (
    <symbol id={`lc-${uid}`} viewBox={`0 0 ${W} ${H}`}>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="2" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
      <rect x="3" y="4" width={W - 6} height={H - 8} rx="1.5" fill="#c7b28a" stroke="#7a6a45" strokeWidth="0.8" />
      {[0, 1].map((i) => (
        <g key={i} transform={`translate(${W / 2 - 8 + i * 16} ${H / 2})`}>
          <rect x="-5" y="-6" width="10" height="12" rx="1.4" fill="#0d1013" stroke="#5a4f38" strokeWidth="0.6" />
          <circle cx="0" cy="0" r="3.2" fill={`url(#bore-${uid})`} />
          <circle cx="0" cy="0" r="1.4" fill="#1a2a3a" opacity="0.8" />
        </g>
      ))}
    </symbol>
  );
}

function RackNetworking({
  type = "router",
  ports = 8,
  model = "RS-DEV",
  variant,             // firewall: "appliance" | "ngfw"
  fiber = false,       // patch panel fiber vs copper
  data = {},
  onPortClick,
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const accent = ACCENTS[type] || "#37b6ff";

  // patch panels: dense single row, no console/branding block (just a label strip)
  const isPatch = type === "patch";
  const isPassive = isPatch;

  // ---- port block sizing ----
  const perBlock = 8;
  const blockOf = (i) => Math.floor(i / perBlock);
  const cellW = (isPatch && fiber) ? 40 : RJ_W;
  const cellH = (isPatch && fiber) ? 30 : RJ_H;
  const gap = RJ_GAP;

  const cols = ports;
  const blocks = Math.ceil(cols / perBlock);
  const rowW = cols * cellW + (cols - blocks) * gap + (blocks - 1) * (BLOCK_GAP - gap);

  // console/brand area (skipped for patch panels)
  const CONSOLE_W = isPassive ? 150 : 250;

  const contentW = CONSOLE_W + SEC_GAP + rowW;
  const { totalW, chassisX, chassisW, bladeW, contentX } = fitToRack(contentW);
  const totalH = U1;

  const brandX = contentX;
  const portsX = contentX + CONSOLE_W + SEC_GAP;
  const portsTop = (totalH - cellH) / 2;

  let tip = null;
  if (hover != null) tip = { n: hover, ...(data[hover] || {}) };

  const portPos = (i) => {
    const b = blockOf(i);
    const inB = i % perBlock;
    return portsX + b * (perBlock * cellW + (perBlock - 1) * gap + BLOCK_GAP) + inB * (cellW + gap);
  };

  const rjSym = `rj-${uid}`;

  return (
    <div style={{ position: "relative", width: "100%", fontFamily: "'Roboto Condensed','DIN','Segoe UI',sans-serif" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" role="img"
        aria-label={`Rack Slicer ${LABELS[type]} ${ports}-port`} style={{ display: "block", userSelect: "none" }}>
        <RackDefs uid={uid} accent={accent} />
        <defs>
          <Rj45Symbol uid={uid} id={rjSym} />
          <SfpSymbol uid={uid} />
          <LcSymbol uid={uid} />
        </defs>

        <ChassisWithBlades uid={uid} totalW={totalW} totalH={totalH} chassisX={chassisX} chassisW={chassisW} bladeW={bladeW} ears />

        {/* left accent stripe (like the catalog cards) */}
        <rect x={chassisX + 3} y="14" width="3" height={totalH - 28} rx="1.5" fill={`url(#accent-${uid})`} />

        {/* brand + type block */}
        {!isPassive && (
          <ConsoleBlock uid={uid} x={brandX} w={CONSOLE_W} h={totalH} accent={accent}
            type={type} model={model} ports={ports} variant={variant} />
        )}
        {isPassive && (
          <PatchLabel uid={uid} x={brandX} w={CONSOLE_W} h={totalH} accent={accent} model={model} ports={ports} fiber={fiber} />
        )}

        {/* divider before ports */}
        <line x1={portsX - SEC_GAP / 2} y1="18" x2={portsX - SEC_GAP / 2} y2={totalH - 18} stroke="#3a4147" strokeWidth="1" opacity="0.5" />

        {/* ports */}
        {Array.from({ length: ports }, (_, i) => i + 1).map((n) => {
          const x = portPos(n - 1);
          const d = data[n] || {};
          const connected = d.status === "connected";
          const linkState = d.linkColor || (connected ? (type === "firewall" ? "green" : "green") : "off");
          const actState = connected ? "greenBlink" : "off";
          const useFiberModule = (type === "router" || type === "firewall") && d.module === "sfp";
          return (
            <g key={n} transform={`translate(${x} ${portsTop})`}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
              onClick={() => onPortClick && onPortClick(n, d)}
              tabIndex={0} role="button" aria-label={`Port ${n}`}
              data-port={n} data-status={d.status || ""} data-speed={d.speed || ""}
              data-device={d.device || ""} data-vlan={d.vlan || ""}
              style={{ cursor: "pointer", outline: "none", "--bail": accent }}>
              {isPatch && fiber
                ? <use href={`#lc-${uid}`} width={cellW} height={cellH} />
                : useFiberModule
                ? <use href={`#sfp-${uid}`} width={cellW} height={cellH} />
                : <use href={`#${rjSym}`} width={cellW} height={cellH} />}
              {!isPatch && <>
                <Led uid={uid} cx={6} cy={5} state={linkState} r={1.4} />
                <Led uid={uid} cx={cellW - 6} cy={5} state={actState} r={1.4} />
              </>}
              <text x={cellW / 2} y={cellH + 11} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#aeb6bd" pointerEvents="none">{n}</text>
              <rect className={`hov-${uid}`} x="0" y="0" width={cellW} height={cellH} rx="2.5" fill={accent} opacity="0" pointerEvents="none" />
            </g>
          );
        })}

        <LedKeyframes uid={uid} />
      </svg>

      {tip && !isPatch && (
        <Tooltip tip={tip} type={type} model={model} />
      )}
    </div>
  );
}

// ---- console/brand block for active devices ----
function ConsoleBlock({ uid, x, w, h, accent, type, model, ports, variant }) {
  const cy = h / 2;
  const leds = type === "firewall"
    ? [{ l: "PWR", s: "green" }, { l: "HA", s: "blue" }, { l: "THREAT", s: "amberBlink" }, { l: "VPN", s: "green" }]
    : type === "kvm" || type === "console"
    ? [{ l: "PWR", s: "green" }, { l: "SYS", s: "greenBlink" }, { l: "LNK", s: "green" }, { l: "ACT", s: "greenBlink" }]
    : [{ l: "PWR", s: "green" }, { l: "SYS", s: "greenBlink" }, { l: "WAN", s: "green" }, { l: "VPN", s: "blue" }];
  const typeLabel = type === "firewall" && variant === "ngfw" ? "NGFW"
    : type === "firewall" ? "FIREWALL APPLIANCE"
    : LABELS[type];
  return (
    <g transform={`translate(${x} 0)`}>
      {leds.map((d, i) => {
        const ly = 22 + i * 22;
        return (
          <g key={d.l}>
            <Led uid={uid} cx={12} cy={ly} state={d.s} />
            <text x={22} y={ly + 3.4} fontSize="8" fill="#aeb6bd" letterSpacing="0.5">{d.l}</text>
          </g>
        );
      })}
      <Brand x={64} y={cy - 10} accent={accent} sub={model} />
      <rect x={64} y={cy + 8} width="140" height="1" fill="#3a4147" />
      <text x={64} y={cy + 21} fontSize="7.5" fill="#5b636a" letterSpacing="1.4">
        {`${typeLabel} • ${ports}P • 1U`}
      </text>
      {/* console + reset on the right of this block */}
      <g transform={`translate(${w - 84} ${cy + 4})`}>
        <rect x="0" y="0" width="26" height="18" rx="1.6" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="0.9" />
        <rect x="2" y="2" width="22" height="14" rx="1" fill={`url(#cageInner-${uid})`} filter={`url(#innerShadow-${uid})`} />
        <path d="M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z" fill="#04060a" />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={4 + i * 2.3} y="4.5" width="1.3" height="4" fill="#c9a24b" opacity="0.8" />
        ))}
        <text x="13" y="26" fontSize="6" textAnchor="middle" fill="#7b838a" letterSpacing="0.5">CONSOLE</text>
      </g>
      <g transform={`translate(${w - 42} ${cy - 12})`}>
        <rect x="0" y="0" width="22" height="8" rx="4" fill="#0a0d0f" stroke="#3a4147" strokeWidth="0.8" />
        <rect x="3" y="2.6" width="16" height="2.8" rx="1.4" fill="#2a3036" />
        <text x="11" y="18" fontSize="6" textAnchor="middle" fill="#7b838a" letterSpacing="0.6">USB-C</text>
      </g>
      <g transform={`translate(${w - 16} ${cy + 8})`}>
        <circle cx="0" cy="0" r="3.2" fill="#0a0d0f" stroke="#3a4147" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="1.1" fill="#02040a" />
        <text x="0" y="14" fontSize="6" textAnchor="middle" fill="#7b838a">RST</text>
      </g>
    </g>
  );
}

// ---- compact label block for passive patch panels ----
function PatchLabel({ uid, x, w, h, accent, model, ports, fiber }) {
  const cy = h / 2;
  return (
    <g transform={`translate(${x} 0)`}>
      <Brand x={4} y={cy - 8} accent={accent} sub={model} size={14} />
      <rect x={4} y={cy + 10} width={w - 20} height="1" fill="#3a4147" />
      <text x={4} y={cy + 23} fontSize="7.5" fill="#5b636a" letterSpacing="1.2">
        {`PATCH PANEL • ${ports}P ${fiber ? "LC FIBER" : "CAT6"} • 1U`}
      </text>
    </g>
  );
}

function Tooltip({ tip, type, model }) {
  const rows = [
    ["Device", tip.device || "—"],
    ["Speed", tip.speed || "—"],
    ["Status", tip.status || "disconnected"],
    ["VLAN", tip.vlan != null ? tip.vlan : "—"],
  ];
  return (
    <div role="status" style={{
      position: "absolute", top: 8, right: 8, minWidth: 210,
      background: "rgba(14,17,20,0.96)", border: "1px solid #2c3237", borderRadius: 8,
      padding: "10px 12px", color: "#dfe5ea", fontSize: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Port {tip.n}<span style={{ float: "right", color: "#7b838a", fontWeight: 400 }}>{model}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "#8b939a" }}>{k}</span>
          <span style={{ fontFamily: "monospace" }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}


/**
 * RackPower — realistic PDUs and UPS units.
 *
 * SOCKET TYPES (real proportions):
 *   "c13"   IEC C13   34×30   "c19"  IEC C19  42×34
 *   "in6"   Indian 6A 34×34   "in16" Indian 16A 42×42
 *   "univ"  Universal multi-standard 40×36
 *
 * <RackPower kind="pdu" socket="c13"  outlets={8}  units={1} tier="basic"   model="…" />
 * <RackPower kind="pdu" socket="univ" outlets={20} units={2} tier="smart"   model="…" />
 * <RackPower kind="pdu" socket="in16" outlets={18} vertical  tier="smart"   model="…" />
 * <RackPower kind="ups" units={2} va={1500} model="…" />
 * tier: "basic" | "metered" | "smart"
 */

const PDU_ACCENT = "#ffd23f";
const UPS_ACCENT = "#ff8a3f";

const SOCKETS = {
  c13:  { w: 34, h: 30 }, c19: { w: 42, h: 34 },
  in6:  { w: 34, h: 34 }, in16: { w: 42, h: 42 },
  univ: { w: 40, h: 36 },
};
const SOCK_NAME = { c13: "C13", c19: "C19", in6: "6A", in16: "16A", univ: "UNIV" };

function SocketSymbol({ uid, type }) {
  const { w, h } = SOCKETS[type];
  const id = `sock-${type}-${uid}`;
  const bezel = (
    <>
      <rect x="0.5" y="0.5" width={w - 1} height={h - 1} rx="3" fill="#26292d" stroke="#0a0c0e" strokeWidth="1" />
      <rect x="2" y="2" width={w - 4} height={h - 4} rx="2.5" fill="#1b1e21" stroke="#000" strokeWidth="0.5" />
      <rect x="3" y="3" width={w - 6} height={h - 6} rx="2" fill="none" stroke="#3a4045" strokeWidth="0.8" opacity="0.6" />
    </>
  );
  if (type === "c13") {
    // IEC C13 outlet (receptacle) — flat top, chamfered lower corners (the "hexagonal D").
    // Accepts a C14 plug. Three rectangular contacts: earth top-centre, live + neutral lower.
    const cw = 20, ch = 17;                 // opening size
    const ox = w / 2, oy = h / 2;
    return (
      <symbol id={id} viewBox={`0 0 ${w} ${h}`}>
        {bezel}
        {/* opening: square top, angled lower corners */}
        <path d={`M ${ox - cw/2} ${oy - ch/2}
                 h ${cw}
                 v ${ch - 5}
                 l -4 5
                 h -${cw - 8}
                 l -4 -5
                 z`}
          fill="#0a0c0e" stroke="#3a3f44" strokeWidth="0.9" filter={`url(#innerShadow-${uid})`} />
        {/* subtle inner wall sheen */}
        <path d={`M ${ox - cw/2 + 1.5} ${oy - ch/2 + 1.5} h ${cw - 3}`} stroke="#4a5055" strokeWidth="0.7" opacity="0.4" />
        {/* earth contact — top centre */}
        <rect x={ox - 1.4} y={oy - ch/2 + 2.5} width="2.8" height="4.6" rx="0.5" fill="#050607" />
        {/* live + neutral — lower, spaced */}
        <rect x={ox - 6.4} y={oy + 0.5} width="2.8" height="5" rx="0.5" fill="#050607" />
        <rect x={ox + 3.6} y={oy + 0.5} width="2.8" height="5" rx="0.5" fill="#050607" />
      </symbol>
    );
  }
  if (type === "c19") {
    return (
      <symbol id={id} viewBox={`0 0 ${w} ${h}`}>
        {bezel}
        <rect x={w/2-11} y={h/2-8} width="22" height="16" rx="2.5" fill="#0a0c0e" stroke="#3a3f44" strokeWidth="0.8" filter={`url(#innerShadow-${uid})`} />
        <rect x={w/2-7} y={h/2-4.5} width="6" height="2.4" rx="0.6" fill="#050607" />
        <rect x={w/2+1} y={h/2-4.5} width="6" height="2.4" rx="0.6" fill="#050607" />
        <rect x={w/2-3} y={h/2+2.5} width="6" height="2.4" rx="0.6" fill="#050607" />
      </symbol>
    );
  }
  if (type === "in6" || type === "in16") {
    const big = type === "in16";
    const rHole = big ? 2.6 : 2.1;
    const spread = big ? 8 : 6.5;
    return (
      <symbol id={id} viewBox={`0 0 ${w} ${h}`}>
        {bezel}
        <circle cx={w/2} cy={h/2} r={big ? 15 : 12} fill="#0a0c0e" stroke="#3a3f44" strokeWidth="0.8" filter={`url(#innerShadow-${uid})`} />
        <circle cx={w/2} cy={h/2} r={big ? 15 : 12} fill="none" stroke="#2a2f34" strokeWidth="0.6" />
        <circle cx={w/2} cy={h/2 - spread} r={rHole + 0.5} fill="#050607" stroke="#1a1d20" strokeWidth="0.5" />
        <circle cx={w/2 - spread} cy={h/2 + spread*0.6} r={rHole} fill="#050607" stroke="#1a1d20" strokeWidth="0.5" />
        <circle cx={w/2 + spread} cy={h/2 + spread*0.6} r={rHole} fill="#050607" stroke="#1a1d20" strokeWidth="0.5" />
        <path d={`M ${w/2 - (big?9:7)} ${h/2 - 2} a ${big?9:7} ${big?9:7} 0 0 1 ${big?18:14} 0`} fill="none" stroke="#4a5055" strokeWidth="0.7" opacity="0.4" />
      </symbol>
    );
  }
  return (
    <symbol id={id} viewBox={`0 0 ${w} ${h}`}>
      {bezel}
      <rect x={w/2-13} y={h/2-11} width="26" height="22" rx="6" fill="#0a0c0e" stroke="#3a3f44" strokeWidth="0.8" filter={`url(#innerShadow-${uid})`} />
      <circle cx={w/2} cy={h/2 - 5} r="2.3" fill="#050607" />
      <circle cx={w/2 - 6.5} cy={h/2 + 3} r="2.3" fill="#050607" />
      <circle cx={w/2 + 6.5} cy={h/2 + 3} r="2.3" fill="#050607" />
      <rect x={w/2 - 11} y={h/2 - 1.5} width="2" height="3" rx="0.5" fill="#050607" opacity="0.7" />
      <rect x={w/2 + 9} y={h/2 - 1.5} width="2" height="3" rx="0.5" fill="#050607" opacity="0.7" />
    </symbol>
  );
}

function RackPower({
  kind = "pdu", socket = "c13", outlets = 8, units = 1, va = 1500,
  tier = "basic", vertical = false, model = "RS-PWR", data = {}, onOutletClick,
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);
  const accent = kind === "ups" ? UPS_ACCENT : PDU_ACCENT;
  if (kind === "ups") return <UPS uid={uid} units={units} va={va} model={model} accent={accent} />;
  if (vertical) return <VerticalPDU uid={uid} socket={socket} outlets={outlets} tier={tier} model={model}
    accent={accent} data={data} hover={hover} setHover={setHover} onOutletClick={onOutletClick} />;
  return <HorizontalPDU uid={uid} socket={socket} outlets={outlets} units={units} tier={tier} model={model}
    accent={accent} data={data} hover={hover} setHover={setHover} onOutletClick={onOutletClick} />;
}

function SmartPanel({ uid, x, cy, outlets, ethPorts = 2 }) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWX".slice(0, Math.min(outlets, 12)).split("");
  return (
    <g transform={`translate(${x} 0)`}>
      <g transform={`translate(0 ${cy - 30})`}>
        {letters.map((L, i) => (
          <g key={L} transform={`translate(${i * 12} 0)`}>
            <text x="0" y="0" fontSize="6" textAnchor="middle" fill="#9aa2a9" fontWeight="600">{L}</text>
            <Led uid={uid} cx={0} cy={7} state={i % 5 === 4 ? "off" : "green"} r={1.5} />
          </g>
        ))}
      </g>
      <g transform={`translate(0 ${cy - 4})`}>
        <Led uid={uid} cx={2} cy={0} state="amber" r={1.6} />
        <text x={8} y={3} fontSize="6.5" fill="#aeb6bd">SSL</text>
        <Led uid={uid} cx={2} cy={12} state="green" r={1.6} />
        <text x={8} y={15} fontSize="6.5" fill="#aeb6bd">DHCP</text>
      </g>
      <g transform={`translate(38 ${cy - 14})`}>
        <rect x="0" y="0" width="58" height="30" rx="3" fill="#020a06" stroke="#0a2016" strokeWidth="1.2" />
        <text x="29" y="22" textAnchor="middle" fontSize="20" fontWeight="700" fill="#39ff5a"
          fontFamily="'Share Tech Mono',monospace" filter={`url(#glow-${uid})`} letterSpacing="1">8.8.1</text>
        <text x="29" y="30" textAnchor="middle" fontSize="5.5" fill="#2a8a4a" letterSpacing="1.5">METER</text>
      </g>
      <g transform={`translate(108 ${cy - 8})`}>
        <circle cx="0" cy="0" r="7" fill="#1a1d20" stroke="#3a4147" strokeWidth="1.2" />
        <circle cx="0" cy="0" r="5" fill={`url(#chassis-${uid})`} />
        <circle cx="-1.5" cy="-1.5" r="1.6" fill="#5b6268" opacity="0.6" />
        <text x="0" y="16" fontSize="6" textAnchor="middle" fill="#7b838a">FUNCTION</text>
      </g>
      <g transform={`translate(0 ${cy + 20})`}>
        {Array.from({ length: ethPorts }).map((_, i) => (
          <g key={i} transform={`translate(${i * 24} 0)`}>
            <rect x="0" y="0" width="20" height="14" rx="1.6" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="0.8" />
            <rect x="1.5" y="1.5" width="17" height="11" rx="1" fill={`url(#cageInner-${uid})`} filter={`url(#innerShadow-${uid})`} />
            <path d="M7 1.5 h6 v3 h-1.5 v-1.5 h-3 v1.5 h-1.5 z" fill="#04060a" />
            <Led uid={uid} cx={3} cy={3} state={i === 0 ? "green" : "off"} r={1} />
            <text x="10" y="21" fontSize="5" textAnchor="middle" fill="#7b838a">{i === 0 ? "LAN1" : i === 1 ? "LAN2" : "SENSOR"}</text>
          </g>
        ))}
      </g>
    </g>
  );
}

function MeterPanel({ uid, x, cy }) {
  return (
    <g transform={`translate(${x} ${cy - 16})`}>
      <rect x="0" y="0" width="66" height="34" rx="3" fill="#020a06" stroke="#0a2016" strokeWidth="1.2" />
      <text x="33" y="24" textAnchor="middle" fontSize="20" fontWeight="700" fill="#39ff5a"
        fontFamily="'Share Tech Mono',monospace" filter={`url(#glow-${uid})`} letterSpacing="1">9.3</text>
      <text x="33" y="32" textAnchor="middle" fontSize="5.5" fill="#2a8a4a" letterSpacing="1.5">AMPS · 230V</text>
    </g>
  );
}

function HorizontalPDU({ uid, socket, outlets, units, tier, model, accent, data, hover, setHover, onOutletClick }) {
  const S = SOCKETS[socket];
  const OG = 8;
  const rows = units >= 2 ? 2 : 1;
  const perRow = rows === 2 ? Math.ceil(outlets / 2) : outlets;
  const panelW = tier === "smart" ? 200 : tier === "metered" ? 80 : 0;
  const brandW = 176;
  const rowW = perRow * S.w + (perRow - 1) * OG;
  const contentW = brandW + 18 + rowW + (panelW ? 22 + panelW : 0);
  const { totalW, chassisX, chassisW, bladeW, contentX } = fitToRack(contentW);
  const totalH = U1 * units;
  const cy = totalH / 2;
  const brandX = contentX;
  const outletsX = brandX + brandW + 18;
  const rowGap = 12;
  const blockH = rows * S.h + (rows - 1) * rowGap;
  const outletsTop = (totalH - blockH) / 2;
  const panelX = outletsX + rowW + 22;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");
  const oPos = (i) => {
    const r = rows === 2 ? Math.floor(i / perRow) : 0;
    const c = rows === 2 ? i % perRow : i;
    return { x: outletsX + c * (S.w + OG), y: outletsTop + r * (S.h + rowGap) };
  };
  const sockId = `sock-${socket}-${uid}`;
  const tierLabel = tier === "smart" ? "SMART" : tier === "metered" ? "METERED" : "BASIC";

  return (
    <div style={{ position: "relative", width: "100%", fontFamily: "'Roboto Condensed','DIN','Segoe UI',sans-serif" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" role="img"
        aria-label={`Rack Slicer PDU ${outlets}× ${SOCK_NAME[socket]}`} style={{ display: "block", userSelect: "none" }}>
        <RackDefs uid={uid} accent={accent} />
        <defs><SocketSymbol uid={uid} type={socket} /></defs>
        <ChassisWithBlades uid={uid} totalW={totalW} totalH={totalH} chassisX={chassisX} chassisW={chassisW} bladeW={bladeW} ears />
        <rect x={chassisX + 3} y="14" width="3" height={totalH - 28} rx="1.5" fill={`url(#accent-${uid})`} />
        <g transform={`translate(${brandX} 0)`}>
          <Brand x={0} y={cy - 8} accent={accent} sub={model} />
          <rect x={0} y={cy + 10} width={brandW - 44} height="1" fill="#3a4147" />
          <text x={0} y={cy + 22} fontSize="7" fill="#5b636a" letterSpacing="1.1">
            {`${tierLabel} PDU • ${outlets}× ${SOCK_NAME[socket]} • ${units}U`}
          </text>
          <g transform={`translate(${brandW - 34} ${cy - 15})`}>
            <rect x="0" y="0" width="24" height="30" rx="3" fill="#0d1013" stroke="#3a4147" strokeWidth="1" />
            <rect x="4" y="4" width="16" height="13" rx="2" fill="#1c2024" stroke="#000" strokeWidth="0.5" />
            <rect x="6" y="6" width="12" height="5" rx="1.5" fill={accent} opacity="0.9" filter={`url(#glow-${uid})`} />
            <text x="12" y="27" fontSize="5.5" textAnchor="middle" fill="#7b838a">16A</text>
          </g>
        </g>
        <line x1={outletsX - 9} y1="16" x2={outletsX - 9} y2={totalH - 16} stroke="#3a4147" strokeWidth="1" opacity="0.5" />
        {Array.from({ length: outlets }, (_, i) => i).map((i) => {
          const { x, y } = oPos(i);
          const n = i + 1;
          const d = data[n] || {};
          const on = d.status !== "off";
          return (
            <g key={n} transform={`translate(${x} ${y})`}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
              onClick={() => onOutletClick && onOutletClick(n, d)}
              tabIndex={0} role="button" aria-label={`Outlet ${letters[i]}`} style={{ cursor: "pointer", outline: "none" }}>
              <use href={`#${sockId}`} width={S.w} height={S.h} />
              <text x={S.w / 2} y={-4} textAnchor="middle" fontSize="8" fontWeight="700" fill="#9aa2a9">{letters[i]}</text>
              {tier === "smart" && <Led uid={uid} cx={S.w - 4} cy={4} state={on ? "green" : "red"} r={1.3} />}
              <rect className={`hov-${uid}`} x="0" y="0" width={S.w} height={S.h} rx="3" fill={accent} opacity="0" pointerEvents="none" />
            </g>
          );
        })}
        {tier === "smart" && <SmartPanel uid={uid} x={panelX} cy={cy} outlets={outlets} ethPorts={units >= 2 ? 3 : 2} />}
        {tier === "metered" && <MeterPanel uid={uid} x={panelX} cy={cy} />}
        <LedKeyframes uid={uid} />
      </svg>
    </div>
  );
}

function VerticalPDU({ uid, socket, outlets, tier, model, accent, data, hover, setHover, onOutletClick }) {
  const S = SOCKETS[socket];
  const OG = 8;
  const stripW = Math.max(72, S.w + 34);
  const topPad = tier === "smart" ? 118 : 76;
  const botPad = 34;
  const colH = outlets * S.h + (outlets - 1) * OG;
  const totalH = topPad + colH + botPad;
  const totalW = stripW;
  const ox = (stripW - S.w) / 2 + 6;
  const sockId = `sock-${socket}-${uid}`;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");

  return (
    <div style={{ position: "relative", display: "inline-block", fontFamily: "'Roboto Condensed','Segoe UI',sans-serif" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} height="560" role="img"
        aria-label={`Rack Slicer Vertical PDU ${outlets}× ${SOCK_NAME[socket]}`} style={{ display: "block", userSelect: "none" }}>
        <RackDefs uid={uid} accent={accent} />
        <defs><SocketSymbol uid={uid} type={socket} /></defs>
        <g filter={`url(#ao-${uid})`}>
          <rect x="1" y="1" width={totalW - 2} height={totalH - 2} rx="7" fill={`url(#chassis-${uid})`} stroke="#0c0f11" strokeWidth="1.2" />
          <rect x="1" y="1" width={totalW - 2} height={totalH - 2} rx="7" fill="transparent" filter={`url(#grain-${uid})`} />
        </g>
        {[15, totalH - 15].map((cyb, i) => (
          <g key={i}>
            <circle cx={totalW / 2} cy={cyb} r="6" fill="#0a0c0e" stroke="#4c5359" strokeWidth="1" />
            <circle cx={totalW / 2} cy={cyb} r="2.2" fill="#02040a" />
          </g>
        ))}
        <g transform={`translate(0 30)`}>
          <rect x={totalW/2 - 14} y="0" width="28" height="16" rx="2" fill="#0d1013" stroke="#3a4147" strokeWidth="1" />
          <rect x={totalW/2 - 10} y="3" width="20" height="10" rx="1.5" fill="#1c2024" />
          <text x={totalW/2} y="26" textAnchor="middle" fontSize="6" fill="#7b838a">INPUT 16A</text>
          {tier === "smart" && (
            <g transform={`translate(0 34)`}>
              <rect x={totalW/2 - 22} y="0" width="44" height="20" rx="3" fill="#020a06" stroke="#0a2016" strokeWidth="1" />
              <text x={totalW/2} y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill="#39ff5a"
                fontFamily="'Share Tech Mono',monospace" filter={`url(#glow-${uid})`}>4.8kW</text>
              <g transform={`translate(${totalW/2 - 20} 26)`}>
                {[0,1].map(i => (
                  <g key={i} transform={`translate(${i*22} 0)`}>
                    <rect x="0" y="0" width="18" height="12" rx="1.4" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="0.7" />
                    <rect x="1.5" y="1.5" width="15" height="9" rx="1" fill={`url(#cageInner-${uid})`} />
                    <Led uid={uid} cx={3} cy={2.5} state={i===0?"green":"off"} r={0.9} />
                  </g>
                ))}
              </g>
            </g>
          )}
        </g>
        <text x={totalW / 2} y={topPad - 12} textAnchor="middle" fontSize="8" fontWeight="700" fill={accent} letterSpacing="0.8">RACK SLICER</text>
        {Array.from({ length: outlets }, (_, i) => i).map((i) => {
          const n = i + 1;
          const y = topPad + i * (S.h + OG);
          const d = data[n] || {};
          const on = d.status !== "off";
          return (
            <g key={n} transform={`translate(${ox} ${y})`}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
              onClick={() => onOutletClick && onOutletClick(n, d)}
              tabIndex={0} role="button" aria-label={`Outlet ${letters[i]}`} style={{ cursor: "pointer", outline: "none" }}>
              <use href={`#${sockId}`} width={S.w} height={S.h} />
              <Led uid={uid} cx={-8} cy={S.h / 2} state={on ? "green" : "off"} r={1.4} />
              <text x={-14} y={S.h / 2 + 3} textAnchor="end" fontSize="7" fontWeight="600" fill="#8b939a">{n}</text>
              <rect className={`hov-${uid}`} x="0" y="0" width={S.w} height={S.h} rx="3" fill={accent} opacity="0" pointerEvents="none" />
            </g>
          );
        })}
        <LedKeyframes uid={uid} />
      </svg>
    </div>
  );
}

function UPS({ uid, units, va, model, accent }) {
  const brandW = 240, lcdW = 150, lcdH = 62;
  const contentW = brandW + 24 + lcdW + 24 + 120;
  const { totalW, chassisX, chassisW, bladeW, contentX } = fitToRack(contentW);
  const totalH = U1 * units;
  const cy = totalH / 2;
  const lcdX = contentX + brandW + 24;
  const barsX = lcdX + lcdW + 24;
  const loadPct = Math.min(0.85, va / 8000);
  return (
    <div style={{ position: "relative", width: "100%", fontFamily: "'Roboto Condensed','DIN','Segoe UI',sans-serif" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" role="img" aria-label={`Rack Slicer UPS ${va}VA`} style={{ display: "block", userSelect: "none" }}>
        <RackDefs uid={uid} accent={accent} />
        <ChassisWithBlades uid={uid} totalW={totalW} totalH={totalH} chassisX={chassisX} chassisW={chassisW} bladeW={bladeW} ears />
        <rect x={chassisX + 3} y="14" width="3" height={totalH - 28} rx="1.5" fill={`url(#accent-${uid})`} />
        <g transform={`translate(${contentX} 0)`}>
          <Brand x={0} y={cy - 8} accent={accent} sub={model} />
          <rect x={0} y={cy + 10} width={brandW - 60} height="1" fill="#3a4147" />
          <text x={0} y={cy + 23} fontSize="7.5" fill="#5b636a" letterSpacing="1.2">{`ONLINE UPS • ${va}VA • ${units}U`}</text>
          {[["LINE", "green"], ["BATT", "off"], ["FAULT", "off"], ["LOAD", "amber"]].map(([l, s], i) => (
            <g key={l} transform={`translate(${brandW - 52} ${cy - 18 + i * 13})`}>
              <Led uid={uid} cx={0} cy={0} state={s} r={1.6} />
              <text x={8} y={3} fontSize="7" fill="#aeb6bd">{l}</text>
            </g>
          ))}
        </g>
        <g transform={`translate(${lcdX} ${cy - lcdH / 2})`}>
          <rect x="0" y="0" width={lcdW} height={lcdH} rx="5" fill="#04120a" stroke="#0a1f14" strokeWidth="1.5" />
          <rect x="4" y="4" width={lcdW - 8} height={lcdH - 8} rx="3" fill="#031008" />
          <text x="12" y="24" fontSize="16" fontWeight="700" fill="#39ff5a" fontFamily="'Share Tech Mono',monospace" filter={`url(#glow-${uid})`}>
            {va}<tspan fontSize="9"> VA</tspan></text>
          <text x="12" y="40" fontSize="9" fill="#2a8a5a" fontFamily="monospace">230V IN / 230V OUT</text>
          <text x="12" y="53" fontSize="9" fill="#2a8a5a" fontFamily="monospace">{`RUNTIME ${Math.round(8 + va / 300)}m`}</text>
          <g transform={`translate(${lcdW - 40} 12)`}>
            <rect x="0" y="0" width="28" height="13" rx="2" fill="none" stroke="#2a8a5a" strokeWidth="1.2" />
            <rect x="28" y="4" width="2.5" height="5" fill="#2a8a5a" />
            <rect x="2" y="2" width={24 * 0.8} height="9" rx="1" fill="#39ff5a" opacity="0.85" />
          </g>
        </g>
        <g transform={`translate(${barsX} ${cy - 20})`}>
          <text x="0" y="-4" fontSize="7" fill="#7b838a" letterSpacing="1">LOAD</text>
          {Array.from({ length: 10 }).map((_, i) => {
            const active = i / 10 < loadPct;
            const col = i < 6 ? "#39ff5a" : i < 8 ? "#ffb020" : "#ff4d4d";
            return <rect key={i} x={i * 11} y="0" width="8" height="16" rx="1.5"
              fill={active ? col : "#1a1f24"} opacity={active ? 0.95 : 0.5} filter={active ? `url(#glow-${uid})` : undefined} />;
          })}
          <text x="0" y="34" fontSize="7" fill="#7b838a" letterSpacing="1">BATTERY</text>
          {Array.from({ length: 10 }).map((_, i) => (
            <rect key={i} x={i * 11} y="38" width="8" height="16" rx="1.5" fill={i < 9 ? "#39ff5a" : "#1a1f24"} opacity={i < 9 ? 0.95 : 0.5} />
          ))}
        </g>
        <LedKeyframes uid={uid} />
      </svg>
    </div>
  );
}


// ===================== POWER CATALOG DEMO =====================
function outletData(n, offEvery) {
  const d = {};
  for (let i = 1; i <= n; i++) d[i] = { status: (offEvery && i % offEvery === 0) ? "off" : "on" };
  return d;
}
const HORIZ = [
  { socket: "c13",  outlets: 8,  units: 1, tier: "basic",   model: "RS-PDU8C13 · Basic 8× C13" },
  { socket: "c13",  outlets: 12, units: 1, tier: "metered", model: "RS-IN12 · Indian Metered 12× C13" },
  { socket: "c13",  outlets: 16, units: 1, tier: "basic",   model: "RS-IN16 · Indian Basic 16× C13" },
  { socket: "univ", outlets: 8,  units: 1, tier: "smart",   model: "RS-SPDU8U · Smart 8× Universal" },
  { socket: "c19",  outlets: 6,  units: 1, tier: "smart",   model: "RS-HC6 · Smart 6× C19 High-Current" },
  { socket: "univ", outlets: 20, units: 2, tier: "smart",   model: "RS-SPDU20 · Smart 20× Universal (2U)" },
];
const VERT = [
  { socket: "c13", outlets: 18, tier: "smart", model: "VPDU-18 C13" },
  { socket: "c13", outlets: 24, tier: "smart", model: "VPDU-24 C13" },
  { socket: "c13", outlets: 21, tier: "basic", model: "VPDU-21 C13" },
];
const UPSES = [
  { units: 1, va: 750,  model: "RS-UPS750" },
  { units: 2, va: 1500, model: "RS-UPS1500" },
  { units: 3, va: 6000, model: "RS-UPS6000" },
];
function Section({ title, accent, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
        <span style={{ width: 4, height: 16, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: accent }}>{title}</span>
      </div>{children}
    </div>
  );
}
function Card({ children, pad = "16px" }) {
  return <div style={{ background: "linear-gradient(180deg,#101317,#0a0c0e)", border: "1px solid #23282c",
    borderRadius: 10, padding: pad, overflow: "auto" }}>{children}</div>;
}
export default function App() {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(120% 120% at 50% 0%, #12151a 0%, #0a0c0e 60%, #060708 100%)",
      padding: "26px 22px", color: "#dfe5ea", fontFamily: "'Roboto Condensed','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ fontSize: 12, letterSpacing: 4, color: "#ffd23f", fontWeight: 700 }}>RACK SLICER</div>
        <h1 style={{ margin: "2px 0 20px", fontSize: 26, fontWeight: 700 }}>Power — Realistic PDUs &amp; UPS</h1>
        <Section title="HORIZONTAL PDU — C13 (INDIAN & GLOBAL) · C19 · UNIVERSAL" accent="#ffd23f">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {HORIZ.map((p, i) => (
              <Card key={i}><RackPower kind="pdu" {...p} data={outletData(p.outlets, p.tier === "smart" ? 5 : 0)} /></Card>
            ))}
          </div>
        </Section>
        <Section title="VERTICAL PDU (0U) — C13" accent="#ffd23f">
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {VERT.map((p, i) => (
              <Card key={i} pad="14px"><RackPower kind="pdu" vertical {...p} data={outletData(p.outlets, 6)} /></Card>
            ))}
          </div>
        </Section>
        <Section title="UPS — 1U / 2U / 3U" accent="#ff8a3f">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {UPSES.map((p, i) => (<Card key={i}><RackPower kind="ups" {...p} /></Card>))}
          </div>
        </Section>
        <div style={{ fontSize: 12, color: "#6a727a", marginTop: 8, lineHeight: 1.6 }}>
          C13 outlets shown with the correct flat-top hexagonal-D shape (earth slot top-centre, live + neutral below) —
          the receptacle that accepts C14 cords, standard on Indian and global rack PDUs. C19 is the larger high-current
          outlet; Universal accepts multiple plug standards. Smart PDUs carry 2–3 Ethernet ports, per-outlet LEDs,
          SSL/DHCP indicators, a 7-segment meter and a FUNCTION button.
        </div>
      </div>
    </div>
  );
}
