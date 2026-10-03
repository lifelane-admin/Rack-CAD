/**
 * RackSlicer MCP Audit Logger
 * Maintains immutable, non-sensitive audit logs for every MCP tool and resource operation.
 */

import { McpAuditLogEntry } from '../types';
import { McpSanitizer } from '../security/sanitizer';
import { eventBus } from '../../core/event-bus';

export class McpAuditLogger {
  private static readonly MAX_ENTRIES = 200;
  private static logs: McpAuditLogEntry[] = [];

  /**
   * Records an audit event with sanitized parameters and duration.
   */
  static log(entry: Omit<McpAuditLogEntry, 'id' | 'timestamp'>): McpAuditLogEntry {
    const fullEntry: McpAuditLogEntry = {
      ...entry,
      id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      sanitizedArgs: McpSanitizer.sanitizePayload(entry.sanitizedArgs),
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.MAX_ENTRIES) {
      this.logs.pop();
    }

    // Broadcast audit event to UI / Developer Console
    try {
      eventBus.emit('mcp:audit' as any, fullEntry as any);
    } catch {
      // EventBus might not be hooked up in node test runners
    }

    return fullEntry;
  }

  /**
   * Retrieves recent audit logs.
   */
  static getRecentLogs(limit = 50): McpAuditLogEntry[] {
    return this.logs.slice(0, limit);
  }

  /**
   * Retrieves audit logs for a specific tenant.
   */
  static getLogsByTenant(tenantId: string, limit = 50): McpAuditLogEntry[] {
    return this.logs.filter(l => l.tenantId === tenantId).slice(0, limit);
  }

  /**
   * Clears the log buffer (testing only).
   */
  static clear(): void {
    this.logs = [];
  }
}
