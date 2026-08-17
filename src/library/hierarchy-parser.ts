// "Describe infra in one line" quick-entry feature — parses a single slash-separated line into a
// CloudHierarchy's levels, an alternative to manually placing and nesting several CloudContainer
// boundary boxes by hand (see cloud-hierarchy-renderer.ts for how the parsed result is drawn).
import { CloudProvider, CloudHierarchyLevel, CloudHierarchyLevelKind } from '../core/types';
import { getBoundaryIconsByKind } from './cloud-icon-catalog';

/** Fixed level order this feature always parses a slash-separated line into — Account > Region >
 *  Resource Group > VPC > Subnet is the nested-boundary hierarchy every cloud actually has, and
 *  the order the "describe infra in one line" feature was asked to follow. */
export const HIERARCHY_LEVEL_ORDER: CloudHierarchyLevelKind[] = ['account', 'region', 'resource-group', 'vpc', 'subnet'];

const ACCOUNT_KIND_LABEL: Record<CloudProvider, string> = { aws: 'Account', azure: 'Subscription', gcp: 'Project', onprem: 'Account' };
const VPC_KIND_LABEL: Record<CloudProvider, string> = { aws: 'VPC', azure: 'VNet', gcp: 'VPC', onprem: 'Network' };

/** Splits e.g. "gipl-azure-subscription/South India/Resource Groups/192.168.200.0-24/192.168.200.0-24"
 *  into up to 5 levels (Account/Region/Resource Group/VPC/Subnet, in that fixed order). Empty
 *  segments are skipped so "a//b" doesn't create a blank middle level; extra segments past the
 *  5th are ignored. */
export function parseHierarchyLine(line: string): CloudHierarchyLevel[] {
  const segments = line.split('/').map(s => s.trim()).filter(Boolean);
  return segments.slice(0, HIERARCHY_LEVEL_ORDER.length).map((label, i) => ({
    kind: HIERARCHY_LEVEL_ORDER[i],
    label,
  }));
}

/** Reconstructs the slash-separated line from a hierarchy's levels — used to re-populate the
 *  input modal when editing an already-placed hierarchy. */
export function hierarchyLevelsToLine(levels: CloudHierarchyLevel[]): string {
  return levels.map(l => l.label).join('/');
}

/** Provider-appropriate display name for a level's kind (e.g. Azure "Subscription" vs AWS
 *  "Account", Azure "VNet" vs AWS/GCP "VPC"). */
export function hierarchyKindLabel(kind: CloudHierarchyLevelKind, provider: CloudProvider): string {
  switch (kind) {
    case 'account': return ACCOUNT_KIND_LABEL[provider];
    case 'vpc': return VPC_KIND_LABEL[provider];
    case 'resource-group': return 'Resource Group';
    case 'region': return 'Region';
    case 'subnet': return 'Subnet';
  }
}

/** A level pill's icon is either a real manifest SVG (Subscription/Resource Group/VPC/Subnet —
 *  the official provider icon) or a plain generic flag/pennant marker glyph (Region — see
 *  renderers/flag-icons.ts; a generic flag icon, not a national flag). */
export type HierarchyLevelIcon = { type: 'image'; path: string } | { type: 'flag' };

/** A level pill's icon: Region always gets the same generic flag marker (see
 *  renderers/flag-icons.ts), the rest reuse the exact official Azure/AWS/GCP portal icons already
 *  catalogued for the sidebar's Boundaries menu (see getBoundaryIconsByKind in
 *  cloud-icon-catalog.ts), falling back to icon-less for any kind a provider has no official icon
 *  for (e.g. AWS/GCP have no dedicated "Resource Group" icon) rather than guessing. */
export function hierarchyLevelIcon(kind: CloudHierarchyLevelKind, provider: CloudProvider): HierarchyLevelIcon | undefined {
  if (kind === 'region') return { type: 'flag' };
  const path = getBoundaryIconsByKind(provider).get(kind)?.[0]?.path;
  return path ? { type: 'image', path } : undefined;
}
