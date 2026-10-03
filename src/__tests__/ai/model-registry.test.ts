import { describe, it, expect, beforeEach } from 'vitest';
import {
  modelRegistry,
  ModelRegistry,
  determineModelCategory,
  determineModelLicense,
  determineDeploymentOptions,
  normalizeModel,
  calculateGenerationWindow,
  sortEligibleModels,
  filterEligibleForWindow,
  extractVersionScore,
  estimateModelCost,
  provenanceManager,
  AIModel,
} from '../../ai/registry';

describe('Dynamic AI Model Registry (N → N-8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Model Category Classification (Model-level)', () => {
    it('classifies models into exactly two top-level categories: open_source or paid', () => {
      // Open source/open-weight models
      expect(determineModelCategory('qwen-3.5-72b-instruct')).toBe('open_source');
      expect(determineModelCategory('meta-llama/llama-4-scion')).toBe('open_source');
      expect(determineModelCategory('deepseek-v4-pro')).toBe('open_source');
      expect(determineModelCategory('mistral-large-2411')).toBe('open_source');
      expect(determineModelCategory('phi-4')).toBe('open_source');
      expect(determineModelCategory('granite-3.1-8b')).toBe('open_source');

      // Paid commercial API models
      expect(determineModelCategory('gpt-6-astra')).toBe('paid');
      expect(determineModelCategory('gpt-5.6-sol')).toBe('paid');
      expect(determineModelCategory('claude-opus-5-5')).toBe('paid');
      expect(determineModelCategory('claude-sonnet-5')).toBe('paid');
      expect(determineModelCategory('gemini-3.8-flash')).toBe('paid');
      expect(determineModelCategory('grok-4.7')).toBe('paid');
      expect(determineModelCategory('command-r-plus')).toBe('paid');
    });

    it('classifies at model level rather than provider level', () => {
      // Qwen with explicit commercial license vs open weight
      expect(determineModelCategory('qwen-commercial', { type: 'commercial' })).toBe('paid');
      expect(determineModelCategory('qwen-open', { type: 'open_weight' })).toBe('open_source');

      // Mistral commercial vs open
      expect(determineModelCategory('mistral-commercial', { type: 'commercial' })).toBe('paid');
      expect(determineModelCategory('mistral-open', { type: 'open_weight' })).toBe('open_source');
    });
  });

  describe('2. License & Deployment Classification', () => {
    it('correctly maps licenses for open source and commercial models', () => {
      const osLicense = determineModelLicense('llama-3.3', 'open_source');
      expect(osLicense.type).toBe('open_weight');
      expect(osLicense.commercialUseAllowed).toBe(true);

      const apacheLicense = determineModelLicense('apache-model', 'open_source');
      expect(apacheLicense.type).toBe('osi_open_source');

      const paidLicense = determineModelLicense('gpt-6-astra', 'paid');
      expect(paidLicense.type).toBe('commercial');
    });

    it('maps deployment options appropriately', () => {
      const osDeploy = determineDeploymentOptions('open_source');
      expect(osDeploy.selfHosted).toBe(true);
      expect(osDeploy.onPremises).toBe(true);
      expect(osDeploy.privateCloud).toBe(true);
      expect(osDeploy.kubernetes).toBe(true);

      const paidDeploy = determineDeploymentOptions('paid');
      expect(paidDeploy.providerHosted).toBe(true);
      expect(paidDeploy.selfHosted).toBe(false);
      expect(paidDeploy.onPremises).toBe(false);
    });
  });

  describe('3. Version Parsing & Sorting', () => {
    it('extracts comparable numerical version scores', () => {
      expect(extractVersionScore('gpt-5.6-sol')).toEqual([5, 6]);
      expect(extractVersionScore('claude-3.7-sonnet')).toEqual([3, 7]);
      expect(extractVersionScore('v4')).toEqual([4]);
    });

    it('sorts newer models ahead of older models', () => {
      const models: Partial<AIModel>[] = [
        { id: '1', displayName: 'Model 2.0', modelId: 'model-2.0', status: 'active', category: 'paid' },
        { id: '2', displayName: 'Model 3.5', modelId: 'model-3.5', status: 'active', category: 'paid' },
        { id: '3', displayName: 'Model 3.8', modelId: 'model-3.8', status: 'latest', category: 'paid' },
      ];
      const sorted = sortEligibleModels(models as AIModel[]);
      expect(sorted[0].modelId).toBe('model-3.8');
      expect(sorted[1].modelId).toBe('model-3.5');
      expect(sorted[2].modelId).toBe('model-2.0');
    });
  });

  describe('4. N → N-8 Generation Window (Specification Section 18 & 61)', () => {
    const createMockModel = (id: string, date: string, ver: string, status: any = 'active'): AIModel => ({
      id,
      modelId: id,
      displayName: `Model ${id}`,
      providerId: 'test-provider',
      providerDisplayName: 'Test Provider',
      category: 'paid',
      releaseDate: date,
      version: ver,
      status,
      deploymentOptions: {
        providerHosted: true,
        selfHosted: false,
        local: false,
        privateCloud: false,
        onPremises: false,
        kubernetes: false,
      },
      capabilities: {
        textInput: true,
        textOutput: true,
        imageInput: false,
        imageOutput: false,
        audioInput: false,
        audioOutput: false,
        videoInput: false,
        videoOutput: false,
        vision: false,
        reasoning: true,
        toolCalling: true,
        functionCalling: true,
        structuredOutput: true,
        jsonMode: true,
        streaming: true,
        batch: false,
        embeddings: false,
        codeGeneration: true,
        agenticWorkflows: true,
        computerUse: false,
        webSearch: false,
        fileSearch: false,
        longContext: false,
        multilingual: true,
      },
      pricing: { currency: 'USD', unit: 'per_1m_tokens', inputPer1M: 1, outputPer1M: 2 },
      lifecycle: { status },
      endpoints: {},
      lastVerified: new Date().toISOString(),
    });

    it('Specification Test: 10 models A B C D E F G H I J -> N=A, N-1=B ... N-8=I, J excluded', () => {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      const models = letters.map((l, i) =>
        createMockModel(l, `2026-0${10 - i}-01`, `${10 - i}.0`)
      );

      const window = calculateGenerationWindow(models);
      expect(window.length).toBe(9);
      expect(window[0].modelId).toBe('A');
      expect(window[0].relativeGeneration).toBe('N');
      expect(window[1].modelId).toBe('B');
      expect(window[1].relativeGeneration).toBe('N-1');
      expect(window[2].modelId).toBe('C');
      expect(window[2].relativeGeneration).toBe('N-2');
      expect(window[3].modelId).toBe('D');
      expect(window[3].relativeGeneration).toBe('N-3');
      expect(window[4].modelId).toBe('E');
      expect(window[4].relativeGeneration).toBe('N-4');
      expect(window[5].modelId).toBe('F');
      expect(window[5].relativeGeneration).toBe('N-5');
      expect(window[6].modelId).toBe('G');
      expect(window[6].relativeGeneration).toBe('N-6');
      expect(window[7].modelId).toBe('H');
      expect(window[7].relativeGeneration).toBe('N-7');
      expect(window[8].modelId).toBe('I');
      expect(window[8].relativeGeneration).toBe('N-8');

      // J must not appear in the 9-model window
      const hasJ = window.some(m => m.modelId === 'J');
      expect(hasJ).toBe(false);
    });

    it('Specification Test: New model promotion: existing A..I, new X -> N=X, N-1=A ... N-8=H', () => {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
      const existing = letters.map((l, i) =>
        createMockModel(l, `2026-0${9 - i}-01`, `${9 - i}.0`)
      );

      const newModel = createMockModel('X', '2026-10-01', '10.0', 'latest');
      const allWithNew = [newModel, ...existing];

      const window = calculateGenerationWindow(allWithNew);
      expect(window.length).toBe(9);
      expect(window[0].modelId).toBe('X');
      expect(window[0].relativeGeneration).toBe('N');
      expect(window[1].modelId).toBe('A');
      expect(window[1].relativeGeneration).toBe('N-1');
      expect(window[2].modelId).toBe('B');
      expect(window[2].relativeGeneration).toBe('N-2');
      expect(window[3].modelId).toBe('C');
      expect(window[3].relativeGeneration).toBe('N-3');
      expect(window[4].modelId).toBe('D');
      expect(window[4].relativeGeneration).toBe('N-4');
      expect(window[5].modelId).toBe('E');
      expect(window[5].relativeGeneration).toBe('N-5');
      expect(window[6].modelId).toBe('F');
      expect(window[6].relativeGeneration).toBe('N-6');
      expect(window[7].modelId).toBe('G');
      expect(window[7].relativeGeneration).toBe('N-7');
      expect(window[8].modelId).toBe('H');
      expect(window[8].relativeGeneration).toBe('N-8');

      // I was pushed out of the 9 window
      expect(window.some(m => m.modelId === 'I')).toBe(false);
    });

    it('Specification Test: Retirement test: if D is retired, no holes -> N=A, N-1=B, N-2=C, N-3=E ...', () => {
      const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
      const models = letters.map((l, i) =>
        createMockModel(l, `2026-0${9 - i}-01`, `${9 - i}.0`, l === 'D' ? 'retired' : 'active')
      );

      const window = calculateGenerationWindow(models);
      expect(window[0].modelId).toBe('A');
      expect(window[0].relativeGeneration).toBe('N');
      expect(window[1].modelId).toBe('B');
      expect(window[1].relativeGeneration).toBe('N-1');
      expect(window[2].modelId).toBe('C');
      expect(window[2].relativeGeneration).toBe('N-2');
      expect(window[3].modelId).toBe('E');
      expect(window[3].relativeGeneration).toBe('N-3');
      expect(window[4].modelId).toBe('F');
      expect(window[4].relativeGeneration).toBe('N-4');

      // D is retired and excluded with no hole in relativeGeneration
      expect(window.some(m => m.modelId === 'D')).toBe(false);
      expect(window.map(m => m.relativeGeneration)).toEqual([
        'N',
        'N-1',
        'N-2',
        'N-3',
        'N-4',
        'N-5',
        'N-6',
        'N-7',
      ]);
    });

    it('does not invent missing generations if fewer than 9 models exist', () => {
      const models = [
        createMockModel('A', '2026-03-01', '3.0'),
        createMockModel('B', '2026-02-01', '2.0'),
        createMockModel('C', '2026-01-01', '1.0'),
      ];

      const window = calculateGenerationWindow(models);
      expect(window.length).toBe(3);
      expect(window[0].relativeGeneration).toBe('N');
      expect(window[1].relativeGeneration).toBe('N-1');
      expect(window[2].relativeGeneration).toBe('N-2');
    });
  });

  describe('5. Lifecycle Filtering (Section 17)', () => {
    it('excludes retired models by default', () => {
      const models: Partial<AIModel>[] = [
        { id: '1', modelId: 'active-1', status: 'active' },
        { id: '2', modelId: 'retired-1', status: 'retired' },
        { id: '3', modelId: 'deprecated-1', status: 'deprecated' },
        { id: '4', modelId: 'legacy-1', status: 'legacy' },
      ];

      const filtered = filterEligibleForWindow(models as AIModel[]);
      expect(filtered.length).toBe(1);
      expect(filtered[0].modelId).toBe('active-1');

      const withLegacy = filterEligibleForWindow(models as AIModel[], { includeLegacy: true });
      expect(withLegacy.some(m => m.modelId === 'legacy-1')).toBe(true);
      expect(withLegacy.some(m => m.modelId === 'retired-1')).toBe(false);
    });
  });

  describe('6. Agentic Compatibility Check (Section 30)', () => {
    it('validates Tool Calling, Structured Output, and Reasoning for Agentic AI', () => {
      const fullModel: AIModel = {
        id: 'full',
        modelId: 'full',
        displayName: 'Full Model',
        providerId: 'test',
        providerDisplayName: 'Test',
        category: 'paid',
        status: 'active',
        deploymentOptions: {} as any,
        capabilities: {
          textInput: true,
          textOutput: true,
          imageInput: false,
          imageOutput: false,
          audioInput: false,
          audioOutput: false,
          videoInput: false,
          videoOutput: false,
          vision: true,
          reasoning: true,
          toolCalling: true,
          functionCalling: true,
          structuredOutput: true,
          jsonMode: true,
          streaming: true,
          batch: false,
          embeddings: false,
          codeGeneration: true,
          agenticWorkflows: true,
          computerUse: false,
          webSearch: false,
          fileSearch: false,
          longContext: false,
          multilingual: true,
        },
        pricing: { currency: 'USD', unit: 'per_1m_tokens' },
        lifecycle: { status: 'active' },
        endpoints: {},
        lastVerified: '',
      };

      const checkValid = modelRegistry.validateAgenticCompatibility(fullModel);
      expect(checkValid.compatible).toBe(true);
      expect(checkValid.missingCapabilities.length).toBe(0);

      const weakModel: AIModel = {
        ...fullModel,
        capabilities: {
          ...fullModel.capabilities,
          toolCalling: false,
          reasoning: false,
        },
      };

      const checkWeak = modelRegistry.validateAgenticCompatibility(weakModel);
      expect(checkWeak.compatible).toBe(false);
      expect(checkWeak.missingCapabilities).toContain('Tool Calling');
      expect(checkWeak.missingCapabilities).toContain('Reasoning');
      expect(checkWeak.warningMessage).toContain('RackSlicer Agentic Mode requires');
    });
  });

  describe('7. Cost Estimator (Section 45)', () => {
    it('calculates token costs correctly with proper formula and estimate only label', () => {
      const model: AIModel = {
        id: 'gpt-test',
        modelId: 'gpt-test',
        displayName: 'GPT Test',
        providerId: 'openai',
        providerDisplayName: 'OpenAI',
        category: 'paid',
        status: 'active',
        deploymentOptions: {} as any,
        capabilities: {} as any,
        pricing: {
          currency: 'USD',
          unit: 'per_1m_tokens',
          inputPer1M: 3.0,
          outputPer1M: 12.0,
        },
        lifecycle: { status: 'active' },
        endpoints: {},
        lastVerified: '',
      };

      // 100,000 input tokens at $3/1M = $0.30
      // 50,000 output tokens at $12/1M = $0.60
      // Total = $0.90
      const estimate = estimateModelCost(model, {
        inputTokens: 100000,
        outputTokens: 50000,
      });

      expect(estimate.inputCost).toBeCloseTo(0.30);
      expect(estimate.outputCost).toBeCloseTo(0.60);
      expect(estimate.estimatedCost).toBeCloseTo(0.90);
      expect(estimate.disclaimer).toBe('Estimate only');
    });

    it('reports $0.00 cost for self-hosted open source models', () => {
      const osModel: AIModel = {
        id: 'llama-local',
        modelId: 'llama-local',
        displayName: 'Llama Local',
        providerId: 'local',
        providerDisplayName: 'Local LLM',
        category: 'open_source',
        status: 'active',
        deploymentOptions: { selfHosted: true } as any,
        capabilities: {} as any,
        pricing: {
          currency: 'USD',
          unit: 'per_1m_tokens',
          inputPer1M: 0,
          outputPer1M: 0,
        },
        lifecycle: { status: 'active' },
        endpoints: {},
        lastVerified: '',
      };

      const estimate = estimateModelCost(osModel, {
        inputTokens: 200000,
        outputTokens: 10000,
      });

      expect(estimate.estimatedCost).toBe(0);
      expect(estimate.isFree).toBe(true);
      expect(estimate.formattedCost).toContain('$0.00');
    });
  });

  describe('8. Provenance & Reproducibility (Section 48 & 49)', () => {
    it('creates and records verifiable design provenance records', () => {
      const model: AIModel = {
        id: 'test/m1',
        modelId: 'm1',
        displayName: 'Test Model 1',
        providerId: 'test',
        providerDisplayName: 'Test Provider',
        version: '1.2.0',
        category: 'paid',
        status: 'active',
        deploymentOptions: {} as any,
        capabilities: {} as any,
        pricing: { currency: 'USD', unit: 'per_1m_tokens' },
        lifecycle: { status: 'active' },
        endpoints: {},
        lastVerified: '',
      };

      const record = provenanceManager.createProvenanceRecord({
        designId: 'design-xyz-123',
        model,
        registryVersion: '2026.10.03.1200',
        promptText: 'Add 2 Dell R770 servers and wire to spine switch',
      });

      expect(record.designId).toBe('design-xyz-123');
      expect(record.model).toBe('Test Model 1');
      expect(record.apiId).toBe('m1');
      expect(record.registryVersion).toBe('2026.10.03.1200');
      expect(record.promptHash).toBeDefined();

      const retrieved = provenanceManager.getProvenance('design-xyz-123');
      expect(retrieved).toEqual(record);
    });
  });

  describe('9. Sync & Failure Fallback (Section 33)', () => {
    it('retains last known good data when sync fails without deleting registry', async () => {
      const registry = new ModelRegistry([]);
      const dummyModel = normalizeModel(
        { id: 'cached-model', displayName: 'Cached Model' },
        'cached-provider',
        'Cached Provider'
      );

      registry.injectModel(dummyModel);
      expect(registry.getModels().length).toBe(1);

      // Register an adapter that fails on discover
      registry.registerAdapter({
        providerId: 'failing-provider',
        displayName: 'Failing Provider',
        supportedCategories: ['paid'],
        discoverModels: async () => {
          throw new Error('API Rate Limit Exceeded (HTTP 429)');
        },
        getModelDetails: async () => ({ id: 'failing' }),
        testConnection: async () => ({
          success: false,
          message: 'Error',
          modelsDiscovered: 0,
          currentModels: 0,
          previewModels: 0,
          timestamp: '',
        }),
      });

      const runs = await registry.syncNow();
      expect(runs[0].status).toBe('cached_fallback');

      // The existing models must NEVER be deleted
      expect(registry.getModels().length).toBe(1);
      expect(registry.getModelById(dummyModel.id)).toBeDefined();

      const errors = registry.getSyncErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('HTTP 429');
    });
  });
});
