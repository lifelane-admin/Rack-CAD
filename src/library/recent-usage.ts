import { CloudContainer } from '../core/types';

const STORAGE_KEY = 'rackcad_cloud_recent_usage';
const MAX_ENTRIES = 10;

export type RecentUsageEntry =
  | { type: 'icon'; iconId: string; ts: number }
  | { type: 'boundary'; kind: CloudContainer['kind']; ts: number };

function load(): RecentUsageEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(entries: RecentUsageEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function isSameEntry(a: RecentUsageEntry, b: RecentUsageEntry): boolean {
  if (a.type !== b.type) return false;
  return a.type === 'icon'
    ? a.iconId === (b as { iconId: string }).iconId
    : a.kind === (b as { kind: CloudContainer['kind'] }).kind;
}

function record(entry: RecentUsageEntry): void {
  const deduped = load().filter(e => !isSameEntry(e, entry));
  deduped.unshift(entry);
  persist(deduped.slice(0, MAX_ENTRIES));
}

/** Records dragging a cloud icon (any provider/category) onto the canvas. Re-using an icon moves
 *  it back to the front instead of creating a duplicate entry. */
export function recordIconUse(iconId: string): void {
  record({ type: 'icon', iconId, ts: Date.now() });
}

/** Records drawing a boundary shape (Region/VPC/Subnet/... via cloud-shape:prime). */
export function recordBoundaryUse(kind: CloudContainer['kind']): void {
  record({ type: 'boundary', kind, ts: Date.now() });
}

/** Most-recently-used first, capped at MAX_ENTRIES. */
export function getRecentUsage(): RecentUsageEntry[] {
  return load();
}
