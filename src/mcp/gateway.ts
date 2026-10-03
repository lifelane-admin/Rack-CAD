/**
 * RackSlicer MCP Gateway
 * The formal security boundary between AI models and RackSlicer Core.
 * Enforces sanitization, prohibited tool blocking, tenant isolation, rate limiting,
 * RBAC authorization, schema validation, audit logging, and zero-leak error mapping.
 */

import {
  McpToolCallRequest,
  McpToolCallResponse,
  McpRequestContext,
  McpResource,
  McpResourceContent,
} from './types';
import { McpSanitizer, PROHIBITED_TOOLS } from './security/sanitizer';
import { McpRbac } from './auth/rbac';
import { McpAuditLogger } from './audit/audit-logger';
import { McpToolRegistry } from './tools/registry';
import { McpResourceCatalog } from './resources/resource-catalog';
import { MCP_TOOLS_CATALOG } from './tools/definitions';

interface RateLimitTracker {
  count: number;
  resetAt: number;
}

export class McpGateway {
  private static rateLimits: Map<string, RateLimitTracker> = new Map();
  private static readonly RATE_LIMIT_WINDOW_MS = 60_000;
  private static readonly RATE_LIMIT_MAX_REQUESTS = 120;

  /**
   * Main entrypoint for invoking an MCP tool.
   */
  static async handleToolCall(request: McpToolCallRequest): Promise<McpToolCallResponse> {
    const startTime = performance.now();
    const requestId = request?.context?.requestId || `REQ-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const toolName = request?.tool ? String(request.tool).trim() : '';
    const args = request?.arguments || {};
    const context: McpRequestContext = request?.context || {
      requestId,
      tenantId: 'tenant-default',
      userId: 'user-default',
      role: 'designer',
      executionMode: 'assisted',
      timestamp: Date.now(),
    };

    try {
      // 1. Check for prohibited execution tools
      if (!toolName || McpSanitizer.isProhibitedTool(toolName) || PROHIBITED_TOOLS.has(toolName)) {
        const error = McpSanitizer.createSafeError(
          'PROHIBITED_OPERATION',
          `Operation '${toolName}' is strictly prohibited. Arbitrary code, shell, SQL, or filesystem execution is forbidden.`,
          requestId
        );
        this.recordAudit(context, toolName, args, false, startTime, 'PROHIBITED_OPERATION');
        return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
      }

      // 2. Prompt Injection Defense
      const argsString = JSON.stringify(args);
      const injectionCheck = McpSanitizer.checkPromptInjection(argsString);
      if (injectionCheck.isInjected) {
        const error = McpSanitizer.createSafeError(
          'INJECTION_DETECTED',
          injectionCheck.reason || 'Prompt injection detected.',
          requestId
        );
        this.recordAudit(context, toolName, args, false, startTime, 'INJECTION_DETECTED');
        return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
      }

      // 3. Multi-Tenant Isolation
      const tenantCheck = McpRbac.validateTenantIsolation(context, (args as any).tenantId);
      if (!tenantCheck.allowed) {
        const error = McpSanitizer.createSafeError(
          'PERMISSION_DENIED',
          tenantCheck.reason || 'Cross-tenant boundary access violation.',
          requestId
        );
        this.recordAudit(context, toolName, args, false, startTime, 'PERMISSION_DENIED');
        return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
      }

      // 4. Rate Limiting Check
      const rateLimitKey = `${context.tenantId}:${context.userId}`;
      if (this.isRateLimited(rateLimitKey)) {
        const error = McpSanitizer.createSafeError(
          'RATE_LIMITED',
          'Rate limit exceeded. Too many tool requests in window.',
          requestId
        );
        this.recordAudit(context, toolName, args, false, startTime, 'RATE_LIMITED');
        return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
      }

      // 5. Tool Allowlist & Schema Existence
      const toolDef = McpToolRegistry.getToolDefinition(toolName);
      if (!toolDef) {
        const error = McpSanitizer.createSafeError(
          'INVALID_REQUEST',
          `Tool '${toolName}' is not in the allowlisted RackSlicer MCP catalog.`,
          requestId
        );
        this.recordAudit(context, toolName, args, false, startTime, 'INVALID_REQUEST');
        return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
      }

      // 6. RBAC & Execution Mode Authorization
      const authCheck = McpRbac.isAuthorized(context, toolName, toolDef.minimumRole, toolDef.destructive);
      if (!authCheck.allowed) {
        const error = McpSanitizer.createSafeError(
          'PERMISSION_DENIED',
          authCheck.reason || 'Insufficient role permissions.',
          requestId
        );
        this.recordAudit(context, toolName, args, false, startTime, 'PERMISSION_DENIED');
        return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
      }

      // 7. Schema Validation (required properties)
      if (toolDef.parameters.required) {
        for (const reqProp of toolDef.parameters.required) {
          if (args[reqProp] === undefined || args[reqProp] === null) {
            const error = McpSanitizer.createSafeError(
              'INVALID_REQUEST',
              `Missing required parameter '${reqProp}' for tool '${toolName}'.`,
              requestId
            );
            this.recordAudit(context, toolName, args, false, startTime, 'INVALID_REQUEST');
            return { success: false, tool: toolName, error: error.error, audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) } };
          }
        }
      }

      // 8. Execute Tool
      const sanitizedArgs = McpSanitizer.sanitizePayload(args);
      const result = await McpToolRegistry.executeTool(toolName, sanitizedArgs, context);

      // 9. Sanitize Output Data
      const sanitizedResult = McpSanitizer.sanitizePayload(result);
      const executionTimeMs = Math.round(performance.now() - startTime);

      this.recordAudit(context, toolName, args, true, startTime);

      return {
        success: true,
        tool: toolName,
        data: sanitizedResult,
        audit: { requestId, executionTimeMs },
      };
    } catch (err: unknown) {
      const internalMsg = err instanceof Error ? err.message : 'Unknown gateway error';
      const safeError = McpSanitizer.createSafeError('INTERNAL_ERROR', internalMsg, requestId);
      this.recordAudit(context, toolName, args, false, startTime, 'INTERNAL_ERROR');

      return {
        success: false,
        tool: toolName,
        error: safeError.error,
        audit: { requestId, executionTimeMs: Math.round(performance.now() - startTime) },
      };
    }
  }

  /**
   * Lists available read-only resources.
   */
  static listResources(): McpResource[] {
    return McpResourceCatalog.listResources();
  }

  /**
   * Reads an authorized read-only resource.
   */
  static readResource(uri: string, context: McpRequestContext): McpResourceContent {
    return McpResourceCatalog.readResource(uri, context);
  }

  /**
   * Returns list of allowlisted tool definitions.
   */
  static listTools() {
    return MCP_TOOLS_CATALOG;
  }

  private static isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = this.rateLimits.get(key);
    if (!entry || now > entry.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + this.RATE_LIMIT_WINDOW_MS });
      return false;
    }

    if (entry.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      return true;
    }

    entry.count++;
    return false;
  }

  private static recordAudit(
    context: McpRequestContext,
    toolName: string,
    args: Record<string, unknown>,
    success: boolean,
    startTime: number,
    errorCode?: any
  ): void {
    McpAuditLogger.log({
      requestId: context.requestId,
      tenantId: context.tenantId,
      userId: context.userId,
      role: context.role,
      toolName,
      success,
      durationMs: Math.round(performance.now() - startTime),
      errorCode,
      sanitizedArgs: args,
    });
  }

  /**
   * Reset rate limits and in-memory caches (testing utility).
   */
  static resetGateway(): void {
    this.rateLimits.clear();
  }
}
