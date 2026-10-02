import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT } from '../../ai/system-prompt';

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains the JSON output contract with correct field names', () => {
    expect(SYSTEM_PROMPT).toContain('"explanation"');
    expect(SYSTEM_PROMPT).toContain('addDevices');
    expect(SYSTEM_PROMPT).toContain('addCables');
    expect(SYSTEM_PROMPT).toContain('addRacks');
    expect(SYSTEM_PROMPT).toContain('sourcePortId');
    expect(SYSTEM_PROMPT).toContain('destPortId');
    expect(SYSTEM_PROMPT).toContain('startUnit');
    expect(SYSTEM_PROMPT).toContain('templateId');
  });

  it('warns against wrong diff schema', () => {
    expect(SYSTEM_PROMPT).toContain('NEVER use "action"');
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
    expect(SYSTEM_PROMPT).toContain('| general |');
    expect(SYSTEM_PROMPT).toContain('#78909c');
  });

  it('contains storage isolation rule', () => {
    expect(SYSTEM_PROMPT).toContain('STORAGE ISOLATION');
  });

  it('contains Hyper-V cluster wiring rule', () => {
    expect(SYSTEM_PROMPT).toContain('HYPER-V CLUSTER WIRING');
  });
});
