import { BaseAIProviderAdapter } from './base-adapter';
import { ProviderCredentials, ProviderRawModel, ModelCategory, ConnectionTestResult } from '../types';

export class LocalLLMProviderAdapter extends BaseAIProviderAdapter {
  readonly providerId = 'local';
  readonly displayName = 'Local / Self-Hosted (Ollama)';
  readonly supportedCategories: ModelCategory[] = ['open_source'];
  description = 'Local and on-premises inference via Ollama or private server (100% private datacenter deployment).';
  docsUrl = 'https://ollama.com';

  async testConnection(credentials: ProviderCredentials): Promise<ConnectionTestResult> {
    const start = Date.now();
    const base = credentials.endpointUrl || credentials.baseUrl || 'http://localhost:11434';

    try {
      const resp = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
      const latencyMs = Date.now() - start;

      if (!resp.ok) {
        return {
          success: false,
          statusType: 'failed',
          balanceStatus: 'unknown',
          message: `Local server responded with HTTP ${resp.status} at ${base}`,
          modelsDiscovered: 0,
          currentModels: 0,
          previewModels: 0,
          latencyMs,
          timestamp: new Date().toISOString(),
        };
      }

      const data = await resp.json();
      const count = Array.isArray(data?.models) ? data.models.length : 0;
      return {
        success: true,
        statusType: 'connected',
        balanceStatus: 'ok',
        balanceFormatted: 'Local Hardware (Free)',
        quotaNotice: 'On-premises GPU/CPU execution. Zero cloud token costs.',
        message: `Connected (${latencyMs}ms) · ${count} local models available`,
        modelsDiscovered: count,
        currentModels: count,
        previewModels: 0,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        success: false,
        statusType: 'failed',
        balanceStatus: 'unknown',
        message: `Local daemon not reachable at ${base}. Run "ollama serve" to start local inference.`,
        modelsDiscovered: 0,
        currentModels: 0,
        previewModels: 0,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async discoverModels(credentials: ProviderCredentials): Promise<ProviderRawModel[]> {
    const base = credentials.endpointUrl || 'http://localhost:11434';
    try {
      const resp = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json();
        if (data.models && Array.isArray(data.models)) {
          return data.models.map((m: any) => ({
            id: m.name,
            displayName: `${m.name} (Local Self-Hosted)`,
            contextWindow: 131072,
            maxTokens: 8192,
            capabilities: {
              vision: /vision|llava|vl/i.test(m.name),
              reasoning: /r1|reason|deepseek/i.test(m.name),
              toolCalling: true,
              structuredOutput: true,
            },
            pricing: {
              inputPer1M: 0,
              outputPer1M: 0,
            },
            license: {
              name: 'Open Source / Open Weight',
              type: 'open_weight',
              commercialUseAllowed: true,
            },
            raw: m,
          }));
        }
      }
    } catch {
      // Fallback
    }

    return [
      {
        id: 'llama3:latest',
        displayName: 'Llama 3 (Local Inference)',
        contextWindow: 131072,
        maxTokens: 8192,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Llama Community License', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'deepseek-r1:latest',
        displayName: 'DeepSeek R1 (Local Reasoning)',
        contextWindow: 64000,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'MIT / Open Weight', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'qwen2.5-coder:latest',
        displayName: 'Qwen 2.5 Coder (Local Architecture)',
        contextWindow: 131072,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Apache 2.0', type: 'osi_open_source', commercialUseAllowed: true },
      },
    ];
  }
}
