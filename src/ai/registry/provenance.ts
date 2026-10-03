import { ModelProvenance, AIModel } from './types';

const PROVENANCE_STORAGE_KEY = 'rackcad_design_provenance_audit';
export const CURRENT_TOOL_DEFINITIONS_VERSION = 'v2.4.0';
export const CURRENT_RACKSLICER_SCHEMA_VERSION = 'v3.2.0';

export class ProvenanceManager {
  private records: Map<string, ModelProvenance> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(PROVENANCE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.designId) {
              this.records.set(item.designId, item);
            }
          }
        }
      }
    } catch {
      // Storage unavailable or corrupted
    }
  }

  private saveToStorage(): void {
    try {
      const arr = Array.from(this.records.values());
      localStorage.setItem(PROVENANCE_STORAGE_KEY, JSON.stringify(arr.slice(-200)));
    } catch {
      // Storage full or error
    }
  }

  createProvenanceRecord(params: {
    designId: string;
    model: AIModel;
    registryVersion: string;
    promptText?: string;
  }): ModelProvenance {
    const record: ModelProvenance = {
      designId: params.designId,
      provider: params.model.providerDisplayName,
      model: params.model.displayName,
      apiId: params.model.modelId,
      modelVersion: params.model.version,
      registryVersion: params.registryVersion,
      promptHash: params.promptText ? this.hashString(params.promptText) : undefined,
      toolDefinitionsVersion: CURRENT_TOOL_DEFINITIONS_VERSION,
      rackSlicerSchemaVersion: CURRENT_RACKSLICER_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
    };

    this.records.set(params.designId, record);
    this.saveToStorage();
    return record;
  }

  getProvenance(designId: string): ModelProvenance | undefined {
    return this.records.get(designId);
  }

  getAllRecords(): ModelProvenance[] {
    return Array.from(this.records.values());
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `hash-${Math.abs(hash).toString(16)}`;
  }
}

export const provenanceManager = new ProvenanceManager();
