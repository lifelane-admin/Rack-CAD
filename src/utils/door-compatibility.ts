/**
 * Door & Rack Compatibility Engine
 *
 * Enforces physical enclosure rules across Rack Type, Front Door Style,
 * Door Operation, and Door Opening. Provides watermark indicators "(N/A)"
 * and auto-adjustment when incompatible combinations are selected.
 */

import { RackDoorOperation, RackDoorOpening, RackDoorType, RackType } from '../core/types';

export interface CompatibilityOption<T extends string> {
  value: T;
  label: string;
  isApplicable: boolean;
  reason?: string;
  displayLabel: string;
}

export function isDualDoorStyle(doorStyle?: string): boolean {
  if (!doorStyle) return false;
  return doorStyle.startsWith('split-') || doorStyle.startsWith('asym-split-');
}

export function isBiFoldDoorStyle(doorStyle?: string): boolean {
  if (!doorStyle) return false;
  return doorStyle.startsWith('bifold-');
}

export function isColoDoorStyle(doorStyle?: string): boolean {
  if (!doorStyle) return false;
  return doorStyle.startsWith('multi-compartment-');
}

export function isOpenEnclosure(doorStyle?: string, rackType?: string): boolean {
  return doorStyle === 'none' || rackType === 'open-frame';
}

/**
 * Returns the list of Door Operation options with physical compatibility status and (N/A) watermark.
 */
export function getDoorOperationOptions(
  doorStyle?: string,
  rackType?: string
): CompatibilityOption<RackDoorOperation>[] {
  const isOpen = isOpenEnclosure(doorStyle, rackType);
  const isDual = isDualDoorStyle(doorStyle);
  const isBiFold = isBiFoldDoorStyle(doorStyle);
  const isColo = isColoDoorStyle(doorStyle);
  const isWall = rackType === 'wall-mount';

  const rawOptions: Array<{ value: RackDoorOperation; label: string }> = [
    { value: 'swing-left', label: 'Swing - Left Hinged' },
    { value: 'swing-right', label: 'Swing - Right Hinged' },
    { value: 'swing-dual', label: 'Swing - Dual Leaf (Wardrobe)' },
    { value: 'sliding', label: 'Sliding Track (Manual / Auto)' },
    { value: 'lift-off', label: 'Lift-Off (Quick-Release Panel)' },
    { value: 'bifold', label: 'Bi-Fold (Folding Hinge)' },
  ];

  return rawOptions.map(opt => {
    let isApplicable = true;
    let reason = '';

    if (isOpen) {
      isApplicable = false;
      reason = 'Open Frame / No Door';
    } else if (isDual) {
      // Twin Doors require dual-leaf swing or lift-off
      if (opt.value === 'sliding') {
        isApplicable = false;
        reason = 'Incompatible with Twin/Split Doors';
      } else if (opt.value === 'swing-left' || opt.value === 'swing-right') {
        isApplicable = false;
        reason = 'Requires Dual Leaf for Split Doors';
      } else if (opt.value === 'bifold') {
        isApplicable = false;
        reason = 'Requires Bi-Fold Door Style';
      }
    } else if (isBiFold) {
      // Bi-Fold doors require bifold hinge or lift-off
      if (opt.value === 'sliding') {
        isApplicable = false;
        reason = 'Incompatible with Folding Doors';
      } else if (opt.value === 'swing-left' || opt.value === 'swing-right' || opt.value === 'swing-dual') {
        isApplicable = false;
        reason = 'Requires Folding Hinge';
      }
    } else if (isColo) {
      // Colo compartment doors are individual single hinged/lift-off panels
      if (opt.value === 'sliding') {
        isApplicable = false;
        reason = 'Incompatible with Colo Multi-Doors';
      } else if (opt.value === 'swing-dual' || opt.value === 'bifold') {
        isApplicable = false;
        reason = 'Individual Compartment Doors';
      }
    } else {
      // Single Leaf Doors (perforated, honeycomb, glass, solid, etc.)
      if (opt.value === 'swing-dual') {
        isApplicable = false;
        reason = 'Requires Twin/Split Door Style';
      } else if (opt.value === 'bifold') {
        isApplicable = false;
        reason = 'Requires Bi-Fold Door Style';
      } else if (opt.value === 'sliding' && isWall) {
        isApplicable = false;
        reason = 'Wall Mount Clearance';
      }
    }

    const displayLabel = isApplicable ? opt.label : `${opt.label} (N/A)`;

    return {
      value: opt.value,
      label: opt.label,
      isApplicable,
      reason,
      displayLabel,
    };
  });
}

/**
 * Returns the list of Door Opening options (Front Only / Front + Rear) with compatibility status and (N/A) watermark.
 */
export function getDoorOpeningOptions(
  doorStyle?: string,
  rackType?: string
): CompatibilityOption<RackDoorOpening>[] {
  const isOpen = isOpenEnclosure(doorStyle, rackType);
  const isWall = rackType === 'wall-mount';

  const rawOptions: Array<{ value: RackDoorOpening; label: string }> = [
    { value: 'front-only', label: 'Front Only (Single Access)' },
    { value: 'front-rear', label: 'Front + Rear (Dual Front & Rear Access)' },
  ];

  return rawOptions.map(opt => {
    let isApplicable = true;
    let reason = '';

    if (isOpen) {
      if (opt.value === 'front-rear') {
        isApplicable = false;
        reason = 'Open Frame';
      }
    } else if (isWall) {
      if (opt.value === 'front-rear') {
        isApplicable = false;
        reason = 'Wall Mounted';
      }
    }

    const displayLabel = isApplicable ? opt.label : `${opt.label} (N/A)`;

    return {
      value: opt.value,
      label: opt.label,
      isApplicable,
      reason,
      displayLabel,
    };
  });
}

/**
 * Auto-corrects any invalid or incompatible door configuration into a valid physical combination.
 */
export function sanitizeDoorConfiguration(config: {
  rackType?: RackType | string;
  frontDoor?: RackDoorType | string;
  doorOperation?: RackDoorOperation | string;
  doorOpening?: RackDoorOpening | string;
  sidePanels?: boolean;
}): {
  rackType: RackType;
  frontDoor: RackDoorType;
  doorOperation: RackDoorOperation;
  doorOpening: RackDoorOpening;
  sidePanels: boolean;
} {
  const rackType = (config.rackType as RackType) || 'server';
  let frontDoor = (config.frontDoor as RackDoorType) || 'perforated';
  let doorOperation = (config.doorOperation as RackDoorOperation) || 'swing-left';
  let doorOpening = (config.doorOpening as RackDoorOpening) || 'front-only';
  let sidePanels = config.sidePanels !== false;

  if (rackType === 'open-frame') {
    frontDoor = 'none';
    doorOperation = 'swing-left';
    doorOpening = 'front-only';
    sidePanels = false;
    return { rackType, frontDoor, doorOperation, doorOpening, sidePanels };
  }

  if (frontDoor === 'none') {
    doorOperation = 'swing-left';
    doorOpening = 'front-only';
    return { rackType, frontDoor, doorOperation, doorOpening, sidePanels };
  }

  const opOptions = getDoorOperationOptions(frontDoor, rackType);
  const currentOpValid = opOptions.find(o => o.value === doorOperation && o.isApplicable);

  if (!currentOpValid) {
    if (isDualDoorStyle(frontDoor)) {
      doorOperation = 'swing-dual';
    } else if (isBiFoldDoorStyle(frontDoor)) {
      doorOperation = 'bifold';
    } else {
      doorOperation = 'swing-left';
    }
  }

  const openOptions = getDoorOpeningOptions(frontDoor, rackType);
  const currentOpeningValid = openOptions.find(o => o.value === doorOpening && o.isApplicable);

  if (!currentOpeningValid) {
    doorOpening = 'front-only';
  }

  return {
    rackType,
    frontDoor,
    doorOperation,
    doorOpening,
    sidePanels,
  };
}
