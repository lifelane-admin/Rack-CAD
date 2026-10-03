/**
 * RackSlicer MCP Authentication & Role-Based Access Control (RBAC)
 * Enforces tenant isolation, user authorization, and tool permission matrices.
 */

import { McpRequestContext, McpUserRole } from '../types';

export const ROLE_HIERARCHY: Record<McpUserRole, number> = {
  viewer: 1,
  designer: 2,
  architect: 3,
  admin: 4,
};

export class McpRbac {
  /**
   * Checks if user has at least the required role.
   */
  static hasMinimumRole(userRole: McpUserRole, requiredRole: McpUserRole): boolean {
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 99;
    return userLevel >= requiredLevel;
  }

  /**
   * Validates multi-tenant isolation.
   * Cross-tenant read/write attempts are strictly rejected.
   */
  static validateTenantIsolation(
    context: McpRequestContext,
    resourceTenantId?: string
  ): { allowed: boolean; reason?: string } {
    if (!context || !context.tenantId) {
      return { allowed: false, reason: 'Missing tenant identity in request context.' };
    }

    if (resourceTenantId && resourceTenantId !== context.tenantId) {
      return {
        allowed: false,
        reason: `Cross-tenant boundary violation: ${context.tenantId} cannot access ${resourceTenantId}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Checks whether the given context is authorized to invoke a tool.
   */
  static isAuthorized(
    context: McpRequestContext,
    toolName: string,
    toolMinimumRole: McpUserRole,
    isDestructive = false
  ): { allowed: boolean; reason?: string } {
    if (!context.userId || !context.tenantId) {
      return { allowed: false, reason: 'Unauthenticated context.' };
    }

    if (!this.hasMinimumRole(context.role, toolMinimumRole)) {
      return {
        allowed: false,
        reason: `Role '${context.role}' does not meet minimum required role '${toolMinimumRole}' for tool '${toolName}'.`,
      };
    }

    // Advisory mode restricts any destructive or mutation tools
    if (context.executionMode === 'advisory' && (isDestructive || toolName.startsWith('apply_') || toolName.startsWith('create_') || toolName.startsWith('remove_'))) {
      return {
        allowed: false,
        reason: `Tool '${toolName}' cannot be executed in Advisory mode. Use preview or switch to Assisted/Autonomous mode.`,
      };
    }

    return { allowed: true };
  }
}
