/**
 * RackSlicer MCP (Model Context Protocol) AI Control Plane
 * Core Types, Tool Signatures, Resource Definitions, Security & Audit Schemas.
 */

export type McpUserRole = 'viewer' | 'designer' | 'architect' | 'admin';

export type McpExecutionMode = 'advisory' | 'assisted' | 'autonomous';

export interface McpRequestContext {
  requestId: string;
  tenantId: string;
  userId: string;
  role: McpUserRole;
  executionMode: McpExecutionMode;
  clientIp?: string;
  timestamp: number;
}

export type McpErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHENTICATED'
  | 'PERMISSION_DENIED'
  | 'PROHIBITED_OPERATION'
  | 'RESOURCE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'TRANSACTION_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'INJECTION_DETECTED';

export interface McpErrorResponse {
  error: {
    code: McpErrorCode;
    message: string;
    requestId: string;
    correlationId?: string;
    details?: Record<string, unknown>;
  };
}

export interface McpToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  enum?: string[];
  items?: McpToolParameterSchema;
  properties?: Record<string, McpToolParameterSchema>;
  minimum?: number;
  maximum?: number;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  requiresApproval: boolean;
  minimumRole: McpUserRole;
  parameters: {
    type: 'object';
    properties: Record<string, McpToolParameterSchema>;
    required?: string[];
  };
}

export interface McpToolCallRequest {
  tool: string;
  arguments: Record<string, unknown>;
  context: McpRequestContext;
}

export interface McpToolCallResponse<T = unknown> {
  success: boolean;
  tool: string;
  data?: T;
  error?: McpErrorResponse['error'];
  audit: {
    requestId: string;
    executionTimeMs: number;
  };
}

// ==========================================
// Structured Design Changes & Preview Types
// ==========================================

export type DesignAction =
  | 'create_rack'
  | 'remove_rack'
  | 'add_equipment'
  | 'move_equipment'
  | 'remove_equipment'
  | 'replace_equipment'
  | 'connect_ports'
  | 'disconnect_ports'
  | 'create_cable'
  | 'remove_cable'
  | 'add_pdu'
  | 'connect_power';

export interface DesignChangeItem {
  action: DesignAction;
  rackId?: string;
  libraryItemId?: string;
  deviceId?: string;
  targetDeviceId?: string;
  name?: string;
  position?: number; // startUnit
  units?: number;    // RU height
  powerWatts?: number;
  source?: string;   // port ID
  target?: string;   // port ID
  cableType?: string;
  color?: string;
  details?: Record<string, unknown>;
}

export interface DesignValidationCheck {
  category: 'capacity' | 'power' | 'cooling' | 'network' | 'redundancy';
  status: 'PASS' | 'WARN' | 'FAIL';
  title: string;
  message: string;
  details?: string;
}

export interface DesignChangePreview {
  previewId: string;
  transactionId: string;
  requestSummary: string;
  requiresApproval: boolean;
  approvalReasons: string[];
  changes: {
    summary: string[];
    addRacksCount: number;
    addDevicesCount: number;
    addCablesCount: number;
    removeDevicesCount: number;
    removeCablesCount: number;
    items: DesignChangeItem[];
  };
  rackImpact: {
    rackId: string;
    rackName: string;
    totalUnits: number;
    usedUnitsBefore: number;
    usedUnitsAfter: number;
    utilizationPercent: number;
  }[];
  powerImpact: {
    estimatedLoadWatts: number;
    feedAWatts: number;
    feedBWatts: number;
    pduCapacityWatts: number;
    headroomWatts: number;
    isRedundant: boolean;
  };
  networkImpact: {
    interfacesAdded: number;
    cableTypes: Record<string, number>;
    redundantPaths: boolean;
    dualToRDetected: boolean;
  };
  validation: {
    overallStatus: 'PASS' | 'WARN' | 'FAIL';
    checks: DesignValidationCheck[];
  };
  bom: {
    manufacturer: string;
    model: string;
    category: string;
    quantity: number;
    estimatedCostUsd: number;
  }[];
}

export interface DesignTransactionRecord {
  transactionId: string;
  previewId?: string;
  status: 'pending_preview' | 'previewed' | 'approved' | 'applied' | 'rolled_back' | 'failed';
  createdAt: number;
  appliedAt?: number;
  rolledBackAt?: number;
  context: McpRequestContext;
  changes: DesignChangeItem[];
  snapshotBefore: string;
  snapshotAfter?: string;
  validationResults?: DesignValidationCheck[];
}

// ==========================================
// Audit & Log Types
// ==========================================

export interface McpAuditLogEntry {
  id: string;
  requestId: string;
  transactionId?: string;
  timestamp: number;
  tenantId: string;
  userId: string;
  role: McpUserRole;
  toolName: string;
  success: boolean;
  durationMs: number;
  errorCode?: McpErrorCode;
  sanitizedArgs: Record<string, unknown>;
  changeCount?: number;
}

// ==========================================
// MCP Resource URI Types
// ==========================================

export interface McpResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
  readOnly: boolean;
}

export interface McpResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}
