import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { AIMessage, RackDiff } from './types';
import { serializeState } from './state-serializer';
import { applyDiff, executeResolvedDiff } from './diff-applier';
import { ProviderRegistry } from './provider-registry';

const registry = new ProviderRegistry();

export const aiService = {
  async chat(messages: AIMessage[]): Promise<void> {
    const state = stateManager.getState();
    const context = serializeState(state);

    const provider = await registry.detect();
    eventBus.emit('ai:provider-changed', provider.name);

    let accumulated = '';

    try {
      for await (const chunk of provider.chat(context, messages)) {
        accumulated += chunk;
        eventBus.emit('ai:stream-chunk', chunk);
      }

      const rackDiff = provider.parseDiff(accumulated);
      eventBus.emit('ai:stream-done', rackDiff);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown AI error';
      eventBus.emit('ai:error', msg);
    }
  },

  async refreshHints(selectedId?: string): Promise<void> {
    const state = stateManager.getState();
    const context = serializeState(state);
    const provider = await registry.detect();
    const hints = await provider.getHints(context, selectedId);
    eventBus.emit('ai:hints-updated', hints);
  },

  applyRackDiff(diff: RackDiff): void {
    const state = stateManager.getState();
    const resolved = applyDiff(
      diff,
      state.devices.map(d => d.id),
      state.cables.map(c => c.id),
      state.racks.map(r => r.id),
    );
    if (!resolved) return;

    const { devices, cables, racks } = executeResolvedDiff(
      resolved,
      state.devices,
      state.cables,
      state.racks,
    );
    stateManager.setState({ devices, cables, racks });
    stateManager.setState({ previewDiff: null });
  },

  setPreviewDiff(diff: RackDiff | null): void {
    stateManager.setState({ previewDiff: diff }, true);
  },
};
