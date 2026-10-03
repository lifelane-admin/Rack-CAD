import { AIModel, RelativeGeneration, ModelLifecycleStatus } from './types';

export const MODEL_WINDOW_SIZE = 9;

export const GENERATION_SLOTS: RelativeGeneration[] = [
  'N',
  'N-1',
  'N-2',
  'N-3',
  'N-4',
  'N-5',
  'N-6',
  'N-7',
  'N-8',
];

/**
 * Extracts a numeric or comparable version score from model name/version
 * e.g. "gpt-5.6-sol" -> [5, 6], "claude-3-7" -> [3, 7], "v4" -> [4]
 */
export function extractVersionScore(modelId: string, versionStr?: string): number[] {
  const target = versionStr || modelId;
  const matches = target.match(/\d+(?:\.\d+)*/g);
  if (!matches || matches.length === 0) return [0];

  const lastMatch = matches[matches.length - 1];
  return lastMatch.split('.').map(n => parseInt(n, 10) || 0);
}

function compareVersions(aScore: number[], bScore: number[]): number {
  const maxLen = Math.max(aScore.length, bScore.length);
  for (let i = 0; i < maxLen; i++) {
    const a = aScore[i] ?? 0;
    const b = bScore[i] ?? 0;
    if (a !== b) return b - a; // descending: higher version first
  }
  return 0;
}

/**
 * Ranks models according to Specification Section 20:
 * 1. Provider-declared current/latest status
 * 2. Release date (descending)
 * 3. Version (descending)
 * 4. Provider model family
 * 5. Verified lifecycle information
 */
export function sortEligibleModels(models: AIModel[]): AIModel[] {
  return [...models].sort((a, b) => {
    // 1. Provider-declared latest/new
    const aIsLatest = a.status === 'latest' || a.status === 'new';
    const bIsLatest = b.status === 'latest' || b.status === 'new';
    if (aIsLatest !== bIsLatest) {
      return aIsLatest ? -1 : 1;
    }

    // 2. Release date (descending)
    if (a.releaseDate && b.releaseDate) {
      const diff = new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
      if (!isNaN(diff) && diff !== 0) return diff;
    } else if (a.releaseDate && !b.releaseDate) {
      return -1;
    } else if (!a.releaseDate && b.releaseDate) {
      return 1;
    }

    // 3. Version comparison
    const aVer = extractVersionScore(a.modelId, a.version);
    const bVer = extractVersionScore(b.modelId, b.version);
    const verDiff = compareVersions(aVer, bVer);
    if (verDiff !== 0) return verDiff;

    // 4. Family comparison
    if (a.family && b.family && a.family !== b.family) {
      return a.family.localeCompare(b.family);
    }

    // 5. Default by displayName/modelId
    return a.displayName.localeCompare(b.displayName);
  });
}

export interface WindowFilterOptions {
  includeLegacy?: boolean;
  includeDeprecated?: boolean;
  includeRetired?: boolean;
}

/**
 * Filter models based on lifecycle state (Specification Section 17):
 * - RETIRED -> EXCLUDE from default
 * - DEPRECATED -> HIDE FROM DEFAULT (shown only if includeDeprecated)
 * - LEGACY -> HIDE FROM DEFAULT (shown only if includeLegacy)
 * - PREVIEW / ACTIVE / LATEST -> CONTINUE
 */
export function filterEligibleForWindow(
  models: AIModel[],
  options: WindowFilterOptions = {}
): AIModel[] {
  return models.filter(m => {
    if (m.status === 'retired' && !options.includeRetired) {
      return false;
    }
    if (m.status === 'deprecated' && !options.includeDeprecated) {
      return false;
    }
    if (m.status === 'legacy' && !options.includeLegacy) {
      return false;
    }
    return true;
  });
}

/**
 * Computes the N → N-8 generation window (Specification Section 18):
 * - Exactly up to 9 slots: N, N-1 ... N-8
 * - If fewer than 9 eligible models, assigns only available. Never invents missing generations.
 * - Leaves remaining models (beyond slot 8) without relativeGeneration (they stay in archive/compatibility).
 */
export function calculateGenerationWindow(
  models: AIModel[],
  options: WindowFilterOptions = {}
): AIModel[] {
  const eligible = filterEligibleForWindow(models, options);
  const sorted = sortEligibleModels(eligible);

  return sorted.slice(0, MODEL_WINDOW_SIZE).map((model, index) => {
    return {
      ...model,
      relativeGeneration: GENERATION_SLOTS[index],
    };
  });
}

/**
 * Groups models by Provider and Category, and assigns N → N-8 per group (Specification Section 19).
 */
export function assignGenerationsAcrossRegistry(
  allModels: AIModel[],
  options: WindowFilterOptions = {}
): AIModel[] {
  // Map keyed by `${category}:${providerId}`
  const groups = new Map<string, AIModel[]>();

  for (const model of allModels) {
    const key = `${model.category}:${model.providerId}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(model);
  }

  const result: AIModel[] = [];

  for (const groupModels of groups.values()) {
    // Separate into window models and remaining models
    const windowModels = calculateGenerationWindow(groupModels, options);
    const windowIds = new Set(windowModels.map(m => m.id));

    result.push(...windowModels);

    // Any model in this group not in the top window keeps no relativeGeneration
    for (const model of groupModels) {
      if (!windowIds.has(model.id)) {
        result.push({
          ...model,
          relativeGeneration: undefined,
        });
      }
    }
  }

  return result;
}
