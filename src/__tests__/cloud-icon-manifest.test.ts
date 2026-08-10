import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { cloudIconManifest, getCloudIcon, getCloudIconsByProvider, isBoundaryIcon, inferContainerKind, CLOUD_SHAPE_KINDS } from '../library/cloud-icon-catalog';

// The manifest is generated from the official AWS/Azure/GCP icon packs (see the plan/handoff
// notes) and normalized into public/cloud-icons/<provider>/<slug>.svg. This guards against the
// manifest and the actual files on disk drifting apart, and against duplicate/malformed entries.
const PUBLIC_ROOT = join(__dirname, '..', '..', 'public');

describe('cloud-icon-manifest', () => {
  it('has a substantial number of icons across all three providers', () => {
    expect(cloudIconManifest.length).toBeGreaterThan(1000);
    expect(getCloudIconsByProvider('aws').length).toBeGreaterThan(100);
    expect(getCloudIconsByProvider('azure').length).toBeGreaterThan(100);
    expect(getCloudIconsByProvider('gcp').length).toBeGreaterThan(100);
  });

  it('every entry has a unique id', () => {
    const ids = cloudIconManifest.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry\'s path resolves to a real file under public/cloud-icons', () => {
    const missing = cloudIconManifest.filter(e => !existsSync(join(PUBLIC_ROOT, e.path)));
    expect(missing.map(e => e.id)).toEqual([]);
  });

  it('every entry has a non-empty name and category', () => {
    const bad = cloudIconManifest.filter(e => !e.name.trim() || !e.category.trim());
    expect(bad.map(e => e.id)).toEqual([]);
  });

  it('getCloudIcon looks up a known entry by id', () => {
    const first = cloudIconManifest[0];
    expect(getCloudIcon(first.id)).toEqual(first);
  });

  it('getCloudIcon returns undefined for an unknown id', () => {
    expect(getCloudIcon('nonexistent-icon-id')).toBeUndefined();
  });
});

describe('isBoundaryIcon / inferContainerKind', () => {
  it('flags Azure "Virtual Networks" and "Subnet" as boundary icons', () => {
    expect(isBoundaryIcon(getCloudIcon('azure-virtual-networks')!)).toBe(true);
    expect(isBoundaryIcon(getCloudIcon('azure-subnet')!)).toBe(true);
  });

  it('flags every AWS group-kind icon (Region, VPC, Subnet, ...) as a boundary icon', () => {
    const groups = cloudIconManifest.filter(e => e.kind === 'group');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every(isBoundaryIcon)).toBe(true);
  });

  it('does not flag a real resource that merely operates against a boundary (e.g. a VPC/VNet gateway or appliance)', () => {
    const falsePositiveNames = ['Vpc Lattice', 'Vnet Appliance', 'Virtual Network Gateways'];
    for (const name of falsePositiveNames) {
      const entry = cloudIconManifest.find(e => e.name === name);
      if (entry) expect(isBoundaryIcon(entry)).toBe(false);
    }
  });

  it('does not flag an ordinary service icon (e.g. Amazon EC2) as a boundary icon', () => {
    expect(isBoundaryIcon(getCloudIcon('aws-amazon-ec2')!)).toBe(false);
  });

  it('infers the right container kind from a boundary icon\'s name', () => {
    expect(inferContainerKind(getCloudIcon('azure-virtual-networks')!)).toBe('vpc');
    expect(inferContainerKind(getCloudIcon('azure-subnet')!)).toBe('subnet');
    expect(inferContainerKind(getCloudIcon('aws-region')!)).toBe('region');
    expect(inferContainerKind(getCloudIcon('aws-virtual-private-cloud-vpc')!)).toBe('vpc');
  });

  it('flags Azure Subscriptions and GCP Project as boundary icons, inferred as "account"', () => {
    expect(isBoundaryIcon(getCloudIcon('azure-subscriptions')!)).toBe(true);
    expect(inferContainerKind(getCloudIcon('azure-subscriptions')!)).toBe('account');
    expect(isBoundaryIcon(getCloudIcon('gcp-project')!)).toBe(true);
    expect(inferContainerKind(getCloudIcon('gcp-project')!)).toBe('account');
  });

  it('does not flag an unrelated "...Accounts" resource icon as a boundary (e.g. Storage Accounts)', () => {
    const storageAccounts = cloudIconManifest.find(e => e.name === 'Storage Accounts');
    expect(storageAccounts).toBeDefined();
    expect(isBoundaryIcon(storageAccounts!)).toBe(false);
  });
});

describe('CLOUD_SHAPE_KINDS', () => {
  it('covers all six basic boundary shapes: Region, AZ, VPC/VNet, Subnet, Resource Group, Account', () => {
    const kinds = CLOUD_SHAPE_KINDS.map(s => s.kind).sort();
    expect(kinds).toEqual(['account', 'az', 'region', 'resource-group', 'subnet', 'vpc'].sort());
  });

  it('every shape has a non-empty label', () => {
    expect(CLOUD_SHAPE_KINDS.every(s => s.label.trim().length > 0)).toBe(true);
  });
});
