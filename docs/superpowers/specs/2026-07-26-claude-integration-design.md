# Claude AI Integration — RackCAD Design Spec
**Date:** 2026-07-26  
**Status:** Approved  
**Model:** `claude-opus-4-7` | `effort: medium` | `thinking: adaptive`

---

## Overview

Integrate Claude AI into RackCAD as an optional "Enable AI Mode" feature. All existing capabilities remain fully accessible manually. AI Mode adds a three-tier intelligence layer: rule-based algorithms (always available, offline), a local LLM via Ollama/LM Studio (offline AI), and the Claude API (online AI). Users interact through a chat panel and inline property hints, with a suggest-then-apply workflow — Claude proposes changes, the user previews and commits them.

---

## Goals

- AI Mode is **optional** — zero impact on users who don't enable it
- All 7 feature areas work **offline** via the Rule Engine tier
- Local LLM tier provides AI offline; Claude API provides AI online
- Changes are never applied silently — always **suggest → preview → Apply**
- Fully **undoable** via existing `history.ts` undo stack
- API key stored in `localStorage` only, never logged or proxied

---

## Architecture

### Three-Tier Provider Strategy

| Tier | Provider | Trigger |
|---|---|---|
| 1 | `RuleEngine` | Always available — no network, no LLM |
| 2 | `LocalLLMProvider` | Ollama/LM Studio at `localhost:11434` reachable |
| 3 | `ClaudeProvider` | `ANTHROPIC_API_KEY` set and `api.anthropic.com` reachable |

Provider detection runs at AI Mode enable time and on each request. Tiers are tried in reverse priority (Claude → Local → Rules). Rules always succeed.

### New Files

```
src/ai/
  provider.interface.ts     — AIProvider interface: analyze(), suggest(), stream()
  rule-engine.ts            — Tier 1: algorithmic routing, validation, catalog logic
  local-llm-provider.ts     — Tier 2: fetch() to Ollama OpenAI-compat API
  claude-provider.ts        — Tier 3: Anthropic SDK, streaming, claude-opus-4-7
  provider-registry.ts      — Runtime tier detection, returns active AIProvider
  state-serializer.ts       — AppState → compact RackContext JSON (~2–8KB)
  diff-applier.ts           — RackDiff → AppState mutations via stateManager
  ai-service.ts             — Orchestrates: detect → serialize → call → stream → EventBus

src/components/
  ai-panel.ts               — Chat panel UI (collapsible, right side)
  ai-panel.css              — Chat panel styles

src/styles/
  ai-panel.css              — AI panel and hint styles
```

### Modified Files

| File | Change |
|---|---|
| `src/components/toolbar.ts` | Add AI Mode toggle button + provider badge |
| `src/components/properties.ts` | Inject `AIHintsSection` at bottom when AI Mode on + object selected |
| `src/renderers/cable-renderer.ts` | Render yellow preview highlight ring from `AppState.previewDiff` |
| `src/renderers/device-renderer.ts` | Render yellow preview highlight ring from `AppState.previewDiff` |
| `src/core/state.ts` | Add `aiMode: boolean`, `aiProvider: string`, `previewDiff: RackDiff | null` |
| `src/core/types.ts` | Add `RackContext`, `RackDiff`, `AIHint` interfaces |
| `src/core/event-bus.ts` | Add `ai:request`, `ai:response`, `ai:provider-changed` events |
| `src/app.ts` | Wire AI Mode toggle, subscribe to AI events |

### Data Flow

```
User types in chat / selects object
  → ai-service.ts serializes AppState → RackContext JSON
  → provider-registry.ts selects active tier
  → Provider streams: explanation text + RackDiff JSON
  → Chat panel streams explanation word-by-word
  → Diff card appears with [Preview] [Apply] [✕]
  → Preview: sets AppState.previewDiff → renderers draw yellow highlights
  → Apply: diff-applier mutates stateManager → history.push() → renderAll()
  → Ctrl+Z: full undo via existing history stack
```

---

## State Serialization

`state-serializer.ts` extracts a `RackContext` snapshot — structural data only, no SVG/render state:

```typescript
interface RackContext {
  racks: {
    id: string; name: string; units: number;
    devices: {
      id: string; type: string; model: string;
      ruStart: number; ruEnd: number;
      ports: { id: string; type: string; side: string; connected: boolean }[];
      power?: number; weight?: number;
    }[];
    pdus: { side: string; watts: number }[];
  }[];
  cables: {
    id: string; type: string; color: string;
    fromPort: string; toPort: string;
    routingMode: string; anchors: { x: number; y: number }[];
  }[];
  validation: { alerts: { severity: string; message: string }[] };
  selectedId?: string;
}
```

---

## Claude Prompt Design

### System Prompt (sent once, prompt-cached)

```
You are an expert datacenter engineer assistant embedded in RackCAD.
You have full knowledge of the current rack layout provided as JSON.

Always respond with valid JSON matching this exact schema:
{"explanation": "<streamed to user>", "diff": <RackDiff> | null}

diff is null for analysis/questions with no canvas change.
For diffs: use minimal operations — only change what was asked.
Validate before suggesting: power <80% capacity, weight within limits,
port media/speed compatibility. Respect routingMode per cable.
```

### User Message Structure

```
[CONTEXT]
<RackContext JSON>

[REQUEST]
<user chat message | "Analyze selected: <selectedId>">
```

### RackDiff Response Schema

```typescript
interface RackDiff {
  explanation: string;
  diff: {
    addDevices?:    DeviceData[];
    removeDevices?: string[];
    updateDevices?: (Partial<DeviceData> & { id: string })[];
    addCables?:     CableData[];
    removeCables?:  string[];
    updateCables?:  (Partial<CableData> & { id: string })[];
    updateAnchors?: { cableId: string; anchors: Point[] }[];
    addRacks?:      RackData[];
    updateRacks?:   (Partial<RackData> & { id: string })[];
  } | null;
}
```

LLM tiers enforce this schema via `output_config: { format: { type: "json_schema" } }`.  
Rule Engine produces the identical shape — `diff-applier.ts` is provider-agnostic.

---

## UI Components

### 1. AI Mode Toggle (Toolbar)

Single icon button with auto-updating provider badge:
- `⚙ Rules` — Rule Engine active
- `⚡ Local` — Local LLM active  
- `☁ Claude` — Claude API active
- `☁ ✕` — Claude error, downgraded

Click toggles `AppState.aiMode`. Badge reflects `AppState.aiProvider`.

### 2. AI Chat Panel (`ai-panel.ts`)

Collapsible panel, right side, alongside Properties:

```
┌─────────────────────────────┐
│ ☁ Claude  ●  AI Assistant  │
├─────────────────────────────┤
│  [conversation history]     │
│                             │
│  ┌─ Suggested changes ────┐ │
│  │ • 12 cables re-routed  │ │
│  │ • 3 anchors updated    │ │
│  │ [Preview] [Apply] [✕] │ │
│  └────────────────────────┘ │
├─────────────────────────────┤
│ [Type a request...      ] ▶ │
└─────────────────────────────┘
```

- Explanation streams word-by-word
- Diff card appears after full response received
- `Preview` → yellow canvas highlights
- `Apply` → commits to state + undo stack
- `✕` → dismisses diff, keeps explanation

### 3. Inline AI Hints (Properties Panel)

`AIHintsSection` injected at Properties panel bottom on object selection:

```
┌─ AI Insights ──────────────────┐
│ ⚠ Rack A: 78% power capacity  │
│ ✓ Cable bend radius OK         │
│ 💡 Move server to RU 15-16     │
│                    [Apply] [✕] │
└────────────────────────────────┘
```

Re-evaluates on every selection change. Rule Engine: instant. LLM tiers: shimmer → populate.

| Selected | Rule Engine | LLM Enhancement |
|---|---|---|
| Rack | Power %, weight %, free RUs | Optimisation suggestions |
| Device | Port utilisation, placement | Airflow/placement advice |
| Cable | Bend radius, media match | Routing narrative |
| Port | Connected/available | Compatible device suggestions |

### 4. Canvas Preview Overlay

`AppState.previewDiff` drives a yellow highlight ring in cable and device renderers. Cleared on Apply or dismiss. No new renderer files — injected into existing render passes.

### 5. API Key Modal

Shown on first AI Mode enable when no key is found in `localStorage`:

```
┌─ Connect to Claude ──────────────────────┐
│  Enter your Anthropic API key to enable  │
│  cloud AI. Leave blank for Local/Rules.  │
│                                          │
│  [sk-ant-...........................] 👁  │
│  Key stored in localStorage only.        │
│         [Skip]        [Connect]          │
└──────────────────────────────────────────┘
```

Key stored as `rackcad_anthropic_key`. "Disconnect" in toolbar settings clears it.

---

## Feature Coverage

### 1. Enhanced Visual Modes *(rear-view, skeleton, depth, no-cover)*
- **Rules:** Complete rear-view depth rendering, skeleton wireframe, no-cover toggle in renderers
- **LLM:** *"Show rear view"* → diff sets `viewMode: "rear"` in AppState

### 2. Advanced Cable Auto-Routing / Tray Management
- **Rules:** Extend `routing.ts` — overhead vs underfloor tray paths, A* obstacle avoidance around device bounding boxes, lane staggering
- **LLM:** *"Route all storage cables underfloor"* → diff updates `routingMode` + recalculates anchors by cable type/color

### 3. Export Enhancements *(DXF / SVG / PDF)*
- **Rules:** Extend `export.ts` — structured PDF (rack summary, port mapping table, cable legend matching reference image), SVG crop-to-selection, DXF geometry
- **LLM:** *"Generate a deployment report"* → Claude writes design notes + network summary narrative into the PDF template

### 4. Custom Device Spec Builder
- **Rules:** UI form in Properties: name, U-size, port layout, power, weight, front panel image → saves to local catalog
- **LLM:** *"Add a 2U server with 4x SFP+ and 2x RJ45, 450W"* → diff generates complete `DeviceData` template

### 5. Catalog Expansion
- **Rules:** Hand-authored templates in `device-catalog.ts`:
  - Switches: 4 / 8 / 12 / 16 / 24 / 48 port variants
  - PDUs: Vertical, Horizontal, Smart, Basic (all categories)
  - Routers, patch panels, KVM switches, console servers, cable managers, blanking panels
- **LLM:** *"Add a Cisco Catalyst 9300 48-port"* → Claude generates full device template JSON

### 6. Cable Routing Improvements
- **Rules:** Snap-to-tray-channel anchors, obstacle bounding-box avoidance, bundle grouping by network type/color
- **LLM:** *"Untangle cables between RU 14 and 20"* → diff recalculates anchor positions to minimise crossings

### 7. Validation Rules
- **Rules:** Extend `validation.ts`:
  - Rack weight accumulation vs floor/rack limit
  - Per-rack power draw vs PDU rating (warn ≥80%, error ≥95%)
  - Port media/speed mismatch detection
  - Duplicate IP detection, missing redundancy warnings
- **LLM:** *"Is this rack safe to deploy?"* → plain-English audit report with prioritised remediation steps

---

## Error Handling

### Provider Failures

| Failure | Behaviour |
|---|---|
| Claude 401 invalid key | Badge → `☁ ✕`, toast: *"Claude key invalid — switched to Local"*, auto-downgrade |
| Claude 429 rate limit | Exponential backoff × 3, then downgrade, toast with retry countdown |
| Ollama unreachable | Silent skip to Rules tier |
| All LLM tiers fail | Rules tier always succeeds — no error shown |
| Network drops mid-stream | Partial explanation shown, Apply hidden, toast: *"Connection lost"* |

### Diff Application

| Failure | Behaviour |
|---|---|
| Invalid diff schema | Diff card hidden, explanation shown, console warning |
| RU conflict | Diff-applier finds nearest free RU, notes adjustment in explanation |
| Port already connected | Cable skipped, noted in explanation |
| Any Apply | Pushed to `history.ts` undo stack — Ctrl+Z reverses |

---

## Streaming UX

- Explanation streams word-by-word; diff card appears after full JSON parsed
- `◉ Thinking...` spinner during generation
- Follow-up messages queued while response in-flight
- `max_tokens: 4096` for export/report requests; `max_tokens: 1024` for canvas diffs

---

## Security

- API key stored in `localStorage` as `rackcad_anthropic_key` — never logged, never proxied
- Only `RackContext` structural data sent to Claude — no user metadata
- Ollama calls go to `localhost` only — no external network
- Key entry modal shows/hides key with toggle icon

---

## Out of Scope

- Backend proxy / server-side key management (Approach B — deferred)
- Persistent conversation history across sessions
- Multi-user / collaborative AI sessions
- Fine-tuned models or custom Claude deployments
