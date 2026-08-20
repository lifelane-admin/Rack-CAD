import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';

describe('floatingToolbarVisible state', () => {
  beforeEach(() => {
    eventBus.clear();
    stateManager.setState({
      floatingToolbarVisible: undefined as any,
    });
  });

  it('defaults to true', () => {
    stateManager.setState({ floatingToolbarVisible: true });
    expect(stateManager.getState().floatingToolbarVisible).toBe(true);
  });

  it('can be toggled to false via setState', () => {
    stateManager.setState({ floatingToolbarVisible: false });
    expect(stateManager.getState().floatingToolbarVisible).toBe(false);
  });
});
