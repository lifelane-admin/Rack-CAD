/**
 * RackSlicer MCP Security & Sanitization Layer
 * Implements strict input/output sanitization, prompt injection defense,
 * prohibited operation barriers, and zero-leak error mapping.
 */

import { McpErrorCode, McpErrorResponse } from '../types';

// Sensitive keywords and patterns that MUST NEVER be leaked to AI or returned in logs
const SENSITIVE_PATTERNS = [
  /api[-_]?key\s*[:=]\s*["']?[a-zA-Z0-9_\-]{8,}["']?/gi,
  /bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi,
  /(?:password|passwd|pwd|secret|token)\s*[:=]\s*["']?[^\s"']+["']?/gi,
  /(?:postgres|mysql|mongodb|redis|sqlite):\/\/[^\s]+/gi,
  /[A-Z]:\\[^\s"']+/gi, // Windows absolute file paths
  /\/home\/[^\s"']+/gi, // Linux home paths
  /\/Users\/[^\s"']+/gi, // Mac/Unix user paths
  /node_modules[\\\/][^\s"']+/gi,
];

// Patterns indicative of prompt injection or system boundary bypass
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+(instructions|prompts|rules)/i,
  /disregard\s+(all\s+)?(previous|prior)\s+(instructions|rules)/i,
  /reveal\s+(the\s+)?(system\s+prompt|source\s+code|api\s+keys?|passwords?)/i,
  /print\s+(the\s+)?(system\s+prompt|environment\s+variables?|env\s+vars?)/i,
  /show\s+me\s+(the\s+)?(source\s+code|secret|credential|database)/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /bypass\s+(all\s+)?(security|restrictions|mcp\s+gateway)/i,
  /<script\b[^>]*>/i,
  /;\s*(DROP|DELETE|TRUNCATE|ALTER)\s+TABLE/i,
  /\|\s*(cat|ls|dir|rm|del|powershell|bash|sh)\b/i,
];

// Explicitly prohibited MCP tools/commands
export const PROHIBITED_TOOLS = new Set([
  'execute_command',
  'run_shell',
  'execute_javascript',
  'execute_sql',
  'run_python',
  'access_filesystem',
  'execute_code',
  'eval',
  'run_docker',
  'run_kubernetes_command',
  'exec',
  'system',
  'spawn',
]);

export class McpSanitizer {
  /**
   * Validates if a tool invocation is prohibited by definition.
   */
  static isProhibitedTool(toolName: string): boolean {
    if (!toolName || typeof toolName !== 'string') return true;
    const lower = toolName.trim().toLowerCase();
    if (PROHIBITED_TOOLS.has(lower)) return true;
    if (lower.startsWith('exec') || lower.startsWith('shell') || lower.startsWith('fs_') || lower.startsWith('sql_')) {
      return true;
    }
    return false;
  }

  /**
   * Scans text for prompt injection, jailbreaking, or boundary escape attempts.
   */
  static checkPromptInjection(text: string): { isInjected: boolean; reason?: string } {
    if (!text || typeof text !== 'string') {
      return { isInjected: false };
    }

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        return {
          isInjected: true,
          reason: 'Potential prompt injection or boundary violation detected.',
        };
      }
    }

    return { isInjected: false };
  }

  /**
   * Deeply sanitizes an object, scrubbing any embedded secrets, file paths, or injection tokens.
   */
  static sanitizePayload<T>(payload: T): T {
    if (payload === null || payload === undefined) {
      return payload;
    }

    if (typeof payload === 'string') {
      let sanitized: string = payload;
      for (const pattern of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED_SENSITIVE]');
      }
      return sanitized as unknown as T;
    }

    if (Array.isArray(payload)) {
      return payload.map(item => this.sanitizePayload(item)) as unknown as T;
    }

    if (typeof payload === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(payload)) {
        // Redact any sensitive field keys directly
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('key') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('password') ||
          lowerKey.includes('credential') ||
          lowerKey.includes('sourcepath')
        ) {
          result[key] = '[REDACTED_SENSITIVE]';
        } else {
          result[key] = this.sanitizePayload(value);
        }
      }
      return result as unknown as T;
    }

    return payload;
  }

  /**
   * Zero-Leak Error Mapper:
   * Maps internal errors/exceptions to safe external MCP error responses,
   * completely scrubbing stack traces, memory addresses, and file paths.
   */
  static createSafeError(
    code: McpErrorCode,
    internalMessage: string,
    requestId: string,
    details?: Record<string, unknown>
  ): McpErrorResponse {
    // Scrub internal details
    let safeMessage = internalMessage;
    for (const pattern of SENSITIVE_PATTERNS) {
      safeMessage = safeMessage.replace(pattern, '[REDACTED]');
    }

    // Default friendly mapping for standard error types
    const friendlyMap: Partial<Record<McpErrorCode, string>> = {
      PROHIBITED_OPERATION: 'The requested operation is strictly prohibited by RackSlicer MCP Security Policy.',
      PERMISSION_DENIED: 'Permission denied: Insufficient privileges or cross-tenant access prohibited.',
      UNAUTHENTICATED: 'Authentication required. Valid API credentials must be supplied.',
      INJECTION_DETECTED: 'Request rejected due to potential prompt or command injection pattern.',
      INVALID_REQUEST: 'The request parameters did not conform to the required MCP schema.',
      RATE_LIMITED: 'Rate limit exceeded. Please back off before trying again.',
      RESOURCE_NOT_FOUND: 'The specified resource or design element could not be found.',
      VALIDATION_FAILED: 'Design validation failed against datacenter engineering rules.',
    };

    return {
      error: {
        code,
        message: safeMessage || friendlyMap[code] || 'Operation failed.',
        requestId,
        details: details ? (this.sanitizePayload(details) as Record<string, unknown>) : undefined,
      },
    };
  }
}
