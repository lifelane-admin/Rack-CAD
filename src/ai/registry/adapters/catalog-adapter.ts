import { BaseAIProviderAdapter } from './base-adapter';
import { ProviderCredentials, ProviderRawModel, ModelCategory } from '../types';

export interface ProviderCatalogConfig {
  providerId: string;
  displayName: string;
  description: string;
  supportedCategories: ModelCategory[];
  discoveryMethod: 'api' | 'catalog' | 'docs';
  apiEndpoint?: string;
  pricingSource: string;
  lifecycleSource: string;
  docsUrl: string;
  keyUrl?: string;
  seedModels: ProviderRawModel[];
}

export class CatalogProviderAdapter extends BaseAIProviderAdapter {
  readonly providerId: string;
  readonly displayName: string;
  readonly supportedCategories: ModelCategory[];
  readonly description: string;
  readonly docsUrl: string;
  readonly keyUrl?: string;
  private config: ProviderCatalogConfig;

  constructor(config: ProviderCatalogConfig) {
    super();
    this.config = config;
    this.providerId = config.providerId;
    this.displayName = config.displayName;
    this.supportedCategories = config.supportedCategories;
    this.description = config.description;
    this.docsUrl = config.docsUrl;
    this.keyUrl = config.keyUrl;
  }

  async discoverModels(credentials: ProviderCredentials): Promise<ProviderRawModel[]> {
    // If endpoint and API key provided, attempt live discovery
    if (this.config.apiEndpoint && credentials.apiKey) {
      try {
        const resp = await fetch(this.config.apiEndpoint, {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (resp.ok) {
          const data = await resp.json();
          const items = Array.isArray(data) ? data : data.data || data.models;
          if (Array.isArray(items) && items.length > 0) {
            return items.map((item: any) => ({
              id: item.id || item.name,
              displayName: item.name || item.id,
              description: item.description,
              contextWindow: item.context_length || 128000,
              capabilities: {
                vision: /vision|multimodal|vl/i.test(item.id || ''),
                reasoning: /reason|r1|thought|cot/i.test(item.id || ''),
                toolCalling: true,
                structuredOutput: true,
              },
              pricing: item.pricing,
              raw: item,
            }));
          }
        }
      } catch {
        // Fall back to official catalog seed
      }
    }

    return this.config.seedModels;
  }
}

export const INITIAL_PROVIDER_CONFIGS: ProviderCatalogConfig[] = [
  {
    providerId: 'xai',
    displayName: 'xAI Grok',
    description: 'xAI Grok frontier models with deep real-time reasoning and massive context capability.',
    supportedCategories: ['paid'],
    discoveryMethod: 'api',
    apiEndpoint: 'https://api.x.ai/v1/models',
    pricingSource: 'https://x.ai/api',
    lifecycleSource: 'xAI Official Announcements',
    docsUrl: 'https://docs.x.ai',
    keyUrl: 'https://console.x.ai',
    seedModels: [
      {
        id: 'grok-4.7',
        displayName: 'Grok 4.7 (Frontier Reasoning & Real-Time Intelligence)',
        contextWindow: 1000000,
        maxTokens: 16384,
        capabilities: { reasoning: true, vision: true, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 3.0, outputPer1M: 15.0 },
      },
      {
        id: 'grok-2-vision-1212',
        displayName: 'Grok 2 Vision (Multimodal Technical Architecture)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: false, vision: true, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 2.0, outputPer1M: 10.0 },
      },
      {
        id: 'grok-2-1212',
        displayName: 'Grok 2 (State of the Art Language)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 2.0, outputPer1M: 10.0 },
      },
    ],
  },
  {
    providerId: 'qwen',
    displayName: 'Alibaba Qwen',
    description: 'Alibaba Cloud Qwen open-weight and commercial enterprise foundational models.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://dashscope.aliyun.com',
    lifecycleSource: 'Qwen Release Catalog',
    docsUrl: 'https://github.com/QwenLM/Qwen2.5',
    seedModels: [
      {
        id: 'qwen-3.5-max',
        displayName: 'Qwen 3.5 Max (Flagship Frontier Enterprise)',
        contextWindow: 131072,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: true, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 1.6, outputPer1M: 6.4 },
        license: { name: 'Commercial API License', type: 'commercial', commercialUseAllowed: true },
      },
      {
        id: 'qwen-3.5-72b-instruct',
        displayName: 'Qwen 3.5 72B Instruct (Open Weight Self-Hosted)',
        contextWindow: 131072,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0.35, outputPer1M: 0.70 },
        license: { name: 'Qwen License / Open Weight', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'qwen-3.5-coder-32b',
        displayName: 'Qwen 3.5 Coder 32B (Open Architecture & Code)',
        contextWindow: 131072,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0.15, outputPer1M: 0.30 },
        license: { name: 'Apache 2.0', type: 'osi_open_source', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'meta',
    displayName: 'Meta / Llama',
    description: 'Meta open-weight foundational models for self-hosted enterprise and edge deployment.',
    supportedCategories: ['open_source'],
    discoveryMethod: 'catalog',
    pricingSource: 'Open Weight (Self-Hosted compute)',
    lifecycleSource: 'Meta AI Releases',
    docsUrl: 'https://llama.meta.com',
    seedModels: [
      {
        id: 'llama-4-scion',
        displayName: 'Llama 4 Scion (Next-Generation Open Flagship)',
        contextWindow: 131072,
        maxTokens: 16384,
        capabilities: { reasoning: true, vision: true, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Llama Community License', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'llama-3.3-70b-instruct',
        displayName: 'Llama 3.3 70B Instruct (General Enterprise Open Weight)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Llama Community License', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'llama-3.1-405b-instruct',
        displayName: 'Llama 3.1 405B Instruct (Ultra-Scale Open Weight)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Llama Community License', type: 'open_weight', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'mistral',
    displayName: 'Mistral AI',
    description: 'Mistral frontier models with European data sovereignty, open weights, and Le Chat API.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://mistral.ai/pricing',
    lifecycleSource: 'Mistral Documentation',
    docsUrl: 'https://docs.mistral.ai',
    seedModels: [
      {
        id: 'mistral-large-2411',
        displayName: 'Mistral Large 2 (Frontier Flagship Reasoning)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 2.0, outputPer1M: 6.0 },
        license: { name: 'Mistral Research / Open Weight', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'pixtral-large-2411',
        displayName: 'Pixtral Large (128k Multimodal Vision Architecture)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: false, vision: true, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 2.0, outputPer1M: 6.0 },
        license: { name: 'Commercial / Open Weight', type: 'open_weight', commercialUseAllowed: true },
      },
      {
        id: 'mistral-small-2409',
        displayName: 'Mistral Small (Cost-Effective Low Latency)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0.2, outputPer1M: 0.6 },
        license: { name: 'Apache 2.0', type: 'osi_open_source', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'microsoft',
    displayName: 'Microsoft',
    description: 'Microsoft Phi open small language models and Azure OpenAI enterprise infrastructure.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'Azure AI Studio',
    lifecycleSource: 'Microsoft AI Research',
    docsUrl: 'https://azure.microsoft.com/products/ai-services',
    seedModels: [
      {
        id: 'phi-4',
        displayName: 'Phi-4 (Synthetic Reasoning SOTA Small Model)',
        contextWindow: 16384,
        maxTokens: 4096,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'MIT License', type: 'osi_open_source', commercialUseAllowed: true },
      },
      {
        id: 'phi-3.5-moe',
        displayName: 'Phi-3.5 MoE (High-Speed Mixture-of-Experts)',
        contextWindow: 128000,
        maxTokens: 4096,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'MIT License', type: 'osi_open_source', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'nvidia',
    displayName: 'NVIDIA',
    description: 'NVIDIA Nemotron open models tuned for high throughput GPU datacenter clusters.',
    supportedCategories: ['open_source'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://build.nvidia.com',
    lifecycleSource: 'NVIDIA NIM Catalog',
    docsUrl: 'https://developer.nvidia.com/nemotron',
    seedModels: [
      {
        id: 'nemotron-4-340b-instruct',
        displayName: 'Llama-3.1-Nemotron-70B-Instruct (Datacenter Optimization)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'NVIDIA Open Model License', type: 'open_weight', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'ibm',
    displayName: 'IBM / Granite',
    description: 'IBM Granite open-source models with permissive Apache 2.0 enterprise indemnification.',
    supportedCategories: ['open_source'],
    discoveryMethod: 'catalog',
    pricingSource: 'Apache 2.0 Open Source',
    lifecycleSource: 'IBM Research',
    docsUrl: 'https://www.ibm.com/granite',
    seedModels: [
      {
        id: 'granite-3.1-8b-instruct',
        displayName: 'Granite 3.1 8B Instruct (Apache 2.0 Permissive)',
        contextWindow: 128000,
        maxTokens: 8192,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Apache 2.0', type: 'osi_open_source', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'cohere',
    displayName: 'Cohere',
    description: 'Cohere Command R enterprise models specialized for RAG, tool use, and multilingual enterprise deployments.',
    supportedCategories: ['paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://cohere.com/pricing',
    lifecycleSource: 'Cohere API Documentation',
    docsUrl: 'https://docs.cohere.com',
    seedModels: [
      {
        id: 'command-r-plus-08-2024',
        displayName: 'Command R+ (Enterprise RAG & Tool Calling Flagship)',
        contextWindow: 128000,
        maxTokens: 4096,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 2.5, outputPer1M: 10.0 },
      },
    ],
  },
  {
    providerId: 'ai21',
    displayName: 'AI21 Labs',
    description: 'AI21 Jamba Mamba-Transformer hybrid state-space architecture for massive context efficiency.',
    supportedCategories: ['paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://www.ai21.com/pricing',
    lifecycleSource: 'AI21 Platform',
    docsUrl: 'https://docs.ai21.com',
    seedModels: [
      {
        id: 'jamba-1.5-large',
        displayName: 'Jamba 1.5 Large (SSM-Transformer Hybrid 256k Context)',
        contextWindow: 256000,
        maxTokens: 4096,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 2.0, outputPer1M: 8.0 },
      },
    ],
  },
  {
    providerId: 'zai',
    displayName: 'Z.ai / GLM',
    description: 'Zhipu AI / Z.ai GLM bilingual frontier reasoning models with open weight and hosted API options.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://open.bigmodel.cn',
    lifecycleSource: 'Z.ai Official Releases',
    docsUrl: 'https://z.ai',
    seedModels: [
      {
        id: 'glm-4-plus',
        displayName: 'GLM-4 Plus (Flagship Architecture & Tool Use)',
        contextWindow: 128000,
        maxTokens: 4096,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 1.0, outputPer1M: 1.0 },
      },
    ],
  },
  {
    providerId: 'moonshot',
    displayName: 'Moonshot / Kimi',
    description: 'Moonshot AI Kimi models pioneering 2M token context windows for deep technical repository analysis.',
    supportedCategories: ['paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://platform.moonshot.cn',
    lifecycleSource: 'Moonshot AI Docs',
    docsUrl: 'https://platform.moonshot.cn/docs',
    seedModels: [
      {
        id: 'moonshot-v1-128k',
        displayName: 'Kimi v1 (128k Context Architecture)',
        contextWindow: 128000,
        maxTokens: 4096,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 1.5, outputPer1M: 1.5 },
      },
    ],
  },
  {
    providerId: 'minimax',
    displayName: 'MiniMax',
    description: 'MiniMax abab series with linear attention and large context processing.',
    supportedCategories: ['paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://api.minimax.chat',
    lifecycleSource: 'MiniMax Docs',
    docsUrl: 'https://api.minimax.chat/document',
    seedModels: [
      {
        id: 'abab6.5s-chat',
        displayName: 'MiniMax abab 6.5s (245k Context)',
        contextWindow: 245000,
        maxTokens: 4096,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 1.0, outputPer1M: 1.0 },
      },
    ],
  },
  {
    providerId: 'bytedance',
    displayName: 'ByteDance / Seed',
    description: 'ByteDance Doubao / Seed multimodal models for enterprise scale automation.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'Volcengine AI',
    lifecycleSource: 'ByteDance Seed Announcements',
    docsUrl: 'https://www.volcengine.com/product/doubao',
    seedModels: [
      {
        id: 'doubao-pro-128k',
        displayName: 'Doubao Pro 128k (Enterprise General)',
        contextWindow: 128000,
        maxTokens: 4096,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0.12, outputPer1M: 0.24 },
      },
    ],
  },
  {
    providerId: 'baidu',
    displayName: 'Baidu / ERNIE',
    description: 'Baidu ERNIE Bot enterprise foundational multimodal models.',
    supportedCategories: ['paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'Baidu Qianfan Platform',
    lifecycleSource: 'Baidu AI Platform',
    docsUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP',
    seedModels: [
      {
        id: 'ernie-4.0-turbo-8k',
        displayName: 'ERNIE 4.0 Turbo (Flagship Knowledge & Logic)',
        contextWindow: 8192,
        maxTokens: 2048,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 4.0, outputPer1M: 12.0 },
      },
    ],
  },
  {
    providerId: 'tencent',
    displayName: 'Tencent / Hunyuan',
    description: 'Tencent Hunyuan enterprise foundational model with MoE architecture.',
    supportedCategories: ['paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'Tencent Cloud',
    lifecycleSource: 'Tencent Cloud Docs',
    docsUrl: 'https://cloud.tencent.com/document/product/1729',
    seedModels: [
      {
        id: 'hunyuan-large',
        displayName: 'Hunyuan Large (389B MoE Architecture)',
        contextWindow: 32768,
        maxTokens: 4096,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 1.5, outputPer1M: 4.5 },
      },
    ],
  },
  {
    providerId: 'xiaomi',
    displayName: 'Xiaomi / MiMo',
    description: 'Xiaomi MiMo on-device and cloud hybrid intelligence models.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'Xiaomi AI Lab',
    lifecycleSource: 'Xiaomi Releases',
    docsUrl: 'https://github.com/Xiaomi/MiMo',
    seedModels: [
      {
        id: 'mimo-7b-instruct',
        displayName: 'MiMo 7B Instruct (Edge & Local Server Optimization)',
        contextWindow: 32768,
        maxTokens: 4096,
        capabilities: { reasoning: false, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0, outputPer1M: 0 },
        license: { name: 'Apache 2.0', type: 'osi_open_source', commercialUseAllowed: true },
      },
    ],
  },
  {
    providerId: 'upstage',
    displayName: 'Upstage / Solar',
    description: 'Upstage Solar depth-upscaled models with high speed document and technical comprehension.',
    supportedCategories: ['open_source', 'paid'],
    discoveryMethod: 'catalog',
    pricingSource: 'https://upstage.ai',
    lifecycleSource: 'Upstage AI Docs',
    docsUrl: 'https://developers.upstage.ai',
    seedModels: [
      {
        id: 'solar-pro',
        displayName: 'Solar Pro (22B Depth-Upscaled Architecture)',
        contextWindow: 64000,
        maxTokens: 4096,
        capabilities: { reasoning: true, vision: false, toolCalling: true, structuredOutput: true },
        pricing: { inputPer1M: 0.25, outputPer1M: 0.25 },
        license: { name: 'Apache 2.0 / Open Weight', type: 'open_weight', commercialUseAllowed: true },
      },
    ],
  },
];
