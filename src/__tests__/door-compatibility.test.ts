import { describe, it, expect } from 'vitest';
import {
  getDoorOperationOptions,
  getDoorOpeningOptions,
  sanitizeDoorConfiguration,
  isDualDoorStyle,
  isBiFoldDoorStyle,
  isColoDoorStyle,
  isOpenEnclosure,
} from '../utils/door-compatibility';

describe('Door Compatibility Engine', () => {
  it('identifies door categories correctly', () => {
    expect(isDualDoorStyle('split-perforated')).toBe(true);
    expect(isDualDoorStyle('asym-split-glass')).toBe(true);
    expect(isDualDoorStyle('perforated')).toBe(false);

    expect(isBiFoldDoorStyle('bifold-mesh')).toBe(true);
    expect(isBiFoldDoorStyle('split-mesh')).toBe(false);

    expect(isColoDoorStyle('multi-compartment-2')).toBe(true);
    expect(isColoDoorStyle('multi-compartment-4')).toBe(true);

    expect(isOpenEnclosure('none', 'server')).toBe(true);
    expect(isOpenEnclosure('perforated', 'open-frame')).toBe(true);
  });

  it('marks sliding track as (N/A) for Twin / Dual Split doors', () => {
    const options = getDoorOperationOptions('split-perforated', 'server');
    const sliding = options.find(o => o.value === 'sliding');
    expect(sliding).toBeDefined();
    expect(sliding?.isApplicable).toBe(false);
    expect(sliding?.displayLabel).toContain('(N/A)');
    expect(sliding?.reason).toContain('Twin/Split Doors');

    const swingDual = options.find(o => o.value === 'swing-dual');
    expect(swingDual?.isApplicable).toBe(true);
    expect(swingDual?.displayLabel).toBe('Swing - Dual Leaf (Wardrobe)');

    const liftOff = options.find(o => o.value === 'lift-off');
    expect(liftOff?.isApplicable).toBe(true);

    const swingLeft = options.find(o => o.value === 'swing-left');
    expect(swingLeft?.isApplicable).toBe(false);
    expect(swingLeft?.displayLabel).toContain('(N/A)');
  });

  it('marks sliding and single swing as (N/A) for Bi-Fold doors', () => {
    const options = getDoorOperationOptions('bifold-honeycomb', 'server');
    const sliding = options.find(o => o.value === 'sliding');
    expect(sliding?.isApplicable).toBe(false);
    expect(sliding?.displayLabel).toContain('(N/A)');

    const bifold = options.find(o => o.value === 'bifold');
    expect(bifold?.isApplicable).toBe(true);

    const swingDual = options.find(o => o.value === 'swing-dual');
    expect(swingDual?.isApplicable).toBe(false);
  });

  it('allows sliding track for single doors but not for wall mount', () => {
    const serverOpts = getDoorOperationOptions('perforated', 'server');
    const serverSliding = serverOpts.find(o => o.value === 'sliding');
    expect(serverSliding?.isApplicable).toBe(true);
    expect(serverSliding?.displayLabel).not.toContain('(N/A)');

    const wallOpts = getDoorOperationOptions('perforated', 'wall-mount');
    const wallSliding = wallOpts.find(o => o.value === 'sliding');
    expect(wallSliding?.isApplicable).toBe(false);
    expect(wallSliding?.displayLabel).toContain('(N/A)');
    expect(wallSliding?.reason).toContain('Wall Mount Clearance');
  });

  it('marks front-rear opening as (N/A) for wall-mount and open-frame', () => {
    const serverOpening = getDoorOpeningOptions('perforated', 'server');
    expect(serverOpening.find(o => o.value === 'front-rear')?.isApplicable).toBe(true);

    const wallOpening = getDoorOpeningOptions('perforated', 'wall-mount');
    const wallFrontRear = wallOpening.find(o => o.value === 'front-rear');
    expect(wallFrontRear?.isApplicable).toBe(false);
    expect(wallFrontRear?.displayLabel).toContain('(N/A)');

    const openFrameOpening = getDoorOpeningOptions('none', 'open-frame');
    const openFrontRear = openFrameOpening.find(o => o.value === 'front-rear');
    expect(openFrontRear?.isApplicable).toBe(false);
    expect(openFrontRear?.displayLabel).toContain('(N/A)');
  });

  it('sanitizes incompatible door configurations automatically', () => {
    // Twin door + sliding -> auto-corrected to swing-dual
    const res1 = sanitizeDoorConfiguration({
      rackType: 'server',
      frontDoor: 'split-perforated',
      doorOperation: 'sliding',
      doorOpening: 'front-only',
    });
    expect(res1.doorOperation).toBe('swing-dual');

    // Bi-fold + single swing -> auto-corrected to bifold
    const res2 = sanitizeDoorConfiguration({
      rackType: 'server',
      frontDoor: 'bifold-glass',
      doorOperation: 'swing-left',
      doorOpening: 'front-only',
    });
    expect(res2.doorOperation).toBe('bifold');

    // Wall-mount + front-rear -> auto-corrected to front-only
    const res3 = sanitizeDoorConfiguration({
      rackType: 'wall-mount',
      frontDoor: 'perforated',
      doorOperation: 'swing-left',
      doorOpening: 'front-rear',
    });
    expect(res3.doorOpening).toBe('front-only');

    // Open frame -> auto-corrected to none / swing-left / front-only / no side panels
    const res4 = sanitizeDoorConfiguration({
      rackType: 'open-frame',
      frontDoor: 'split-perforated',
      doorOperation: 'sliding',
      doorOpening: 'front-rear',
      sidePanels: true,
    });
    expect(res4.frontDoor).toBe('none');
    expect(res4.doorOperation).toBe('swing-left');
    expect(res4.doorOpening).toBe('front-only');
    expect(res4.sidePanels).toBe(false);
  });
});
