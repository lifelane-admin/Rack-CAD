import {
  AIModel,
  ModelCategory,
  ModelCapabilities,
  ModelPricing,
  ModelLifecycle,
  ModelLicense,
  DeploymentOptions,
  ProviderRawModel,
  ModelLifecycleStatus,
} from './types';

// Set of known open-weight and open-source model patterns and families
const OPEN_SOURCE_PATTERNS = [
  /llama/i,
  /qwen/i,
  /deepseek/i,
  /mistral/i,
  /mixtral/i,
  /phi-/i,
  /nemotron/i,
  /granite/i,
  /glm/i,
  /yi-/i,
  /baichuan/i,
  /gemma/i,
  /falcon/i,
  /starcoder/i,
  /codellama/i,
  /vicuna/i,
  /solar/i,
  /mimo/i,
  /seed/i,
];

// Explicit commercial proprietary patterns
const PROPRIETARY_PATTERNS = [
  /gpt-4/i,
  /gpt-5/i,
  /gpt-6/i,
  /o1/i,
  /o3/i,
  /claude/i,
  /gemini/i,
  /grok/i,
  /command-r/i,
  /jamba/i,
  /ernie/i,
  /hunyuan/i,
  /kimi/i,
];

export function determineModelCategory(
  modelId: string,
  license?: Partial<ModelLicense>,
  explicitCategory?: ModelCategory
): ModelCategory {
  if (explicitCategory) return explicitCategory;

  // Check license first
  if (license?.type === 'osi_open_source' || license?.type === 'open_weight' || license?.type === 'source_available') {
    return 'open_source';
  }
  if (license?.type === 'commercial' || license?.type === 'proprietary') {
    return 'paid';
  }

  // Model-level regex heuristic
  for (const pat of OPEN_SOURCE_PATTERNS) {
    if (pat.test(modelId)) return 'open_source';
  }
  for (const pat of PROPRIETARY_PATTERNS) {
    if (pat.test(modelId)) return 'paid';
  }

  // Default to paid if unknown hosted API, or open_source if ollama/local
  return 'paid';
}

export function determineModelLicense(
  modelId: string,
  category: ModelCategory,
  override?: Partial<ModelLicense>
): ModelLicense {
  if (override?.name && override?.type) {
    return {
      name: override.name,
      type: override.type,
      commercialUseAllowed: override.commercialUseAllowed ?? true,
      modificationAllowed: override.modificationAllowed ?? true,
      redistributionAllowed: override.redistributionAllowed ?? true,
      licenseURL: override.licenseURL,
    };
  }

  if (category === 'open_source') {
    if (/apache/i.test(modelId)) {
      return {
        name: 'Apache 2.0',
        type: 'osi_open_source',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
        licenseURL: 'https://www.apache.org/licenses/LICENSE-2.0',
      };
    }
    if (/mit/i.test(modelId)) {
      return {
        name: 'MIT',
        type: 'osi_open_source',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
        licenseURL: 'https://opensource.org/licenses/MIT',
      };
    }
    if (/llama/i.test(modelId)) {
      return {
        name: 'Llama Community License',
        type: 'open_weight',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
        licenseURL: 'https://llama.meta.com/llama-license/',
      };
    }
    if (/deepseek/i.test(modelId)) {
      return {
        name: 'DeepSeek License / MIT',
        type: 'open_weight',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
      };
    }
    if (/qwen/i.test(modelId)) {
      return {
        name: 'Qwen Community License / Apache 2.0',
        type: 'open_weight',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
      };
    }
    if (/mistral|mixtral/i.test(modelId)) {
      return {
        name: 'Apache 2.0 / Mistral Open Weight',
        type: 'open_weight',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
      };
    }
    if (/granite/i.test(modelId)) {
      return {
        name: 'Apache 2.0',
        type: 'osi_open_source',
        commercialUseAllowed: true,
        modificationAllowed: true,
        redistributionAllowed: true,
      };
    }
    return {
      name: 'Open Weight / Custom Open License',
      type: 'open_weight',
      commercialUseAllowed: true,
      modificationAllowed: true,
      redistributionAllowed: true,
    };
  }

  return {
    name: 'Proprietary Commercial API License',
    type: 'commercial',
    commercialUseAllowed: true,
    modificationAllowed: false,
    redistributionAllowed: false,
  };
}

export function determineDeploymentOptions(
  category: ModelCategory,
  override?: Partial<DeploymentOptions>
): DeploymentOptions {
  if (category === 'open_source') {
    return {
      providerHosted: override?.providerHosted ?? true,
      selfHosted: override?.selfHosted ?? true,
      local: override?.local ?? true,
      privateCloud: override?.privateCloud ?? true,
      onPremises: override?.onPremises ?? true,
      kubernetes: override?.kubernetes ?? true,
      inferenceServers: override?.inferenceServers ?? ['vLLM', 'TGI', 'Ollama', 'SGLang', 'Triton'],
      hardwareRequirements: override?.hardwareRequirements ?? '1-8x PCIe/SXM GPUs or modern CPU inference',
    };
  }

  return {
    providerHosted: true,
    selfHosted: override?.selfHosted ?? false,
    local: override?.local ?? false,
    privateCloud: override?.privateCloud ?? false,
    onPremises: override?.onPremises ?? false,
    kubernetes: override?.kubernetes ?? false,
    inferenceServers: ['Provider Managed Cloud'],
    hardwareRequirements: 'Cloud API (No local GPU required)',
  };
}

export function normalizeCapabilities(
  rawModel: ProviderRawModel,
  modelId: string
): ModelCapabilities {
  const caps = rawModel.capabilities || {};
  const isReasoning =
    caps.reasoning ??
    (/reasoning|r1|o1|o3|thought|thinking|cot/i.test(modelId) ||
      /deepseek-reasoner|o3-mini|gemini-2.5-pro/i.test(modelId));

  const isVision =
    caps.vision ??
    (/vision|flash-vision|4o|gemini|claude|vl/i.test(modelId) ||
      caps.imageInput === true);

  const isLongContext =
    caps.longContext ??
    (rawModel.contextWindow ? rawModel.contextWindow >= 128000 : /1m|long/i.test(modelId));

  return {
    textInput: caps.textInput ?? true,
    textOutput: caps.textOutput ?? true,
    imageInput: caps.imageInput ?? isVision,
    imageOutput: caps.imageOutput ?? false,
    audioInput: caps.audioInput ?? false,
    audioOutput: caps.audioOutput ?? false,
    videoInput: caps.videoInput ?? false,
    videoOutput: caps.videoOutput ?? false,
    vision: isVision,
    reasoning: isReasoning,
    reasoningLevels: caps.reasoningLevels ?? (isReasoning ? ['low', 'medium', 'high'] : undefined),
    toolCalling: caps.toolCalling ?? true,
    functionCalling: caps.functionCalling ?? true,
    structuredOutput: caps.structuredOutput ?? true,
    jsonMode: caps.jsonMode ?? true,
    streaming: caps.streaming ?? true,
    batch: caps.batch ?? false,
    embeddings: caps.embeddings ?? false,
    codeGeneration: caps.codeGeneration ?? true,
    agenticWorkflows: caps.agenticWorkflows ?? (caps.toolCalling !== false && caps.structuredOutput !== false),
    computerUse: caps.computerUse ?? (/claude-3-7|claude-opus-5|computer/i.test(modelId)),
    webSearch: caps.webSearch ?? (/gemini|grok|perplexity|search/i.test(modelId)),
    fileSearch: caps.fileSearch ?? false,
    longContext: isLongContext,
    multilingual: caps.multilingual ?? true,
  };
}

export function normalizePricing(
  pricing?: Partial<ModelPricing>,
  category?: ModelCategory
): ModelPricing {
  const isFree = category === 'open_source' && (!pricing || (pricing.inputPer1M === 0 && pricing.outputPer1M === 0));

  return {
    currency: 'USD',
    unit: pricing?.unit ?? 'per_1m_tokens',
    inputPer1M: pricing?.inputPer1M ?? (isFree ? 0 : undefined),
    outputPer1M: pricing?.outputPer1M ?? (isFree ? 0 : undefined),
    cachedInputPer1M: pricing?.cachedInputPer1M,
    cacheWritePer1M: pricing?.cacheWritePer1M,
    imageInput: pricing?.imageInput,
    audioInput: pricing?.audioInput,
    audioOutput: pricing?.audioOutput,
    batchInputPer1M: pricing?.batchInputPer1M,
    batchOutputPer1M: pricing?.batchOutputPer1M,
    reasoningTokensIncluded: pricing?.reasoningTokensIncluded ?? true,
    pricingURL: pricing?.pricingURL,
    pricingSource: pricing?.pricingSource ?? 'Official Provider Catalog',
    effectiveDate: pricing?.effectiveDate,
    lastVerified: pricing?.lastVerified ?? new Date().toISOString(),
  };
}

export function normalizeLifecycle(
  rawModel: ProviderRawModel,
  modelId: string
): ModelLifecycle {
  let status: ModelLifecycleStatus = 'active';

  if (/retired|eol|obsolete/i.test(modelId) || rawModel.raw?.status === 'retired') {
    status = 'retired';
  } else if (/deprecated/i.test(modelId) || rawModel.raw?.status === 'deprecated') {
    status = 'deprecated';
  } else if (/legacy|1\.5-flash|gpt-3\.5/i.test(modelId) || rawModel.raw?.status === 'legacy') {
    status = 'legacy';
  } else if (/preview|exp|experimental|beta/i.test(modelId) || rawModel.raw?.status === 'preview') {
    status = 'preview';
  } else if (/latest|v4|v5|v6|3\.8|5\.6/i.test(modelId) || rawModel.raw?.status === 'latest') {
    status = 'latest';
  }

  const releaseDate =
    typeof rawModel.created === 'string'
      ? rawModel.created
      : typeof rawModel.created === 'number'
      ? new Date(rawModel.created * 1000).toISOString().split('T')[0]
      : undefined;

  return {
    status,
    releaseDate,
    lifecycleSource: 'Provider Catalog',
    lastVerified: new Date().toISOString(),
  };
}

export function normalizeModel(
  raw: ProviderRawModel,
  providerId: string,
  providerDisplayName: string,
  explicitCategory?: ModelCategory
): AIModel {
  const cleanModelId = raw.id.replace(/^models\//, '');
  const category = determineModelCategory(cleanModelId, raw.license, explicitCategory);
  const license = determineModelLicense(cleanModelId, category, raw.license);
  const deploymentOptions = determineDeploymentOptions(category);
  const capabilities = normalizeCapabilities(raw, cleanModelId);
  const pricing = normalizePricing(raw.pricing, category);
  const lifecycle = normalizeLifecycle(raw, cleanModelId);

  const displayName = raw.displayName || raw.name || cleanModelId;

  return {
    id: `${providerId}/${cleanModelId}`,
    providerId,
    providerDisplayName,
    modelId: cleanModelId,
    displayName,
    family: raw.family,
    version: raw.version,
    releaseDate: lifecycle.releaseDate,
    category,
    license,
    deploymentOptions,
    status: lifecycle.status,
    contextWindow: raw.contextWindow || (category === 'open_source' ? 131072 : 1048576),
    maxOutputTokens: raw.maxTokens || 8192,
    capabilities,
    pricing,
    lifecycle,
    endpoints: {},
    lastVerified: new Date().toISOString(),
    sourceMetadata: {
      rawResponse: raw.raw,
      discoveredAt: new Date().toISOString(),
      sourceType: 'api',
    },
  };
}

export function extractModelBadges(model: AIModel): string[] {
  const badges: string[] = [];

  if (model.status === 'latest') badges.push('★ LATEST');
  else if (model.status === 'new') badges.push('✦ NEW');
  else if (model.status === 'preview') badges.push('PREVIEW');
  else if (model.status === 'legacy') badges.push('LEGACY');
  else if (model.status === 'deprecated') badges.push('DEPRECATED');
  else if (model.status === 'retired') badges.push('RETIRED');

  if (model.category === 'open_source' && model.deploymentOptions.selfHosted) {
    badges.push('SELF-HOSTED');
  }

  if (model.capabilities.reasoning) badges.push('REASONING');
  if (model.capabilities.vision) badges.push('VISION');
  if (model.capabilities.toolCalling) badges.push('TOOLS');

  if (model.contextWindow && model.contextWindow >= 1000000) {
    badges.push('1M CONTEXT');
  }

  return badges;
}
