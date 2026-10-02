# AI Mode System Prompt Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-line AI system prompt with an enhanced version that knows device templateIds, traffic→cable mappings, and Hyper-V cluster wiring conventions, so natural-language infrastructure requests produce correct RackDiff output on the first attempt.

**Architecture:** Extract the shared prompt to `src/ai/system-prompt.ts`, then replace the 6 duplicated `const SYSTEM_PROMPT` blocks across provider files with a single import. The local-llm provider embeds context JSON into the system prompt; it keeps that behaviour while using the shared base.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

---

## File Map

| Action | File | Change |
|--------|------|--------|
| Create | `src/ai/system-prompt.ts` | New file — exports `SYSTEM_PROMPT` |
| Create | `src/__tests__/ai/system-prompt.test.ts` | New test file |
| Modify | `src/ai/claude-provider.ts` | Delete local const, add import |
| Modify | `src/ai/gemini-provider.ts` | Delete local const, add import |
| Modify | `src/ai/openai-provider.ts` | Delete local const, add import |
| Modify | `src/ai/deepseek-provider.ts` | Delete local const, add import |
| Modify | `src/ai/openrouter-provider.ts` | Delete local const, add import |
| Modify | `src/ai/local-llm-provider.ts` | Import base, prepend to inline context prompt |

---

## Task 1: Create `src/ai/system-prompt.ts` with tests

**Files:**
- Create: `src/ai/system-prompt.ts`
- Create: `src/__tests__/ai/system-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ai/system-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../../ai/system-prompt';

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains the JSON output contract', () => {
    expect(SYSTEM_PROMPT).toContain('"explanation"');
    expect(SYSTEM_PROMPT).toContain('"diff"');
  });

  it('maps Hyper-V host to server-2u-enterprise', () => {
    expect(SYSTEM_PROMPT).toContain('server-2u-enterprise');
    expect(SYSTEM_PROMPT).toContain('Hyper-V');
  });

  it('maps 32-port switch to rs-sw-32p', () => {
    expect(SYSTEM_PROMPT).toContain('rs-sw-32p');
  });

  it('maps shared SAN to storage-2u-allflash-nvme', () => {
    expect(SYSTEM_PROMPT).toContain('storage-2u-allflash-nvme');
  });

  it('maps storage traffic to general-a cable type', () => {
    expect(SYSTEM_PROMPT).toContain('general-a');
    expect(SYSTEM_PROMPT).toContain('#00acc1');
  });

  it('maps live migration to live-migration cable type', () => {
    expect(SYSTEM_PROMPT).toContain('live-migration');
    expect(SYSTEM_PROMPT).toContain('#fdd835');
  });

  it('maps heartbeat/cluster to general cable type', () => {
    expect(SYSTEM_PROMPT).toContain('general');
    expect(SYSTEM_PROMPT).toContain('#78909c');
  });

  it('contains storage isolation rule', () => {
    expect(SYSTEM_PROMPT).toContain('STORAGE ISOLATION');
  });

  it('contains Hyper-V cluster wiring rule', () => {
    expect(SYSTEM_PROMPT).toContain('HYPER-V CLUSTER WIRING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/ai/system-prompt.test.ts
```

Expected: FAIL — `Cannot find module '../../ai/system-prompt'`

- [ ] **Step 3: Create `src/ai/system-prompt.ts`**

```typescript
export const SYSTEM_PROMPT = `You are an expert datacenter engineer assistant embedded in Rack Slicer, a professional rack design tool.
You receive the current rack layout as JSON and a user request.

ALWAYS respond with valid JSON matching exactly this schema:
{"explanation": "<markdown text to show the user>", "diff": <RackDiff object> | null}

diff is null when no canvas change is needed (analysis, questions, reports).
For diffs, use minimal operations — only change what was explicitly requested.
For cable routing: respect the current routingMode (overhead/underfloor).
Validate: power draw <80% PDU capacity warning, <95% error; verify port type compatibility.

## DEVICE CATALOGUE
When a user describes a device role, use the templateId from this table. Do not invent templateIds.

| Role | templateId |
|------|-----------|
| 1U server / web server | server-1u |
| 2U server / application server | server-2u |
| Hyper-V host / Windows Server / VM host / virtualization host | server-2u-enterprise |
| HCI node / hyperconverged node | server-2u-hci |
| 4U server / database server | server-4u |
| 8-port switch | rs-sw-8p |
| 16-port switch | rs-sw-16p |
| 24-port switch | rs-sw-24p |
| 32-port L3 switch | rs-sw-32p |
| 48-port switch | rs-sw-48p |
| Enterprise switch (24x RJ45 + 4x SFP+) | sw-enterprise |
| ToR 25G/100G switch | sw-1u-tor-25g-100g |
| Leaf 100G/400G switch | sw-1u-leaf-100g-400g |
| Core/spine switch | sw-2u-spine-64x100g |
| Shared SAN / iSCSI storage / NAS / primary storage array | storage-2u-allflash-nvme |
| 12-bay storage array | storage-12bay |
| 24-bay storage array | storage-24bay |
| All-flash array | storage-aff |
| JBOD / expansion shelf | storage-2u-jbod-shelf |
| Core router | router-core |
| Edge / WAN router | router-1u-edge-wan |
| Firewall / NGFW / perimeter security | fw-enterprise |
| FortiGate firewall | fw-fortigate-400f |
| KVM / console server (8-port) | console-8p |
| KVM / console server (16-port) | console-16p |
| UPS (1.5kW) | ups-2u-1500 |
| UPS (6kW) | ups-3u-6000 |
| PDU (basic 8-port C13) | pdu-basic-8c13 |
| PDU (1U monitored 10-port) | pdu-1u-monitored-10p |
| Patch panel (1U Cat6A 48-port) | patch-1u-cat6a-48p |
| Patch panel (1U fiber SC 24-port) | patch-1u-fiber-sc-24p |

## TRAFFIC CLASSIFICATION
Map every traffic type to exactly the cable type and color shown. Never use a different color or type for these roles.

| Traffic Type | cableType | color |
|-------------|-----------|-------|
| Management / IPMI / iDRAC / BMC / out-of-band | idrac | #e53935 |
| Production / VM traffic / application / data network | vm-network | #fb8c00 |
| Storage / iSCSI / SAN / NAS / block storage | general-a | #00acc1 |
| Live Migration / vMotion / VM mobility | live-migration | #fdd835 |
| Heartbeat / Cluster / HA / corosync / Windows Failover Cluster | general | #78909c |
| Backup / replication / DR traffic | backup | #1e88e5 |
| Ceph / distributed storage primary path | ceph-primary | #43a047 |
| Ceph / distributed storage secondary path | ceph-secondary | #8e24aa |
| Console / serial / KVM | console | #8d6e63 |
| Power (C13 receptacle) | c13-power | #212529 |
| Power (C19 receptacle) | c19-power | #212529 |

## PLANNING RULES
Follow these rules in order before writing any diff:

1. RU PRE-CHECK: Count occupied RU slots in the target rack. Place new devices in free slots from the bottom up unless the user specifies otherwise. Never overlap occupied slots.

2. PORT PLANNING: Before writing addCables, decide which physical port on each device carries which traffic type. Each port carries exactly one traffic type. Include the port assignment plan in your explanation before listing cables.

3. STORAGE ISOLATION (CRITICAL): Cables with cableType "general-a" (storage) must connect to dedicated ports. A port used for storage must never also carry production (vm-network) or management (idrac) traffic. If a device does not have enough ports, say so explicitly and do not create the cables.

4. HYPER-V CLUSTER WIRING: For each Hyper-V host in the cluster, assign ports in this order:
   - 1 port → management (idrac, #e53935)
   - 2 ports → production VM traffic (vm-network, #fb8c00)
   - 2 ports → storage/iSCSI (general-a, #00acc1) — dedicated, never shared
   - 1 port → live migration (live-migration, #fdd835)
   - 1 port → heartbeat/cluster (general, #78909c)
   Total: 7 ports minimum per Hyper-V host.

5. SWITCH PORT GROUPS: When wiring a switch for a Hyper-V cluster, assign contiguous port blocks by traffic type:
   - Ports 1–4: management (idrac)
   - Ports 5–12: production (vm-network)
   - Ports 13–20: storage (general-a) — isolated block
   - Ports 21–24: live migration (live-migration)
   - Ports 25–28: heartbeat/cluster (general)

6. MINIMAL DIFF: Only emit operations explicitly requested. Do not add devices, cables, or racks that were not asked for.

7. BEFORE SUGGESTING DEVICES: Check free RUs in the target rack.
8. BEFORE SUGGESTING CABLES: Verify both source and destination ports are not already connected.`;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/ai/system-prompt.test.ts
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/system-prompt.ts src/__tests__/ai/system-prompt.test.ts
git commit -m "feat(ai): add enhanced system prompt with device catalogue and traffic classification"
```

---

## Task 2: Wire the five cloud providers

**Files:**
- Modify: `src/ai/claude-provider.ts` (lines 19–31)
- Modify: `src/ai/gemini-provider.ts` (lines 25–37)
- Modify: `src/ai/openai-provider.ts` (lines 16–28)
- Modify: `src/ai/deepseek-provider.ts` (lines 16–28)
- Modify: `src/ai/openrouter-provider.ts` (lines 17–29)

Each change is identical: add the import, delete the local const.

- [ ] **Step 1: Update `src/ai/claude-provider.ts`**

Add `import { SYSTEM_PROMPT } from './system-prompt';` on line 4 (after the existing imports).

Delete lines 19–31 (the entire local `const SYSTEM_PROMPT = \`...\`;` block). The file around that area should look like:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_anthropic_key';
const LS_MODEL_KEY = 'rackcad_anthropic_model';
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
// ... AVAILABLE_CLAUDE_MODELS array unchanged ...

function buildUserMessage(context: RackContext, messages: AIMessage[]): string {
```

- [ ] **Step 2: Update `src/ai/gemini-provider.ts`**

Add `import { SYSTEM_PROMPT } from './system-prompt';` after the existing imports (after line 2).

Delete lines 25–37 (the local `const SYSTEM_PROMPT = \`...\`;` block). The file around that area should look like:

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_gemini_key';
// ... rest of file unchanged ...
```

- [ ] **Step 3: Update `src/ai/openai-provider.ts`**

Add `import { SYSTEM_PROMPT } from './system-prompt';` after the existing imports (after line 2).

Delete lines 16–28 (the local `const SYSTEM_PROMPT = \`...\`;` block). The file around that area should look like:

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_openai_key';
// ... rest of file unchanged ...
```

- [ ] **Step 4: Update `src/ai/deepseek-provider.ts`**

Add `import { SYSTEM_PROMPT } from './system-prompt';` after the existing imports (after line 2).

Delete lines 16–28 (the local `const SYSTEM_PROMPT = \`...\`;` block). The file around that area should look like:

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_deepseek_key';
// ... rest of file unchanged ...
```

- [ ] **Step 5: Update `src/ai/openrouter-provider.ts`**

Add `import { SYSTEM_PROMPT } from './system-prompt';` after the existing imports (after line 2).

Delete lines 17–29 (the local `const SYSTEM_PROMPT = \`...\`;` block). The file around that area should look like:

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const LS_KEY = 'rackcad_openrouter_key';
// ... rest of file unchanged ...
```

- [ ] **Step 6: Run the full test suite to verify nothing broke**

```bash
npx vitest run
```

Expected: same pass/fail counts as baseline (690 passing, 7 failing — the 7 pre-existing failures are unrelated to this change). The new system-prompt tests also pass.

- [ ] **Step 7: Commit**

```bash
git add src/ai/claude-provider.ts src/ai/gemini-provider.ts src/ai/openai-provider.ts src/ai/deepseek-provider.ts src/ai/openrouter-provider.ts
git commit -m "refactor(ai): import shared SYSTEM_PROMPT in all cloud providers"
```

---

## Task 3: Wire `local-llm-provider.ts`

**Files:**
- Modify: `src/ai/local-llm-provider.ts` (lines 27–35)

The local-llm provider is different: it embeds the rack context JSON directly inside the system prompt (not the user message). Keep that behaviour — just prepend the shared base prompt before the context JSON.

Current code at lines 27–35:
```typescript
const systemPrompt = `You are an expert datacenter engineer assistant. The current rack layout is:
${contextJson}

ALWAYS respond with valid JSON matching exactly this schema:
{"explanation": "<markdown text to show the user>", "diff": <RackDiff object> | null}

diff is null when no canvas change is needed (analysis, questions).
For diffs, use minimal operations — only change what was explicitly requested.
Check free RUs before adding devices. Verify ports are not connected before adding cables.`;
```

- [ ] **Step 1: Add the import to `src/ai/local-llm-provider.ts`**

Add `import { SYSTEM_PROMPT } from './system-prompt';` after line 2 (the existing imports). The top of the file should become:

```typescript
import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';
import { RuleEngine } from './rule-engine';
import { SYSTEM_PROMPT } from './system-prompt';

const OLLAMA_BASE = 'http://localhost:11434';
```

- [ ] **Step 2: Replace the inline system prompt construction (lines 27–35)**

Replace:
```typescript
const systemPrompt = `You are an expert datacenter engineer assistant. The current rack layout is:
${contextJson}

ALWAYS respond with valid JSON matching exactly this schema:
{"explanation": "<markdown text to show the user>", "diff": <RackDiff object> | null}

diff is null when no canvas change is needed (analysis, questions).
For diffs, use minimal operations — only change what was explicitly requested.
Check free RUs before adding devices. Verify ports are not connected before adding cables.`;
```

With:
```typescript
const systemPrompt = `${SYSTEM_PROMPT}

## CURRENT RACK LAYOUT
${contextJson}`;
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: same pass/fail counts as baseline (690 passing, 7 pre-existing failures). No new failures.

- [ ] **Step 4: Commit**

```bash
git add src/ai/local-llm-provider.ts
git commit -m "refactor(ai): use shared SYSTEM_PROMPT in local-llm provider"
```

---

## Manual Verification

After all three tasks are complete, start the dev server and open the app:

```bash
npm run dev
```

1. Open the app in the browser. AI Mode is on by default (from the earlier change).
2. In the AI chat panel, paste this exact request:

> Create a 2-node Hyper-V cluster with shared SAN storage. Put both Hyper-V servers in the same rack and add a 32-port L3 switch. Create separate cable routing for Management, Production Network, Storage, Live Migration and Heartbeat/Cluster traffic. Keep storage traffic isolated from normal network traffic and show the cable paths clearly.

3. Click Apply on the suggested diff and verify:
   - [ ] Two `server-2u-enterprise` devices appear in the same rack
   - [ ] One `rs-sw-32p` switch appears in the same rack
   - [ ] One `storage-2u-allflash-nvme` SAN unit appears
   - [ ] Red cables connect management ports
   - [ ] Orange cables connect production/VM ports
   - [ ] Cyan cables connect storage/iSCSI ports
   - [ ] Yellow cables connect live migration ports
   - [ ] Grey cables connect heartbeat/cluster ports
   - [ ] No port carries both storage and production traffic
