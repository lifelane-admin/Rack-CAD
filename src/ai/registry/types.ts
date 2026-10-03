export type ModelCategory = 'open_source' | 'paid';

export type ModelLifecycleStatus =
  | 'new'
  | 'latest'
  | 'active'
  | 'preview'
  | 'legacy'
  | 'deprecated'
  | 'retired';

export type RelativeGeneration =
  | 'N'
  | 'N-1'
  | 'N-2'
  | 'N-3'
  | 'N-4'
  | 'N-5'
  | 'N-6'
  | 'N-7'
  | 'N-8';

export type LicenseType =
  | 'osi_open_source'
  | 'open_weight'
  | 'source_available'
  | 'commercial'
  | 'proprietary'
  | 'unknown';

export interface ModelLicense {
  name: string;
  type: LicenseType;
  commercialUseAllowed?: boolean;
  modificationAllowed?: boolean;
  redistributionAllowed?: boolean;
  licenseURL?: string;
}

export interface DeploymentOptions {
  providerHosted: boolean;
  selfHosted: boolean;
  local: boolean;
  privateCloud: boolean;
  onPremises: boolean;
  kubernetes: boolean;
  inferenceServers?: string[];
  hardwareRequirements?: string;
}

export interface ModelCapabilities {
  textInput: boolean;
  textOutput: boolean;
  imageInput: boolean;
  imageOutput: boolean;
  audioInput: boolean;
  audioOutput: boolean;
  videoInput: boolean;
  videoOutput: boolean;
  vision: boolean;
  reasoning: boolean;
  reasoningLevels?: string[];
  toolCalling: boolean;
  functionCalling: boolean;
  structuredOutput: boolean;
  jsonMode: boolean;
  streaming: boolean;
  batch: boolean;
  embeddings: boolean;
  codeGeneration: boolean;
  agenticWorkflows: boolean;
  computerUse: boolean;
  webSearch: boolean;
  fileSearch: boolean;
  longContext: boolean;
  multilingual: boolean;
}

export type PricingUnit =
  | 'per_1m_tokens'
  | 'per_request'
  | 'per_second'
  | 'per_minute'
  | 'custom';

export interface ModelPricing {
  currency: 'USD';
  unit: PricingUnit;
  inputPer1M?: number;
  outputPer1M?: number;
  cachedInputPer1M?: number;
  cacheWritePer1M?: number;
  imageInput?: number;
  audioInput?: number;
  audioOutput?: number;
  batchInputPer1M?: number;
  batchOutputPer1M?: number;
  reasoningTokensIncluded?: boolean;
  pricingURL?: string;
  pricingSource?: string;
  effectiveDate?: string;
  lastVerified?: string;
}

export interface ModelLifecycle {
  status: ModelLifecycleStatus;
  releaseDate?: string;
  deprecationDate?: string;
  retirementDate?: string;
  replacementModelId?: string;
  lifecycleSource?: string;
  lastVerified?: string;
}

export interface ModelEndpoints {
  chatUrl?: string;
  modelsUrl?: string;
  baseUrl?: string;
}

export interface ProviderSourceMetadata {
  rawResponse?: Record<string, unknown>;
  discoveredAt?: string;
  sourceType?: 'api' | 'catalog' | 'docs' | 'override';
}

export interface AIModel {
  id: string;
  providerId: string;
  providerDisplayName: string;
  modelId: string; // The exact API ID used in calls
  displayName: string;
  family?: string;
  version?: string;
  releaseDate?: string;

  category: ModelCategory;

  license?: ModelLicense;
  deploymentOptions: DeploymentOptions;

  status: ModelLifecycleStatus;
  relativeGeneration?: RelativeGeneration;

  contextWindow?: number;
  maxOutputTokens?: number;
  knowledgeCutoff?: string;

  capabilities: ModelCapabilities;
  pricing: ModelPricing;
  lifecycle: ModelLifecycle;
  endpoints: ModelEndpoints;

  aliases?: string[];
  recommendedFor?: string[];
  limitations?: string[];

  sourceMetadata?: ProviderSourceMetadata;
  lastVerified: string;
}

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
  endpointUrl?: string;
  organizationId?: string;
  projectId?: string;
  customHeaders?: Record<string, string>;
}

export interface ProviderRawModel {
  id: string;
  name?: string;
  displayName?: string;
  family?: string;
  version?: string;
  created?: number | string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  pricing?: Partial<ModelPricing>;
  capabilities?: Partial<ModelCapabilities>;
  license?: Partial<ModelLicense>;
  raw?: Record<string, unknown>;
}

export interface ProviderModelDetails extends ProviderRawModel {
  endpoints?: ModelEndpoints;
  lifecycle?: Partial<ModelLifecycle>;
}

export interface ModelValidationResult {
  valid: boolean;
  latencyMs?: number;
  error?: string;
  toolCallingVerified?: boolean;
  structuredOutputVerified?: boolean;
  reasoningVerified?: boolean;
  checkedAt: string;
}

export type ConnectionStatusType = 'connected' | 'low_balance' | 'failed' | 'needs_key';
export type BalanceStatus = 'ok' | 'low' | 'depleted' | 'unknown';

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  statusType?: ConnectionStatusType;
  balanceStatus?: BalanceStatus;
  balanceFormatted?: string;
  quotaNotice?: string;
  modelsDiscovered: number;
  currentModels: number;
  previewModels: number;
  latencyMs?: number;
  error?: string;
  timestamp: string;
}

export interface AIProviderAdapter {
  providerId: string;
  displayName: string;
  description?: string;
  docsUrl?: string;
  keyUrl?: string;
  supportedCategories: ModelCategory[];

  discoverModels(credentials: ProviderCredentials): Promise<ProviderRawModel[]>;

  getModelDetails(modelId: string, credentials: ProviderCredentials): Promise<ProviderModelDetails>;

  getPricing?(modelId: string): Promise<ModelPricing | null>;

  getLifecycle?(modelId: string): Promise<ModelLifecycle | null>;

  validateModel?(modelId: string, credentials: ProviderCredentials): Promise<ModelValidationResult>;

  testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult>;
}

export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

export interface UnifiedTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface UnifiedResponseFormat {
  type: 'json_object' | 'text' | 'json_schema';
  schema?: Record<string, unknown>;
}

export interface ReasoningConfig {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high';
  maxBudgetTokens?: number;
}

export interface UnifiedAIRequest {
  modelId: string;
  messages: UnifiedMessage[];
  tools?: UnifiedTool[];
  responseFormat?: UnifiedResponseFormat;
  temperature?: number;
  maxTokens?: number;
  reasoning?: ReasoningConfig;
}

export interface ModelProvenance {
  designId: string;
  provider: string;
  model: string;
  apiId: string;
  modelVersion?: string;
  registryVersion: string;
  promptHash?: string;
  toolDefinitionsVersion: string;
  rackSlicerSchemaVersion: string;
  timestamp: string;
}

export interface RegistrySyncRun {
  syncId: string;
  providerId: string;
  startedAt: string;
  completedAt?: string;
  modelsDiscovered: number;
  modelsAdded: number;
  modelsUpdated: number;
  modelsDeprecated: number;
  modelsRetired: number;
  pricingUpdated: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed' | 'cached_fallback';
}

export interface RegistrySyncError {
  providerId: string;
  timestamp: string;
  error: string;
  code?: string;
}

export interface ProviderHealthStatus {
  providerId: string;
  displayName: string;
  status: 'connected' | 'sync_delayed' | 'error' | 'not_configured';
  message?: string;
  lastSync?: string;
  modelCount: number;
}

export interface RegistryFreshnessStatus {
  state: 'live' | 'cached' | 'stale' | 'offline';
  freshness: 'current' | 'aging' | 'stale' | 'very_stale';
  lastUpdated: string;
  version: string;
  ageMinutes: number;
}

export interface ModelFilterCriteria {
  category?: ModelCategory;
  providerId?: string;
  searchQuery?: string;
  licenseType?: LicenseType;
  selfHostedOnly?: boolean;
  onPremisesOnly?: boolean;
  privateCloudOnly?: boolean;
  gpuRequired?: boolean;
  cpuCapable?: boolean;
  pricingTier?: 'free' | 'low_cost' | 'standard' | 'premium';
  maxInputPricePer1M?: number;
  minContextWindow?: number;
  requireReasoning?: boolean;
  requireVision?: boolean;
  requireToolCalling?: boolean;
  requireStructuredOutput?: boolean;
  requireLongContext?: boolean;
  requireAgentic?: boolean;
  showLegacy?: boolean;
  showDeprecated?: boolean;
  showRetired?: boolean;
}

export interface FallbackChain {
  primaryModelId: string;
  fallback1ModelId?: string;
  fallback2ModelId?: string;
}

export interface AgenticValidationResult {
  compatible: boolean;
  missingCapabilities: string[];
  warningMessage?: string;
}
