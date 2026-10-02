// @vitest-environment node
//
// Integration test — requires a live API key.
// Run with:
//   $env:DEEPSEEK_API_KEY="<key>"   npx vitest run src/__tests__/ai/hyper-v-integration.test.ts
//   $env:ANTHROPIC_API_KEY="<key>"  npx vitest run src/__tests__/ai/hyper-v-integration.test.ts
//
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../../ai/system-prompt';

const HYPER_V_PROMPT = `Create a 2-node Hyper-V cluster with shared SAN storage.
Each node needs management, production VM, storage iSCSI, live migration, and heartbeat connectivity.
Add a 32-port switch for all traffic and a shared SAN storage device.
Use a 42U rack. Wire everything up with the correct cable types and colors.`;

const EMPTY_CONTEXT = JSON.stringify({
  racks: [],
  cables: [],
  validation: { alerts: [] },
  selectedId: undefined,
}, null, 2);

async function callDeepSeek(apiKey: string): Promise<string> {
  const userMsg = `[CONTEXT]\n${EMPTY_CONTEXT}\n\n[REQUEST]\n${HYPER_V_PROMPT}`;
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const json = await response.json() as any;
  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${JSON.stringify(json.error)}`);
  return json.choices[0].message.content;
}

async function callAnthropic(apiKey: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const userMsg = `[CONTEXT]\n${EMPTY_CONTEXT}\n\n[REQUEST]\n${HYPER_V_PROMPT}`;
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  return message.content[0].type === 'text' ? message.content[0].text : '';
}

function assertSchema(raw: string, provider: string) {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`${provider} response is not valid JSON.\n\nRaw:\n${raw}`);
  }

  console.log(`\n=== ${provider} Response ===`);
  console.log(JSON.stringify(parsed, null, 2));

  expect(parsed).toHaveProperty('explanation');
  expect(parsed).toHaveProperty('diff');
  expect(parsed.diff).not.toBeNull();

  const diff = parsed.diff;
  expect(diff).not.toHaveProperty('action');
  expect(diff).not.toHaveProperty('devices');
  expect(diff).not.toHaveProperty('cables');
  expect(diff).toHaveProperty('addDevices');
  expect(diff).toHaveProperty('addCables');
  expect(Array.isArray(diff.addDevices)).toBe(true);
  expect(Array.isArray(diff.addCables)).toBe(true);

  for (const device of diff.addDevices) {
    expect(device).toHaveProperty('id');
    expect(device).toHaveProperty('templateId');
    expect(device).toHaveProperty('rackId');
    expect(device).toHaveProperty('startUnit');
    expect(device).toHaveProperty('ports');
    expect(Array.isArray(device.ports)).toBe(true);
  }

  for (const cable of diff.addCables) {
    expect(cable).toHaveProperty('sourcePortId');
    expect(cable).toHaveProperty('destPortId');
    expect(cable).not.toHaveProperty('from_device_id');
    expect(cable).not.toHaveProperty('to_device_id');
    expect(cable).toHaveProperty('color');
    expect(cable).toHaveProperty('type');
  }

  const templateIds = diff.addDevices.map((d: any) => d.templateId);
  console.log(`\n=== Devices ===`, templateIds);
  expect(templateIds).toContain('server-2u-enterprise');
  expect(templateIds).toContain('rs-sw-32p');

  const cableTypes = diff.addCables.map((c: any) => c.type);
  console.log(`=== Cable types ===`, cableTypes);
  expect(cableTypes).toContain('idrac');
  expect(cableTypes).toContain('general-a');
}

const deepseekKey = process.env.DEEPSEEK_API_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

describe('Hyper-V integration', () => {
  it.skipIf(!deepseekKey)('[DeepSeek] produces correct addDevices/addCables schema', async () => {
    const raw = await callDeepSeek(deepseekKey!);
    assertSchema(raw, 'DeepSeek');
  }, 90_000);

  it.skipIf(!anthropicKey)('[Claude] produces correct addDevices/addCables schema', async () => {
    const raw = await callAnthropic(anthropicKey!);
    assertSchema(raw, 'Claude');
  }, 90_000);

  it('skips when no API key is set', () => {
    if (deepseekKey || anthropicKey) return;
    console.log('No API key found. Set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY to run integration tests.');
  });
});
