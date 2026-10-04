import { stateManager } from '../../core/state';
import { TextLabel, DeviceData } from '../../core/types';
import { generateId } from '../../utils/geometry';

const LABEL_PREFIX = 'ai-label-';

export class LabelSyncManager {
  syncLabels(devices: DeviceData[]): void {
    const state = stateManager.getState();
    const existing: TextLabel[] = (state as any).textLabels ?? [];

    const unmanaged = existing.filter(l => !l.id.startsWith(LABEL_PREFIX));

    const deviceIds = new Set(devices.map(d => d.id));

    const managed: TextLabel[] = devices.map((device, idx) => {
      const existingLabel = existing.find(
        l => l.id.startsWith(LABEL_PREFIX) && l.pointerDeviceId === device.id,
      );
      if (existingLabel) {
        return { ...existingLabel, text: device.name };
      }
      return {
        id: `${LABEL_PREFIX}${device.id}`,
        x: 520,
        y: 60 + idx * 48,
        text: device.name,
        fontFamily: 'Inter, sans-serif',
        fontSize: 11,
        fontWeight: 'normal' as const,
        fontStyle: 'normal' as const,
        underline: false,
        color: '#e2e8f0',
        align: 'left' as const,
        backgroundColor: 'rgba(15,23,42,0.85)',
        backgroundPaddingX: 6,
        backgroundPaddingY: 3,
        rotation: 0,
        pointerDeviceId: device.id,
        pointerAnchorX: 350,
        pointerAnchorY: 16,
        pointerStyle: 'elbow' as const,
        pointerLineColor: '#3b82f6',
      } as TextLabel;
    });

    const staleManagedIds = existing
      .filter(l => l.id.startsWith(LABEL_PREFIX) && !deviceIds.has(l.pointerDeviceId ?? ''))
      .map(l => l.id);

    const updatedLabels = [...unmanaged, ...managed].filter(
      l => !staleManagedIds.includes(l.id),
    );

    stateManager.setState({ textLabels: updatedLabels } as any);
  }

  clearAll(): void {
    const state = stateManager.getState();
    const textLabels = ((state as any).textLabels ?? []).filter(
      (l: TextLabel) => !l.id.startsWith(LABEL_PREFIX),
    );
    stateManager.setState({ textLabels } as any);
  }
}
