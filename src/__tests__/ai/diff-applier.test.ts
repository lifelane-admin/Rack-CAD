import { applyDiff } from '../../ai/diff-applier';
import { RackDiff } from '../../ai/types';
import { DeviceData } from '../../core/types';

const baseDevice: DeviceData = {
  id: 'd1', templateId: 'generic', rackId: 'r1',
  startUnit: 1, name: 'Server', hostname: 'srv', managementIp: '',
  serialNumber: '', description: '', ports: [],
};

describe('applyDiff', () => {
  it('null diff makes no changes', () => {
    const diff: RackDiff = { explanation: 'ok', diff: null };
    const result = applyDiff(diff, ['d1'], ['c1']);
    expect(result).toBeNull();
  });

  it('removeDevices returns device ids to remove', () => {
    const diff: RackDiff = {
      explanation: 'removing',
      diff: { removeDevices: ['d1'] },
    };
    const result = applyDiff(diff, ['d1'], []);
    expect(result?.removeDevices).toContain('d1');
  });

  it('addCables returns cable list', () => {
    const diff: RackDiff = {
      explanation: 'adding cable',
      diff: {
        addCables: [{
          id: 'c-new', name: 'New Cable', type: 'general', color: '#fff',
          sourcePortId: 'p1', destPortId: 'p2', bendPoints: [],
          thickness: 2, bendRadius: 10, bundleId: null, notes: '',
        }],
      },
    };
    const result = applyDiff(diff, [], []);
    expect(result?.addCables?.[0].id).toBe('c-new');
  });
});
