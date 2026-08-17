import { describe, it, expect } from 'vitest';
import { parseHierarchyLine, hierarchyLevelsToLine, hierarchyKindLabel, hierarchyLevelIcon } from '../library/hierarchy-parser';

describe('parseHierarchyLine', () => {
  it('parses a full 5-segment line into Account/Region/Resource Group/VPC/Subnet, in order', () => {
    const levels = parseHierarchyLine('gipl-azure-subscription/South India/Resource Groups/192.168.200.0/24');
    expect(levels.map(l => l.kind)).toEqual(['account', 'region', 'resource-group', 'vpc', 'subnet']);
    expect(levels.map(l => l.label)).toEqual(['gipl-azure-subscription', 'South India', 'Resource Groups', '192.168.200.0', '24']);
  });

  it('handles fewer than 5 segments by only producing that many levels', () => {
    const levels = parseHierarchyLine('my-account/us-east-1');
    expect(levels).toEqual([
      { kind: 'account', label: 'my-account' },
      { kind: 'region', label: 'us-east-1' },
    ]);
  });

  it('ignores segments beyond the 5th', () => {
    const levels = parseHierarchyLine('a/b/c/d/e/f/g');
    expect(levels.length).toBe(5);
    expect(levels[4]).toEqual({ kind: 'subnet', label: 'e' });
  });

  it('skips empty segments (e.g. a trailing or doubled slash) instead of creating a blank level', () => {
    const levels = parseHierarchyLine('acct//region/');
    expect(levels.map(l => l.label)).toEqual(['acct', 'region']);
  });

  it('returns an empty array for a blank line', () => {
    expect(parseHierarchyLine('')).toEqual([]);
    expect(parseHierarchyLine('   ')).toEqual([]);
  });
});

describe('hierarchyLevelsToLine', () => {
  it('round-trips through parseHierarchyLine', () => {
    const original = 'acct/region/rg/vpc/subnet';
    expect(hierarchyLevelsToLine(parseHierarchyLine(original))).toBe(original);
  });
});

describe('hierarchyKindLabel', () => {
  it('uses provider-specific terms for account and vpc', () => {
    expect(hierarchyKindLabel('account', 'azure')).toBe('Subscription');
    expect(hierarchyKindLabel('account', 'aws')).toBe('Account');
    expect(hierarchyKindLabel('account', 'gcp')).toBe('Project');
    expect(hierarchyKindLabel('vpc', 'azure')).toBe('VNet');
    expect(hierarchyKindLabel('vpc', 'aws')).toBe('VPC');
  });

  it('uses the same term for region/resource-group/subnet across providers', () => {
    expect(hierarchyKindLabel('region', 'aws')).toBe('Region');
    expect(hierarchyKindLabel('resource-group', 'gcp')).toBe('Resource Group');
    expect(hierarchyKindLabel('subnet', 'azure')).toBe('Subnet');
  });
});

describe('hierarchyLevelIcon', () => {
  it('gives region the same generic flag marker regardless of provider or label', () => {
    expect(hierarchyLevelIcon('region', 'azure')).toEqual({ type: 'flag' });
    expect(hierarchyLevelIcon('region', 'aws')).toEqual({ type: 'flag' });
    expect(hierarchyLevelIcon('region', 'gcp')).toEqual({ type: 'flag' });
  });

  it('resolves a real manifest image icon for kinds Azure has official icons for', () => {
    expect(hierarchyLevelIcon('account', 'azure')).toEqual({ type: 'image', path: '/cloud-icons/azure/subscriptions.svg' });
    expect(hierarchyLevelIcon('subnet', 'azure')).toEqual({ type: 'image', path: '/cloud-icons/azure/subnet.svg' });
    expect(hierarchyLevelIcon('resource-group', 'azure')?.type).toBe('image');
    expect(hierarchyLevelIcon('vpc', 'azure')?.type).toBe('image');
  });

  it('falls back to undefined (no icon) for a kind a provider has no official icon for, e.g. AWS resource-group', () => {
    expect(hierarchyLevelIcon('resource-group', 'aws')).toBeUndefined();
  });
});
