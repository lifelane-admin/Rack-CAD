# AI Mode System Prompt Enhancement

**Date:** 2026-10-02
**Status:** Approved

## Problem

The current AI Mode system prompt is 8 lines. It has no knowledge of:
- Which RackSlicer `templateId` values map to real-world device roles
- Which cable types map to network traffic classifications
- Infrastructure topology conventions (e.g. Hyper-V cluster wiring)

As a result, when a user asks the AI to build something like:

> "Create a 2-node Hyper-V cluster with shared SAN storage. Put both Hyper-V servers in the same rack and add a 32-port L3 switch. Create separate cable routing for Management, Production Network, Storage, Live Migration and Heartbeat/Cluster traffic."

…the AI guesses at device templates and cable types, producing inconsistent and incorrect results.

## Goal

When a user describes an infrastructure requirement in plain English, the AI must select the correct device templates, assign the correct cable types per traffic class, enforce port isolation between traffic types, and produce a complete, visually clear RackDiff on the first attempt.

## Approach

Enhance the system prompt — no UI changes, no schema changes, no new dependencies. Extract the prompt to a single shared file (`src/ai/system-prompt.ts`) imported by all providers.

## Design

### 1. File Structure

**New file:** `src/ai/system-prompt.ts`
- Exports `SYSTEM_PROMPT: string`
- Single source of truth for all providers

**Modified files (import swap only):**
- `src/ai/claude-provider.ts`
- `src/ai/gemini-provider.ts`
- `src/ai/openai-provider.ts`
- `src/ai/deepseek-provider.ts`
- `src/ai/openrouter-provider.ts`
- `src/ai/local-llm-provider.ts` — imports `SYSTEM_PROMPT` as base, appends rack context JSON below it

### 2. Enhanced System Prompt Structure

The new prompt has five sections:

#### Section A: Role (unchanged)
Identifies the assistant as a datacenter engineer embedded in RackSlicer.

#### Section B: Output Format (unchanged)
JSON contract: `{ "explanation": "<markdown>", "diff": <RackDiff> | null }`

#### Section C: Device Catalogue Reference Table

Maps plain-English device roles to exact `templateId` values:

| Role | templateId | Notes |
|------|-----------|-------|
| 1U Server / Web server | `server-1u` | |
| 2U Server / App server | `server-2u` | |
| Hyper-V host / Windows Server / VM host | `server-2u-enterprise` | 4x SFP28 + MGMT |
| HCI Node | `server-2u-hci` | 4x SFP28 cluster |
| 4U Server / Database server | `server-4u` | |
| 8-port L3 switch | `rs-sw-8p` | |
| 16-port L3 switch | `rs-sw-16p` | |
| 24-port switch / access switch | `rs-sw-24p` | |
| 32-port L3 switch | `rs-sw-32p` | |
| 48-port switch | `rs-sw-48p` | |
| Enterprise switch (24x RJ45 + 4x SFP+) | `sw-enterprise` | |
| ToR 25G/100G switch | `sw-1u-tor-25g-100g` | |
| Shared SAN / iSCSI storage / NAS | `storage-2u-allflash-nvme` | |
| 12-bay storage array | `storage-12bay` | |
| 24-bay storage array | `storage-24bay` | |
| All-flash array | `storage-aff` | |
| Core router | `router-core` | |
| Edge / WAN router | `router-1u-edge-wan` | |
| Firewall / NGFW | `fw-enterprise` | |
| FortiGate | `fw-fortigate-400f` | |
| KVM / console server | `console-kvm-8p` or `console-kvm-32p` | see device-catalog.ts |
| Patch panel | `patch-panel-1u` or `patch-panel-2u` | see device-catalog.ts |
| UPS | `ups-2u` or `ups-6u` | see device-catalog.ts |
| PDU | `pdu-1u` or `pdu-0u` | see device-catalog.ts |

#### Section D: Traffic Classification → Cable Type Table

| Traffic Type | Cable Type | Default Color | Notes |
|-------------|-----------|---------------|-------|
| Management / IPMI / iDRAC / BMC | `idrac` | red `#e53935` | OOB management only |
| Production / VM traffic / application | `vm-network` | orange `#fb8c00` | |
| Storage / iSCSI / SAN / NAS | `general-a` | cyan `#00acc1` | Never shared with production |
| Live Migration / vMotion | `live-migration` | yellow `#fdd835` | |
| Heartbeat / Cluster / HA | `general` | grey `#78909c` | |
| Backup / replication | `backup` | blue `#1e88e5` | |
| Ceph / distributed storage primary | `ceph-primary` | green `#43a047` | |
| Ceph / distributed storage secondary | `ceph-secondary` | purple `#8e24aa` | |
| Power | `c13-power` or `c19-power` | black | |
| Console / serial | `console` | brown | |

#### Section E: Planning Rules

Rules the AI must follow before emitting any diff:

1. **RU pre-check** — count free RUs in the target rack before placing any device; never overlap occupied slots.
2. **Port planning before cable placement** — for each device being cabled, list which physical ports carry which traffic type before writing `addCables`. Each port carries exactly one traffic type.
3. **Storage isolation** — storage (`general-a`) cables must use dedicated ports; they must never share a NIC/port with production (`vm-network`) cables.
4. **Hyper-V cluster wiring convention** — each Hyper-V host requires: 1 port for management (`idrac`), ≥2 ports for production VM traffic (`vm-network`), ≥2 dedicated ports for storage (`general-a`), 1 port for live migration (`live-migration`), 1 port for heartbeat/cluster (`general`).
5. **Per-traffic switch port groups** — on the L3 switch, group ports by traffic type: assign a contiguous block of ports to each traffic class (management ports 1–2, production ports 3–10, storage ports 11–18, live migration ports 19–20, heartbeat ports 21–22).
6. **Minimal diff** — only emit operations explicitly required by the user's request. Do not add unrequested devices or cables.
7. **Validation** — warn if PDU load ≥80%, error if ≥95%; verify source and destination ports are not already connected before adding cables.

### 3. Traffic Isolation Guarantee

The system prompt explicitly states: storage traffic (`general-a`) must never share a physical port or NIC with production traffic (`vm-network`). This is enforced by instruction — the AI must assign distinct ports for each traffic class and call this out in its explanation.

## Test Case

The following request must produce a correct RackDiff on the first attempt with any capable provider (Claude Sonnet+, GPT-4o+, Gemini 1.5 Pro+):

> "Create a 2-node Hyper-V cluster with shared SAN storage. Put both Hyper-V servers in the same rack and add a 32-port L3 switch. Create separate cable routing for Management, Production Network, Storage, Live Migration and Heartbeat/Cluster traffic. Keep storage traffic isolated from normal network traffic and show the cable paths clearly."

**Expected output:**
- 2x `server-2u-enterprise` in same rack
- 1x `rs-sw-32p` in same rack
- 1x `storage-2u-allflash-nvme`
- Cables: red (management), orange (production), cyan (storage), yellow (live migration), grey (heartbeat)
- No port shared between storage and production traffic

## Out of Scope

- UI changes
- RackDiff schema changes
- New device templates
- New cable types
- Automated test additions (manual verification sufficient for prompt-only change)
