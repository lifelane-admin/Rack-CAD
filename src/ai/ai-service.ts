import { eventBus } from '../core/event-bus';
import { stateManager } from '../core/state';
import { AIMessage, RackDiff } from './types';
import { serializeState } from './state-serializer';
import { applyDiff, executeResolvedDiff } from './diff-applier';
import { ProviderRegistry } from './provider-registry';
import { McpGateway, McpIntentTranslator, DesignChangePreview, McpExecutionMode } from '../mcp';

const registry = new ProviderRegistry();
let currentExecutionMode: McpExecutionMode = 'assisted';

export const aiService = {
  getExecutionMode(): McpExecutionMode {
    return currentExecutionMode;
  },

  setExecutionMode(mode: McpExecutionMode): void {
    currentExecutionMode = mode;
    eventBus.emit('ai:execution-mode-changed' as any, mode as any);
  },

  async chat(messages: AIMessage[]): Promise<void> {
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const query = lastUserMessage?.content || '';

    // Check for direct natural language domain commands
    const lowerQuery = query.toLowerCase().trim();
    if (
      lowerQuery === 'apply' ||
      lowerQuery === 'apply changes' ||
      lowerQuery === 'apply the changes'
    ) {
      const activeTxId = (this as any)._lastTransactionId;
      if (activeTxId) {
        await this.applyMcpTransaction(activeTxId, true);
        return;
      }
    }

    if (lowerQuery === 'rollback' || lowerQuery === 'revert' || lowerQuery === 'undo changes') {
      const activeTxId = (this as any)._lastTransactionId;
      if (activeTxId) {
        await this.rollbackMcpTransaction(activeTxId);
        return;
      }
    }

    // Attempt domain natural language translation through MCP Gateway first
    const isDomainCommand =
      lowerQuery.includes('42u rack') ||
      lowerQuery.includes('proxmox') ||
      lowerQuery.includes('ceph') ||
      lowerQuery.includes('dell') ||
      lowerQuery.includes('r770') ||
      lowerQuery.includes('25gbe') ||
      lowerQuery.includes('a/b power') ||
      lowerQuery.includes('validate') ||
      lowerQuery.includes('optimize') ||
      lowerQuery.includes('heat load') ||
      lowerQuery.includes('cooling') ||
      lowerQuery.includes('show power') ||
      lowerQuery.includes('bom');

    if (isDomainCommand) {
      try {
        const mcpResult = await McpIntentTranslator.executeNaturalLanguage(
          query,
          'designer',
          currentExecutionMode
        );

        if (mcpResult.response.success) {
          const data = mcpResult.response.data as any;
          if (data && data.previewId && data.transactionId) {
            (this as any)._lastTransactionId = data.transactionId;
            eventBus.emit('ai:mcp-preview' as any, data as DesignChangePreview);

            // In autonomous mode, auto-apply if no critical approvals are required
            if (currentExecutionMode === 'autonomous' && !data.requiresApproval) {
              await this.applyMcpTransaction(data.transactionId, true);
            }
            return;
          } else {
            // General read tool result
            const explanation = `### 🔍 MCP Tool Result: \`${mcpResult.parsed.tool}\`\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
            eventBus.emit('ai:stream-done', { explanation, diff: null });
            return;
          }
        }
      } catch {
        // Fall back to standard provider streaming
      }
    }

    // Standard LLM Streaming fallback
    const state = stateManager.getState();
    const context = serializeState(state);

    const provider = await registry.detect();
    stateManager.setState({ aiProvider: provider.name });
    eventBus.emit('ai:provider-changed', provider.name);

    let accumulated = '';

    try {
      for await (const chunk of provider.chat(context, messages)) {
        accumulated += chunk;
        eventBus.emit('ai:stream-chunk', chunk);
      }

      const rackDiff = provider.parseDiff(accumulated);

      // If diff contains operations, convert to MCP Transaction Preview
      if (rackDiff.diff) {
        const mcpChanges = McpIntentTranslator.convertDiffToMcpChanges(rackDiff.diff);
        if (mcpChanges.length > 0) {
          const previewResp = await McpGateway.handleToolCall({
            tool: 'preview_design_changes',
            arguments: {
              requestSummary: query,
              changes: mcpChanges,
            },
            context: {
              requestId: `REQ-${Date.now()}`,
              tenantId: 'tenant-primary',
              userId: 'user-active',
              role: 'designer',
              executionMode: currentExecutionMode,
              timestamp: Date.now(),
            },
          });

          if (previewResp.success && previewResp.data) {
            const previewData = previewResp.data as DesignChangePreview;
            (this as any)._lastTransactionId = previewData.transactionId;
            eventBus.emit('ai:mcp-preview' as any, previewData);

            if (currentExecutionMode === 'autonomous' && !previewData.requiresApproval) {
              await this.applyMcpTransaction(previewData.transactionId, true);
            }
            return;
          }
        }
      }

      eventBus.emit('ai:stream-done', rackDiff);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown AI error';
      eventBus.emit('ai:error', msg);
    }
  },

  async applyMcpTransaction(transactionId: string, confirmApproval = true): Promise<void> {
    const res = await McpGateway.handleToolCall({
      tool: 'apply_design_changes',
      arguments: {
        transactionId,
        confirmApproval,
      },
      context: {
        requestId: `REQ-${Date.now()}`,
        tenantId: 'tenant-primary',
        userId: 'user-active',
        role: 'designer',
        executionMode: currentExecutionMode,
        timestamp: Date.now(),
      },
    });

    if (res.success) {
      eventBus.emit('ai:mcp-applied' as any, { transactionId });
      eventBus.emit('notification', { message: `✓ MCP Transaction ${transactionId} applied successfully!`, type: 'success' });
    } else {
      eventBus.emit('ai:error', res.error?.message || 'Failed to apply MCP transaction.');
    }
  },

  async rollbackMcpTransaction(transactionId: string): Promise<void> {
    const res = await McpGateway.handleToolCall({
      tool: 'rollback_design_changes',
      arguments: {
        transactionId,
      },
      context: {
        requestId: `REQ-${Date.now()}`,
        tenantId: 'tenant-primary',
        userId: 'user-active',
        role: 'admin',
        executionMode: currentExecutionMode,
        timestamp: Date.now(),
      },
    });

    if (res.success) {
      eventBus.emit('ai:mcp-rolled-back' as any, { transactionId });
      eventBus.emit('notification', { message: `↩ Transaction ${transactionId} rolled back successfully!`, type: 'info' });
    } else {
      eventBus.emit('ai:error', res.error?.message || 'Failed to rollback transaction.');
    }
  },

  async refreshHints(selectedId?: string): Promise<void> {
    const state = stateManager.getState();
    const context = serializeState(state);
    const provider = await registry.detect();
    stateManager.setState({ aiProvider: provider.name });
    eventBus.emit('ai:provider-changed', provider.name as any);
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
    stateManager.setState({ devices, cables, racks, previewDiff: null });

    try {
      import('./registry/model-registry').then(({ modelRegistry }) => {
        const designId = `design-${Date.now()}`;
        modelRegistry.createDesignProvenance(designId, diff.explanation);
      });
    } catch {
      // Ignore
    }
  },

  setPreviewDiff(diff: RackDiff | null): void {
    stateManager.setState({ previewDiff: diff }, true);
  },

  getActiveProvider(): string {
    return stateManager.getState().aiProvider || 'gemini';
  },
};
