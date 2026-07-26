import { RackContext, RackDiff, AIMessage } from '../../ai/types';

describe('AI types', () => {
  it('RackDiff with null diff is valid', () => {
    const diff: RackDiff = { explanation: 'Analysis only', diff: null };
    expect(diff.diff).toBeNull();
    expect(diff.explanation).toBe('Analysis only');
  });

  it('AIMessage roles are user or assistant', () => {
    const msg: AIMessage = { role: 'user', content: 'hello' };
    expect(msg.role).toBe('user');
  });
});
