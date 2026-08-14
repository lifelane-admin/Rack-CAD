// Thin lookup layer over the generated cloud-icon-manifest.json (see
// scratchpad/scripts/build-cloud-icons.js at build time, not part of the app's runtime) — the
// full official AWS/Azure/GCP icon packs normalized into public/cloud-icons/<provider>/*.svg.
// Mirrors device-catalog.ts's getTemplate() lookup pattern.
import cloudIconManifestRaw from './cloud-icon-manifest.json';
import { CloudProvider, CloudContainer } from '../core/types';

export interface CloudIconEntry {
  id: string;
  provider: CloudProvider;
  category: string;
  name: string;
  kind: 'service' | 'group' | 'category';
  path: string;
  /** "True Scale" category only — real pixel dimensions using the exact same RACK_CONSTANTS
   *  (RU_HEIGHT/RACK_INNER_WIDTH/RACK_OUTER_WIDTH) as the rack canvas, so a node dropped from
   *  this category lands at true relative size instead of the generic 64x64 default. */
  trueScale?: { width: number; height: number };
}

export const cloudIconManifest: CloudIconEntry[] = cloudIconManifestRaw as CloudIconEntry[];

const byId = new Map<string, CloudIconEntry>(cloudIconManifest.map(e => [e.id, e]));

export function getCloudIcon(id: string): CloudIconEntry | undefined {
  return byId.get(id);
}

export function getCloudIconsByProvider(provider: CloudProvider): CloudIconEntry[] {
  return cloudIconManifest.filter(e => e.provider === provider);
}

// Azure/GCP ship no dedicated "boundary" icon subset the way AWS's official pack does (those are
// already tagged kind:'group' in the manifest — see build-cloud-icons.js) — these are the exact
// display names (case-insensitive) of Azure/GCP service icons that are themselves boundary
// concepts rather than actual resources, curated by hand rather than substring-matched, since a
// loose match on "vpc"/"vnet" would also catch real resources like "VPC Lattice" or "Vnet
// Appliance" that operate *against* a boundary rather than representing one.
const BOUNDARY_ICON_NAMES = new Set([
  'virtual networks',
  'virtual networks classic',
  'subnet',
  'resource groups',
  'resource group list',
  'subscriptions',  // Azure's billing/org boundary
  'project',        // GCP's billing/org boundary
]);

/** Whether this icon represents a boundary/grouping concept (VPC, Subnet, Resource Group,
 *  Availability Zone, Region, ...) rather than an actual resource — dropping one of these onto
 *  the Cloud Architecture canvas should start drawing a boundary box, not place a small icon. */
export function isBoundaryIcon(entry: CloudIconEntry): boolean {
  return entry.kind === 'group' || BOUNDARY_ICON_NAMES.has(entry.name.toLowerCase());
}

/** Best-guess CloudContainer.kind for a boundary icon, from its name — drives default border
 *  styling (see cloud-container-renderer.ts). Falls back to 'generic' for anything unrecognized. */
export function inferContainerKind(entry: CloudIconEntry): CloudContainer['kind'] {
  const n = entry.name.toLowerCase();
  if (n.includes('subnet')) return 'subnet';
  if (n.includes('resource group')) return 'resource-group';
  if (n.includes('availability zone') || n === 'az') return 'az';
  if (n.includes('region')) return 'region';
  if (n.includes('vpc') || n.includes('virtual network') || n.includes('virtual private cloud')) return 'vpc';
  if (n.includes('account') || n.includes('subscription') || n.includes('project')) return 'account';
  return 'generic';
}

/** Display label + representative manifest icon (if any exists for the given provider) for each
 *  of the "basic shapes" every cloud provider has an equivalent of — used by the dedicated
 *  toolbar shape buttons (draw a Region/AZ/VPC/Subnet/Resource-Group/Account directly, without
 *  having to find and drag the right palette icon first). Availability Zone has no matching icon
 *  in any of the three official packs — it's a purely drawn concept everywhere. */
export const CLOUD_SHAPE_KINDS: { kind: CloudContainer['kind']; label: string }[] = [
  { kind: 'region', label: 'Region' },
  { kind: 'az', label: 'Availability Zone' },
  { kind: 'vpc', label: 'VPC / Virtual Network' },
  { kind: 'subnet', label: 'Subnet' },
  { kind: 'resource-group', label: 'Resource Group' },
  { kind: 'account', label: 'Account / Subscription / Project' },
];
