import React, { useState, useId } from "react";

/**
 * RackFortiGate — white enterprise firewall faceplate (FortiGate 400F style).
 *
 * Light chassis, zoned 2-row port layout (odd top / even bottom), red brand mark.
 * Zones are configurable; each zone is a contiguous run of stacked port pairs.
 *
 * <RackFortiGate
 *   model="FortiGate 400F"
 *   zones={[
 *     { label: ["HA","MGMT"], kind:"rj45", count:2, state:"up" },
 *     { label:"1-16",  kind:"rj45", count:16, state:"up" },
 *     { label:"X1-X8", kind:"sfp",  count:8,  state:"down", prefix:"X" },
 *     { label:"17-24", kind:"rj45", count:8,  state:"down", start:17 },
 *   ]}
 * />
 */

const PORT_W = 26, PORT_H = 20, PAIR_GAP = 6, COL_GAP = 5, ZONE_GAP = 26;
const ROW_LABEL_H = 16;

// light palette
const C = {
  chassis0: "#ffffff", chassis1: "#f4f5f7", chassisEdge: "#d4d7dc",
  ear: "#eceef1", earEdge: "#cfd3d9",
  portUpFill: "#e9f7ee", portUpEdge: "#2e9e5b", portUpTab: "#37b26a",
  portDownFill: "#eef0f3", portDownEdge: "#b6bcc4", portDownTab: "#c2c8d0",
  sfpFill: "#e7eaee", sfpEdge: "#aab1ba",
  text: "#3a3f46", textMute: "#8a9099", label: "#5a616a",
  red: "#e01e2b",
};

function Rj45({ x, y, up, uid }) {
  const fill = up ? C.portUpFill : C.portDownFill;
  const edge = up ? C.portUpEdge : C.portDownEdge;
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* housing */}
      <rect x="0" y="0" width={PORT_W} height={PORT_H} rx="2.5" fill={fill} stroke={edge} strokeWidth="1.1" />
      <rect x="1.4" y="1.4" width={PORT_W - 2.8} height={PORT_H - 2.8} rx="1.8" fill="none" stroke={edge} strokeWidth="0.6" opacity="0.5" />
      {/* keystone mouth (detailed, like the switch jacks) */}
      <g transform={`translate(${PORT_W / 2} ${PORT_H / 2 + 1.5})`}>
        <path d="M-8 -7 h16 v9 a1.6 1.6 0 0 1 -1.6 1.6 h-3.2 v-2.6 a1.4 1.4 0 0 0 -1.4 -1.4 h-3.6 a1.4 1.4 0 0 0 -1.4 1.4 v2.6 h-3.2 a1.6 1.6 0 0 1 -1.6 -1.6 z"
          fill={`url(#rjmouth-${uid})`} stroke={edge} strokeWidth="0.7" filter={`url(#wjackShadow-${uid})`} />
        {/* recessed top */}
        <rect x="-6.4" y="-5.6" width="12.8" height="5.4" rx="0.8" fill="#f5efe0" opacity="0.7" />
        {/* 8 gold contact pins */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={-5.9 + i * 1.5} y="-5.6" width="0.9" height="4" fill={`url(#wgold-${uid})`} rx="0.25" />
        ))}
      </g>
      {/* link LED corner */}
      <circle cx={PORT_W - 4} cy={PORT_H - 4} r="1.4" fill={up ? "#2e9e5b" : "#cfd3d9"} />
    </g>
  );
}

function Sfp({ x, y, up }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width={PORT_W} height={PORT_H} rx="2.5" fill={up ? "#e9f7ee" : C.sfpFill} stroke={up ? C.portUpEdge : C.sfpEdge} strokeWidth="1.1" />
      {/* cage slot */}
      <rect x="3.5" y="4" width={PORT_W - 7} height={PORT_H - 8} rx="1.2" fill="#dfe3e8" stroke={up ? C.portUpEdge : C.sfpEdge} strokeWidth="0.8" opacity={up ? 0.9 : 1} />
      {/* inner opening */}
      <rect x="6" y="6.5" width={PORT_W - 12} height={PORT_H - 13} rx="0.8" fill="#c7cdd4" />
      <circle cx={PORT_W - 4} cy={PORT_H - 4} r="1.4" fill={up ? "#2e9e5b" : "#cfd3d9"} />
    </g>
  );
}

function RackFortiGate({
  model = "FortiGate 400F",
  zones = defaultZones(),
  data = {},
  onPortClick,
}) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState(null);

  // layout math: each zone is N ports in pairs → ceil(N/2) columns
  const brandW = 150;
  const padL = 20, padR = 20, padY = 16;

  let cursor = brandW + 20;
  const placed = [];
  zones.forEach((z, zi) => {
    const cols = Math.ceil(z.count / 2);
    const startX = cursor;
    for (let i = 0; i < z.count; i++) {
      const col = Math.floor(i / 2);
      const row = i % 2;                       // 0 top (odd), 1 bottom (even)
      const x = startX + col * (PORT_W + COL_GAP);
      placed.push({ zi, i, x, row, zone: z });
    }
    const zoneW = cols * PORT_W + (cols - 1) * COL_GAP;
    cursor = startX + zoneW + ZONE_GAP;
  });

  const portsW = cursor - ZONE_GAP;
  const totalW = portsW + padR + 20;
  const rowsH = PORT_H * 2 + PAIR_GAP;
  const totalH = padY * 2 + ROW_LABEL_H + rowsH + ROW_LABEL_H + 8;
  const topRowY = padY + ROW_LABEL_H;
  const botRowY = topRowY + PORT_H + PAIR_GAP;

  // rack ears (light)
  const EAR = 30;
  const fullW = totalW + EAR * 2;

  const globalLabel = (z, i) => {
    if (Array.isArray(z.label)) return null;   // HA/MGMT handled per-row
    const start = z.start || parseInt(String(z.label).split("-")[0]) || 1;
    const prefix = z.prefix || "";
    return `${prefix}${start + i}`;
  };

  let tip = null;
  if (hover) tip = { ...hover };

  return (
    <div style={{ position: "relative", width: "100%", fontFamily: "'Inter','Segoe UI',Arial,sans-serif" }}>
      <svg viewBox={`0 0 ${fullW} ${totalH}`} width="100%" role="img"
        aria-label={`${model} firewall`} style={{ display: "block", userSelect: "none" }}>
        <defs>
          <linearGradient id={`wchassis-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#f6f7f9" /><stop offset="1" stopColor="#eceef1" />
          </linearGradient>
          <linearGradient id={`wear-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f2f4f6" /><stop offset="1" stopColor="#e2e5e9" />
          </linearGradient>
          <linearGradient id={`rjmouth-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbfaf5" /><stop offset="0.5" stopColor="#efe9da" /><stop offset="1" stopColor="#d8d1bf" />
          </linearGradient>
          <linearGradient id={`wgold-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6d98a" /><stop offset="0.5" stopColor="#d4ad5a" /><stop offset="1" stopColor="#a07f2e" />
          </linearGradient>
          <filter id={`wjackShadow-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feOffset dx="0" dy="0.6" /><feGaussianBlur stdDeviation="0.7" result="o" />
            <feComposite in="SourceGraphic" in2="o" operator="out" result="inv" />
            <feColorMatrix in="inv" type="matrix" values="0 0 0 0 0.4  0 0 0 0 0.38  0 0 0 0 0.33  0 0 0 0.5 0" result="sh" />
            <feComposite in="sh" in2="SourceGraphic" operator="in" />
          </filter>
          <filter id={`wsh-${uid}`} x="-10%" y="-20%" width="120%" height="150%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#9aa0a8" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* rack ears */}
        {[0, 1].map((s) => {
          const x = s === 0 ? 0 : fullW - EAR;
          const hx = s === 0 ? EAR / 2 : x + EAR / 2;
          return (
            <g key={s} filter={`url(#wsh-${uid})`}>
              <rect x={x} y="2" width={EAR} height={totalH - 4} rx="3" fill={`url(#wear-${uid})`} stroke={C.earEdge} strokeWidth="1" />
              {[0.28, 0.72].map((f, i) => (
                <g key={i}>
                  <ellipse cx={hx} cy={totalH * f} rx="4.5" ry="6" fill="#fff" stroke={C.earEdge} strokeWidth="1" />
                  <ellipse cx={hx} cy={totalH * f} rx="2" ry="3.2" fill="#d7dbe0" />
                </g>
              ))}
            </g>
          );
        })}

        {/* chassis */}
        <g transform={`translate(${EAR} 0)`} filter={`url(#wsh-${uid})`}>
          <rect x="0" y="2" width={totalW} height={totalH - 4} rx="6" fill={`url(#wchassis-${uid})`} stroke={C.chassisEdge} strokeWidth="1.2" />

          {/* brand — a neutral mark; the label text is whatever `model` is set to */}
          <g transform={`translate(${padL} ${totalH / 2})`}>
            <g transform="translate(0 -9)">
              <rect x="0" y="0" width="18" height="18" rx="3" fill="#2a2f36" />
              <path d="M4 13 L8 5 L10 5 L14 13 L11.6 13 L10.8 11 L7.2 11 L6.4 13 Z" fill="#fff" />
            </g>
            <text x="26" y="2" fontSize="14" fontWeight="700" fill={C.text} letterSpacing="0.2">{model}</text>
            <text x="26" y="16" fontSize="8.5" fontWeight="600" fill={C.textMute} letterSpacing="0.3">ENTERPRISE FIREWALL</text>
          </g>

          {/* ports + labels */}
          {placed.map((p) => {
            const z = p.zone;
            const y = p.row === 0 ? topRowY : botRowY;
            const px = p.x - EAR; // chassis-local
            const up = z.state === "up";
            const isSfp = z.kind === "sfp";
            const n = globalLabel(z, p.i);
            const rowLabelPair = Array.isArray(z.label) ? z.label : null;
            return (
              <g key={`${p.zi}-${p.i}`}
                onMouseEnter={() => setHover({ zone: z.label, n: n || (rowLabelPair ? rowLabelPair[p.row] : ""), kind: z.kind, up })}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPortClick && onPortClick(z, p.i)}
                tabIndex={0} role="button"
                aria-label={`${isSfp ? "SFP" : "RJ45"} ${n || ""}`}
                style={{ cursor: "pointer", outline: "none" }}>
                {isSfp ? <Sfp x={px} y={y} up={up} /> : <Rj45 x={px} y={y} up={up} uid={uid} />}
                {/* per-column number: odd above top row, even below bottom row */}
                {p.i % 2 === 0 && (
                  <text x={px + PORT_W / 2} y={topRowY - 5} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={C.label}>
                    {rowLabelPair ? rowLabelPair[0] : globalLabel(z, p.i)}
                  </text>
                )}
                {p.i % 2 === 1 && (
                  <text x={px + PORT_W / 2} y={botRowY + PORT_H + 11} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={C.label}>
                    {rowLabelPair ? rowLabelPair[1] : globalLabel(z, p.i)}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        <style>{`
          g[role="button"]:hover rect:first-of-type{ filter: brightness(0.97); }
        `}</style>
      </svg>

      {tip && (
        <div role="status" style={{
          position: "absolute", top: 6, right: 6, background: "#fff", color: "#3a3f46",
          border: "1px solid #d4d7dc", borderRadius: 8, padding: "8px 11px", fontSize: 12,
          boxShadow: "0 6px 20px rgba(120,130,140,0.25)", pointerEvents: "none", minWidth: 150,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 3 }}>Port {tip.n}</div>
          <div style={{ color: "#8a9099" }}>{tip.kind === "sfp" ? "SFP / SFP+" : "GE RJ45"} · {tip.up ? "Link Up" : "Down"}</div>
        </div>
      )}
    </div>
  );
}

function defaultZones() {
  return [
    { label: ["HA", "MGMT"], kind: "rj45", count: 2, state: "up" },
    { label: "1-16", kind: "rj45", count: 16, state: "up", start: 1 },
    { label: "X1-X8", kind: "sfp", count: 8, state: "up", prefix: "X", start: 1 },
    { label: "17-24", kind: "rj45", count: 8, state: "up", start: 17 },
  ];
}

export default function App() {
  // model is user-supplied — set it to whatever device the diagram documents
  const [name, setName] = useState("FortiGate 400F");
  return (
    <div style={{ minHeight: "100vh", background: "#e8ebee", padding: "40px 24px", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#2a2f36" }}>Enterprise Firewall — White Faceplate</h1>
        <label style={{ fontSize: 13, color: "#5a616a" }}>Device label:&nbsp;
          <input value={name} onChange={(e) => setName(e.target.value)}
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #c8ccd2", fontSize: 13 }} />
        </label>
        <div style={{ marginTop: 16, background: "#f6f7f9", border: "1px solid #dfe2e6", borderRadius: 12, padding: "24px 20px" }}>
          <RackFortiGate model={name} />
        </div>
        <div style={{ marginTop: 14, fontSize: 13, color: "#6a727a" }}>
          All ports active (green link). Detailed keystone RJ45 jacks with gold contacts (same style as the switches).
          The label above is a free-text field — type any device name and it appears on the chassis.
        </div>
      </div>
    </div>
  );
}
