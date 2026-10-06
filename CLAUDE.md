# RackSlicer — Project Instructions

## What This Is

Professional datacenter infrastructure CAD tool. Users design rack layouts, cable runs, device placement, power/cooling topology, and cloud architecture diagrams. AI providers generate natural language commands that produce structured `RackDiff` JSON, which is applied to the canvas.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript ~6.0 |
| Bundler / Dev Server | Vite 8.x |
| Test runner | Vitest 4.x + happy-dom |
| 3D rendering | Three.js 0.177 |
| AI SDK | @anthropic-ai/sdk 0.115 |
| UI framework | **Vanilla TypeScript** (no React/Vue) |
| Font | Inter (@fontsource) |

## Build & Run

```powershell
npm run dev          # start Vite dev server
npm run build        # tsc + vite build
npm run test         # vitest run (single pass)
npm run test:watch   # vitest watch
npm run test:ui      # vitest UI
```

## Project Structure

```
src/
  core/          State (StateManager singleton), canvas, types, event-bus, history, validation
  components/    UI components — modals, toolbars, panels (vanilla TS DOM)
  renderers/     2D SVG canvas renderers per element type
  datacenter/    Datacenter floor plan canvas & device index
  library/       Device catalog, custom asset catalog
  three/         Three.js 3D viewport (SceneManager, CameraManager, rack/device builders)
  ai/            Multi-provider AI layer
    registry/    Model registry + per-provider adapters
    studio/      AI Studio (avatar, BOM engine, intent manager)
    workflow/    Workflow orchestrator, stage renderers, requirement engine
  mcp/           Secure MCP control plane (gateway, RBAC, audit, tools, resources)
  auth/          Auth store
  export/        Export / report builders
  storage/       File save/open persistence
  styles/        CSS — one file per UI area
  __tests__/     All tests (Vitest)
```

## Key Entry Points

| What | Where |
|------|-------|
| App boot | `src/main.ts` → `src/app.ts` (`App.init()`) |
| Domain types | `src/core/types.ts` |
| Global state | `src/core/state.ts` (`stateManager` singleton) |
| Event bus | `src/core/event-bus.ts` |
| AI types | `src/ai/types.ts` (`AIProvider`, `RackDiff`, `RackContext`) |
| AI service | `src/ai/ai-service.ts` |
| AI provider list | `src/ai/provider-registry.ts` |
| MCP gateway | `src/mcp/gateway.ts` (`McpGateway.handleToolCall`) |
| 3D viewport | `src/three/ThreeViewport.ts` |

## AI System — How It Works

1. `ai-service.ts` serializes current canvas state → `RackContext` via `state-serializer.ts`
2. Sends to active provider (Gemini / DeepSeek / OpenRouter / OpenAI / Claude / Local / Rules)
3. AI streams back a `RackDiff` JSON (`{ explanation, diff: { addDevices, removeDevices, ... } }`)
4. `diff-applier.ts` validates and applies the diff immediately to `stateManager`
5. All AI→core calls route through `McpGateway` with RBAC, rate limiting, and audit logging

**Fallback:** `RuleEngine` (provider `'rules'`) is always available — no API key needed, produces rule-based hints.

## MCP Control Plane

`src/mcp/` is the security boundary between AI models and RackSlicer Core. Key properties:
- Prohibited commands (shell, SQL, filesystem exec) are blocked at the gateway
- RBAC: roles are `designer`, `viewer`, `admin`
- Sliding-window rate limiter (120 req/min per tenant)
- Immutable audit trail via `McpAuditLogger`
- Execution modes: `assisted` (preview + confirm) | `autonomous` (auto-apply)

## Conventions

- **No framework** — all UI is vanilla TypeScript manipulating the DOM directly
- **Immutable state updates** — never mutate existing objects; return new copies
- **Event bus** — cross-module communication goes through `eventBus.emit/on`; avoid direct coupling
- **StateManager singleton** — `stateManager` from `src/core/state.ts` is the single source of truth
- **Test files** live in `src/__tests__/`, named `<feature>.test.ts`
- **Commit style**: `type(scope): description` — types: `feat`, `fix`, `refactor`, `test`, `chore`, `perf`

## Testing

```powershell
npm run test             # run all tests once
```

Tests use `happy-dom` (no real browser). Vitest globals enabled. Test pattern: `src/__tests__/**/*.test.ts`.

## DCIM Validation Rules & False-Positive Prevention

When working with datacenter validation, power distribution, and cable schedules:
1. **0U Vertical PDUs & Side-Mount Equipment**:
   - Side-mount equipment (e.g. `vpdu-legrand-is`, `LCS3-IS`, vertical cable managers) mounts in zero-U side channels with `uStart: 0` and `heightU: 0`.
   - Never flag `uStart: 0` or `heightU: 0` as invalid U positions or bounds errors in `USpaceEngine` or `DeterministicValidator`.
   - In Excel exports, format as `0U (Side)` / `0U (Side-Mount)` rather than `U0`.
2. **Dual PSU & Dual PDU Redundancy**:
   - Compute devices with 2 PSUs connect Left Ear Power (PSU 1 / Feed A) and Right Ear Power (PSU 2 / Feed B).
   - `ModelMigrationAdapter` must always detect power cables across both PSUs and feeds regardless of whether `type` is `power`, `c13-power`, or connected to PDU `outlet-*` sockets.
   - Dual-corded servers on separate PDUs/feeds must evaluate as `1+1 Redundant` with zero power warnings.
3. **Ear Port Pass-Through Speeds & Transceivers**:
   - Ear data ports (e.g. `Right Ear S2-P1`) represent physical routing conduits for body PCIe NICs.
   - They inherit speed and connector (e.g. `10GbE SFP+`) from chassis body ports or connected transceivers/DACs. Never force them to generic 1GbE RJ45.
   - Power cables and PDU outlets are strictly excluded from network transceiver/speed mismatch checks.

**Coverage target:** 80% minimum. Write tests first (RED → GREEN → REFACTOR).

## Important Notes

- `src/app.ts` is very large (>380 KB) — read it in chunks with `offset`/`limit`
- `vite.config.ts` excludes `New_Development/`, `New_Switch_Design/`, `.superpowers/` from the watcher
- No CLAUDE.md existed before — this file was generated by codebase onboarding
