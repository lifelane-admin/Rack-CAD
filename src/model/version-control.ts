/**
 * Infrastructure Architecture Version Control & Diff Engine
 * Tracks change history, snapshots, rollback, and generates visual diffs between model states.
 */

import {
  ArchitectureVersion,
  ArchitectureDiff,
  PhysicalModelSnapshot,
  PhysicalObject,
  PhysicalCable,
  PhysicalPower,
} from './types';

export class ArchitectureVersionManager {
  private versions: ArchitectureVersion[] = [];
  private currentVersionIndex = -1;

  constructor(initialSnapshot?: PhysicalModelSnapshot, author = 'System') {
    if (initialSnapshot) {
      this.commitVersion({
        author,
        description: 'Initial architecture baseline',
        snapshot: initialSnapshot,
      });
    }
  }

  commitVersion(params: {
    author: string;
    description: string;
    changeReason?: string;
    proposalId?: string;
    snapshot: PhysicalModelSnapshot;
  }): ArchitectureVersion {
    const nextVerNumber = `v1.${this.versions.length}`;
    const ver: ArchitectureVersion = {
      version: nextVerNumber,
      timestamp: new Date().toISOString(),
      author: params.author,
      description: params.description,
      changeReason: params.changeReason,
      proposalId: params.proposalId,
      snapshot: JSON.stringify(params.snapshot),
    };

    // If we've undone back into history, truncate the redo branch
    if (this.currentVersionIndex < this.versions.length - 1) {
      this.versions = this.versions.slice(0, this.currentVersionIndex + 1);
    }

    this.versions.push(ver);
    this.currentVersionIndex = this.versions.length - 1;
    return ver;
  }

  getHistory(): ArchitectureVersion[] {
    return [...this.versions];
  }

  getCurrentVersion(): ArchitectureVersion | null {
    return this.versions[this.currentVersionIndex] || null;
  }

  canUndo(): boolean {
    return this.currentVersionIndex > 0;
  }

  canRedo(): boolean {
    return this.currentVersionIndex < this.versions.length - 1;
  }

  undo(): PhysicalModelSnapshot | null {
    if (!this.canUndo()) return null;
    this.currentVersionIndex--;
    const ver = this.versions[this.currentVersionIndex];
    return JSON.parse(ver.snapshot) as PhysicalModelSnapshot;
  }

  redo(): PhysicalModelSnapshot | null {
    if (!this.canRedo()) return null;
    this.currentVersionIndex++;
    const ver = this.versions[this.currentVersionIndex];
    return JSON.parse(ver.snapshot) as PhysicalModelSnapshot;
  }

  restoreVersion(versionTag: string): PhysicalModelSnapshot | null {
    const idx = this.versions.findIndex(v => v.version === versionTag);
    if (idx === -1) return null;
    this.currentVersionIndex = idx;
    return JSON.parse(this.versions[idx].snapshot) as PhysicalModelSnapshot;
  }

  /**
   * Calculates a detailed semantic diff between two architecture snapshots.
   */
  static diff(before: PhysicalModelSnapshot, after: PhysicalModelSnapshot): ArchitectureDiff {
    const diff: ArchitectureDiff = {
      added: [],
      removed: [],
      modified: [],
      moved: [],
      reconnected: [],
      powerChanged: [],
      portChanged: [],
    };

    const beforeObjMap = new Map<string, PhysicalObject>(before.objects.map(o => [o.objectId, o]));
    const afterObjMap = new Map<string, PhysicalObject>(after.objects.map(o => [o.objectId, o]));

    // Check additions and moves/modifications
    for (const [id, afterObj] of afterObjMap.entries()) {
      const beforeObj = beforeObjMap.get(id);
      if (!beforeObj) {
        diff.added.push(afterObj);
      } else {
        // Check moved
        if (beforeObj.rackId !== afterObj.rackId || beforeObj.uStart !== afterObj.uStart) {
          diff.moved.push({
            objectId: id,
            objectName: afterObj.objectName,
            fromRack: beforeObj.rackId,
            fromU: beforeObj.uStart,
            toRack: afterObj.rackId,
            toU: afterObj.uStart,
          });
        }

        // Check property changes
        const changes: string[] = [];
        if (beforeObj.powerWatts !== afterObj.powerWatts) {
          changes.push(`Power: ${beforeObj.powerWatts}W -> ${afterObj.powerWatts}W`);
        }
        if (beforeObj.psuRedundancy !== afterObj.psuRedundancy) {
          changes.push(`PSU: ${beforeObj.psuRedundancy} -> ${afterObj.psuRedundancy}`);
        }
        if (beforeObj.haPairId !== afterObj.haPairId) {
          changes.push(`HA Pair: ${beforeObj.haPairId || 'None'} -> ${afterObj.haPairId || 'None'}`);
        }
        if (changes.length > 0) {
          diff.modified.push({ before: beforeObj, after: afterObj, changes });
        }
      }
    }

    // Check removals
    for (const [id, beforeObj] of beforeObjMap.entries()) {
      if (!afterObjMap.has(id)) {
        diff.removed.push(beforeObj);
      }
    }

    // Check cables
    const beforeCableMap = new Map<string, PhysicalCable>(before.cables.map(c => [c.cableId, c]));
    const afterCableMap = new Map<string, PhysicalCable>(after.cables.map(c => [c.cableId, c]));

    for (const [id, afterCable] of afterCableMap.entries()) {
      const beforeCable = beforeCableMap.get(id);
      if (beforeCable) {
        if (
          beforeCable.sourcePort !== afterCable.sourcePort ||
          beforeCable.destinationPort !== afterCable.destinationPort
        ) {
          diff.reconnected.push({
            cableId: id,
            before: `${beforeCable.sourceObject}:${beforeCable.sourcePort} -> ${beforeCable.destinationObject}:${beforeCable.destinationPort}`,
            after: `${afterCable.sourceObject}:${afterCable.sourcePort} -> ${afterCable.destinationObject}:${afterCable.destinationPort}`,
          });
        }
      }
    }

    // Check power
    const beforePowerMap = new Map<string, PhysicalPower>(before.power.map(p => [p.powerId, p]));
    const afterPowerMap = new Map<string, PhysicalPower>(after.power.map(p => [p.powerId, p]));

    for (const [id, afterPwr] of afterPowerMap.entries()) {
      const beforePwr = beforePowerMap.get(id);
      if (beforePwr && (beforePwr.pduId !== afterPwr.pduId || beforePwr.powerFeed !== afterPwr.powerFeed)) {
        diff.powerChanged.push({
          objectId: afterPwr.objectId,
          detail: `PSU ${afterPwr.psuLabel} moved from PDU ${beforePwr.pduId} (Feed ${beforePwr.powerFeed}) to PDU ${afterPwr.pduId} (Feed ${afterPwr.powerFeed})`,
        });
      }
    }

    return diff;
  }
}
