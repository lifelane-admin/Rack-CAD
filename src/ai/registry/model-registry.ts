import { eventBus } from '../../core/event-bus';
import {
  AIModel,
  AIProviderAdapter,
  ModelCategory,
  ModelFilterCriteria,
  ProviderCredentials,
  ProviderHealthStatus,
  RegistryFreshnessStatus,
  RegistrySyncRun,
  RegistrySyncError,
  AgenticValidationResult,
  FallbackChain,
  ConnectionTestResult,
  ConnectionStatusType,
  BalanceStatus,
} from './types';
import { normalizeModel } from './normalizer';
import { assignGenerationsAcrossRegistry } from './ranking-engine';
import { createDefaultAdapters } from './adapters';
import { provenanceManager } from './provenance';

const REGISTRY_STORAGE_KEY = 'rackcad_ai_model_registry_cache';
const REGISTRY_META_KEY = 'rackcad_ai_model_registry_meta';
const ACTIVE_MODEL_SELECTION_KEY = 'rackcad_ai_active_model_selection';
const FALLBACK_CHAIN_KEY = 'rackcad_ai_fallback_chain';

export class ModelRegistry {
  private adapters: Map<string, AIProviderAdapter> = new Map();
  private models: Map<string, AIModel> = new Map();
  private credentials: Map<string, ProviderCredentials> = new Map();

  private registryVersion: string = this.generateVersionId();
  private lastSyncTime: number = 0;
  private syncRuns: RegistrySyncRun[] = [];
  private syncErrors: RegistrySyncError[] = [];
  private isSyncing: boolean = false;
  private connectionStatuses: Map<string, ConnectionTestResult> = new Map();

  private activeSelectedModelId: string | null = null;
  private fallbackChain: FallbackChain = { primaryModelId: '' };

  constructor(adapters?: AIProviderAdapter[]) {
    const list = adapters || createDefaultAdapters();
    for (const adapter of list) {
      this.registerAdapter(adapter);
    }

    this.loadFromCache();
    this.loadCredentials();
    this.loadActiveSelection();

    // If cache was empty, seed immediately from adapters
    if (this.models.size === 0) {
      this.seedInitialRegistry();
    }
  }

  registerAdapter(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  getAdapter(providerId: string): AIProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getAllAdapters(): AIProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  setCredentials(providerId: string, creds: ProviderCredentials): void {
    if (!creds.apiKey) {
      this.clearCredentials(providerId);
      return;
    }
    this.credentials.set(providerId, creds);
    try {
      localStorage.setItem(`rackcad_${providerId}_key`, creds.apiKey);
      if (providerId === 'gemini') localStorage.setItem('rackcad_gemini_key', creds.apiKey);
      else if (providerId === 'openai') localStorage.setItem('rackcad_openai_key', creds.apiKey);
      else if (providerId === 'claude') localStorage.setItem('rackcad_anthropic_key', creds.apiKey);
      else if (providerId === 'deepseek') localStorage.setItem('rackcad_deepseek_key', creds.apiKey);
      else if (providerId === 'openrouter') localStorage.setItem('rackcad_openrouter_key', creds.apiKey);
    } catch {
      // Ignore
    }
    eventBus.emit('ai:credentials-updated' as any, { providerId });
  }

  clearCredentials(providerId: string): void {
    this.credentials.delete(providerId);
    this.connectionStatuses.delete(providerId);
    try {
      localStorage.removeItem(`rackcad_${providerId}_key`);
      if (providerId === 'gemini') localStorage.removeItem('rackcad_gemini_key');
      else if (providerId === 'openai') localStorage.removeItem('rackcad_openai_key');
      else if (providerId === 'claude') localStorage.removeItem('rackcad_anthropic_key');
      else if (providerId === 'deepseek') localStorage.removeItem('rackcad_deepseek_key');
      else if (providerId === 'openrouter') localStorage.removeItem('rackcad_openrouter_key');
    } catch {
      // Ignore
    }
    eventBus.emit('ai:credentials-updated' as any, { providerId });
  }

  hasCredentials(providerId: string): boolean {
    if (providerId === 'local' || providerId === 'rules') return true;
    const creds = this.getCredentials(providerId);
    return !!(creds.apiKey && creds.apiKey.trim().length > 0);
  }

  getConnectionStatus(providerId: string): {
    status: ConnectionStatusType;
    balanceStatus?: BalanceStatus;
    balanceFormatted?: string;
    latencyMs?: number;
    message?: string;
    details?: ConnectionTestResult;
  } {
    if (!this.hasCredentials(providerId) && providerId !== 'local') {
      return { status: 'needs_key', balanceStatus: 'unknown', message: 'API Key Required' };
    }
    const cached = this.connectionStatuses.get(providerId);
    if (cached) {
      if (cached.statusType) {
        return {
          status: cached.statusType,
          balanceStatus: cached.balanceStatus,
          balanceFormatted: cached.balanceFormatted,
          latencyMs: cached.latencyMs,
          message: cached.message,
          details: cached,
        };
      }
      if (cached.success) {
        if (cached.balanceStatus === 'low') {
          return { status: 'low_balance', balanceStatus: 'low', balanceFormatted: cached.balanceFormatted, latencyMs: cached.latencyMs, message: cached.message, details: cached };
        }
        return { status: 'connected', balanceStatus: cached.balanceStatus || 'ok', balanceFormatted: cached.balanceFormatted, latencyMs: cached.latencyMs, message: cached.message, details: cached };
      } else {
        return { status: 'failed', balanceStatus: cached.balanceStatus || 'depleted', latencyMs: cached.latencyMs, message: cached.message, details: cached };
      }
    }

    if (providerId === 'local') {
      return { status: 'needs_key', balanceStatus: 'unknown', message: 'Endpoint Untested' };
    }

    return { status: 'needs_key', balanceStatus: 'unknown', message: 'Key Saved • Not Verified' };
  }

  async testConnection(providerId: string, customCreds?: ProviderCredentials): Promise<ConnectionTestResult> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      return {
        success: false,
        statusType: 'failed',
        balanceStatus: 'unknown',
        message: `No adapter registered for provider: ${providerId}`,
        modelsDiscovered: 0,
        currentModels: 0,
        previewModels: 0,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const creds = customCreds || this.getCredentials(providerId);
    if (customCreds) {
      this.setCredentials(providerId, customCreds);
    }

    if (!creds.apiKey && providerId !== 'local') {
      const res: ConnectionTestResult = {
        success: false,
        statusType: 'needs_key',
        balanceStatus: 'unknown',
        message: 'No API Key entered. Please enter your API key first.',
        modelsDiscovered: 0,
        currentModels: 0,
        previewModels: 0,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };
      this.connectionStatuses.set(providerId, res);
      return res;
    }

    const res = await adapter.testConnection(creds);
    this.connectionStatuses.set(providerId, res);
    eventBus.emit('ai:connection-tested' as any, { providerId, result: res });
    return res;
  }

  getCredentials(providerId: string): ProviderCredentials {
    const cached = this.credentials.get(providerId);
    if (cached) return cached;

    // Backward-compat check with legacy local storage keys
    let legacyKey: string | null = null;
    if (providerId === 'gemini') legacyKey = localStorage.getItem('rackcad_gemini_key');
    else if (providerId === 'openai') legacyKey = localStorage.getItem('rackcad_openai_key');
    else if (providerId === 'claude') legacyKey = localStorage.getItem('rackcad_anthropic_key');
    else if (providerId === 'deepseek') legacyKey = localStorage.getItem('rackcad_deepseek_key');
    else if (providerId === 'openrouter') legacyKey = localStorage.getItem('rackcad_openrouter_key');
    else legacyKey = localStorage.getItem(`rackcad_${providerId}_key`);

    const creds = { apiKey: legacyKey || undefined };
    this.credentials.set(providerId, creds);
    return creds;
  }

  private loadCredentials(): void {
    for (const providerId of this.adapters.keys()) {
      this.getCredentials(providerId);
    }
  }

  private generateVersionId(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  private loadFromCache(): void {
    try {
      const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
      const meta = localStorage.getItem(REGISTRY_META_KEY);
      if (raw) {
        const list: AIModel[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const m of list) {
            this.models.set(m.id, m);
          }
        }
      }
      if (meta) {
        const parsed = JSON.parse(meta);
        if (parsed.version) this.registryVersion = parsed.version;
        if (parsed.lastSyncTime) this.lastSyncTime = parsed.lastSyncTime;
      }
    } catch {
      // Storage unavailable or corrupted
    }
  }

  private saveToCache(): void {
    try {
      const list = Array.from(this.models.values());
      localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(list));
      localStorage.setItem(
        REGISTRY_META_KEY,
        JSON.stringify({
          version: this.registryVersion,
          lastSyncTime: this.lastSyncTime,
          modelCount: this.models.size,
        })
      );
    } catch {
      // Storage full or error
    }
  }

  private loadActiveSelection(): void {
    try {
      const saved = localStorage.getItem(ACTIVE_MODEL_SELECTION_KEY);
      if (saved) {
        this.activeSelectedModelId = saved;
      }
      const savedChain = localStorage.getItem(FALLBACK_CHAIN_KEY);
      if (savedChain) {
        this.fallbackChain = JSON.parse(savedChain);
      }
    } catch {
      // Ignore
    }
  }

  getActiveSelectedModel(): AIModel | undefined {
    if (this.activeSelectedModelId) {
      const found = this.models.get(this.activeSelectedModelId);
      if (found) {
        if (found.category === 'open_source' || this.hasCredentials(found.providerId) || found.providerId === 'local') {
          return found;
        }
      }
    }

    // Prefer a configured model if any provider has credentials
    const allModels = Array.from(this.models.values());
    const configuredModel = allModels.find(m => this.hasCredentials(m.providerId) || m.providerId === 'local');
    if (configuredModel) {
      return configuredModel;
    }

    // Default: find first latest open_source or paid model
    const all = this.getModels({ category: 'paid' });
    if (all.length > 0) return all[0];
    const anyModel = Array.from(this.models.values())[0];
    return anyModel;
  }

  setActiveSelectedModel(modelId: string): void {
    const model = this.models.get(modelId);
    if (!model) return;

    this.activeSelectedModelId = modelId;
    this.fallbackChain.primaryModelId = modelId;

    try {
      localStorage.setItem(ACTIVE_MODEL_SELECTION_KEY, modelId);
      localStorage.setItem(FALLBACK_CHAIN_KEY, JSON.stringify(this.fallbackChain));
      localStorage.setItem('rackcad_active_provider', model.providerId);
      localStorage.setItem(`rackcad_${model.providerId}_model`, model.modelId);
    } catch {
      // Ignore
    }

    eventBus.emit('ai:provider-changed', model.providerId as any);
    eventBus.emit('ai:active-model-changed' as any, { modelId, model, providerId: model.providerId });
  }

  setFallbackChain(chain: FallbackChain): void {
    this.fallbackChain = { ...chain };
    try {
      localStorage.setItem(FALLBACK_CHAIN_KEY, JSON.stringify(this.fallbackChain));
    } catch {
      // Ignore
    }
  }

  getFallbackChain(): FallbackChain {
    return { ...this.fallbackChain };
  }

  /**
   * Synchronize the registry across all configured adapters.
   * Specification Section 33: Never delete the existing registry on failure.
   */
  async syncNow(): Promise<RegistrySyncRun[]> {
    if (this.isSyncing) return this.syncRuns;
    this.isSyncing = true;

    const currentRuns: RegistrySyncRun[] = [];
    const newVersion = this.generateVersionId();

    for (const [providerId, adapter] of this.adapters.entries()) {
      const creds = this.getCredentials(providerId);
      const syncId = `sync-${providerId}-${Date.now()}`;
      const run: RegistrySyncRun = {
        syncId,
        providerId,
        startedAt: new Date().toISOString(),
        modelsDiscovered: 0,
        modelsAdded: 0,
        modelsUpdated: 0,
        modelsDeprecated: 0,
        modelsRetired: 0,
        pricingUpdated: 0,
        errors: [],
        status: 'running',
      };

      try {
        const rawModels = await adapter.discoverModels(creds);
        run.modelsDiscovered = rawModels.length;

        for (const raw of rawModels) {
          const normalized = normalizeModel(raw, providerId, adapter.displayName);
          const existing = this.models.get(normalized.id);

          if (!existing) {
            this.models.set(normalized.id, normalized);
            run.modelsAdded++;
            eventBus.emit('ai:model-added', normalized);
          } else {
            // Check for status changes
            if (existing.status !== normalized.status) {
              if (normalized.status === 'deprecated') {
                run.modelsDeprecated++;
                eventBus.emit('ai:model-deprecated', normalized);
              } else if (normalized.status === 'retired') {
                run.modelsRetired++;
                eventBus.emit('ai:model-retired', normalized);
              }
            }
            if (JSON.stringify(existing.pricing) !== JSON.stringify(normalized.pricing)) {
              run.pricingUpdated++;
              eventBus.emit('ai:model-pricing-updated', normalized);
            }
            this.models.set(normalized.id, {
              ...existing,
              ...normalized,
              lastVerified: new Date().toISOString(),
            });
            run.modelsUpdated++;
          }
        }

        run.status = 'completed';
        run.completedAt = new Date().toISOString();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        run.errors.push(errorMsg);
        run.status = 'cached_fallback'; // Specification: Retain last known good data
        run.completedAt = new Date().toISOString();

        this.syncErrors.push({
          providerId,
          timestamp: new Date().toISOString(),
          error: errorMsg,
        });
      }

      currentRuns.push(run);
      this.syncRuns.push(run);
    }

    this.registryVersion = newVersion;
    this.lastSyncTime = Date.now();
    this.isSyncing = false;

    // Recalculate generations across all models in registry
    this.recalculateGenerations();
    this.saveToCache();

    eventBus.emit('ai:model-registry-updated', {
      version: this.registryVersion,
      totalModels: this.models.size,
    });

    return currentRuns;
  }

  private seedInitialRegistry(): void {
    for (const [providerId, adapter] of this.adapters.entries()) {
      const creds = this.getCredentials(providerId);
      // Run synchronously where possible or use seed
      adapter.discoverModels(creds).then(rawModels => {
        for (const raw of rawModels) {
          const normalized = normalizeModel(raw, providerId, adapter.displayName);
          this.models.set(normalized.id, normalized);
        }
        this.recalculateGenerations();
        this.saveToCache();
      }).catch(() => {
        // Ignore in seed phase
      });
    }
  }

  recalculateGenerations(options?: { includeLegacy?: boolean; includeDeprecated?: boolean }): void {
    const allModels = Array.from(this.models.values());
    const updated = assignGenerationsAcrossRegistry(allModels, options);
    for (const m of updated) {
      this.models.set(m.id, m);
    }
  }

  /**
   * Returns models filtered according to user criteria.
   * Strictly enforces the two top-level user categories: 'open_source' or 'paid'.
   */
  getModels(criteria: ModelFilterCriteria = {}): AIModel[] {
    let list = Array.from(this.models.values());

    // 1. Top-Level Category (Exactly Open Source or Paid)
    if (criteria.category) {
      list = list.filter(m => m.category === criteria.category);
    }

    // 2. Provider filter
    if (criteria.providerId) {
      list = list.filter(m => m.providerId === criteria.providerId);
    }

    // 3. Lifecycle exclusion (Specification Section 17)
    if (!criteria.showRetired) {
      list = list.filter(m => m.status !== 'retired');
    }
    if (!criteria.showDeprecated) {
      list = list.filter(m => m.status !== 'deprecated');
    }
    if (!criteria.showLegacy) {
      list = list.filter(m => m.status !== 'legacy');
    }

    // 4. Search query
    if (criteria.searchQuery && criteria.searchQuery.trim()) {
      const query = criteria.searchQuery.toLowerCase().trim();
      list = list.filter(m =>
        m.displayName.toLowerCase().includes(query) ||
        m.modelId.toLowerCase().includes(query) ||
        m.providerDisplayName.toLowerCase().includes(query) ||
        (m.family && m.family.toLowerCase().includes(query)) ||
        (m.license?.name && m.license.name.toLowerCase().includes(query))
      );
    }

    // 5. Capability filters
    if (criteria.requireReasoning) list = list.filter(m => m.capabilities.reasoning);
    if (criteria.requireVision) list = list.filter(m => m.capabilities.vision);
    if (criteria.requireToolCalling) list = list.filter(m => m.capabilities.toolCalling);
    if (criteria.requireStructuredOutput) list = list.filter(m => m.capabilities.structuredOutput);
    if (criteria.requireLongContext) list = list.filter(m => m.capabilities.longContext);
    if (criteria.requireAgentic) list = list.filter(m => m.capabilities.agenticWorkflows);

    // 6. Deployment filters (Open Source specifics)
    if (criteria.selfHostedOnly) list = list.filter(m => m.deploymentOptions.selfHosted);
    if (criteria.onPremisesOnly) list = list.filter(m => m.deploymentOptions.onPremises);
    if (criteria.privateCloudOnly) list = list.filter(m => m.deploymentOptions.privateCloud);

    // 7. Pricing filter (Paid specifics)
    if (criteria.maxInputPricePer1M !== undefined) {
      list = list.filter(m => m.pricing.inputPer1M !== undefined && m.pricing.inputPer1M <= criteria.maxInputPricePer1M!);
    }

    return list;
  }

  getModelById(id: string): AIModel | undefined {
    return this.models.get(id);
  }

  /**
   * Validates if a model satisfies RackSlicer Agentic AI requirements (Specification Section 30).
   * Tool Calling = true, Structured Output = true, Reasoning = true.
   */
  validateAgenticCompatibility(model: AIModel): AgenticValidationResult {
    const missing: string[] = [];
    if (!model.capabilities.toolCalling) missing.push('Tool Calling');
    if (!model.capabilities.structuredOutput) missing.push('Structured Output');
    if (!model.capabilities.reasoning) missing.push('Reasoning');

    if (missing.length === 0) {
      return { compatible: true, missingCapabilities: [] };
    }

    return {
      compatible: false,
      missingCapabilities: missing,
      warningMessage: `⚠ This model does not support ${missing.join(', ')}. RackSlicer Agentic Mode requires: ✓ Tool Calling ✓ Structured Output ✓ Reasoning. Choose another model or use manual mode.`,
    };
  }

  getFreshnessStatus(): RegistryFreshnessStatus {
    const now = Date.now();
    const ageMinutes = Math.floor((now - (this.lastSyncTime || now)) / 60000);

    let state: RegistryFreshnessStatus['state'] = 'live';
    if (!navigator.onLine) state = 'offline';
    else if (this.syncErrors.length > 0 && ageMinutes > 30) state = 'cached';

    let freshness: RegistryFreshnessStatus['freshness'] = 'current';
    if (ageMinutes > 72 * 60) freshness = 'very_stale';
    else if (ageMinutes > 24 * 60) freshness = 'stale';
    else if (ageMinutes > 12 * 60) freshness = 'aging';

    return {
      state,
      freshness,
      lastUpdated: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : new Date().toISOString(),
      version: this.registryVersion,
      ageMinutes,
    };
  }

  getProviderHealth(): ProviderHealthStatus[] {
    const result: ProviderHealthStatus[] = [];

    for (const [providerId, adapter] of this.adapters.entries()) {
      const creds = this.getCredentials(providerId);
      const providerModels = Array.from(this.models.values()).filter(m => m.providerId === providerId);
      const recentErrors = this.syncErrors.filter(e => e.providerId === providerId);

      let status: ProviderHealthStatus['status'] = 'connected';
      let message = 'Operational';

      if (!creds.apiKey && providerId !== 'local') {
        status = 'not_configured';
        message = 'No API Key configured';
      } else if (recentErrors.length > 0) {
        status = 'sync_delayed';
        message = recentErrors[recentErrors.length - 1].error;
      }

      result.push({
        providerId,
        displayName: adapter.displayName,
        status,
        message,
        modelCount: providerModels.length,
        lastSync: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : undefined,
      });
    }

    return result;
  }

  getRegistryStats() {
    const all = Array.from(this.models.values());
    return {
      totalModels: all.length,
      activeModels: all.filter(m => m.status === 'active').length,
      latestModels: all.filter(m => m.status === 'latest' || m.status === 'new').length,
      previewModels: all.filter(m => m.status === 'preview').length,
      legacyModels: all.filter(m => m.status === 'legacy').length,
      deprecatedModels: all.filter(m => m.status === 'deprecated').length,
      retiredModels: all.filter(m => m.status === 'retired').length,
      openSourceCount: all.filter(m => m.category === 'open_source').length,
      paidCount: all.filter(m => m.category === 'paid').length,
      providerCount: this.adapters.size,
      version: this.registryVersion,
      lastFullSync: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : 'Never',
    };
  }

  getSyncErrors(): RegistrySyncError[] {
    return [...this.syncErrors];
  }

  createDesignProvenance(designId: string, promptText?: string) {
    const model = this.getActiveSelectedModel();
    if (!model) return null;
    return provenanceManager.createProvenanceRecord({
      designId,
      model,
      registryVersion: this.registryVersion,
      promptText,
    });
  }

  // Support direct injection for unit testing
  injectModel(model: AIModel): void {
    this.models.set(model.id, model);
    this.recalculateGenerations();
  }

  clearModels(): void {
    this.models.clear();
  }
}

export const modelRegistry = new ModelRegistry();
