import { AIProvider, AIProviderName, AIHint, AIMessage, RackContext, RackDiff } from './types';

const POWER_WARN_THRESHOLD = 0.8;
const POWER_ERROR_THRESHOLD = 0.95;

export class RuleEngine implements AIProvider {
  readonly name: AIProviderName = 'rules';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getHints(context: RackContext, selectedId?: string): Promise<AIHint[]> {
    const hints: AIHint[] = [];

    for (const rack of context.racks) {
      const totalWatts = rack.pdus.reduce((sum, p) => sum + p.watts, 0);
      // NOTE: device.power is populated by the serializer once Task 15/16 land (catalog + power parsing).
      // Until then, usedWatts will always be 0 and this hint will not trigger.
      const usedWatts = rack.devices.reduce((sum, d) => sum + (d.power ?? 0), 0);
      const ratio = totalWatts > 0 ? usedWatts / totalWatts : 0;

      if (ratio >= POWER_ERROR_THRESHOLD) {
        hints.push({ severity: 'error', message: `${rack.name}: power at ${Math.round(ratio * 100)}% — critical` });
      } else if (ratio >= POWER_WARN_THRESHOLD) {
        hints.push({ severity: 'warning', message: `${rack.name}: power at ${Math.round(ratio * 100)}% of PDU capacity` });
      }

      const usedRus = rack.devices.reduce((sum, d) => sum + (d.ruEnd - d.ruStart + 1), 0);
      const freeRus = Math.max(0, rack.units - usedRus);
      if (freeRus === 0) {
        hints.push({ severity: 'warning', message: `${rack.name}: rack is full (0U free of ${rack.units}U)` });
      } else {
        hints.push({ severity: 'info', message: `${rack.name}: ${freeRus}U free of ${rack.units}U` });
      }
    }

    const floatingCount = context.cables.filter(c => c.toPort === null).length;
    if (floatingCount > 0) {
      hints.push({ severity: 'warning', message: `${floatingCount} cable(s) have no destination port` });
    }

    const validationErrors = context.validation.alerts.filter(a => a.severity === 'error');
    for (const alert of validationErrors.slice(0, 3)) {
      hints.push({ severity: 'error', message: alert.message });
    }

    return hints;
  }

  async *chat(context: RackContext, _messages: AIMessage[]): AsyncIterable<string> {
    const hints = await this.getHints(context);
    const summary = hints.map(h => `• ${h.message}`).join('\n');
    const response: RackDiff = {
      explanation: `Rule-based analysis:\n${summary || 'No issues detected.'}\n\n(Enable Claude or Local AI for natural language requests.)`,
      diff: null,
    };
    yield JSON.stringify(response);
  }

  parseDiff(raw: string): RackDiff {
    try {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.explanation === 'string' &&
        (parsed.diff === null || (typeof parsed.diff === 'object' && !Array.isArray(parsed.diff)))
      ) {
        return parsed as RackDiff;
      }
    } catch {
      // not JSON — treat as plain explanation
    }
    return { explanation: raw, diff: null };
  }
}
