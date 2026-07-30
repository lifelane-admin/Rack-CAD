import React, { useState, useMemo, useId } from "react";

/**
 * Rack Slicer — Ultra-realistic 1U enterprise switch.
 *
 * Industrial RJ45 layout: copper ports are arranged in stacked vertical
 * pairs (odd on top, even on bottom) grouped into blocks of `colsPerBlock`
 * columns. A 24-port switch = (4×2)×3 blocks, matching TP-LINK TL-SG2424.
 * The SFP ports form a separate uplink group on the right.
 *
 *   [ console ]  [ RJ45 blocks (cols×2) ]  | [ SFP uplinks ]
 *
 * <RackSwitch
 *    rj45={24} sfp={4}
 *    colsPerBlock={4}     // 4 columns per block → (4×2) blocks
 *    vendor="TP-LINK" model="TL-SG2424"
 *    data={{ "rj45:1": {...}, "sfp:1": {...} }}
 * />
 *
 * data keys: "rj45:<n>" and "sfp:<n>".
 *   entry: { speed, link, status, device, vlan, mac }
 *   SFP also: module: "fiber" | "dac" | false  (default fiber when connected)
 */

// ---- geometry ---------------------------------------------------------------
const U_HEIGHT = 132;              // 1U front height
// Full 19" rack width in these units. The assembly is ALWAYS this wide:
// a small chassis gets wide blank ear-blades, a large chassis gets narrow ones.
const RACK_W = 1240;               // flange-to-flange 1U span
const MIN_BLADE_W = 34;            // ears never shrink below this (screw-hole room)
const EAR_W = 26;                  // chassis-side mount zone where the blade folds in
const PANEL_PAD = 22;
const CONSOLE_W = 250;

// RJ45 jack (single jack of a stacked pair)
const RJ_W = 30;
const RJ_H = 40;          // each jack; two stacked = 2×40 + gap
const RJ_COL_GAP = 4;     // between columns inside a block
const RJ_ROW_GAP = 7;     // vertical gap between the two stacked jacks
const BLOCK_GAP = 15;     // between RJ45 blocks

// SFP cage (tall & narrow)
const SFP_W = 46;
const SFP_H = 42.5;
const SFP_GAP_X = 9;
const SECTION_GAP = 26;   // between RJ45 area and SFP area

const LED_COLORS = {
  off: "#20262b", green: "#39ff8a", greenBlink: "#39ff8a", amber: "#ffb020",
  amberBlink: "#ffb020", blue: "#37b6ff", red: "#ff4d4d", white: "#f2f6ff",
};

const speedToState = (link, status) => {
  if (link === "down" || status === "disconnected") return "off";
  if (status === "error") return "red";
  return "green";
};

function RackSwitch({
  rj45 = 24,
  sfp = 4,
  colsPerBlock = 4,
  rjRows = 2,
  vendor = "Rack Slicer",
  model = "RS-SG2424",
  data = {},
  onPortClick,
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null); // {kind,n}

  // ---- RJ45 block layout ----
  // rjRows: 2 = stacked odd/even pairs (default industrial); 1 = single horizontal line.
  const rjLayout = useMemo(() => {
    const rows = rjRows;
    // "units" = number of horizontal cells: pairs when 2 rows, ports when 1 row.
    const units = rows === 1 ? rj45 : Math.ceil(rj45 / 2);
    const blocks = Math.ceil(units / colsPerBlock);
    const colW = RJ_W;
    const blockW = colsPerBlock * colW + (colsPerBlock - 1) * RJ_COL_GAP;
    const totalRjW =
      units > 0
        ? blocks * blockW + (blocks - 1) * BLOCK_GAP -
          (blocks * colsPerBlock - units) * (colW + RJ_COL_GAP)
        : 0;
    return { units, blocks, blockW, totalRjW: Math.max(0, totalRjW) };
  }, [rj45, colsPerBlock, rjRows]);

  const rjBlockH = rjRows === 1 ? RJ_H : RJ_H * 2 + RJ_ROW_GAP;
  const sfpRowWidth = sfp > 0 ? sfp * SFP_W + (sfp - 1) * SFP_GAP_X : 0;

  const chassisW = EAR_W * 2 + PANEL_PAD * 2 + CONSOLE_W + SECTION_GAP +
    rjLayout.totalRjW + (sfp > 0 ? SECTION_GAP + sfpRowWidth : 0);

  // Blades fill whatever space remains to reach the fixed 19" rack width.
  // Small switch → wide blank ears; large switch → narrow ears. Total is constant.
  let bladeW = (RACK_W - chassisW) / 2;
  let totalW = RACK_W;
  if (bladeW < MIN_BLADE_W) {         // chassis wider than a standard rack? grow total instead
    bladeW = MIN_BLADE_W;
    totalW = chassisW + bladeW * 2;
  }
  const BLADE_W = bladeW;
  const chassisX = BLADE_W;           // chassis body starts after the left blade
  const totalH = U_HEIGHT;

  const consoleX = BLADE_W + EAR_W + PANEL_PAD;
  const rjX = consoleX + CONSOLE_W + SECTION_GAP;
  const sfpX = rjX + rjLayout.totalRjW + (sfp > 0 ? SECTION_GAP : 0);

  const rjTop = (totalH - rjBlockH) / 2;
  const sfpTop = (totalH - SFP_H) / 2;

  let tip = null;
  if (hover) tip = { ...hover, ...(data[`${hover.kind}:${hover.n}`] || {}) };

  // Position of a jack given its port number.
  const rjPos = (n) => {
    if (rjRows === 1) {
      // single horizontal line: cell index = port index
      const cell = n - 1;
      const block = Math.floor(cell / colsPerBlock);
      const cellInBlock = cell % colsPerBlock;
      const x =
        rjX +
        block * (rjLayout.blockW + BLOCK_GAP) +
        cellInBlock * (RJ_W + RJ_COL_GAP);
      return { x, y: rjTop, row: 0, single: true };
    }
    // stacked pairs: column = floor((n-1)/2), row 0 = odd (top), 1 = even (bottom)
    const col = Math.floor((n - 1) / 2);
    const row = (n - 1) % 2;
    const block = Math.floor(col / colsPerBlock);
    const colInBlock = col % colsPerBlock;
    const x =
      rjX +
      block * (rjLayout.blockW + BLOCK_GAP) +
      colInBlock * (RJ_W + RJ_COL_GAP);
    const y = rjTop + row * (RJ_H + RJ_ROW_GAP);
    return { x, y, row, single: false };
  };

  const rjPorts = Array.from({ length: rj45 }, (_, i) => i + 1);

  return (
    <div style={{ position: "relative", width: "100%", fontFamily: "'Roboto Condensed','DIN','Segoe UI',sans-serif" }}>
      <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" role="img"
        aria-label={`${vendor} ${model} switch`} style={{ display: "block", userSelect: "none" }}>
        <defs>
          <linearGradient id={`chassis-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3a4046" /><stop offset="0.06" stopColor="#2c3237" />
            <stop offset="0.5" stopColor="#23282c" /><stop offset="0.94" stopColor="#1b1f22" /><stop offset="1" stopColor="#141719" />
          </linearGradient>
          <linearGradient id={`ear-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#31373c" /><stop offset="0.5" stopColor="#24292d" /><stop offset="1" stopColor="#181b1e" />
          </linearGradient>
          {/* mounting blade — horizontal falloff so the folded flange edge catches light */}
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
          <linearGradient id={`sfpBoot-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c333a" /><stop offset="0.5" stopColor="#171c21" /><stop offset="1" stopColor="#0c0f12" />
          </linearGradient>
          <radialGradient id={`bore-${uid}`} cx="0.5" cy="0.4" r="0.75">
            <stop offset="0" stopColor="#1a2a3a" /><stop offset="0.7" stopColor="#060b12" /><stop offset="1" stopColor="#000" />
          </radialGradient>

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

          {/* RJ45 jack — orientation flips so a stacked pair mirrors (tabs meet in middle) */}
          <symbol id={`rj45up-${uid}`} viewBox={`0 0 ${RJ_W} ${RJ_H}`}>
            <rect x="0.5" y="0.5" width={RJ_W - 1} height={RJ_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
            <rect x="1.5" y="1.5" width={RJ_W - 3} height={RJ_H - 3} rx="2" fill="none" stroke={`url(#cageLip-${uid})`} strokeWidth="1" opacity="0.8" />
            {/* mouth: latch notch pointing DOWN (jack opening faces viewer, tab down) */}
            <g transform={`translate(${RJ_W / 2} ${RJ_H / 2 + 3})`}>
              <path d="M-10 -11 h20 v14 h-4 v4 a2 2 0 0 1 -2 2 h-4 a2 2 0 0 1 -2 -2 v-4 h-4 z"
                fill={`url(#rjMouth-${uid})`} stroke="#3a352a" strokeWidth="0.8" filter={`url(#innerShadow-${uid})`} />
              <rect x="-8" y="-9" width="16" height="9" rx="1" fill="#4a4638" opacity="0.55" />
              {Array.from({ length: 8 }).map((_, i) => (
                <rect key={i} x={-7.4 + i * 1.85} y="-9" width="1.1" height="6.5" fill={`url(#gold-${uid})`} rx="0.3" />
              ))}
            </g>
          </symbol>
          <symbol id={`rj45dn-${uid}`} viewBox={`0 0 ${RJ_W} ${RJ_H}`}>
            <rect x="0.5" y="0.5" width={RJ_W - 1} height={RJ_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
            <rect x="1.5" y="1.5" width={RJ_W - 3} height={RJ_H - 3} rx="2" fill="none" stroke={`url(#cageLip-${uid})`} strokeWidth="1" opacity="0.8" />
            {/* mirrored: latch notch pointing UP */}
            <g transform={`translate(${RJ_W / 2} ${RJ_H / 2 - 3})`}>
              <path d="M-10 11 h20 v-14 h-4 v-4 a2 2 0 0 0 -2 -2 h-4 a2 2 0 0 0 -2 2 v4 h-4 z"
                fill={`url(#rjMouth-${uid})`} stroke="#3a352a" strokeWidth="0.8" filter={`url(#innerShadow-${uid})`} />
              <rect x="-8" y="0" width="16" height="9" rx="1" fill="#4a4638" opacity="0.55" />
              {Array.from({ length: 8 }).map((_, i) => (
                <rect key={i} x={-7.4 + i * 1.85} y="2.5" width="1.1" height="6.5" fill={`url(#gold-${uid})`} rx="0.3" />
              ))}
            </g>
          </symbol>

          <symbol id={`sfpCage-${uid}`} viewBox={`0 0 ${SFP_W} ${SFP_H}`}>
            <rect x="0.5" y="0.5" width={SFP_W - 1} height={SFP_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
            <rect x="1.5" y="1.5" width={SFP_W - 3} height={SFP_H - 3} rx="2" fill="none" stroke={`url(#cageLip-${uid})`} strokeWidth="1" opacity="0.8" />
            <rect x="5" y="11" width={SFP_W - 10} height={SFP_H - 18} rx="1.5" fill={`url(#cageInner-${uid})`} filter={`url(#innerShadow-${uid})`} />
            <g opacity="0.9">
              {Array.from({ length: 7 }).map((_, i) => (
                <rect key={i} x={7.5 + i * ((SFP_W - 15) / 7)} y="13" width={(SFP_W - 15) / 7 - 1.3} height={SFP_H - 24} fill={`url(#gold-${uid})`} rx="0.4" />
              ))}
            </g>
            <rect x={SFP_W / 2 - 5.5} y="5.5" width="11" height="2.2" rx="1.1" fill="#0a0d0f" stroke="#3a4147" strokeWidth="0.5" />
            <rect x="3" y="2.6" width={SFP_W - 6} height="1.4" rx="0.7" fill="#6a7178" opacity="0.5" />
          </symbol>
          <symbol id={`sfpFiber-${uid}`} viewBox={`0 0 ${SFP_W} ${SFP_H}`}>
            <g filter={`url(#sfpShadow-${uid})`}>
              <rect x="0.5" y="0.5" width={SFP_W - 1} height={SFP_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
              <rect x="3.5" y="4" width={SFP_W - 7} height={SFP_H - 8} rx="2" fill={`url(#sfpBody-${uid})`} stroke="#1b2024" strokeWidth="0.8" />
              <rect x="5" y="5.4" width={SFP_W - 10} height="1.6" rx="0.8" fill="#e8edf1" opacity="0.55" />
              <rect x="5" y="4.2" width={SFP_W - 10} height="3.4" rx="1.4" fill="var(--bail)" opacity="0.92" />
              <g>
                <rect x={SFP_W / 2 - 9} y={SFP_H / 2 - 3.5} width="8" height="9" rx="1.6" fill="#0d1319" stroke="#454d54" strokeWidth="0.7" />
                <circle cx={SFP_W / 2 - 5} cy={SFP_H / 2 + 1} r="2.6" fill={`url(#bore-${uid})`} />
                <rect x={SFP_W / 2 + 1} y={SFP_H / 2 - 3.5} width="8" height="9" rx="1.6" fill="#0d1319" stroke="#454d54" strokeWidth="0.7" />
                <circle cx={SFP_W / 2 + 5} cy={SFP_H / 2 + 1} r="2.6" fill={`url(#bore-${uid})`} />
              </g>
              <rect x="5" y={SFP_H - 8.5} width={SFP_W - 10} height="3" rx="0.6" fill="#c9ccce" opacity="0.85" />
            </g>
          </symbol>
          <symbol id={`sfpDac-${uid}`} viewBox={`0 0 ${SFP_W} ${SFP_H}`}>
            <g filter={`url(#sfpShadow-${uid})`}>
              <rect x="0.5" y="0.5" width={SFP_W - 1} height={SFP_H - 1} rx="2.5" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="1" />
              <rect x="3.5" y="4" width={SFP_W - 7} height={SFP_H - 8} rx="2" fill={`url(#sfpBody-${uid})`} stroke="#1b2024" strokeWidth="0.8" />
              <rect x="5" y="5.4" width={SFP_W - 10} height="1.6" rx="0.8" fill="#e8edf1" opacity="0.5" />
              <rect x={SFP_W / 2 - 6} y={SFP_H / 2 - 4} width="12" height="12" rx="2.4" fill={`url(#sfpBoot-${uid})`} stroke="#05070a" strokeWidth="0.6" />
              {[0, 1, 2].map((i) => (
                <rect key={i} x={SFP_W / 2 - 5} y={SFP_H / 2 - 2.4 + i * 3} width="10" height="1" rx="0.5" fill="#000" opacity="0.35" />
              ))}
            </g>
          </symbol>
        </defs>

        {/* chassis body (inset between the two mounting blades) */}
        <g filter={`url(#ao-${uid})`}>
          <rect x={chassisX} y="1" width={chassisW} height={totalH - 2} rx="4" fill={`url(#chassis-${uid})`} stroke="#0c0f11" strokeWidth="1.2" />
          <rect x={chassisX} y="1" width={chassisW} height={totalH - 2} rx="4" fill="transparent" filter={`url(#grain-${uid})`} />
          <rect x={chassisX + 2} y="2.5" width={chassisW - 4} height="2" rx="1" fill="#454b51" opacity="0.55" />
        </g>

        {/* ---- rack-mount blades: fixed 19" span, holes at the OUTER edge ---- */}
        {[0, 1].map((side) => {
          const isLeft = side === 0;
          const bladeX = isLeft ? 0 : totalW - BLADE_W;
          // holes sit near the outer end of the ear (by the rack rail), like the photo
          const holeCx = isLeft ? Math.min(16, BLADE_W / 2) : bladeX + BLADE_W - Math.min(16, BLADE_W / 2);
          const bendX = isLeft ? BLADE_W - 2.5 : bladeX;         // fold line where ear meets chassis
          return (
            <g key={side} filter={`url(#ao-${uid})`}>
              {/* flat flange face */}
              <rect x={bladeX} y="0" width={BLADE_W} height={totalH} rx="2.5"
                fill={`url(#blade-${uid})`} stroke="#0c0f11" strokeWidth="1" />
              {/* brushed vertical striations for realism */}
              <rect x={bladeX} y="1" width={BLADE_W} height={totalH - 2} fill="transparent" filter={`url(#grain-${uid})`} opacity="0.7" />
              {/* folded bend line (L-bracket) */}
              <rect x={bendX} y="4" width="2.5" height={totalH - 8} fill="#4c545b" opacity="0.55" />
              <rect x={isLeft ? BLADE_W - 1 : bladeX + BLADE_W - 1.4} y="4" width="1.2" height={totalH - 8} fill="#05070a" opacity="0.7" />
              {/* two vertically-stacked oval cage-nut slots at the outer edge */}
              {[0.34, 0.66].map((f, i) => (
                <g key={i}>
                  <rect x={holeCx - 4.5} y={totalH * f - 8} width="9" height="16" rx="4.5"
                    fill="#0a0c0e" stroke="#525a61" strokeWidth="1" />
                  <rect x={holeCx - 4.5} y={totalH * f - 8} width="9" height="16" rx="4.5"
                    fill="none" stroke="#02040a" strokeWidth="0.6" opacity="0.85" />
                  {/* rim highlight top-left for a countersunk feel */}
                  <path d={`M ${holeCx - 3} ${totalH * f - 6} a 3 5 0 0 1 3 -2`} fill="none" stroke="#6a727a" strokeWidth="0.8" opacity="0.55" />
                </g>
              ))}
            </g>
          );
        })}

        <Console uid={uid} x={consoleX} h={U_HEIGHT} w={CONSOLE_W} vendor={vendor} model={model} rj45={rj45} sfp={sfp} />

        {/* ---- RJ45 copper ports (stacked pairs, blocked) ---- */}
        {rjPorts.map((n) => {
          const { x, y, row, single } = rjPos(n);
          const d = data[`rj45:${n}`] || {};
          const connected = d.status === "connected";
          const linkState = d.linkColor || speedToState(d.link, d.status);
          const actState = connected ? "greenBlink" : "off";
          // single row: all jacks face up, LEDs on top edge; stacked: mirror per row
          const sym = single ? `rj45up-${uid}` : row === 0 ? `rj45up-${uid}` : `rj45dn-${uid}`;
          const ledY = single ? 5 : row === 0 ? 5 : RJ_H - 5;
          return (
            <g key={`rj${n}`} transform={`translate(${x} ${y})`}
              onMouseEnter={() => setHover({ kind: "rj45", n })} onMouseLeave={() => setHover(null)}
              onClick={() => onPortClick && onPortClick("rj45", n, d)}
              tabIndex={0} role="button" aria-label={`RJ45 port ${n}`}
              data-port={n} data-kind="rj45" data-speed={d.speed || ""} data-link={d.link || ""}
              data-status={d.status || ""} data-device={d.device || ""} data-vlan={d.vlan || ""} data-mac={d.mac || ""}
              style={{ cursor: "pointer", outline: "none" }}>
              <use href={`#${sym}`} width={RJ_W} height={RJ_H} />
              <Led uid={uid} cx={6} cy={ledY} state={linkState} r={1.4} />
              <Led uid={uid} cx={RJ_W - 6} cy={ledY} state={actState} r={1.4} />
              <rect className={`hov-${uid}`} x="0" y="0" width={RJ_W} height={RJ_H} rx="2.5" fill="#37b6ff" opacity="0" pointerEvents="none" />
            </g>
          );
        })}

        {/* port-number labels: single row → all below; stacked → odd above, even below */}
        {rjPorts.map((n) => {
          const { x, y, row, single } = rjPos(n);
          const labelY = single ? y + RJ_H + 11 : row === 0 ? y - 4 : y + RJ_H + 11;
          return (
            <text key={`lbl${n}`} x={x + RJ_W / 2} y={labelY}
              textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#aeb6bd" pointerEvents="none">{n}</text>
          );
        })}

        {/* ---- SFP uplink group ---- */}
        {sfp > 0 && (
          <>
            <line x1={sfpX - SECTION_GAP / 2} y1={20} x2={sfpX - SECTION_GAP / 2} y2={U_HEIGHT - 20} stroke="#3a4147" strokeWidth="1" opacity="0.5" />
            <text x={sfpX} y={sfpTop - 9} fontSize="8" fill="#7b838a" letterSpacing="1.4">SFP UPLINK</text>
            {Array.from({ length: sfp }, (_, i) => i + 1).map((n) => {
              const x = sfpX + (n - 1) * (SFP_W + SFP_GAP_X);
              const d = data[`sfp:${n}`] || {};
              const connected = d.status === "connected";
              const linkState = d.linkColor || speedToState(d.link, d.status);
              const actState = connected ? "greenBlink" : "off";
              const mod = d.module === undefined ? (connected ? "fiber" : null) : d.module;
              const moduleId = mod === "dac" ? `sfpDac-${uid}` : mod ? `sfpFiber-${uid}` : `sfpCage-${uid}`;
              const bail = d.speed && d.speed.startsWith("25") ? "#37b6ff"
                : d.speed && d.speed.startsWith("10") ? "#39ff8a" : "#ffb020";
              const label = rj45 + n;
              return (
                <g key={`sfp${n}`} transform={`translate(${x} ${sfpTop})`}
                  onMouseEnter={() => setHover({ kind: "sfp", n })} onMouseLeave={() => setHover(null)}
                  onClick={() => onPortClick && onPortClick("sfp", n, d)}
                  tabIndex={0} role="button" aria-label={`SFP port ${label}`}
                  data-port={label} data-kind="sfp" data-speed={d.speed || ""} data-link={d.link || ""}
                  data-status={d.status || ""} data-device={d.device || ""} data-vlan={d.vlan || ""} data-mac={d.mac || ""}
                  style={{ cursor: "pointer", outline: "none", "--bail": bail }}>
                  <use href={`#${moduleId}`} width={SFP_W} height={SFP_H} />
                  <Led uid={uid} cx={6.5} cy={SFP_H - 3.2} state={linkState} />
                  <Led uid={uid} cx={SFP_W - 6.5} cy={SFP_H - 3.2} state={actState} />
                  <text x={SFP_W / 2} y={-5.5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#aeb6bd">{label}</text>
                  <rect className={`hov-${uid}`} x="0" y="0" width={SFP_W} height={SFP_H} rx="2.5" fill="#37b6ff" opacity="0" pointerEvents="none" />
                </g>
              );
            })}
          </>
        )}

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
      </svg>

      {tip && <PortTooltip vendor={vendor} model={model} tip={tip} rj45={rj45} />}
    </div>
  );
}

function Led({ uid, cx, cy, state = "off", r = 1.6 }) {
  const base = state.replace("Blink", "");
  const color = LED_COLORS[base] || LED_COLORS.off;
  const on = base !== "off";
  const cls = state.endsWith("Blink") ? `blink-${uid}` : on ? `pulse-${uid}` : "";
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 0.7} fill="#04060a" stroke="#2a3036" strokeWidth="0.4" />
      <circle className={cls} cx={cx} cy={cy} r={r} fill={color}
        filter={on ? `url(#glow-${uid})` : undefined} opacity={on ? 1 : 0.35} />
      {on && <circle cx={cx - 0.4} cy={cy - 0.4} r={r * 0.35} fill="#fff" opacity="0.85" />}
    </g>
  );
}

function Console({ uid, x, w, h, vendor, model, rj45, sfp }) {
  const cy = h / 2;
  const statusLeds = [
    { l: "PWR", s: "green" }, { l: "SYS", s: "greenBlink" },
    { l: "ALM", s: "off" }, { l: "LOC", s: "blue" },
  ];
  return (
    <g transform={`translate(${x} 0)`}>
      {statusLeds.map((d, i) => {
        const ly = 20 + i * 22;
        return (
          <g key={d.l}>
            <Led uid={uid} cx={10} cy={ly} state={d.s} />
            <text x={20} y={ly + 3.4} fontSize="8.5" fill="#aeb6bd" letterSpacing="0.6">{d.l}</text>
          </g>
        );
      })}
      {/* Rack Slicer wordmark — the only brand text, laser-etched, top-left */}
      <text x={62} y={cy - 12} fontSize="17" fontWeight="700" fill="#37b6ff" letterSpacing="1.5">RACK SLICER</text>
      <text x={62} y={cy + 5} fontSize="9" fill="#8b939a" letterSpacing="1.2">{model}</text>
      <rect x={62} y={cy + 12} width="112" height="1" fill="#3a4147" />
      <text x={62} y={cy + 25} fontSize="7" fill="#5b636a" letterSpacing="1.2">
        {`${rj45}× RJ45${sfp ? ` + ${sfp}× SFP` : ""} • 1U`}
      </text>
      {/* console I/O — lower-right band, below the wordmark, clear of all text */}
      <g transform={`translate(${w - 110} ${cy + 6})`}>
        <rect x="0" y="0" width="24" height="9" rx="4.5" fill="#0a0d0f" stroke="#3a4147" strokeWidth="0.8" />
        <rect x="3" y="2.9" width="18" height="3.2" rx="1.6" fill="#2a3036" />
        <text x="12" y="18" fontSize="6" textAnchor="middle" fill="#7b838a" letterSpacing="0.6">USB-C</text>
      </g>
      <Rj45Console uid={uid} x={w - 72} y={cy + 4} label="CONSOLE" />
      <g transform={`translate(${w - 22} ${cy + 11})`}>
        <circle cx="0" cy="0" r="3.4" fill="#0a0d0f" stroke="#3a4147" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="1.1" fill="#02040a" />
        <text x="0" y="14" fontSize="6" textAnchor="middle" fill="#7b838a" letterSpacing="0.6">RST</text>
      </g>
    </g>
  );
}

function Rj45Console({ uid, x, y, label }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="26" height="18" rx="1.6" fill={`url(#cage-${uid})`} stroke="#05070a" strokeWidth="0.9" />
      <rect x="2" y="2" width="22" height="14" rx="1" fill={`url(#cageInner-${uid})`} filter={`url(#innerShadow-${uid})`} />
      <path d="M9 2 h8 v4 h-2 v-2 h-4 v2 h-2 z" fill="#04060a" />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={4 + i * 2.3} y="4.5" width="1.3" height="4" fill="#c9a24b" opacity="0.8" />
      ))}
      <text x="13" y="26" fontSize="6.5" textAnchor="middle" fill="#7b838a" letterSpacing="0.6">{label}</text>
    </g>
  );
}

function PortTooltip({ tip, vendor, model, rj45 }) {
  const displayNum = tip.kind === "sfp" ? rj45 + tip.n : tip.n;
  const rows = [
    ["Type", tip.kind === "sfp" ? "SFP fiber/DAC" : "RJ45 copper"],
    ["Device", tip.device || "—"],
    ["Speed", tip.speed || "—"],
    ["Status", tip.status || "disconnected"],
    ["VLAN", tip.vlan != null ? tip.vlan : "—"],
    ["MAC", tip.mac || "—"],
  ];
  return (
    <div role="status" style={{
      position: "absolute", top: 8, right: 8, minWidth: 218,
      background: "rgba(14,17,20,0.96)", border: "1px solid #2c3237", borderRadius: 8,
      padding: "10px 12px", color: "#dfe5ea", fontSize: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", pointerEvents: "none",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, letterSpacing: 0.4 }}>
        Port {displayNum}
        <span style={{ float: "right", color: "#7b838a", fontWeight: 400 }}>{vendor} {model}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
          <span style={{ color: "#8b939a" }}>{k}</span>
          <span style={{ fontFamily: "'Share Tech Mono',monospace" }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function makeData(rj45, sfp) {
  const out = {};
  const devices = ["Dell R770", "Proxmox Node", "Ceph OSD", "AP-515", "IP Phone", "NVR", "Uplink"];
  for (let n = 1; n <= rj45; n++) {
    const connected = n % 3 !== 0;
    out[`rj45:${n}`] = connected
      ? { speed: "2.5GbE", link: "up", status: "connected",
          device: devices[n % devices.length], vlan: 10 + (n % 8) * 10,
          mac: `E8:DE:27:${(n * 5 % 256).toString(16).padStart(2, "0").toUpperCase()}:1A:${(n % 256).toString(16).padStart(2, "0").toUpperCase()}` }
      : { link: "down", status: "disconnected" };
  }
  for (let n = 1; n <= sfp; n++) {
    out[`sfp:${n}`] = { speed: "10GbE", link: "up", status: "connected",
      module: n === 2 ? "dac" : "fiber", device: "Core / Aggregation", vlan: 999,
      mac: `AC:1F:6B:${(n * 9 % 256).toString(16).padStart(2, "0").toUpperCase()}:2E:0${n}` };
  }
  return out;
}

// rjRows: 1 = single horizontal line; 2 = stacked (4x2) pairs.
const VARIANTS = [
  { rj45: 8,  sfp: 2, cpb: 4, rows: 1, model: "RS-800M" },
  { rj45: 12, sfp: 2, cpb: 4, rows: 2, model: "RS-1200M" },
  { rj45: 16, sfp: 2, cpb: 4, rows: 2, model: "RS-1600M" },
  { rj45: 24, sfp: 4, cpb: 4, rows: 2, model: "RS-SG2424" },
  { rj45: 48, sfp: 4, cpb: 4, rows: 2, model: "RS-6300M-48" },
  { rj45: 0,  sfp: 12, cpb: 4, rows: 2, model: "RS-4112F" },
];

export default function App() {
  const [idx, setIdx] = useState(0);
  const v = VARIANTS[idx];
  const data = useMemo(() => makeData(v.rj45, v.sfp), [v.rj45, v.sfp]);
  const [clicked, setClicked] = useState(null);
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(120% 120% at 50% 0%, #171b20 0%, #0c0e11 60%, #070809 100%)",
      padding: "28px 20px", color: "#dfe5ea", fontFamily: "'Roboto Condensed','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1360, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 4, color: "#37b6ff", fontWeight: 700 }}>RACK SLICER</div>
            <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: 0.5 }}>Fixed 1U — 8-Port Single Line</h1>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VARIANTS.map((x, i) => (
              <button key={i} onClick={() => setIdx(i)} style={{
                background: i === idx ? "#37b6ff" : "#1a1f24", color: i === idx ? "#04121c" : "#aeb6bd",
                border: "1px solid " + (i === idx ? "#37b6ff" : "#2c3237"), borderRadius: 6,
                padding: "6px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {x.rj45 ? `${x.rj45}+${x.sfp}` : `${x.sfp} SFP`}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 22, borderRadius: 12, overflow: "hidden", border: "1px solid #23282c",
          background: "linear-gradient(180deg,#101317,#0a0c0e)" }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            <RackRail side="left" />
            <div style={{ flex: 1, padding: "22px 0", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%" }}>
                <RackSwitch rj45={v.rj45} sfp={v.sfp} colsPerBlock={v.cpb} rjRows={v.rows} model={v.model}
                  data={data} onPortClick={(kind, n, d) => setClicked({ kind, n, ...d })} />
              </div>
            </div>
            <RackRail side="right" />
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: "#8b939a", lineHeight: 1.6 }}>
          The 8-port model now lays its ports out in a single 1×8 line (grouped 4+4), like compact desktop/rack switches.
          12, 16, 24 and 48-port models keep the stacked (4×2) blocks. Every unit still spans the same fixed 1U width with
          ears filling the remainder. Pass <code>rjRows={"{1}"}</code> for a single line, <code>rjRows={"{2}"}</code> for stacked.
          {clicked && (<span style={{ color: "#37b6ff" }}>
            {"  "}Selected {clicked.kind} port: {clicked.device || "empty"} {clicked.speed ? `· ${clicked.speed}` : ""}
          </span>)}
        </div>
      </div>
    </div>
  );
}

function RackRail({ side }) {
  return (
    <div style={{ width: 24, background: "linear-gradient(90deg,#20242a,#171a1e)", position: "relative",
      borderLeft: side === "right" ? "1px solid #2c3237" : "none",
      borderRight: side === "left" ? "1px solid #2c3237" : "none" }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} style={{ position: "absolute", left: side === "left" ? "auto" : 6, right: side === "left" ? 6 : "auto",
          top: `${8 + i * 11}%`, width: 6, height: 9, borderRadius: 2,
          background: "#0a0c0e", border: "1px solid #3a4147" }} />
      ))}
    </div>
  );
}
