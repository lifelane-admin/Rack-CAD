# Rack Slicer — Resume-Development Handoff

This file exists so a session on a **different Claude account/machine** can resume work
instantly, with zero re-discovery. Read this file first, before touching code.

## 0. Get it running (30 seconds)

This archive already includes `node_modules/`, so no `npm install` is required.

```bash
cd Rack_Design
npm run dev       # Vite dev server — usually http://localhost:5173 (falls back to 5174+ if busy)
```

Other useful scripts (from `package.json`):
```bash
npm run build      # tsc typecheck + vite production build -> dist/
npm test           # vitest run (159 tests as of this handoff, all passing)
npm run test:watch # vitest watch mode
npm run preview    # preview a built dist/
```

Environment this was developed in: Node v24.18.1 / npm 11.16.0, Windows, git bash shell.
No `chromium-cli`/`playwright` was available in that environment — UI changes were verified by
code-tracing + `tsc`/tests, not live screenshots. If the new environment has browser automation,
prefer actually driving the app for real.

## 1. What this project is

A browser-based, client-only (no backend) rack-elevation design tool — "Rack Slicer". Users drag
devices (servers, switches, routers, firewalls, PDUs, UPS, patch panels, NAC appliances, ATS
switches, etc.) onto rack elevations, wire them with cables, configure per-device specs, and
export/save the design. Built with vanilla TypeScript + hand-drawn SVG renderers (no React/Vue) —
Vite for dev/build, Vitest for tests.

Key architecture, if you need to navigate cold:
- `src/core/state.ts` — the single `StateManager` (all app state: racks, devices, cables, UI
  flags). `stateManager.setState()` is the only way state changes.
- `src/core/types.ts` — every data shape (`DeviceData`, `CableData`, `*Config` per device
  category, `AppEvents` for the event bus's payload types).
- `src/core/event-bus.ts` — typed pub/sub (`eventBus.on`/`.emit`) wiring UI components to
  `app.ts`'s handlers. **The canvas does NOT auto-redraw on `state:changed`** — see gotcha #1
  below, this bites every new feature.
- `src/app.ts` — the big one: owns the SVG canvas, all mouse/keyboard interaction (drag, cable
  drawing, selection), and most `eventBus.on(...)` handlers that mutate state.
- `src/renderers/*.ts` — one file per device-panel visual (`switch-renderer.ts`,
  `firewall-renderer.ts`, `pdu-renderer.ts`, `nac-renderer.ts`, `ats-renderer.ts`, ...).
  `panel-renderer.ts` dispatches to the right one by `DeviceCategory`. Each renderer draws into a
  **nested, clipped `<svg viewBox>`** — see gotcha #3.
- `src/library/device-catalog.ts` — the static list of draggable device templates (`id`,
  `category`, default `deviceConfig`, `ports`).
- `src/components/*.ts` — sidebar (device palette), toolbar, floating-toolbar, properties panel
  (per-category config UI), statusbar.
- `New_Development/` — reference JSX mockups (React) that are the **visual design spec** for
  high-fidelity renderers. Treated as source-of-truth when asked to "match the reference" or
  "flush" a device's graphics. See gotcha #6.

## 2. State as of this handoff (2026-07-31)

Latest commit: `8f3f0b8` — "feat: NAC/ATS device renderers, Airdrop Destination cables, native
file save/open", on top of `34b3575` ("Enterprise Switch/Firewall SDK configurators, WAN ports,
port groups, font colors; remove auto-save").

**Working tree is clean** except:
- `.claude/`, `.superpowers/` — Claude Code tool-local state (worktrees, brainstorm scratch).
  Not project source; ignore.
- Untracked reference photos: `New_Development/NPCI Router.png`, `NPCI Switch.png`,
  `IFTAS Router.png` — real customer-rack device photos dropped in but **not yet consumed by any
  code**. Nothing currently reads them. If asked to build device templates from them, that's new,
  unstarted work (see the NPCI/IFTAS note in gotcha #7 first — those *were* built as bespoke
  device templates once, then intentionally removed in favor of generic, parametrically
  configurable Enterprise Switch/Router/Firewall templates. Confirm with the user whether they
  want bespoke templates back or want the generic ones tuned to match these photos, before
  building anything).

Build/tests were green at handoff time: `npx tsc --noEmit` clean, `npm run build` succeeds,
`npx vitest run` → 17 files / 159 tests passing.

### Features completed in the last session (commit `8f3f0b8`)
- **NAC appliance** device category (`nac`): `NacConfig`/`NacVendor` types, `nac-renderer.ts`
  (chassis + RJ45 uplinks + MGMT/Console/USB, vendor skins for ForeScout/Cisco ISE/Aruba
  ClearPass/generic), catalog entry `nac-enterprise`, properties-panel configurator, sidebar
  category, wired into `panel-renderer.ts`/`device-renderer.ts`/`port-renderer.ts`.
- **ATS (Automatic Transfer Switch)** device category (`ats`): `AtsConfig` type,
  `ats-renderer.ts` (dual SOURCE A/B power inlets + transfer-status indicator + output outlets),
  catalog entry `ats-enterprise`, properties configurator, sidebar category, same wiring as NAC.
- **Fortinet firewall preset** (`fw-fortinet-preset`) — Enterprise Firewall engine pre-skinned to
  the Fortinet vendor palette, to replicate a real customer rack's "Firewall 1/2" as-is.
- **"Airdrop Destination" cable mode** — a floating-toolbar toggle
  (`cable:toggle-airdrop-destination` event, `AppState.airdropDestination` flag). While a
  (non-power) cable is being drawn from a real source port, clicking anywhere on empty canvas
  finishes the cable at that exact point (`CableData.floatingDest`) instead of requiring a real
  destination port. The dropped end can be dragged later onto a real port to correct it. Logic:
  `App.commitCableToFloatingDestination()` in `app.ts`; rendering in `cable-renderer.ts` draws the
  correct connector art (Ethernet clip vs. power plug) at a floating end same as a real one.
- **Native file Save/Save As/Open** via the File System Access API (`showSaveFilePicker` /
  `showOpenFilePicker`, Chromium-only) — plain "Save" now re-writes the previously
  opened/saved file (remembered as `App.fileHandle`) instead of always downloading a fresh blob,
  matching normal desktop-app Ctrl+S behavior. Falls back to the old download-a-blob /
  `<input type=file>` behavior on browsers without the API (Firefox, Safari). See
  `App.saveProject()` / `App.openProject()` in `app.ts`.

All four ship with real tests: `src/__tests__/device-catalog.test.ts` (NAC/ATS/Fortinet-preset),
`src/__tests__/airdrop-destination.test.ts` (end-to-end through a real mounted `App`, not just
state assertions), `src/__tests__/cable-renderer.test.ts`, `src/__tests__/routing.test.ts`,
`src/__tests__/file-save-open.test.ts`.

### Not yet started
- Nothing is mid-flight — the last feature set was completed, tested, and committed whole. The
  only open question is the NPCI/IFTAS reference photos above.

## 3. Hard-won gotchas (read before touching related code)

These are lessons paid for with real debugging cycles in prior sessions. They won't be visible
from reading the code cold.

1. **Canvas is not reactive to `state:changed`.** `stateManager.setState()` does NOT trigger a
   redraw — only non-canvas UI (toolbar/statusbar) listens to `state:changed`. Every new
   state-mutating event handler must call `this.renderAll()` itself, OR register a dedicated
   `eventBus.on('your:event', () => this.renderAll())` **after** whatever handler actually mutates
   the state (event-bus listeners run in registration order — registering the render call first
   means it renders stale pre-mutation state). This caused a real bug: opening a saved project
   updated state correctly but the canvas never redrew, and the user reported it as "not saving
   objects" when the data was actually fine.

2. **Port IDs are not stable from catalog → render.** `port-renderer.ts` decides ear-hole bezel
   styling by checking `port.id.includes('-ear-')`, but both `app.ts`'s drag-drop instantiation
   and `state.ts`'s demo loader rewrite every port ID to `${deviceId}-port-${i}` on placement,
   discarding any `-ear-` the catalog template had. Ear-port generation actually lives in
   `state.ts`'s `injectEarPorts()` (called from `prepareDevices()` on every `setState`), which
   runs *after* instantiation and is hardcoded to specific categories
   (`server, switch, router, firewall, ups, storage, console`). Any ID-keyed feature must live in
   that post-instantiation path, not as static catalog IDs.

3. **Nested `<svg>` clips.** Every panel renderer returns a `<g>` wrapping an inner
   `<svg viewBox="0 0 W H">`, and nested SVGs clip to their own viewport by default — unlike the
   much larger canvas in the `New_Development/` JSX reference mockups. Anything drawn outside
   `0..W`/`0..H` in a renderer silently vanishes (no error, `tsc`/tests/build all pass — it's a
   geometry bug, not a wiring bug). If something must visually extend past a device's own
   footprint (cords, overhanging brackets), draw it in the *outer* `<g>` instead (see
   `port-renderer.ts`'s ear ports with negative `relativeX`, or `rack-renderer.ts`'s side-PDU
   zones). Also sanity-check absolute sizes against the real panel height — often only ~26-30px
   for a 1U device — before copying pixel values from a much bigger reference canvas.

4. **Prefer real data over a demo's fake simulation.** If a `New_Development/` reference includes
   a manual/fake data-entry panel for something this app can already compute for real (e.g.
   connected-device wattage via actual `CableData` + per-template `powerWatts`, vs. the
   reference's hand-typed "Rack Load Simulation" list), wire the real computation. Don't assume
   "match the reference exactly" extends to replicating its placeholder-data mechanism too — ask
   first if genuinely ambiguous.

5. **Device orientation/height is placement-time-fixed, not a live config field.** Horizontal
   (rack-mount) vs. vertical (0U side-mount) PDU placement, and `heightUnits` for any device
   category, are tied to which catalog template/placement mechanism was used and are NOT
   toggleable from the properties panel — re-parenting a device between placement mechanisms at
   runtime isn't supported anywhere in the app today. Treat "let me switch this PDU to side-mount"
   as a new structural feature to scope, not a config-field addition.

6. **`New_Development/*.jsx` files are the visual design spec**, not just inspiration — when
   asked to "flush"/improve a device's graphics or "match the reference", it means porting the
   JSX component's actual layout/graphics logic into this repo's vanilla-DOM renderer style (see
   `switch-renderer.ts` as the established pattern: nested `<svg>` with its own big coordinate
   space, non-uniform `preserveAspectRatio="none"` scaling down to the real device box,
   `<symbol>`+`<use>` for repeated parts, a random `uid` namespacing every gradient/filter/symbol
   id so multiple instances on one page never collide). These reference files usually cover more
   device categories than the literal request — read the whole file and surface the expanded
   scope rather than silently in/excluding it. Also check first whether an existing subsystem is
   already MORE sophisticated than the reference (e.g. `pdu-renderer.ts`'s real per-country socket
   graphics beat the reference's 5 generic socket types) — in that case merge (keep the better
   existing part, adopt the reference's chassis/LED/brand polish) rather than overwrite.

7. **Router/firewall/KVM/console/patch-panel port specs were deliberately changed (2026-07-29)**
   to match `New_Development/rack-catalog-demo.jsx` exactly, per explicit user choice, even where
   it changed real specs of existing templates (e.g. `fw-4p` went from 4 plain RJ45 ports to 6
   ports across WAN/LAN/DMZ/HA groups; `router-4p` lost its 2 SFP ports to become pure RJ45).
   `router-core` and `fw-fortigate-400f` were deliberately kept on their own dedicated renderers
   since the reference doesn't model either. If an existing saved design shows different ports
   than expected for these categories, this is why — not a bug. Generation logic lives in
   `src/renderers/networking-renderer.ts`'s `buildGroups()`/`networkingPorts()`.
   Separately: `sw-npci`, `sw-dell`, `sw-aruba-6200f`, `router-npci`, `router-iftas` were bespoke
   device templates built to replicate one specific real customer rack ("NTT DC Rack"), then
   **intentionally removed** from the catalog in favor of the generic configurable Enterprise
   Switch/Router/Firewall SDK (`sw-enterprise`, `fw-enterprise`, `fw-fortinet-preset`, etc.) — see
   the comment at `src/__tests__/device-catalog.test.ts:85-86`.

8. **When committing, isolate this session's hunks.** This repo's working tree has repeatedly had
   *other* unrelated uncommitted work sitting around from different tasks/sessions (sometimes
   mixed into the same file as the current session's change). Never blindly `git add -A`/`git
   add .`. Check `git diff --stat` per file against what the current session actually touched; for
   a file with mixed content, extract just the relevant hunk(s) into a patch and
   `git apply --cached` it rather than staging the whole file.

9. **No browser automation available in the dev environment this was built in** (no
   `chromium-cli`/`playwright`, network installs were blocked). UI changes were verified by
   tracing the render logic + `tsc`/tests, and explicitly flagged as not screenshot-verified.
   If the new environment has working browser automation, prefer actually driving the app.

10. **Only one dev-server copy should be running at a time.** A prior session found two on-disk
    copies of this repo (the main one here, and a `.claude/worktrees/agent-<hash>` sub-worktree
    used by a parallel agent) and wasted a debugging cycle editing the wrong one. Before editing,
    if anything seems to not take effect, confirm which copy the running Vite process actually
    resolved (check `node_modules` path in the process command line). This exported archive
    intentionally excludes `.claude/worktrees/` to avoid recreating that ambiguity — there should
    be exactly one copy of this repo in the new environment.

## 4. What's excluded from this export, and why

To keep the archive a single, unambiguous copy of the live project:
- `.claude/worktrees/` — a nested duplicate git worktree from a parallel-agent session (see
  gotcha #10). Do not recreate this ambiguity in the new environment.
- `.superpowers/` — Claude Code brainstorm/session scratch artifacts, not project source.
- `dist/` — build output, regenerate with `npm run build` in seconds.
- `scratch/` — empty, gitignored working-file dir.
- `RackSlicer_v1.zip`, `RackSlicer_Package/`, `Rack_CAD_Compact_Bundle/` — older **standalone
  static exports** from previous sessions (pre-built HTML/JS snapshots for sharing, not the live
  source). Superseded; the live source in `src/` is always the current truth.
- `project_export.md` — an old export-format doc, superseded by this file.

Everything else — including `.git/` (full history) and `node_modules/` (so no `npm install`
step is needed) — is included.
