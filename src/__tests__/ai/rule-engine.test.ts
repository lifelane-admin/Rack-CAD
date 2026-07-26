import { RuleEngine } from '../../ai/rule-engine';
import { RackContext } from '../../ai/types';

const emptyContext: RackContext = {
  racks: [{ id: 'r1', name: 'Rack 1', units: 42, devices: [], pdus: [{ side: 'left', watts: 7200 }] }],
  cables: [],
  validation: { alerts: [] },
};

describe('RuleEngine', () => {
  const engine = new RuleEngine();

  it('is always available', async () => {
    expect(await engine.isAvailable()).toBe(true);
  });

  it('name is rules', () => {
    expect(engine.name).toBe('rules');
  });

  it('returns hints for empty rack', async () => {
    const hints = await engine.getHints(emptyContext);
    expect(Array.isArray(hints)).toBe(true);
  });

  it('parseDiff returns explanation and null diff for plain text', () => {
    const result = engine.parseDiff('Just an explanation');
    expect(result.explanation).toBe('Just an explanation');
    expect(result.diff).toBeNull();
  });

  it('parseDiff parses valid JSON diff', () => {
    const raw = JSON.stringify({ explanation: 'ok', diff: { removeDevices: ['d1'] } });
    const result = engine.parseDiff(raw);
    expect(result.diff?.removeDevices).toContain('d1');
  });
});
