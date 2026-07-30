/**
 * PDUConfigurator.jsx
 * ────────────────────────────────────────────────────────────────────────────
 * Single-file drop-in React component for Rack Slicer.
 * Contains the entire framework-agnostic PDU engine + configurator UI in one
 * file with zero external dependencies (React only).
 *
 *   import PDUConfigurator from './PDUConfigurator';
 *   <PDUConfigurator />
 *
 * Uses inline <style> so it drops into any React app without CSS setup.
 * ────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useMemo, useCallback } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — plugin registry
   ═══════════════════════════════════════════════════════════════════════════ */

const _reg = { manufacturer: new Map(), socket: new Map(), plug: new Map() };
const registerPlugin = (kind, p) => { _reg[kind].set(p.key, p); return p; };
const getPlugin = (kind, k) => { const v = _reg[kind].get(k); if (!v) throw new Error(`No ${kind} '${k}'`); return v; };
const hasPlugin = (kind, k) => _reg[kind].has(k);
const listPlugins = (kind) => Array.from(_reg[kind]?.values() ?? []);
const plugsForVoltage = (v) => listPlugins('plug').filter(p => !p.voltages || p.voltages.includes(v));

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — finishes and shared SVG defs
   ═══════════════════════════════════════════════════════════════════════════ */

const FINISH = {
  'ral9005-texture': { hi:'#2a2a2a', mid:'#0f0f0f', lo:'#050505', text:'#e8eaec', texture:true },
  black:             { hi:'#3a3d40', mid:'#1c1e20', lo:'#0d0e10', text:'#e8eaec' },
  darkGrey:          { hi:'#54585c', mid:'#33373b', lo:'#1e2124', text:'#f0f2f4' },
  lightGrey:         { hi:'#c8ccd0', mid:'#a4a9ae', lo:'#7d8287', text:'#1a1c1e' },
  white:             { hi:'#ffffff', mid:'#eceef0', lo:'#c9cccf', text:'#1a1c1e' },
  brushedAluminium:  { hi:'#e8eaec', mid:'#c9ccce', lo:'#9fa3a6', text:'#1a1c1e' },
};

function finishFor(c) {
  if (c.enclosure?.finish === 'customRal') {
    const hex = c.enclosure.customHex || '#1a1a1a';
    return { hi: shade(hex, 0.25), mid: hex, lo: shade(hex, -0.35),
             text: isDark(hex) ? '#e8eaec' : '#1a1c1e' };
  }
  return FINISH[c.enclosure?.finish] ?? FINISH['ral9005-texture'];
}
function shade(hex, p) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = x => Math.max(0, Math.min(255, Math.round(x + (p > 0 ? 255 - x : x) * p)));
  return '#' + [f(r), f(g), f(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 128;
}

function sharedDefs(finish, textured) {
  const t = textured ? `
    <filter id="rspdu-texture" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="1" seed="7"/>
      <feColorMatrix values="0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0 0.06  0 0 0 0.35 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge>
    </filter>` : '';
  return `<defs>
    <linearGradient id="rspdu-chassisFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${finish.hi}"/><stop offset="0.1" stop-color="${finish.mid}"/>
      <stop offset="0.9" stop-color="${finish.mid}"/><stop offset="1" stop-color="${finish.lo}"/>
    </linearGradient>
    <linearGradient id="rspdu-chassisSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${finish.lo}"/><stop offset="0.15" stop-color="${finish.mid}"/>
      <stop offset="0.85" stop-color="${finish.mid}"/><stop offset="1" stop-color="${finish.lo}"/>
    </linearGradient>
    <linearGradient id="rspdu-brushed" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c9ccce"/><stop offset="0.5" stop-color="#e8eaec"/>
      <stop offset="0.51" stop-color="#b9bdc0"/><stop offset="1" stop-color="#d4d7d9"/>
    </linearGradient>
    <radialGradient id="rspdu-socketPitDark" cx="0.5" cy="0.4" r="0.75">
      <stop offset="0" stop-color="#242527"/><stop offset="0.6" stop-color="#0a0b0c"/>
      <stop offset="1" stop-color="#020203"/>
    </radialGradient>
    <linearGradient id="rspdu-pinBrass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4e2a1"/><stop offset="1" stop-color="#a9871f"/>
    </linearGradient>
    <linearGradient id="rspdu-guardPlastic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f7fa" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="#c8d4de" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#8ea0b0" stop-opacity="0.75"/>
    </linearGradient>
    <linearGradient id="rspdu-mcbBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3d40"/><stop offset="1" stop-color="#141516"/>
    </linearGradient>
    <linearGradient id="rspdu-mcbToggle" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f5f5f5"/><stop offset="1" stop-color="#b8b8b8"/>
    </linearGradient>
    <linearGradient id="rspdu-cordJacket" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2a2a"/><stop offset="0.5" stop-color="#0f0f0f"/>
      <stop offset="1" stop-color="#050505"/>
    </linearGradient>
    <filter id="rspdu-softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000" flood-opacity="0.55"/>
    </filter>
    <filter id="rspdu-ledGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    ${t}
    <symbol id="rspdu-screw" viewBox="0 0 12 12">
      <circle cx="6" cy="6" r="5.5" fill="#2a2c2e" stroke="#0c0d0e" stroke-width="0.6"/>
      <circle cx="6" cy="6" r="5.5" fill="url(#rspdu-chassisFace)" opacity="0.5"/>
      <path d="M6 2.2 V9.8 M2.2 6 H9.8" stroke="#0a0b0c" stroke-width="1.1"/>
      <circle cx="4.4" cy="4.4" r="1.4" fill="#fff" opacity="0.2"/>
    </symbol>
  </defs>`;
}

const screw = (x, y, r = 3) =>
  `<use href="#rspdu-screw" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}"/>`;

function led(x, y, state = 'power', r = 3) {
  const C = { power:'#37e07a', network:'#37b6ff', alarm:'#ff4d4d', outlet:'#ffd23f', rgb:'#c837ff', off:'#2a2c2e' };
  const c = C[state] ?? C.power;
  return `<circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="${c}" opacity="0.22"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#000" stroke-width="0.4"/>
    <circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.35}" fill="#fff" opacity="0.75"/>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — 7-segment LED digit renderer (real polygon geometry)
   ═══════════════════════════════════════════════════════════════════════════ */

const SEG_MAP = {
  '0':'abcdef', '1':'bc', '2':'abged', '3':'abgcd', '4':'fgbc',
  '5':'afgcd', '6':'afgecd', '7':'abc', '8':'abcdefg', '9':'abcfgd',
  '-':'g', ' ':'', '.':'', 'E':'adefg', 'r':'eg',
};

function sevenSeg(x, y, size, char, on, off) {
  const w = size * 0.58, h = size, t = size * 0.14, g = size * 0.03;
  const active = SEG_MAP[char] ?? '';
  if (char === '.') return `<circle cx="${x + t * 0.8}" cy="${y + h - t * 0.6}" r="${t * 0.7}" fill="${on}"/>`;
  const pts = {
    a:[x+t*0.6, y,           x+w-t*0.6, y          ],
    b:[x+w,     y+t*0.6,     x+w,       y+h/2-g    ],
    c:[x+w,     y+h/2+g,     x+w,       y+h-t*0.6  ],
    d:[x+t*0.6, y+h,         x+w-t*0.6, y+h        ],
    e:[x,       y+h/2+g,     x,         y+h-t*0.6  ],
    f:[x,       y+t*0.6,     x,         y+h/2-g    ],
    g:[x+t*0.6, y+h/2,       x+w-t*0.6, y+h/2      ],
  };
  const seg = id => {
    const [x1, y1, x2, y2] = pts[id];
    const fill = active.includes(id) ? on : off;
    if (y1 === y2) return `<polygon points="${x1},${y1} ${x1+t*0.6},${y1-t*0.5} ${x2-t*0.6},${y1-t*0.5} ${x2},${y1} ${x2-t*0.6},${y1+t*0.5} ${x1+t*0.6},${y1+t*0.5}" fill="${fill}"/>`;
    return `<polygon points="${x1},${y1} ${x1+t*0.5},${y1+t*0.6} ${x1+t*0.5},${y2-t*0.6} ${x1},${y2} ${x1-t*0.5},${y2-t*0.6} ${x1-t*0.5},${y1+t*0.6}" fill="${fill}"/>`;
  };
  return 'abcdefg'.split('').map(seg).join('');
}

function sevenSegNumber(x, y, size, text, on, off) {
  const digitW = size * 0.58, gap = size * 0.14;
  let cx = x;
  const parts = [];
  for (const ch of text) {
    if (ch === '.') { parts.push(sevenSeg(cx - digitW * 0.15, y, size, '.', on, off)); cx += digitW * 0.3; }
    else            { parts.push(sevenSeg(cx, y, size, ch, on, off)); cx += digitW + gap; }
  }
  return { svg: parts.join(''), width: cx - x - gap };
}

function formatPower(watts) {
  if (watts < 10000)  return { value: String(Math.round(watts)).padStart(4, ' '), unit: 'W' };
  if (watts < 100000) return { value: (watts / 1000).toFixed(2), unit: 'kW' };
  return { value: (watts / 1000).toFixed(1), unit: 'kW' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — component renderers (MCB, meter, ports, cord, labels)
   ═══════════════════════════════════════════════════════════════════════════ */

function mcbGuarded(x, y, curve, current, withGuard) {
  const w = 18, h = 42;
  return `<g transform="translate(${x} ${y})" filter="url(#rspdu-softShadow)">
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="1.2" fill="url(#rspdu-mcbBody)" stroke="#000" stroke-width="0.5"/>
    <rect x="${-w/2+0.8}" y="${-h/2+0.8}" width="${w-1.6}" height="6" rx="0.4" fill="#0a0b0c"/>
    <text x="0" y="${-h/2+5.4}" text-anchor="middle" font-size="4" font-weight="700" font-family="sans-serif" fill="#e8e8e8">${curve}${current}</text>
    <rect x="-3.8" y="-10" width="7.6" height="17" rx="0.8" fill="#0a0b0c"/>
    <rect x="-2.2" y="-8.5" width="4.4" height="7.5" rx="0.8" fill="url(#rspdu-mcbToggle)" stroke="#000" stroke-width="0.3"/>
    <text x="0" y="-3.8" text-anchor="middle" font-size="2.4" font-weight="700" font-family="sans-serif" fill="#000">I</text>
    <text x="0" y="5.2" text-anchor="middle" font-size="2.2" font-weight="700" font-family="sans-serif" fill="#666">O</text>
    ${screw(-5, h/2-3, 1.6)}${screw(5, h/2-3, 1.6)}
    ${screw(-5, -h/2+11, 1.6)}${screw(5, -h/2+11, 1.6)}
    ${withGuard ? `
      <g opacity="0.7">
        <path d="M ${-w/2-1} ${-h/2-1} L ${w/2+1} ${-h/2-1} L ${w/2+1} ${h/2+1} L ${-w/2-1} ${h/2+1} Z"
              fill="url(#rspdu-guardPlastic)" stroke="#7893a8" stroke-width="0.3"/>
        <line x1="${-w/2-1}" y1="${-h/2+1}" x2="${w/2+1}" y2="${-h/2+1}" stroke="#5a6a76" stroke-width="0.25"/>
        <circle cx="${-w/2-1}" cy="${-h/2+1}" r="0.9" fill="#5a6a76"/>
        <circle cx="${w/2+1}" cy="${-h/2+1}" r="0.9" fill="#5a6a76"/>
        <circle cx="0" cy="${h/2-2.5}" r="1" fill="#0a0b0c"/>
      </g>` : ''}
  </g>`;
}

function bigKwMeter(x, y, elec, feats, kind, loadWatts) {
  const w = 50, h = 44;
  const ledOn = kind === 'oled' ? '#4dd8ff' : '#7dff9a';
  const ledOff = kind === 'oled' ? '#0a1a24' : '#0a1e12';
  const ratedW = elec.voltage * elec.currentA;
  const actualW = loadWatts != null ? loadWatts : ratedW * 0.68;
  const loadPct = Math.min(1, actualW / ratedW);
  const alarm = loadPct > 0.9;
  const barColor = alarm ? '#ff5a5a' : ledOn;
  const power = formatPower(actualW);
  const digitSize = 10;
  const mainDigits = sevenSegNumber(x + 4, y + 8, digitSize, power.value, ledOn, ledOff);
  const A = actualW / elec.voltage;
  const vStr = String(elec.voltage), aStr = A.toFixed(1);
  const small = 4.5;
  const vRender = sevenSegNumber(x + 4, y + 26, small, vStr, ledOn, ledOff);
  const aRender = sevenSegNumber(x + w - 5 - (aStr.length * small * 0.72), y + 26, small, aStr, ledOn, ledOff);
  return `<g filter="url(#rspdu-softShadow)">
    <rect x="${x-1.5}" y="${y-1.5}" width="${w+3}" height="${h+3}" rx="3" fill="#0a0b0c" stroke="#000" stroke-width="0.5"/>
    <rect x="${x-1.5}" y="${y-1.5}" width="${w+3}" height="1.4" rx="0.7" fill="#fff" opacity="0.08"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#050707"/>
    <rect x="${x+0.4}" y="${y+0.4}" width="${w-0.8}" height="0.8" rx="0.4" fill="#fff" opacity="0.04"/>
    <text x="${x + w/2}" y="${y + 4.5}" text-anchor="middle" font-size="2.4" font-weight="600" font-family="'Share Tech Mono',monospace" fill="${ledOn}" opacity="0.55">POWER CONSUMPTION</text>
    <g filter="url(#rspdu-ledGlow)">${mainDigits.svg}</g>
    <text x="${x + 4 + mainDigits.width + 3}" y="${y + 8 + digitSize*0.85}" font-size="5" font-weight="700" font-family="'Share Tech Mono',monospace" fill="${ledOn}" filter="url(#rspdu-ledGlow)">${power.unit}</text>
    <line x1="${x+3}" y1="${y+21.5}" x2="${x+w-3}" y2="${y+21.5}" stroke="${ledOff}" stroke-width="0.4"/>
    <g filter="url(#rspdu-ledGlow)">${vRender.svg}</g>
    <text x="${x + 4 + vRender.width + 2}" y="${y + 26 + small*0.85}" font-size="2.6" font-weight="700" font-family="'Share Tech Mono',monospace" fill="${ledOn}" opacity="0.85">V</text>
    <g filter="url(#rspdu-ledGlow)">${aRender.svg}</g>
    <text x="${x + w - 3}" y="${y + 26 + small*0.85}" text-anchor="end" font-size="2.6" font-weight="700" font-family="'Share Tech Mono',monospace" fill="${ledOn}" opacity="0.85">A</text>
    <rect x="${x+3}" y="${y+h-6}" width="${w-6}" height="2.6" rx="0.6" fill="${ledOff}"/>
    <rect x="${x+3}" y="${y+h-6}" width="${(w-6) * loadPct}" height="2.6" rx="0.6" fill="${barColor}" filter="url(#rspdu-ledGlow)" opacity="0.95"/>
    <text x="${x+w/2}" y="${y+h-1.3}" text-anchor="middle" font-size="2.2" font-weight="600" font-family="'Share Tech Mono',monospace" fill="${alarm?'#ff9090':ledOn}" opacity="0.7">LOAD ${Math.round(loadPct*100)}%${alarm?' ⚠':''}</text>
    <circle cx="${x+2.5}" cy="${y+2.5}" r="0.7" fill="#37e07a"/>
    <circle cx="${x+w-2.5}" cy="${y+2.5}" r="0.7" fill="${alarm?'#ff5a5a':'#37b6ff'}"/>
  </g>`;
}

function smallDisplay(x, y, kind, elec, feats) {
  const bg = kind === 'oled' ? '#040608' : '#0d2818';
  const fg = kind === 'oled' ? '#37b6ff' : '#7dfcb0';
  const w = 34, h = 20;
  const lines = [`${elec.voltage}V`];
  if (feats.includes('currentMon') || feats.includes('powerMeter')) lines.push(`${(elec.currentA * 0.68).toFixed(1)}A`);
  if (feats.includes('energyMeter')) lines.push(`${(elec.voltage * elec.currentA * 0.68 / 1000).toFixed(2)}kW`);
  return `<g filter="url(#rspdu-softShadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#0a0b0c" stroke="#000" stroke-width="0.6"/>
    <rect x="${x+1.5}" y="${y+1.5}" width="${w-3}" height="${h-3}" rx="0.8" fill="${bg}"/>
    ${lines.slice(0,4).map((ln, i) => `<text x="${x+w/2}" y="${y+5+i*4}" text-anchor="middle"
      font-size="3.6" font-weight="600" font-family="'Share Tech Mono',monospace" fill="${fg}">${ln}</text>`).join('')}
  </g>`;
}

function netPort(x, y, kind, linked) {
  const spec = {
    rj45:    { w:11, h:9, label:'ETH',   pinFill:'#c8b060' },
    sfp:     { w:14, h:9, label:'SFP',   pinFill:'#3a4d5c' },
    usb:     { w:11, h:5, label:'USB',   pinFill:'#0a0b0c' },
    usbC:    { w:9,  h:4, label:'USB-C', pinFill:'#2a3540' },
    console: { w:11, h:9, label:'CON',   pinFill:'#c8b060' },
    serial:  { w:14, h:6, label:'RS232', pinFill:'#3a4d5c' },
    microUsb:{ w:7,  h:3, label:'µUSB',  pinFill:'#0a0b0c' },
  }[kind] ?? { w:11, h:9, label:kind, pinFill:'#c8b060' };
  const { w, h, label, pinFill } = spec;
  return `<g filter="url(#rspdu-softShadow)">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.8" fill="#0e0f10" stroke="#000" stroke-width="0.5"/>
    <rect x="${x+1}" y="${y+0.8}" width="${w-2}" height="${h-1.6}" rx="${kind==='usbC'?h/2-0.8:0.5}" fill="${pinFill}" opacity="0.9"/>
    ${kind==='rj45' ? `
      <rect x="${x+1.5}" y="${y+1.2}" width="${w-3}" height="1.4" fill="#f4d060" opacity="0.4"/>
      <rect x="${x+w/2-1.2}" y="${y-0.4}" width="2.4" height="1" fill="#0e0f10" stroke="#000" stroke-width="0.3"/>` : ''}
    ${kind==='usbC' ? `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2-1.5}" ry="0.8" fill="#5a6570"/>` : ''}
    ${kind==='sfp' ? `<rect x="${x+w/2-3}" y="${y+h/2-1.5}" width="6" height="3" fill="#050506"/>
      <circle cx="${x+2}" cy="${y+h+2.5}" r="0.9" fill="#37e07a"/>` : ''}
    ${kind==='rj45' && linked ? `<circle cx="${x+2}" cy="${y+h+2.5}" r="0.9" fill="#37e07a"/>
      <circle cx="${x+w-2}" cy="${y+h+2.5}" r="0.9" fill="#ffb040"/>` : ''}
    <text x="${x+w/2}" y="${y+h+5.5}" text-anchor="middle"
      font-size="2.8" font-weight="600" font-family="'Share Tech Mono',monospace" fill="#8b939a">${label}</text>
  </g>`;
}

function wirelessIcon(x, y, kind) {
  if (kind === 'wifi') return `<g transform="translate(${x} ${y})">
    <path d="M -5 3 A 5 5 0 0 1 5 3" fill="none" stroke="#37b6ff" stroke-width="0.9"/>
    <path d="M -3 3 A 3 3 0 0 1 3 3" fill="none" stroke="#37b6ff" stroke-width="0.9"/>
    <circle cx="0" cy="3" r="0.9" fill="#37b6ff"/>
    <text x="0" y="10" text-anchor="middle" font-size="3" font-weight="600" font-family="monospace" fill="#8b939a">WiFi</text>
  </g>`;
  return `<g transform="translate(${x} ${y})">
    <path d="M 0 -3 L 3 3 L 0 6 L -3 3 Z M 0 -3 L 0 6" stroke="#37b6ff" stroke-width="0.7" fill="none"/>
    <text x="0" y="12" text-anchor="middle" font-size="3" font-weight="600" font-family="monospace" fill="#8b939a">BT</text>
  </g>`;
}

function envSensor(x, y, kind) {
  const L = { temp:'T°', humidity:'RH', smoke:'SMK', door:'DOOR', leak:'H₂O' }[kind] ?? kind;
  return `<g filter="url(#rspdu-softShadow)">
    <rect x="${x-6}" y="${y-4}" width="12" height="8" rx="1" fill="#0e0f10" stroke="#3a4d5c" stroke-width="0.4"/>
    <circle cx="${x-3}" cy="${y}" r="1.2" fill="#37b6ff" opacity="0.85"/>
    <text x="${x+1}" y="${y+1.2}" font-size="3.2" font-weight="600" font-family="monospace" fill="#c8ccd0">${L}</text>
  </g>`;
}

function powerCord(entryX, entryY, angle, cordCsa, plugRender) {
  const len = 40 + cordCsa * 3, thickness = 2.2 + cordCsa * 0.35;
  return `<g transform="translate(${entryX} ${entryY}) rotate(${angle})">
    <rect x="-1" y="-4" width="12" height="8" rx="2" fill="#141516" stroke="#000" stroke-width="0.4"/>
    <path d="M 10 0 Q ${len*0.4} ${-len*0.35} ${len} ${-len*0.3}"
          stroke="url(#rspdu-cordJacket)" stroke-width="${thickness}" fill="none" stroke-linecap="round"/>
    <path d="M 10 0 Q ${len*0.4} ${-len*0.35} ${len} ${-len*0.3}"
          stroke="#fff" stroke-width="0.6" fill="none" opacity="0.08"/>
    <g transform="translate(${len} ${-len*0.3})">${plugRender(0, 0, -20)}</g>
  </g>`;
}

function qrStub(x, y) {
  let cells = '';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++)
    if ((r*7 + c*3) % 2) cells += `<rect x="${x+c*2}" y="${y+r*2}" width="2" height="2" fill="#111"/>`;
  return `<rect x="${x-1}" y="${y-1}" width="12" height="12" fill="#fff"/>${cells}`;
}

function warningBadge(x, y) {
  return `<g transform="translate(${x} ${y})">
    <polygon points="0,10 5,0 10,10" fill="#ffb547" stroke="#000" stroke-width="0.4"/>
    <text x="5" y="8" text-anchor="middle" font-size="5" font-weight="700" font-family="sans-serif" fill="#000">!</text>
  </g>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — plugins (sockets, plugs, manufacturers)
   ═══════════════════════════════════════════════════════════════════════════ */

registerPlugin('socket', {
  key: 'iec-c13', name: 'IEC C13', standard: 'IEC 60320',
  geometry: { widthMm: 17, heightMm: 15 },
  render(x, y, rot = 0, face = 'white') {
    const w = 17, h = 15;
    const surround = face === 'white' ? '#efe9d8' : '#141618';
    const stroke = face === 'white' ? '#a89f88' : '#000';
    const sheen = face === 'white' ? 0.5 : 0.06;
    return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#rspdu-softShadow)">
      <path d="M ${-w/2} ${-h/2+2} Q ${-w/2} ${-h/2} ${-w/2+2} ${-h/2}
               L ${w/2-2} ${-h/2} Q ${w/2} ${-h/2} ${w/2} ${-h/2+2}
               L ${w/2} ${h/2-1} Q ${w/2} ${h/2} ${w/2-1} ${h/2}
               L ${-w/2+1} ${h/2} Q ${-w/2} ${h/2} ${-w/2} ${h/2-1} Z"
            fill="${surround}" stroke="${stroke}" stroke-width="0.3"/>
      <rect x="${-w/2+1.4}" y="${-h/2+1.4}" width="${w-2.8}" height="${h-2.8}" rx="1.2" fill="url(#rspdu-socketPitDark)"/>
      <g fill="#050506" stroke="#000" stroke-width="0.25">
        <rect x="-4.4" y="-4.1" width="2.2" height="3.9" rx="0.4"/>
        <rect x="2.2" y="-4.1" width="2.2" height="3.9" rx="0.4"/>
        <rect x="-1.3" y="1.1" width="2.6" height="3.4" rx="0.4"/>
      </g>
      <rect x="-0.9" y="1.5" width="1.8" height="1.1" fill="url(#rspdu-pinBrass)" opacity="0.55"/>
      <path d="M ${-w/2+1.5} ${-h/2+1} L ${w/2-4} ${-h/2+1} L ${w/2-4} ${-h/2+2.2} L ${-w/2+1.5} ${-h/2+2.2} Z" fill="#fff" opacity="${sheen*0.4}"/>
    </g>`;
  },
});

registerPlugin('socket', {
  key: 'iec-c19', name: 'IEC C19', standard: 'IEC 60320',
  geometry: { widthMm: 22, heightMm: 18 },
  render(x, y, rot = 0, face = 'white') {
    const w = 22, h = 18;
    const surround = face === 'white' ? '#efe9d8' : '#141618';
    const stroke = face === 'white' ? '#a89f88' : '#000';
    return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#rspdu-softShadow)">
      <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="2.2" fill="${surround}" stroke="${stroke}" stroke-width="0.3"/>
      <rect x="${-w/2+1.8}" y="${-h/2+1.8}" width="${w-3.6}" height="${h-3.6}" rx="1.5" fill="url(#rspdu-socketPitDark)"/>
      <g fill="#050506" stroke="#000" stroke-width="0.25">
        <rect x="-5.5" y="-4.6" width="2.8" height="5" rx="0.5"/>
        <rect x="2.7" y="-4.6" width="2.8" height="5" rx="0.5"/>
        <rect x="-1.8" y="1.6" width="3.6" height="4" rx="0.5"/>
      </g>
      <rect x="-1.2" y="2.2" width="2.4" height="1.4" fill="url(#rspdu-pinBrass)" opacity="0.55"/>
      <path d="M ${-w/2+1.8} ${-h/2+1.3} L ${w/2-5} ${-h/2+1.3} L ${w/2-5} ${-h/2+2.6} L ${-w/2+1.8} ${-h/2+2.6} Z" fill="#fff" opacity="${face==='white'?0.2:0.06}"/>
    </g>`;
  },
});

registerPlugin('socket', {
  key: 'india-16a', name: 'India 6A/16A', standard: 'IS 1293',
  geometry: { widthMm: 20, heightMm: 20 },
  render(x, y, rot = 0, face = 'white') {
    const w = 20, h = 20;
    const surround = face === 'white' ? '#efe9d8' : '#141618';
    return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#rspdu-softShadow)">
      <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="2.5" fill="${surround}" stroke="#000" stroke-width="0.3"/>
      <circle cx="0" cy="0" r="${w/2-2}" fill="url(#rspdu-socketPitDark)"/>
      <g fill="#050506" stroke="#000" stroke-width="0.25">
        <circle cx="0" cy="-4.5" r="1.7"/>
        <circle cx="-4.2" cy="2.6" r="1.5"/>
        <circle cx="4.2" cy="2.6" r="1.5"/>
      </g>
      <circle cx="0" cy="-4.5" r="1" fill="url(#rspdu-pinBrass)" opacity="0.5"/>
    </g>`;
  },
});

registerPlugin('plug', {
  key: 'iec60309-16a', name: 'IEC 60309 16A 3-pin', standard: 'IEC 60309', voltages: [208, 220, 230, 240],
  render(x, y, angle = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})" filter="url(#rspdu-softShadow)">
      <rect x="-7" y="-9" width="26" height="18" rx="4" fill="#0a5fb0" stroke="#063a6e" stroke-width="0.7"/>
      <rect x="-7" y="-9" width="26" height="7" rx="4" fill="#1f7fd0" opacity="0.7"/>
      <ellipse cx="19" cy="0" rx="6" ry="9" fill="#084a8c" stroke="#052f5a" stroke-width="0.7"/>
      <ellipse cx="19" cy="0" rx="3.5" ry="6.2" fill="#03203d"/>
      <circle cx="19" cy="-3" r="1.15" fill="#f4e2a1"/>
      <circle cx="16.5" cy="2" r="1.15" fill="#f4e2a1"/>
      <circle cx="21.5" cy="2" r="1.15" fill="#f4e2a1"/>
      <rect x="-14" y="-4" width="9" height="8" rx="2" fill="#1a1c1e"/>
      <text x="6" y="15" text-anchor="middle" font-size="5" font-weight="600" font-family="monospace" fill="#cfe4f6">16A · 6h</text>
    </g>`;
  },
});

registerPlugin('plug', {
  key: 'iec60309-32a', name: 'IEC 60309 32A 3-pin', standard: 'IEC 60309', voltages: [208, 220, 230, 240],
  render(x, y, angle = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})" filter="url(#rspdu-softShadow)">
      <rect x="-8" y="-11" width="30" height="22" rx="5" fill="#0a5fb0" stroke="#063a6e" stroke-width="0.8"/>
      <rect x="-8" y="-11" width="30" height="9" rx="5" fill="#1f7fd0" opacity="0.7"/>
      <ellipse cx="22" cy="0" rx="7" ry="11" fill="#084a8c" stroke="#052f5a" stroke-width="0.8"/>
      <ellipse cx="22" cy="0" rx="4.2" ry="7.5" fill="#03203d"/>
      <circle cx="22" cy="-3.5" r="1.4" fill="#f4e2a1"/>
      <circle cx="19" cy="2.5" r="1.4" fill="#f4e2a1"/>
      <circle cx="25" cy="2.5" r="1.4" fill="#f4e2a1"/>
      <rect x="-16" y="-5" width="10" height="10" rx="2" fill="#1a1c1e"/>
      <text x="7" y="17" text-anchor="middle" font-size="6" font-weight="600" font-family="monospace" fill="#cfe4f6">32A · 6h</text>
    </g>`;
  },
});

registerPlugin('plug', {
  key: 'bs1363', name: 'UK BS 1363 13A', standard: 'BS 1363', voltages: [230, 240],
  render(x, y, angle = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})" filter="url(#rspdu-softShadow)">
      <rect x="-14" y="-14" width="28" height="28" rx="3" fill="#f4f4f4" stroke="#8a8a8a" stroke-width="0.8"/>
      <rect x="-4" y="-11" width="8" height="6" fill="#e8b040"/>
      <rect x="-9" y="-2" width="6" height="8" fill="#e8b040"/>
      <rect x="3" y="-2" width="6" height="8" fill="#e8b040"/>
      <text x="0" y="12" text-anchor="middle" font-size="5" font-weight="600" font-family="monospace" fill="#333">13A UK</text>
    </g>`;
  },
});

registerPlugin('plug', {
  key: 'nema515', name: 'NEMA 5-15P', standard: 'NEMA', voltages: [110, 120],
  render(x, y, angle = 0) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})" filter="url(#rspdu-softShadow)">
      <rect x="-12" y="-10" width="24" height="20" rx="10" fill="#2a2a2a" stroke="#000" stroke-width="0.6"/>
      <rect x="-6" y="-5" width="1.8" height="6" fill="#c0c0c0"/>
      <rect x="4.2" y="-5" width="1.8" height="6" fill="#c0c0c0"/>
      <circle cx="0" cy="3" r="1.2" fill="#c0c0c0"/>
    </g>`;
  },
});

registerPlugin('manufacturer', {
  key: 'apc', name: 'APC',
  style: { accent:'#5cb85c', endCapRadius:3, ventStyle:'slots', defaultFinish:'ral9005-texture', bankStrip:'#c8362f', outletFace:'white' },
  logo(x, y, s = 1) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="0" y="0" width="42" height="12" rx="1.5" fill="#e2231a"/>
      <text x="21" y="9.5" text-anchor="middle" font-size="9" font-weight="700" font-family="Arial,sans-serif" fill="#fff" letter-spacing="0.5">APC</text>
    </g>`;
  },
});
registerPlugin('manufacturer', {
  key: 'vertiv', name: 'Vertiv',
  style: { accent:'#00a3e0', endCapRadius:1.5, ventStyle:'slots', defaultFinish:'darkGrey', bankStrip:'#00a3e0', outletFace:'white' },
  logo(x, y, s = 1) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <text x="0" y="10" font-size="11" font-weight="700" font-family="Arial,sans-serif" fill="#00a3e0" letter-spacing="0.3">Vertiv</text>
    </g>`;
  },
});
registerPlugin('manufacturer', {
  key: 'generic', name: 'Generic Enterprise',
  style: { accent:'#37b6ff', endCapRadius:2, ventStyle:'slots', defaultFinish:'ral9005-texture', bankStrip:'#37b6ff', outletFace:'white' },
  logo(x, y, s = 1) {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <text x="0" y="10" font-size="11" font-weight="700" font-family="'Rajdhani',sans-serif" fill="#37b6ff" letter-spacing="1.2">RACK SLICER</text>
    </g>`;
  },
});

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — geometry, validator, main compositor
   ═══════════════════════════════════════════════════════════════════════════ */

const U_MM = 44.45, RACK_INNER_MM = 448, PX_PER_MM = 2.4;
const isVertical = o => ['vertical', 'zeroU', 'dualVertical'].includes(o);
const totalOutlets = comp => (comp ?? []).reduce((n, r) => n + (+r.count || 0), 0);
function expandComposition(comp) {
  const out = [];
  (comp ?? []).forEach((row, bankIndex) => {
    for (let i = 0; i < row.count; i++) out.push({ type: row.type, bankIndex });
  });
  return out;
}

function chassisDims(c) {
  const outlets = expandComposition(c.composition);
  if (isVertical(c.orientation)) {
    const rows = c.orientation === 'dualVertical' ? 2 : 1;
    const perCol = Math.ceil(outlets.length / rows);
    const maxH = Math.max(...(c.composition ?? []).map(r => getPlugin('socket', r.type).geometry.heightMm));
    const pitch = maxH + 5;
    const banks = (c.composition ?? []).length, bankGap = 4;
    const portCount = (c.networkPorts ?? []).length;
    const portRows = portCount === 0 ? 0 : portCount <= 3 ? 1 : 2;
    const portsH = portRows * 18;
    const headerH = 130 + portsH;
    const footerH = 40;
    const bodyH = perCol * pitch + banks * bankGap;
    return { widthMm:46*rows+6, lengthMm:headerH+bodyH+footerH, vert:true, rows, headerH, footerH, pitch, banks, outlets, portRows, portsH };
  }
  const u = c.mounting?.u ?? 1;
  return { widthMm:RACK_INNER_MM, lengthMm:u*U_MM, vert:false,
           rows:({single:1,dual:2,triple:3})[c.sockets?.layout]??1, outlets };
}

function layoutSockets(c) {
  const dims = chassisDims(c), outlets = dims.outlets, positions = [];
  const rotFor = i => {
    const r = c.sockets?.rotationDeg;
    if (r === 'alternate') return i % 2 ? 180 : 0;
    return typeof r === 'number' ? r : (+r || 0);
  };
  if (dims.vert) {
    let y = dims.headerH, cb = -1;
    outlets.forEach((o, i) => {
      if (o.bankIndex !== cb) { if (cb !== -1) y += 4; cb = o.bankIndex; }
      positions.push({ x:26, y:y+dims.pitch/2, rotationDeg:rotFor(i), bankIndex:o.bankIndex, type:o.type });
      y += dims.pitch;
    });
    return { positions, dims };
  }
  const perRow = Math.ceil(outlets.length / dims.rows);
  const usable = dims.widthMm - 60, pitch = usable / perRow;
  const rowPitch = dims.lengthMm / (dims.rows + 1);
  outlets.forEach((o, i) => {
    const row = Math.floor(i/perRow), col = i%perRow;
    positions.push({ x:30 + col*pitch + pitch/2, y:rowPitch*(row+1), rotationDeg:rotFor(i), bankIndex:o.bankIndex, type:o.type });
  });
  return { positions, dims };
}

function validateConfig(c) {
  const errors = [], warnings = [];
  const err = (k, m) => errors.push({ code:k, msg:m });
  const warn = (k, m) => warnings.push({ code:k, msg:m });
  if (!hasPlugin('manufacturer', c.manufacturer)) err('MFR_UNKNOWN', `Manufacturer '${c.manufacturer}' not registered`);
  if (!c.composition?.length) err('COMP_EMPTY', 'Outlet composition is empty');
  for (const r of (c.composition ?? [])) {
    if (!hasPlugin('socket', r.type)) err('SOCKET_UNKNOWN', `Socket '${r.type}' not registered`);
    if (!(+r.count > 0)) err('SOCKET_COUNT', 'Group count must be > 0');
  }
  const v = c.electrical?.voltage;
  if (![110,120,208,220,230,240,380,400,415].includes(v)) warn('VOLTAGE_NONSTD', `Voltage ${v}V is non-standard`);
  if (c.inputPlug) {
    if (!hasPlugin('plug', c.inputPlug)) err('PLUG_UNKNOWN', `Plug '${c.inputPlug}' not registered`);
    else {
      const ok = plugsForVoltage(v).map(p => p.key);
      if (!ok.includes(c.inputPlug)) warn('PLUG_VOLTAGE', `Plug '${c.inputPlug}' unusual for ${v}V`);
    }
  }
  const total = totalOutlets(c.composition ?? []);
  if (total > 96) err('QTY_MAX', 'Total outlets exceed 96');
  return { ok: errors.length === 0, errors, warnings };
}

function renderSVG(c) {
  const mfr = getPlugin('manufacturer', c.manufacturer);
  const finish = finishFor(c);
  const textured = c.enclosure?.finish === 'ral9005-texture';
  const { positions, dims } = layoutSockets(c);
  const face = c.enclosure?.outletFace ?? mfr.style.outletFace ?? 'white';
  const W = dims.widthMm, H = dims.lengthMm, pad = 30;
  const vw = (W + pad*2) * PX_PER_MM, vh = (H + pad*2) * PX_PER_MM;
  const p = [];

  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" role="img">`);
  p.push(sharedDefs(finish, textured));
  p.push(`<g transform="translate(${pad*PX_PER_MM} ${pad*PX_PER_MM}) scale(${PX_PER_MM})">`);

  const fillId = c.enclosure?.finish === 'brushedAluminium' ? 'url(#rspdu-brushed)' : 'url(#rspdu-chassisFace)';
  p.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="${mfr.style.endCapRadius}" fill="${fillId}" stroke="#040506" stroke-width="0.8" filter="url(#rspdu-softShadow)"/>`);
  if (textured) p.push(`<rect x="0" y="0" width="${W}" height="${H}" rx="${mfr.style.endCapRadius}" filter="url(#rspdu-texture)" opacity="0.6" pointer-events="none"/>`);
  p.push(`<rect x="0.6" y="0.6" width="${W-1.2}" height="1.5" rx="0.6" fill="#fff" opacity="0.12"/>`);

  if (dims.vert) p.push(`<g filter="url(#rspdu-softShadow)">
    <rect x="${W/2-8}" y="-6" width="16" height="10" rx="2" fill="url(#rspdu-chassisFace)" stroke="#0a0b0c" stroke-width="0.6"/>
    <rect x="${W/2-8}" y="${H-4}" width="16" height="10" rx="2" fill="url(#rspdu-chassisFace)" stroke="#0a0b0c" stroke-width="0.6"/>
    ${screw(W/2, -1, 2)}${screw(W/2, H+1, 2)}
  </g>`);
  else p.push(`<g filter="url(#rspdu-softShadow)">
    <rect x="-16" y="4" width="16" height="${H-8}" rx="1.5" fill="url(#rspdu-chassisFace)" stroke="#0a0b0c" stroke-width="0.7"/>
    ${screw(-8, H*0.25, 3)}${screw(-8, H*0.5, 3)}${screw(-8, H*0.75, 3)}
    <rect x="${W}" y="4" width="16" height="${H-8}" rx="1.5" fill="url(#rspdu-chassisFace)" stroke="#0a0b0c" stroke-width="0.7"/>
    ${screw(W+8, H*0.25, 3)}${screw(W+8, H*0.5, 3)}${screw(W+8, H*0.75, 3)}
  </g>`);

  if (c.breaker && c.breaker !== 'none') {
    const wg = c.breaker === 'mcb-guarded';
    p.push(mcbGuarded(dims.vert ? W/2 : 28, dims.vert ? 27 : H/2, c.mcbCurve || 'D', c.electrical.currentA, wg));
  }

  const feats = c.smartFeatures ?? [];
  const hasDisplay = ['lcd','oled','powerMeter','energyMeter','currentMon','voltageMon'].some(k => feats.includes(k));
  if (hasDisplay) {
    const kind = feats.includes('oled') ? 'oled' : 'lcd';
    if (dims.vert) {
      const meterY = 52 + (dims.portsH ?? 0) + 4;
      p.push(bigKwMeter(W/2 - 25, meterY, c.electrical, feats, kind, c.loadWatts));
    } else p.push(smallDisplay(50, H/2-10, kind, c.electrical, feats));
  }

  const ports = c.networkPorts ?? [];
  if (dims.vert) {
    const nRows = ports.length === 0 ? 0 : ports.length <= 3 ? 1 : 2;
    for (let r = 0; r < nRows; r++) {
      const rowPorts = ports.slice(r*3, r*3+3);
      const py = 52 + r * 18;
      const totalW = rowPorts.length * 14 - 3;
      const startX = (W - totalW) / 2;
      rowPorts.forEach((port, i) => p.push(netPort(startX + i*14, py, port, port === 'rj45')));
    }
  } else ports.forEach((port, i) => p.push(netPort(W-70+i*14, 8, port, port === 'rj45')));

  (c.wireless ?? []).forEach((w, i) => p.push(wirelessIcon(dims.vert ? W-8 : W-90+i*16, dims.vert ? H-45-i*15 : 12, w)));
  (c.envSensors ?? []).forEach((s, i) => p.push(envSensor(dims.vert ? W/2 : 100+i*16, dims.vert ? H-58-i*11 : H/2+8, s)));

  const ledsY = dims.vert ? (dims.headerH - 12) : 8;
  (c.leds ?? []).filter(l => l !== 'none' && l !== 'outlet').forEach((l, i) =>
    p.push(led(dims.vert ? 10+i*10 : 10+i*8, ledsY, l, 2)));

  let lastBank = -1;
  positions.forEach((pos, i) => {
    if (pos.bankIndex !== lastBank && dims.vert) {
      if (lastBank !== -1) p.push(`<rect x="4" y="${pos.y - dims.pitch/2 - 3}" width="${W-8}" height="1.5" fill="#040506" opacity="0.9"/>`);
      lastBank = pos.bankIndex;
    }
    const sock = getPlugin('socket', pos.type);
    p.push(`<g data-outlet="${i}" data-bank="${pos.bankIndex}" data-type="${pos.type}" class="rs-outlet" style="cursor:pointer">${sock.render(pos.x, pos.y, pos.rotationDeg, face)}</g>`);
    if ((c.leds ?? []).includes('outlet')) p.push(led(pos.x + sock.geometry.widthMm/2 + 3, pos.y, 'outlet', 1.4));
  });

  if (c.inputPlug) {
    const plug = getPlugin('plug', c.inputPlug);
    const angle = c.cableEntry === 'top' ? -90 : c.cableEntry === 'bottom' ? 90 : c.cableEntry === 'left' ? 180 : 0;
    const ex = c.cableEntry === 'top' || c.cableEntry === 'bottom' ? W/2 : c.cableEntry === 'left' ? 0 : W;
    const ey = c.cableEntry === 'top' ? 0 : c.cableEntry === 'bottom' ? H : H/2;
    p.push(powerCord(ex, ey, angle, +(c.cordCsa || 2.5), (px, py, pa) => plug.render(px, py, pa)));
  }

  if (c.branding !== 'none') p.push(dims.vert ? mfr.logo(6, H-18, 0.75) : mfr.logo(W/2-40, H-10, 0.8));

  const L = c.labels ?? [];
  if (dims.vert) {
    const meterBottom = 52 + (dims.portsH ?? 0) + 4 + 46;
    const ly = meterBottom + 4;
    const compact = `${c.electrical.voltage}V·${c.electrical.currentA}A·${c.electrical.phase.charAt(0).toUpperCase()}Ø`;
    p.push(`<g font-family="'Share Tech Mono',monospace" font-weight="500" fill="${finish.text}" opacity="0.65">`);
    if (L.includes('model')) p.push(`<text x="${W/2}" y="${ly}" text-anchor="middle" font-size="3.5">RS-PDU-${c.category.toUpperCase()}</text>`);
    if (L.includes('voltage') || L.includes('current')) p.push(`<text x="${W/2}" y="${ly+6}" text-anchor="middle" font-size="3">${compact}</text>`);
    p.push('</g>');
    if (L.includes('qr')) p.push(qrStub(W-14, dims.lengthMm - 32));
    if (L.includes('warning')) p.push(warningBadge(2, dims.lengthMm - 32));
  }

  p.push('</g></svg>');
  return p.join('\n');
}

/* ═══════════════════════════════════════════════════════════════════════════
   ENGINE — generatePDU (the pure function)
   ═══════════════════════════════════════════════════════════════════════════ */

function normalize(c) {
  return {
    orientation: c.orientation ?? 'zeroU', mounting: c.mounting ?? { u:0 },
    manufacturer: c.manufacturer ?? 'apc', category: c.category ?? 'switched',
    electrical: { phase:'single', voltage:230, currentA:32, ...(c.electrical ?? {}) },
    inputPlug: c.inputPlug ?? 'iec60309-32a',
    cordLen: c.cordLen ?? 3, cordCsa: c.cordCsa ?? 6, frls: c.frls ?? true,
    composition: c.composition ?? [{ type:'iec-c13', count:12 }],
    sockets: { layout:'single', rotationDeg:0, ...(c.sockets ?? {}) },
    breaker: c.breaker ?? 'mcb-guarded', mcbCurve: c.mcbCurve ?? 'D',
    smartFeatures: c.smartFeatures ?? [], envSensors: c.envSensors ?? [],
    networkPorts: c.networkPorts ?? [], wireless: c.wireless ?? [],
    leds: c.leds ?? ['power'],
    enclosure: c.enclosure ?? { finish:'ral9005-texture', outletFace:'white' },
    branding: c.branding ?? 'manufacturer', labels: c.labels ?? ['model','voltage','current'],
    cableEntry: c.cableEntry ?? 'top',
    connectedLoads: c.connectedLoads ?? [], loadWatts: c.loadWatts,
  };
}

function generatePDU(raw) {
  const config = normalize(raw);
  const { ok, errors, warnings } = validateConfig(config);
  if (!ok) return { ok:false, errors, warnings, svg:null, json:config };
  const svg = renderSVG(config);
  const dims = chassisDims(config);
  const { positions } = layoutSockets(config);
  const mfr = getPlugin('manufacturer', config.manufacturer);
  const total = totalOutlets(config.composition);
  const metadata = {
    id: `pdu-${config.category}-${total}outlets-${config.electrical.voltage}v`,
    vendor: config.branding === 'manufacturer' ? mfr.name : 'Rack Slicer',
    model: `RS-PDU-${config.category.toUpperCase()}`,
    outlets: total,
    composition: config.composition.map(r => `${r.count}× ${getPlugin('socket', r.type).name}`).join(', '),
    orientation: config.orientation,
    u: dims.vert ? 0 : (config.mounting?.u ?? 1),
    widthMm: Math.round(dims.widthMm), lengthMm: Math.round(dims.lengthMm),
    ratedVoltage: config.electrical.voltage, ratedCurrentA: config.electrical.currentA,
    phase: config.electrical.phase,
    breaker: config.breaker === 'none' ? 'none' : `${config.mcbCurve}${config.electrical.currentA} MCB`,
    cord: `${config.cordCsa}mm² × ${config.cordLen}m${config.frls ? ' FRLS' : ''}`,
    finish: config.enclosure.finish,
    loadWatts: config.loadWatts ?? Math.round(config.electrical.voltage * config.electrical.currentA * 0.68),
    ratedWatts: config.electrical.voltage * config.electrical.currentA,
    connectedDeviceCount: (config.connectedLoads ?? []).length,
  };
  const bom = [{ part:'chassis', desc:`${config.enclosure.finish} enclosure`, qty:1 }];
  config.composition.forEach(r => bom.push({ part:r.type, desc:`${getPlugin('socket', r.type).name} outlet`, qty:r.count }));
  bom.push({ part:config.inputPlug, desc:'input plug', qty:1 });
  bom.push({ part:'cord', desc:`${config.cordCsa}mm² × ${config.cordLen}m ${config.frls?'FRLS':'std'}`, qty:1 });
  if (config.breaker !== 'none') bom.push({ part:config.breaker, desc:`${config.mcbCurve}-curve MCB${config.breaker === 'mcb-guarded' ? ' with safety guard' : ''}`, qty:1 });
  (config.networkPorts ?? []).forEach(p => bom.push({ part:p, desc:'network port', qty:1 }));
  return {
    ok:true, errors:[], warnings, svg, json:config, metadata, bom,
    component: { type:'pdu', ...metadata, svg,
      outletHitboxes: positions.map((p, i) => ({ index:i, x:p.x, y:p.y, bank:p.bankIndex, type:p.type })),
      status:'online' },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI — constants and presets
   ═══════════════════════════════════════════════════════════════════════════ */

const FEATURES = ['powerMeter','lcd','oled','currentMon','voltageMon','powerFactor','energyMeter','snmp','redfish','modbus','bacnet'];
const ENV_SENS = ['temp','humidity','smoke','door','leak'];
const PORTS    = ['rj45','sfp','usb','usbC','serial','console','microUsb'];
const WIRELESS = ['wifi','bluetooth'];
const LEDS     = ['power','network','alarm','outlet','rgb'];
const LABELS   = ['model','voltage','current','serial','qr','asset','warning','safety','barcode'];

const SAMPLE_DEVICES = [
  { name:'Dell R760 Server', watts:450 }, { name:'Dell R760 Server', watts:450 },
  { name:'Dell R770 Server', watts:520 }, { name:'HPE DL380 Server', watts:410 },
  { name:'Cisco 9300 Switch', watts:280 }, { name:'Aruba 6300 Switch', watts:230 },
  { name:'Palo Alto Firewall', watts:170 }, { name:'Storage Array', watts:380 },
];

const PRESETS = {
  userSpec: {
    label:'★ Your Spec · 24×C13 + 6×C19', hero:true,
    config:{
      orientation:'zeroU', mounting:{u:0}, manufacturer:'apc', category:'switched',
      electrical:{ phase:'single', voltage:230, currentA:32 },
      inputPlug:'iec60309-32a', cordLen:3, cordCsa:6, frls:true,
      composition:[
        { type:'iec-c19', count:1 }, { type:'iec-c13', count:4 },
        { type:'iec-c19', count:1 }, { type:'iec-c13', count:4 },
        { type:'iec-c19', count:1 }, { type:'iec-c13', count:4 },
        { type:'iec-c19', count:1 }, { type:'iec-c13', count:4 },
        { type:'iec-c19', count:1 }, { type:'iec-c13', count:4 },
        { type:'iec-c19', count:1 }, { type:'iec-c13', count:4 },
      ],
      breaker:'mcb-guarded', mcbCurve:'D',
      smartFeatures:['lcd','currentMon','energyMeter','powerMeter'],
      networkPorts:['rj45'], leds:['power','network','outlet'],
      enclosure:{ finish:'ral9005-texture', outletFace:'white' },
      branding:'manufacturer', cableEntry:'top', labels:['model','voltage','current'],
      connectedLoads:[],
    },
  },
  apc2u: {
    label:'APC 2U · 16×C13',
    config:{
      orientation:'horizontal', mounting:{u:2}, manufacturer:'apc', category:'switched',
      electrical:{ phase:'single', voltage:230, currentA:32 },
      inputPlug:'iec60309-32a', cordLen:3, cordCsa:2.5, frls:false,
      composition:[{ type:'iec-c13', count:16 }],
      breaker:'mcb-guarded', mcbCurve:'C',
      smartFeatures:['lcd','powerMeter','snmp'],
      networkPorts:['rj45','usbC','console'], leds:['power','network','outlet'],
      enclosure:{ finish:'black', outletFace:'white' },
      branding:'manufacturer', cableEntry:'bottom', labels:['model','voltage','current'],
      connectedLoads:[],
    },
  },
  vertivZ: {
    label:'Vertiv 0U · 42×C13',
    config:{
      orientation:'zeroU', mounting:{u:0}, manufacturer:'vertiv', category:'managed',
      electrical:{ phase:'single', voltage:230, currentA:32 },
      inputPlug:'iec60309-32a', cordLen:3, cordCsa:6, frls:true,
      composition:[{ type:'iec-c13', count:42 }],
      breaker:'mcb-guarded', mcbCurve:'C',
      smartFeatures:['oled','powerMeter','energyMeter','snmp'],
      networkPorts:['rj45','usbC'], leds:['power','network','outlet'],
      enclosure:{ finish:'darkGrey', outletFace:'white' },
      branding:'manufacturer', cableEntry:'top', labels:['model','voltage','current'],
      connectedLoads:[],
    },
  },
};

const DEFAULT_CONFIG = PRESETS.userSpec.config;

/* ═══════════════════════════════════════════════════════════════════════════
   UI — CSS (scoped to the .rs-pdu-configurator container)
   ═══════════════════════════════════════════════════════════════════════════ */

const CSS = `
.rs-pdu-configurator {
  --bg:#0a0d10; --panel:#12171c; --panel2:#171d24; --line:#23303b;
  --ink:#e6ecf2; --dim:#8b939a; --muted:#5b636a;
  --accent:#37b6ff; --accent2:#00e0a4; --warn:#ffb547; --err:#ff5a5a;
  --mono:'Share Tech Mono',monospace; --ui:'Rajdhani',sans-serif;
  display:grid; grid-template-columns:380px 1fr 320px;
  grid-template-rows:56px 1fr; grid-template-areas:"h h h" "l p r";
  background:var(--bg); color:var(--ink); font-family:var(--ui); height:100vh;
}
.rs-pdu-configurator * { box-sizing:border-box }
.rs-pdu-configurator .header { grid-area:h; display:flex; align-items:center; padding:0 20px;
  gap:16px; border-bottom:1px solid var(--line); background:linear-gradient(180deg,#12171c,#0a0d10) }
.rs-pdu-configurator .brand { font-weight:700; letter-spacing:1.5px; color:var(--accent); font-size:18px }
.rs-pdu-configurator .sub { color:var(--dim); font-size:13px; letter-spacing:1px; text-transform:uppercase }
.rs-pdu-configurator .spacer { flex:1 }
.rs-pdu-configurator .status { font-family:var(--mono); font-size:11px; color:var(--dim) }
.rs-pdu-configurator .status b { color:var(--accent2) }
.rs-pdu-configurator .panel { background:var(--panel); overflow-y:auto; padding:14px 16px }
.rs-pdu-configurator .panel::-webkit-scrollbar { width:8px }
.rs-pdu-configurator .panel::-webkit-scrollbar-thumb { background:#23303b; border-radius:4px }
.rs-pdu-configurator .left { grid-area:l; border-right:1px solid var(--line) }
.rs-pdu-configurator .right { grid-area:r; border-left:1px solid var(--line) }
.rs-pdu-configurator .preview { grid-area:p; display:flex; flex-direction:column;
  background:radial-gradient(ellipse at top,#141a20 0,#0a0d10 60%) }
.rs-pdu-configurator .stage { flex:1; display:flex; align-items:center; justify-content:center; padding:24px; overflow:auto }
.rs-pdu-configurator .stage svg { max-height:calc(100vh - 160px); filter:drop-shadow(0 12px 24px rgba(0,0,0,.6)) }
.rs-pdu-configurator .msgbar { border-top:1px solid var(--line); background:var(--panel);
  padding:8px 16px; font-family:var(--mono); font-size:11px; min-height:34px }
.rs-pdu-configurator .msgbar .err { color:var(--err) }
.rs-pdu-configurator .msgbar .warn { color:var(--warn) }
.rs-pdu-configurator .msgbar .ok { color:var(--accent2) }
.rs-pdu-configurator h2 { margin:0 0 6px 0; font-size:11px; letter-spacing:2px;
  color:var(--accent); text-transform:uppercase; font-weight:600; padding-top:14px;
  border-top:1px solid var(--line) }
.rs-pdu-configurator h2:first-of-type { border-top:0; padding-top:0 }
.rs-pdu-configurator label { display:block; font-size:11px; letter-spacing:1px;
  color:var(--dim); text-transform:uppercase; margin:10px 0 4px }
.rs-pdu-configurator select, .rs-pdu-configurator input[type=number],
.rs-pdu-configurator input[type=text], .rs-pdu-configurator input[type=color] {
  width:100%; background:var(--panel2); border:1px solid var(--line); color:var(--ink);
  padding:7px 9px; font-family:var(--mono); font-size:12px; border-radius:2px; outline:none }
.rs-pdu-configurator input[type=color] { padding:2px; height:32px }
.rs-pdu-configurator select:focus, .rs-pdu-configurator input:focus { border-color:var(--accent) }
.rs-pdu-configurator .row { display:grid; grid-template-columns:1fr 1fr; gap:8px }
.rs-pdu-configurator .row3 { display:grid; grid-template-columns:1.5fr 0.7fr 24px;
  gap:6px; align-items:center; margin-bottom:4px }
.rs-pdu-configurator .row3 button { background:#2a1416; color:#ff8080; border:1px solid #4a2020;
  font-family:var(--mono); font-size:14px; cursor:pointer; border-radius:2px; padding:0; height:28px }
.rs-pdu-configurator .addRow { background:#0f2a1e; color:var(--accent2); border:1px dashed #1e5040;
  font-family:var(--mono); font-size:11px; padding:6px 8px; width:100%; cursor:pointer;
  text-transform:uppercase; letter-spacing:1px; margin-top:6px; border-radius:2px }
.rs-pdu-configurator .addRow:hover { background:#144232 }
.rs-pdu-configurator .chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:4px }
.rs-pdu-configurator .chip { font-family:var(--mono); font-size:10.5px; padding:4px 8px;
  border:1px solid var(--line); border-radius:2px; color:var(--dim); cursor:pointer;
  user-select:none; background:var(--panel2); text-transform:uppercase; letter-spacing:.5px }
.rs-pdu-configurator .chip:hover { color:var(--ink); border-color:#3a4d5c }
.rs-pdu-configurator .chip.on { color:#0a0d10; background:var(--accent); border-color:var(--accent); font-weight:600 }
.rs-pdu-configurator .tabs { display:flex; border-bottom:1px solid var(--line); margin-bottom:10px }
.rs-pdu-configurator .tab { padding:8px 12px; font-size:11px; letter-spacing:1.5px;
  text-transform:uppercase; color:var(--dim); cursor:pointer; border-bottom:2px solid transparent }
.rs-pdu-configurator .tab.on { color:var(--accent); border-color:var(--accent) }
.rs-pdu-configurator .kv { display:grid; grid-template-columns:110px 1fr; gap:4px 10px;
  font-family:var(--mono); font-size:11.5px }
.rs-pdu-configurator .kv .k { color:var(--dim); text-transform:uppercase; font-size:10.5px; letter-spacing:1px }
.rs-pdu-configurator .bom .rw { display:grid; grid-template-columns:1fr 40px; padding:5px 0;
  border-bottom:1px dashed #1e2830; font-family:var(--mono); font-size:11px }
.rs-pdu-configurator .bom .q { color:var(--accent); text-align:right }
.rs-pdu-configurator .presets { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px }
.rs-pdu-configurator .presets button { background:var(--panel2); border:1px solid var(--line);
  color:var(--dim); padding:5px 9px; font-family:var(--mono); font-size:10.5px; cursor:pointer;
  letter-spacing:.5px; text-transform:uppercase; border-radius:2px }
.rs-pdu-configurator .presets button:hover { color:var(--accent); border-color:var(--accent) }
.rs-pdu-configurator .presets button.hero { color:var(--accent2); border-color:#1e5040; background:#0f2a1e }
.rs-pdu-configurator .presets button.hero:hover { background:#144232; color:#fff }
.rs-pdu-configurator .tip { font-size:11px; color:var(--muted); margin-top:4px; line-height:1.4 }
.rs-pdu-configurator .loadSummary { margin-top:8px; font-family:var(--mono); font-size:11px;
  color:var(--dim); padding:8px; border:1px solid var(--line); border-radius:2px; background:var(--panel2) }
.rs-pdu-configurator .loadRow { display:flex; justify-content:space-between; margin-bottom:5px }
.rs-pdu-configurator .loadBar { height:4px; background:#0a0d10; border-radius:2px; overflow:hidden }
.rs-pdu-configurator .loadBar > div { height:100%; transition:width 0.2s }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS — small building blocks
   ═══════════════════════════════════════════════════════════════════════════ */

const Chips = ({ items, value, onToggle }) => {
  const set = new Set(value ?? []);
  return (
    <div className="chips">
      {items.map(v =>
        <div key={v} className={`chip${set.has(v) ? ' on' : ''}`} onClick={() => onToggle(v)}>
          {v}
        </div>
      )}
    </div>
  );
};

const Composition = ({ composition, onChange }) => {
  const socks = listPlugins('socket');
  const update = (i, f, v) => onChange(composition.map((r, idx) => idx === i ? { ...r, [f]:v } : r));
  const remove = i => composition.length > 1 && onChange(composition.filter((_, idx) => idx !== i));
  const add = () => onChange([...composition, { type:'iec-c13', count:4 }]);
  return (
    <>
      {composition.map((r, i) =>
        <div key={i} className="row3">
          <select value={r.type} onChange={e => update(i, 'type', e.target.value)}>
            {socks.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
          <input type="number" min="1" max="96" value={r.count}
                 onChange={e => update(i, 'count', Math.max(1, +e.target.value))} />
          <button onClick={() => remove(i)}>×</button>
        </div>
      )}
      <button className="addRow" onClick={add}>+ Add Outlet Group</button>
    </>
  );
};

const ConnectedLoads = ({ loads, onChange, rated }) => {
  const totalW = loads.reduce((s, d) => s + (+d.watts || 0), 0);
  const pct = rated ? Math.round(totalW / rated * 100) : 0;
  const barColor = pct > 90 ? 'var(--err)' : pct > 75 ? 'var(--warn)' : 'var(--accent2)';
  const update = (i, f, v) => onChange(loads.map((d, idx) => idx === i ? { ...d, [f]:v } : d));
  const addOne = () => {
    const p = SAMPLE_DEVICES[loads.length % SAMPLE_DEVICES.length];
    onChange([...loads, { ...p }]);
  };
  return (
    <>
      <div className="tip">Devices connected to this PDU. Sum drives the meter live.</div>
      {loads.length === 0
        ? <div className="tip" style={{ padding:'8px 0' }}>None yet. Click "Sample Rack" to preload.</div>
        : loads.map((d, i) =>
          <div key={i} className="row3">
            <input type="text" value={d.name} onChange={e => update(i, 'name', e.target.value)} />
            <input type="number" min="1" max="9999" value={d.watts}
                   onChange={e => update(i, 'watts', Math.max(1, +e.target.value))} />
            <button onClick={() => onChange(loads.filter((_, idx) => idx !== i))}>×</button>
          </div>
        )}
      <button className="addRow" onClick={addOne}>+ Add Device</button>
      <div className="loadSummary">
        <div className="loadRow"><span>DEVICES</span><b style={{ color:barColor }}>{loads.length}</b></div>
        <div className="loadRow"><span>TOTAL LOAD</span><b style={{ color:barColor }}>{totalW} W</b></div>
        <div className="loadRow"><span>OF RATED ({rated}W)</span><b style={{ color:barColor }}>{pct}%</b></div>
        <div className="loadBar"><div style={{ width:`${Math.min(100,pct)}%`, background:barColor }} /></div>
      </div>
      <div className="row" style={{ marginTop:6 }}>
        <button className="addRow" onClick={() => onChange([])}
                style={{ background:'#2a1416', color:'#ff8080', borderColor:'#4a2020' }}>Clear</button>
        <button className="addRow" onClick={() => onChange(SAMPLE_DEVICES.map(d => ({ ...d })))}
                style={{ background:'#0f1a2a', color:'var(--accent)', borderColor:'#1e3a5a' }}>Sample</button>
      </div>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTS — panels
   ═══════════════════════════════════════════════════════════════════════════ */

const HeaderBar = ({ result }) => (
  <header className="header">
    <div className="brand">RACK SLICER</div>
    <div className="sub">PDU Configurator · v2</div>
    <div className="spacer" />
    <div className="status">
      ENGINE <b>{result?.ok ? 'READY' : 'ERROR'}</b>
      {result?.metadata && <> · <b style={{ color:'var(--accent)' }}>{result.metadata.loadWatts}W</b> live load</>}
    </div>
  </header>
);

const Preview = ({ result }) => (
  <main className="preview">
    <div className="stage">
      {result?.ok
        ? <div dangerouslySetInnerHTML={{ __html: result.svg }} />
        : <div style={{ color:'var(--muted)', fontFamily:'var(--mono)', textAlign:'center' }}>
            <div style={{ fontSize:14, color:'var(--err)', marginBottom:8 }}>CONFIGURATION INVALID</div>
            <div style={{ fontSize:11 }}>{result?.errors?.map(e => e.msg).join(' · ')}</div>
          </div>}
    </div>
    <div className="msgbar">
      {result?.ok
        ? <><span className="ok">✓ {result.metadata.id}</span>
            {result.warnings?.map((w, i) => <span key={i} className="warn"> · ⚠ {w.msg}</span>)}</>
        : result?.errors?.map((e, i) => <span key={i} className="err">✕ {e.msg}</span>)}
    </div>
  </main>
);

const RightPanel = ({ result }) => {
  const [tab, setTab] = useState('meta');
  if (!result?.ok) return <aside className="right panel" />;
  return (
    <aside className="right panel">
      <div className="tabs">
        {['meta','bom','json'].map(k =>
          <div key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{k}</div>
        )}
      </div>
      {tab === 'meta' && <div className="kv">
        {Object.entries(result.metadata).map(([k, v]) =>
          <React.Fragment key={k}><div className="k">{k}</div><div>{String(v)}</div></React.Fragment>)}
      </div>}
      {tab === 'bom' && <div className="bom">
        {result.bom.map((b, i) =>
          <div key={i} className="rw"><div>{b.desc}
            <div style={{ color:'#5b636a', fontSize:10 }}>{b.part}</div></div>
            <div className="q">×{b.qty}</div></div>)}
      </div>}
      {tab === 'json' && <pre style={{ fontFamily:'var(--mono)', fontSize:10.5, color:'var(--dim)',
        whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0 }}>
        {JSON.stringify(result.json, null, 2)}
      </pre>}
    </aside>
  );
};

const LeftPanel = ({ config, setConfig, patch, patchElec, patchEnc, toggle }) => {
  const c = config, el = c.electrical, enc = c.enclosure;
  const onCurrent = a => {
    let p = { electrical:{ ...el, currentA:a } };
    if (el.voltage >= 208 && el.voltage <= 240) {
      if (a === 16 && c.inputPlug === 'iec60309-32a') p.inputPlug = 'iec60309-16a';
      else if (a === 32 && c.inputPlug === 'iec60309-16a') p.inputPlug = 'iec60309-32a';
    }
    setConfig({ ...c, ...p });
  };
  return (
    <aside className="left panel">
      <div className="presets">
        {Object.entries(PRESETS).map(([k, pr]) =>
          <button key={k} className={pr.hero ? 'hero' : ''}
                  onClick={() => setConfig(pr.config)}>{pr.label}</button>)}
      </div>
      <h2>Chassis</h2>
      <label>Orientation</label>
      <select value={c.orientation} onChange={e => patch({ orientation:e.target.value })}>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical</option>
        <option value="zeroU">Zero-U Vertical</option>
        <option value="dualVertical">Dual Vertical</option>
      </select>
      <div className="row">
        <div><label>Mounting (U)</label>
          <select value={c.mounting?.u ?? 0}
                  onChange={e => patch({ mounting:{ u:+e.target.value } })}>
            {[0,1,2,3,4].map(u => <option key={u}>{u}</option>)}</select></div>
        <div><label>Category</label>
          <select value={c.category} onChange={e => patch({ category:e.target.value })}>
            {['basic','metered','switched','managed','smart','intelligent','highDensity']
              .map(v => <option key={v}>{v}</option>)}</select></div>
      </div>
      <label>Manufacturer Style</label>
      <select value={c.manufacturer} onChange={e => patch({ manufacturer:e.target.value })}>
        <option value="apc">APC</option><option value="vertiv">Vertiv</option>
        <option value="generic">Generic Enterprise</option>
      </select>

      <h2>Electrical</h2>
      <div className="row">
        <div><label>Phase</label>
          <select value={el.phase} onChange={e => patchElec({ phase:e.target.value })}>
            <option>single</option><option>three</option><option>split</option></select></div>
        <div><label>Voltage</label>
          <select value={el.voltage} onChange={e => patchElec({ voltage:+e.target.value })}>
            {[110,120,208,220,230,240,380,400,415].map(v => <option key={v}>{v}</option>)}</select></div>
      </div>
      <label>Current (A)</label>
      <input type="number" min="6" max="63" value={el.currentA}
             onChange={e => onCurrent(+e.target.value)} />
      <label>Input Plug</label>
      <select value={c.inputPlug} onChange={e => patch({ inputPlug:e.target.value })}>
        <option value="iec60309-16a">IEC 60309 · 16A</option>
        <option value="iec60309-32a">IEC 60309 · 32A</option>
        <option value="bs1363">UK BS 1363 · 13A</option>
        <option value="nema515">NEMA 5-15P</option>
      </select>
      <div className="tip">Auto-swaps when current changes 16A ↔ 32A.</div>
      <div className="row">
        <div><label>Cord Length (m)</label>
          <input type="number" min="1" max="6" step="0.5" value={c.cordLen}
                 onChange={e => patch({ cordLen:+e.target.value })} /></div>
        <div><label>Cord CSA (mm²)</label>
          <select value={c.cordCsa} onChange={e => patch({ cordCsa:+e.target.value })}>
            {[1.5,2.5,4,6,10].map(v => <option key={v}>{v}</option>)}</select></div>
      </div>

      <h2>Outlet Composition</h2>
      <div className="tip">Rows lay out top-to-bottom on vertical PDUs.</div>
      <Composition composition={c.composition} onChange={comp => patch({ composition:comp })} />

      <h2>Rack Load Simulation</h2>
      <ConnectedLoads loads={c.connectedLoads} rated={el.voltage * el.currentA}
        onChange={loads => patch({
          connectedLoads:loads,
          loadWatts:loads.length ? loads.reduce((s, d) => s + (+d.watts || 0), 0) : undefined,
        })} />

      <h2>Protection</h2>
      <div className="row">
        <div><label>Breaker Type</label>
          <select value={c.breaker} onChange={e => patch({ breaker:e.target.value })}>
            <option value="none">none</option><option value="mcb">MCB</option>
            <option value="mcb-guarded">MCB + Guard</option><option value="hydraulic">Hydraulic</option>
            <option value="electronic">Electronic</option><option value="locking">Locking</option>
          </select></div>
        <div><label>MCB Curve</label>
          <select value={c.mcbCurve} onChange={e => patch({ mcbCurve:e.target.value })}>
            <option>B</option><option>C</option><option>D</option></select></div>
      </div>

      <h2>Smart Features</h2>
      <label>Display / Meter</label>
      <Chips items={FEATURES} value={c.smartFeatures} onToggle={v => toggle('smartFeatures', v)} />
      <label>Environmental Sensors</label>
      <Chips items={ENV_SENS} value={c.envSensors} onToggle={v => toggle('envSensors', v)} />
      <label>Network Ports</label>
      <Chips items={PORTS} value={c.networkPorts} onToggle={v => toggle('networkPorts', v)} />
      <label>Wireless</label>
      <Chips items={WIRELESS} value={c.wireless} onToggle={v => toggle('wireless', v)} />
      <label>LEDs</label>
      <Chips items={LEDS} value={c.leds} onToggle={v => toggle('leds', v)} />

      <h2>Enclosure · Branding</h2>
      <label>Finish</label>
      <select value={enc.finish} onChange={e => patchEnc({ finish:e.target.value })}>
        <option value="ral9005-texture">RAL 9005 Texture (Jet Black)</option>
        <option value="black">Smooth Black</option>
        <option value="darkGrey">Dark Grey</option>
        <option value="lightGrey">Light Grey</option>
        <option value="white">White</option>
        <option value="brushedAluminium">Brushed Aluminium</option>
        <option value="customRal">Custom RAL / Hex…</option>
      </select>
      {enc.finish === 'customRal' &&
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input type="color" value={enc.customHex || '#1a1a1a'}
                 onChange={e => patchEnc({ customHex:e.target.value })} style={{ width:40 }} />
          <span className="tip">Custom body colour</span>
        </div>}
      <label>Outlet Face</label>
      <select value={enc.outletFace} onChange={e => patchEnc({ outletFace:e.target.value })}>
        <option value="white">White (APC style)</option>
        <option value="black">Black (Server Tech)</option>
      </select>
      <div className="row">
        <div><label>Cable Entry</label>
          <select value={c.cableEntry} onChange={e => patch({ cableEntry:e.target.value })}>
            <option>top</option><option>bottom</option><option>left</option><option>right</option>
          </select></div>
        <div><label>Branding</label>
          <select value={c.branding} onChange={e => patch({ branding:e.target.value })}>
            <option value="manufacturer">Mfr Logo</option>
            <option value="rackSlicer">Rack Slicer</option>
            <option value="none">None</option>
          </select></div>
      </div>
      <label>Labels</label>
      <Chips items={LABELS} value={c.labels} onToggle={v => toggle('labels', v)} />
    </aside>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT (default export)
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PDUConfigurator() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const patch = useCallback(p => setConfig(prev => ({ ...prev, ...p })), []);
  const patchElec = useCallback(p =>
    setConfig(prev => ({ ...prev, electrical:{ ...prev.electrical, ...p } })), []);
  const patchEnc = useCallback(p =>
    setConfig(prev => ({ ...prev, enclosure:{ ...prev.enclosure, ...p } })), []);
  const toggle = useCallback((field, v) =>
    setConfig(prev => {
      const arr = prev[field] ?? [];
      return { ...prev, [field]:arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
    }), []);

  const result = useMemo(() => generatePDU(config), [config]);

  return (
    <div className="rs-pdu-configurator">
      <style>{CSS}</style>
      <HeaderBar result={result} />
      <LeftPanel {...{ config, setConfig, patch, patchElec, patchEnc, toggle }} />
      <Preview result={result} />
      <RightPanel result={result} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAMED EXPORTS — engine API (in case Rack Slicer needs to call it directly)
   ═══════════════════════════════════════════════════════════════════════════ */

export { generatePDU, validateConfig, registerPlugin, listPlugins, plugsForVoltage };
