import { AIModel, ModelPricing } from './types';

export interface CostEstimateInput {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  batchTokens?: boolean;
}

export interface CostEstimateResult {
  modelId: string;
  displayName: string;
  providerDisplayName: string;
  currency: 'USD';
  estimatedCost: number;
  inputCost: number;
  outputCost: number;
  cachedInputCost?: number;
  isFree: boolean;
  isUnknownPricing: boolean;
  formattedCost: string;
  disclaimer: 'Estimate only';
  itemizedBreakdown: {
    inputTokens: number;
    inputRatePer1M?: number;
    outputTokens: number;
    outputRatePer1M?: number;
    cachedTokens?: number;
    cachedRatePer1M?: number;
  };
}

export function estimateModelCost(
  model: AIModel,
  params: CostEstimateInput
): CostEstimateResult {
  const pricing: ModelPricing = model.pricing;

  const isUnknown = pricing.inputPer1M === undefined && pricing.outputPer1M === undefined;
  const isFree =
    model.category === 'open_source' &&
    (pricing.inputPer1M === 0 || pricing.inputPer1M === undefined) &&
    (pricing.outputPer1M === 0 || pricing.outputPer1M === undefined);

  let inputCost = 0;
  let outputCost = 0;
  let cachedInputCost = 0;

  const inputRate = params.batchTokens && pricing.batchInputPer1M !== undefined
    ? pricing.batchInputPer1M
    : pricing.inputPer1M ?? 0;

  const outputRate = params.batchTokens && pricing.batchOutputPer1M !== undefined
    ? pricing.batchOutputPer1M
    : pricing.outputPer1M ?? 0;

  const cachedRate = pricing.cachedInputPer1M ?? inputRate * 0.5;

  if (params.cachedInputTokens && params.cachedInputTokens > 0) {
    const freshInput = Math.max(0, params.inputTokens - params.cachedInputTokens);
    inputCost = (freshInput / 1_000_000) * inputRate;
    cachedInputCost = (params.cachedInputTokens / 1_000_000) * cachedRate;
  } else {
    inputCost = (params.inputTokens / 1_000_000) * inputRate;
  }

  outputCost = (params.outputTokens / 1_000_000) * outputRate;

  const totalCost = isFree ? 0 : inputCost + outputCost + cachedInputCost;

  let formattedCost = `$${totalCost.toFixed(5)}`;
  if (isFree) {
    formattedCost = '$0.00 (Self-Hosted)';
  } else if (isUnknown) {
    formattedCost = 'Unknown Pricing';
  } else if (totalCost < 0.0001 && totalCost > 0) {
    formattedCost = '< $0.0001';
  } else {
    formattedCost = `$${totalCost.toFixed(4)}`;
  }

  return {
    modelId: model.id,
    displayName: model.displayName,
    providerDisplayName: model.providerDisplayName,
    currency: 'USD',
    estimatedCost: totalCost,
    inputCost,
    outputCost,
    cachedInputCost: params.cachedInputTokens ? cachedInputCost : undefined,
    isFree,
    isUnknownPricing: isUnknown,
    formattedCost,
    disclaimer: 'Estimate only',
    itemizedBreakdown: {
      inputTokens: params.inputTokens,
      inputRatePer1M: pricing.inputPer1M,
      outputTokens: params.outputTokens,
      outputRatePer1M: pricing.outputPer1M,
      cachedTokens: params.cachedInputTokens,
      cachedRatePer1M: pricing.cachedInputPer1M,
    },
  };
}
