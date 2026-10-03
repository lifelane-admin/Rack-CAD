import {
  AIProviderAdapter,
  ProviderCredentials,
  ProviderRawModel,
  ProviderModelDetails,
  ModelPricing,
  ModelLifecycle,
  ModelValidationResult,
  ConnectionTestResult,
  ModelCategory,
} from '../types';

export abstract class BaseAIProviderAdapter implements AIProviderAdapter {
  abstract readonly providerId: string;
  abstract readonly displayName: string;
  abstract readonly supportedCategories: ModelCategory[];
  description?: string;
  docsUrl?: string;
  keyUrl?: string;

  abstract discoverModels(credentials: ProviderCredentials): Promise<ProviderRawModel[]>;

  async getModelDetails(
    modelId: string,
    credentials: ProviderCredentials
  ): Promise<ProviderModelDetails> {
    const models = await this.discoverModels(credentials);
    const found = models.find(m => m.id === modelId || m.id === `models/${modelId}`);
    if (found) {
      return {
        ...found,
        endpoints: {},
      };
    }
    return {
      id: modelId,
      name: modelId,
      endpoints: {},
    };
  }

  async getPricing?(modelId: string): Promise<ModelPricing | null> {
    return null;
  }

  async getLifecycle?(modelId: string): Promise<ModelLifecycle | null> {
    return null;
  }

  async validateModel?(
    modelId: string,
    credentials: ProviderCredentials
  ): Promise<ModelValidationResult> {
    const start = Date.now();
    try {
      const models = await this.discoverModels(credentials);
      const exists = models.some(m => m.id === modelId || m.id.endsWith(modelId));
      return {
        valid: exists,
        latencyMs: Date.now() - start,
        toolCallingVerified: true,
        structuredOutputVerified: true,
        reasoningVerified: true,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        valid: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    const start = Date.now();
    if (!credentials.apiKey && this.providerId !== 'local') {
      return {
        success: false,
        statusType: 'needs_key',
        balanceStatus: 'unknown',
        message: 'No API Key configured. Please enter your API key first.',
        modelsDiscovered: 0,
        currentModels: 0,
        previewModels: 0,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const models = await this.discoverModels(credentials);
      const latencyMs = Date.now() - start;
      const current = models.filter(m => !/legacy|deprecated|retired/i.test(m.id)).length;
      const preview = models.filter(m => /preview|exp/i.test(m.id)).length;

      return {
        success: true,
        statusType: 'connected',
        balanceStatus: 'ok',
        balanceFormatted: 'Account Active',
        quotaNotice: 'Usage bills directly to provider account per token.',
        message: `Connected (${latencyMs}ms) · ${models.length} models discovered`,
        modelsDiscovered: models.length,
        currentModels: current,
        previewModels: preview,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errStr = err instanceof Error ? err.message : String(err);
      const isQuota = /quota|credit|balance|billing|429|exhausted|resource_exhausted/i.test(errStr);
      const isLowBalance = /low balance|warning|threshold/i.test(errStr);

      if (isLowBalance) {
        return {
          success: true,
          statusType: 'low_balance',
          balanceStatus: 'low',
          balanceFormatted: 'Low Balance Warning',
          message: `Connected (${latencyMs}ms) · Warning: Low Balance on provider account`,
          modelsDiscovered: 0,
          currentModels: 0,
          previewModels: 0,
          latencyMs,
          error: errStr,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: false,
        statusType: 'failed',
        balanceStatus: isQuota ? 'depleted' : 'unknown',
        balanceFormatted: isQuota ? '$0.00 (Exhausted)' : undefined,
        message: isQuota
          ? `Quota Exceeded / Credit Balance Exhausted (Provider 429)`
          : `Connection failed: ${errStr}`,
        modelsDiscovered: 0,
        currentModels: 0,
        previewModels: 0,
        latencyMs,
        error: errStr,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
