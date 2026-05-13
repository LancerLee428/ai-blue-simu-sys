import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDetectionZoneTrackingAttributes,
  parseElectronicWarfareEffectAttributes,
} from '../xml-scenario-parser';
import {
  getDetectionZoneTrackingAttributes,
  getElectronicWarfareEffectAttributes,
} from '../xml-scenario-exporter';

import {
  createElectronicSuppressionBeamLayers,
  createRadarBeamEdgeIndices,
  createRadarScanEmitterModel,
  createRadarBeamMesh,
  getCesiumClockRangeForTacticalSector,
  getScenarioVirtualTimeMs,
  getStaleRuntimeEmitterIds,
  isRadarDetectionEmitterSource,
  normalizeElectronicWarfareConfig,
  normalizeRadarTrackingConfig,
  prepareRuntimeExplosionsForRender,
  resolveStaticDetectionVisible,
  selectElectronicWarfareTargets,
  shouldRenderRuntimeEmitterBeam,
  shouldIncludeRuntimeEWEmitters,
  selectRadarTrackingTargets,
  shouldRenderRuntimeRadarBaseVolume,
  shouldIncludeRuntimeEmitters,
  shouldRenderRuntimeExplosions,
  shouldRenderRuntimeRadarScan,
  shouldShowStaticDetectionVolumesForStatus,
} from '../runtime-visual-math';
import { ElectronicWarfareManager } from '../electronic-warfare';
import type { DetectionZone, EmitterVolume } from '../../types/tactical-scenario';

function createRadarEmitter(position = { longitude: 121, latitude: 25, altitude: 9000, heading: 45 }): EmitterVolume {
  return {
    id: 'radar-red-aew',
    sourceEntityId: 'red-aew',
    kind: 'radar',
    mode: 'omni',
    side: 'red',
    position,
    headingDeg: position.heading ?? 0,
    rangeMeters: 500_000,
    azimuthCenterDeg: 0,
    azimuthWidthDeg: 360,
    elevationMinDeg: 0,
    elevationMaxDeg: 60,
    pulseCycleMs: 6_000,
    active: true,
  };
}

test('EmitterVolume should carry runtime position and support radar and jamming with the same shape', () => {
  const radar = createRadarEmitter({ longitude: 122.2, latitude: 26.1, altitude: 10_000, heading: 90 });
  const jammer: EmitterVolume = {
    ...createRadarEmitter({ longitude: 122.4, latitude: 26.2, altitude: 9_000, heading: 120 }),
    id: 'ew-red-jammer',
    sourceEntityId: 'red-jammer',
    kind: 'electronic-jamming',
    rangeMeters: 150_000,
    elevationMinDeg: -20,
    elevationMaxDeg: 65,
  };

  assert.equal(radar.position.longitude, 122.2);
  assert.equal(radar.headingDeg, 90);
  assert.equal(jammer.kind, 'electronic-jamming');
  assert.deepEqual(
    Object.keys(jammer).sort(),
    Object.keys(radar).sort(),
  );
});

test('getCesiumClockRangeForTacticalSector should convert tactical heading to Cesium local clock', () => {
  const forwardEast = getCesiumClockRangeForTacticalSector({
    headingDeg: 90,
    azimuthCenterDeg: 0,
    azimuthWidthDeg: 60,
  });

  assert.ok(Math.abs(forwardEast.minimumClock - (Math.PI * 11) / 6) < 1e-10);
  assert.ok(Math.abs(forwardEast.maximumClock - (Math.PI * 13) / 6) < 1e-10);

  const forwardNorth = getCesiumClockRangeForTacticalSector({
    headingDeg: 0,
    azimuthCenterDeg: 0,
    azimuthWidthDeg: 60,
  });

  assert.ok(Math.abs(forwardNorth.minimumClock - Math.PI / 3) < 1e-10);
  assert.ok(Math.abs(forwardNorth.maximumClock - (Math.PI * 2) / 3) < 1e-10);
});

test('getScenarioVirtualTimeMs should use a global virtual timeline across phases', () => {
  assert.equal(
    getScenarioVirtualTimeMs([
      { duration: 10 },
      { duration: 8 },
    ], 1, 2_500),
    12_500,
  );
});

test('normalizeRadarTrackingConfig should default to enemy aircraft and missiles with multiple tracks', () => {
  assert.deepEqual(
    normalizeRadarTrackingConfig(undefined),
    {
      enabled: true,
      targetTypes: ['enemy-aircraft', 'enemy-missile'],
      maxTracks: 12,
    },
  );
});

test('normalizeRadarTrackingConfig should sanitize invalid target types and maxTracks', () => {
  assert.deepEqual(
    normalizeRadarTrackingConfig({
      enabled: true,
      targetTypes: ['enemy-aircraft', 'bad-type'],
      maxTracks: 0,
    }),
    {
      enabled: true,
      targetTypes: ['enemy-aircraft'],
      maxTracks: 1,
    },
  );
});

test('normalizeElectronicWarfareConfig should default area and tracking settings', () => {
  assert.deepEqual(
    normalizeElectronicWarfareConfig(undefined),
    {
      enabled: true,
      areaEnabled: true,
      trackingEnabled: true,
      trackingTargetTypes: ['enemy-aircraft', 'enemy-missile'],
      maxTracks: 6,
      pulseEnabled: true,
      pulseColor: '#ff9f1c',
      pulseDurationMs: 2_200,
    },
  );
});

test('parseElectronicWarfareEffectAttributes should enable tracking for legacy XML without tracking attributes', () => {
  assert.deepEqual(parseElectronicWarfareEffectAttributes({
    enabled: 'true',
    pulseEnabled: 'true',
    pulseColor: '#ff9f1c',
    pulseDurationMs: 2200,
  }), {
    enabled: true,
    areaEnabled: true,
    trackingEnabled: true,
    trackingTargetTypes: ['enemy-aircraft', 'enemy-missile'],
    maxTracks: 6,
    pulseEnabled: true,
    pulseColor: '#ff9f1c',
    pulseDurationMs: 2200,
  });
});

test('parseDetectionZoneTrackingAttributes should parse Tracking attributes from XML shape', () => {
  assert.deepEqual(parseDetectionZoneTrackingAttributes({
    enabled: 'true',
    targetTypes: 'enemy-aircraft,enemy-missile',
    maxTracks: 2,
  }), {
    enabled: true,
    targetTypes: ['enemy-aircraft', 'enemy-missile'],
    maxTracks: 2,
  });
});

test('parseElectronicWarfareEffectAttributes should parse EW XML attributes', () => {
  assert.deepEqual(parseElectronicWarfareEffectAttributes({
    enabled: 'true',
    areaEnabled: 'true',
    trackingEnabled: 'true',
    trackingTargetTypes: 'enemy-aircraft,enemy-missile,enemy-radar',
    maxTracks: 2,
    pulseEnabled: 'true',
    pulseColor: '#ffaa33',
    pulseDurationMs: 1800,
  }), {
    enabled: true,
    areaEnabled: true,
    trackingEnabled: true,
    trackingTargetTypes: ['enemy-aircraft', 'enemy-missile', 'enemy-radar'],
    maxTracks: 2,
    pulseEnabled: true,
    pulseColor: '#ffaa33',
    pulseDurationMs: 1800,
  });
});

test('getDetectionZoneTrackingAttributes should write DetectionZone tracking config to XML attributes', () => {
  const zone: DetectionZone = {
    entityId: 'blue-radar-01',
    side: 'blue',
    center: { longitude: 120, latitude: 24, altitude: 0 },
    radiusMeters: 300000,
    tracking: {
      enabled: true,
      targetTypes: ['enemy-aircraft', 'enemy-missile'],
      maxTracks: 2,
    },
  };

  assert.deepEqual(getDetectionZoneTrackingAttributes(zone), {
    enabled: 'true',
    targetTypes: 'enemy-aircraft,enemy-missile',
    maxTracks: '2',
  });
});

test('getElectronicWarfareEffectAttributes should export EW config to XML attributes', () => {
  assert.deepEqual(getElectronicWarfareEffectAttributes({
    enabled: true,
    areaEnabled: true,
    trackingEnabled: true,
    trackingTargetTypes: ['enemy-aircraft', 'enemy-missile', 'enemy-radar'],
    maxTracks: 2,
    pulseEnabled: true,
    pulseColor: '#ffaa33',
    pulseDurationMs: 1800,
  }), {
    enabled: 'true',
    areaEnabled: 'true',
    trackingEnabled: 'true',
    trackingTargetTypes: 'enemy-aircraft,enemy-missile,enemy-radar',
    maxTracks: '2',
    pulseEnabled: 'true',
    pulseColor: '#ffaa33',
    pulseDurationMs: '1800',
  });
});

test('selectRadarTrackingTargets should only keep enemy aircraft and enemy missiles inside range', () => {
  const targets = selectRadarTrackingTargets({
    radarSide: 'blue',
    radarPosition: { longitude: 120, latitude: 24, altitude: 0, heading: 0 },
    rangeMeters: 200_000,
    tracking: {
      enabled: true,
      targetTypes: ['enemy-aircraft', 'enemy-missile'],
      maxTracks: 2,
    },
    entities: [
      {
        id: 'red-air',
        side: 'red',
        type: 'air-fighter',
        position: { longitude: 120.5, latitude: 24, altitude: 9000 },
      },
      {
        id: 'blue-air',
        side: 'blue',
        type: 'air-fighter',
        position: { longitude: 120.3, latitude: 24, altitude: 9000 },
      },
    ],
    weapons: [
      {
        id: 'red-missile',
        launcherSide: 'red',
        currentPosition: { longitude: 120.2, latitude: 24, altitude: 5000 },
      },
      {
        id: 'blue-missile',
        launcherSide: 'blue',
        currentPosition: { longitude: 120.1, latitude: 24, altitude: 5000 },
      },
    ],
  });

  assert.deepEqual(targets.map(target => target.id), ['red-missile', 'red-air']);
  assert.deepEqual(targets.map(target => target.category), ['enemy-missile', 'enemy-aircraft']);
});

test('selectRadarTrackingTargets should track all in-range enemies up to the configured budget', () => {
  const targets = selectRadarTrackingTargets({
    radarSide: 'red',
    radarPosition: { longitude: 100, latitude: 35, altitude: 0 },
    rangeMeters: 500_000,
    tracking: normalizeRadarTrackingConfig(undefined),
    entities: [
      {
        id: 'blue-air-1',
        side: 'blue',
        type: 'air-fighter',
        position: { longitude: 100.2, latitude: 35.1, altitude: 9000 },
      },
      {
        id: 'blue-air-2',
        side: 'blue',
        type: 'air-multirole',
        position: { longitude: 100.4, latitude: 35.2, altitude: 11000 },
      },
      {
        id: 'red-air',
        side: 'red',
        type: 'air-fighter',
        position: { longitude: 100.1, latitude: 35, altitude: 9000 },
      },
    ],
    weapons: [
      {
        id: 'blue-missile-1',
        launcherSide: 'blue',
        currentPosition: { longitude: 100.3, latitude: 35.15, altitude: 5000 },
      },
      {
        id: 'blue-missile-2',
        launcherSide: 'blue',
        currentPosition: { longitude: 100.5, latitude: 35.25, altitude: 7000 },
      },
    ],
  });

  assert.deepEqual(
    new Set(targets.map(target => target.id)),
    new Set(['blue-air-1', 'blue-air-2', 'blue-missile-1', 'blue-missile-2']),
  );
});

test('selectElectronicWarfareTargets should keep enemy radar, missiles and aircraft inside jammer range', () => {
  const targets = selectElectronicWarfareTargets({
    jammerSide: 'blue',
    jammerPosition: { longitude: 120, latitude: 24, altitude: 9000, heading: 0 },
    rangeMeters: 220_000,
    tracking: {
      enabled: true,
      areaEnabled: true,
      trackingEnabled: true,
      trackingTargetTypes: ['enemy-aircraft', 'enemy-missile', 'enemy-radar'],
      maxTracks: 3,
      pulseEnabled: true,
      pulseColor: '#ff9f1c',
      pulseDurationMs: 2_200,
    },
    entities: [
      {
        id: 'red-radar',
        side: 'red',
        type: 'ground-radar',
        position: { longitude: 120.1, latitude: 24, altitude: 0 },
      },
      {
        id: 'red-air',
        side: 'red',
        type: 'air-fighter',
        position: { longitude: 120.4, latitude: 24, altitude: 9000 },
      },
      {
        id: 'blue-air',
        side: 'blue',
        type: 'air-fighter',
        position: { longitude: 120.05, latitude: 24, altitude: 9000 },
      },
    ],
    weapons: [
      {
        id: 'red-missile',
        launcherSide: 'red',
        currentPosition: { longitude: 120.2, latitude: 24, altitude: 4000 },
      },
    ],
  });

  assert.deepEqual(targets.map(target => target.id), ['red-radar', 'red-missile', 'red-air']);
  assert.deepEqual(targets.map(target => target.category), ['enemy-radar', 'enemy-missile', 'enemy-aircraft']);
});

test('ElectronicWarfareManager should only degrade weapons launched by the opposing side', () => {
  const manager = new ElectronicWarfareManager();
  manager.registerJammer({
    id: 'blue-ew',
    name: '蓝方电子战车',
    type: 'ground-ew',
    side: 'blue',
    position: { longitude: 121, latitude: 25, altitude: 0 },
  });
  manager.overrideJammerRadius('blue-ew', 200_000);

  const base = {
    weaponId: 'weapon-1',
    weaponSpec: {
      id: 'test-sam',
      type: 'sam-long' as const,
      name: '测试导弹',
      guidance: 'active-radar' as const,
      maxRange: 200_000,
      minRange: 1_000,
      cruiseSpeedMps: 1_000,
      terminalSpeedMps: 1_200,
      acceleration: 80,
      turnRate: 20,
      warheadWeight: 100,
      killRadius: 40,
      launchDelay: 0,
      lockTime: 0,
    },
    launcherId: 'red-launcher',
    targetEntityId: 'blue-target',
    launchPosition: { longitude: 121.2, latitude: 25, altitude: 8000 },
    targetPosition: { longitude: 121.1, latitude: 25, altitude: 0 },
  };

  assert.equal(manager.calculateWeaponInterference({
    ...base,
    launcherSide: 'blue',
  }), null);
  assert.equal(manager.calculateWeaponInterference({
    ...base,
    launcherSide: 'red',
  })?.jammerId, 'blue-ew');
});

test('createRadarBeamMesh should build a pointed cone beam instead of a spherical slice', () => {
  const mesh = createRadarBeamMesh({
    rangeMeters: 1_000,
    azimuthWidthDeg: 20,
    elevationMinDeg: -5,
    elevationMaxDeg: 15,
    segments: 12,
  });

  assert.deepEqual(mesh.positions.slice(0, 3), [0, 0, 0]);
  assert.equal(mesh.perimeterStart, 1);
  assert.equal(mesh.perimeterCount, 12);
  assert.equal(mesh.positions.length, 39);
  assert.equal(mesh.indices.length, 36);

  const firstPerimeterY = mesh.positions[4];
  const firstPerimeterZ = mesh.positions[5];
  assert.ok(firstPerimeterY > 900);
  assert.ok(firstPerimeterZ > 0);
  assert.ok(mesh.indices.every(index => Number.isInteger(index) && index >= 0 && index <= 12));
});

test('createRadarBeamMesh should use a circular far-end cap for tracking beams', () => {
  const mesh = createRadarBeamMesh({
    rangeMeters: 1_000,
    azimuthWidthDeg: 20,
    elevationMinDeg: -5,
    elevationMaxDeg: 15,
    segments: 16,
  });

  const centerZ = mesh.positions[5];
  const horizontalRadius = Math.abs(mesh.positions[3]);
  const verticalRadius = Math.abs(mesh.positions[5 + 4 * 3] - centerZ);

  assert.ok(Math.abs(horizontalRadius - verticalRadius) < 1e-6);
});

test('createRadarBeamEdgeIndices should build ray and perimeter line pairs', () => {
  const indices = createRadarBeamEdgeIndices({
    perimeterStart: 1,
    perimeterCount: 4,
  });

  assert.deepEqual(indices, [
    0, 1,
    1, 2,
    0, 2,
    2, 3,
    0, 3,
    3, 4,
    0, 4,
    4, 1,
  ]);
});

test('createElectronicSuppressionBeamLayers should describe a layered noisy jamming beam', () => {
  const layers = createElectronicSuppressionBeamLayers({
    virtualTimeMs: 0,
    pulseCycleMs: 2_200,
  });

  assert.deepEqual(layers.map(layer => layer.idSuffix), ['core', 'noise-a', 'noise-b', 'edge']);
  assert.deepEqual(layers.map(layer => layer.alpha), [0.07, 0.045, 0.03, 0.1]);
  assert.ok(layers[0].alpha > layers[1].alpha);
  assert.ok(layers.every(layer => layer.alpha <= 0.1));
  assert.ok(layers[1].azimuthWidthScale > layers[0].azimuthWidthScale);
  assert.ok(layers[2].elevationWidthScale > layers[0].elevationWidthScale);
  assert.equal(layers[3].drawEdges, true);
});

test('createElectronicSuppressionBeamLayers should shift noise bands with virtual time', () => {
  const start = createElectronicSuppressionBeamLayers({
    virtualTimeMs: 0,
    pulseCycleMs: 2_200,
  });
  const later = createElectronicSuppressionBeamLayers({
    virtualTimeMs: 550,
    pulseCycleMs: 2_200,
  });

  assert.notEqual(start[1].azimuthOffsetDeg, later[1].azimuthOffsetDeg);
  assert.notEqual(start[2].elevationOffsetDeg, later[2].elevationOffsetDeg);
  assert.equal(start[0].azimuthOffsetDeg, 0);
  assert.equal(later[0].azimuthOffsetDeg, 0);
});

test('shouldIncludeRuntimeEmitters should only keep beams during active playback', () => {
  assert.equal(shouldIncludeRuntimeEmitters('running'), true);
  assert.equal(shouldIncludeRuntimeEmitters('completed'), false);
  assert.equal(shouldIncludeRuntimeEmitters('idle'), false);
  assert.equal(shouldIncludeRuntimeEmitters('paused'), false);
});

test('shouldIncludeRuntimeEmitters should allow debug buttons to force emitter refresh', () => {
  assert.equal(shouldIncludeRuntimeEmitters('idle', true), true);
  assert.equal(shouldIncludeRuntimeEmitters('paused', true), true);
  assert.equal(shouldIncludeRuntimeEmitters('running', false), false);
  assert.equal(shouldIncludeRuntimeEmitters('running', null), true);
});

test('shouldIncludeRuntimeEWEmitters should let jamming debug visibility work independently', () => {
  assert.equal(shouldIncludeRuntimeEWEmitters('idle', true), true);
  assert.equal(shouldIncludeRuntimeEWEmitters('paused', true), true);
  assert.equal(shouldIncludeRuntimeEWEmitters('running', false), false);
  assert.equal(shouldIncludeRuntimeEWEmitters('running', null), true);
});

test('runtime visual debug overrides should default to automatic playback behavior', () => {
  const unsetDebugOverride = null;

  assert.equal(shouldIncludeRuntimeEmitters('running', unsetDebugOverride), true);
  assert.equal(shouldIncludeRuntimeEWEmitters('running', unsetDebugOverride), true);
  assert.equal(shouldRenderRuntimeRadarScan('running', unsetDebugOverride), true);
});

test('static detection volumes should be controlled by execution status, not emitter presence', () => {
  assert.equal(shouldShowStaticDetectionVolumesForStatus('idle'), true);
  assert.equal(shouldShowStaticDetectionVolumesForStatus('completed'), true);
  assert.equal(shouldShowStaticDetectionVolumesForStatus('running'), false);
  assert.equal(shouldShowStaticDetectionVolumesForStatus('paused'), false);
});

test('runtime radar scan should only render during active playback', () => {
  assert.equal(shouldRenderRuntimeRadarScan('running'), true);
  assert.equal(shouldRenderRuntimeRadarScan('running', false), false);
  assert.equal(shouldRenderRuntimeRadarScan('paused'), false);
  assert.equal(shouldRenderRuntimeRadarScan('idle'), false);
  assert.equal(shouldRenderRuntimeRadarScan('completed'), false);
});

test('runtime radar scan should allow debug buttons to override execution status', () => {
  assert.equal(shouldRenderRuntimeRadarScan('idle', true), true);
  assert.equal(shouldRenderRuntimeRadarScan('paused', true), true);
  assert.equal(shouldRenderRuntimeRadarScan('completed', true), true);
  assert.equal(shouldRenderRuntimeRadarScan('running', null), true);
  assert.equal(shouldRenderRuntimeRadarScan('idle', null), false);
});

test('runtime explosions should allow debug buttons to override execution status', () => {
  assert.equal(shouldRenderRuntimeExplosions('running', null), true);
  assert.equal(shouldRenderRuntimeExplosions('idle', null), false);
  assert.equal(shouldRenderRuntimeExplosions('idle', true), true);
  assert.equal(shouldRenderRuntimeExplosions('running', false, false), false);
  assert.equal(shouldRenderRuntimeExplosions('running', false, true), true);
});

test('runtime explosions should keep rendering active explosions after completion', () => {
  assert.equal(shouldRenderRuntimeExplosions('completed', null, true), true);
  assert.equal(shouldRenderRuntimeExplosions('completed', null, false), false);
  assert.equal(shouldRenderRuntimeExplosions('completed', false, true), true);
});

test('prepareRuntimeExplosionsForRender should add a debug preview when forced visible without live explosions', () => {
  const prepared = prepareRuntimeExplosionsForRender({
    explosions: [],
    debugVisible: true,
    virtualTimeMs: 9_500,
    fallbackPosition: { longitude: 121.5, latitude: 25.2, altitude: 0 },
  });

  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].id, 'debug-preview-explosion-9000');
  assert.equal(prepared[0].startTimeMs, 9_000);
  assert.deepEqual(prepared[0].position, { longitude: 121.5, latitude: 25.2, altitude: 0 });
});

test('prepareRuntimeExplosionsForRender should change debug preview id on each preview cycle', () => {
  const first = prepareRuntimeExplosionsForRender({
    explosions: [],
    debugVisible: true,
    virtualTimeMs: 2_950,
    fallbackPosition: { longitude: 121.5, latitude: 25.2, altitude: 0 },
  });
  const next = prepareRuntimeExplosionsForRender({
    explosions: [],
    debugVisible: true,
    virtualTimeMs: 3_050,
    fallbackPosition: { longitude: 121.5, latitude: 25.2, altitude: 0 },
  });

  assert.notEqual(first[0].id, next[0].id);
  assert.equal(next[0].id, 'debug-preview-explosion-3000');
});

test('prepareRuntimeExplosionsForRender should prefer live explosions over debug preview', () => {
  const liveExplosion = {
    id: 'explosion-live',
    type: 'ship-impact' as const,
    position: { longitude: 121, latitude: 25, altitude: 0 },
    startTimeMs: 8_000,
    damage: 1200,
    triggeredAtMs: 42_000,
  };

  assert.deepEqual(
    prepareRuntimeExplosionsForRender({
      explosions: [liveExplosion],
      debugVisible: true,
      virtualTimeMs: 9_500,
      fallbackPosition: { longitude: 121.5, latitude: 25.2, altitude: 0 },
    }),
    [liveExplosion],
  );
});

test('tracking radar beam model should stay locked on target instead of sweeping over time', () => {
  const trackEmitter: EmitterVolume = {
    ...createRadarEmitter(),
    mode: 'track',
    azimuthCenterDeg: 0,
    azimuthWidthDeg: 10,
  };

  const start = createRadarScanEmitterModel(trackEmitter, {
    virtualTimeMs: 0,
    beamWidthDeg: 18,
  });
  const later = createRadarScanEmitterModel(trackEmitter, {
    virtualTimeMs: 3_000,
    beamWidthDeg: 18,
  });

  assert.equal(start.azimuthCenterDeg, 0);
  assert.equal(later.azimuthCenterDeg, 0);
  assert.equal(later.azimuthWidthDeg, 10);
});

test('resolveStaticDetectionVisible should allow debug buttons to override execution status', () => {
  assert.equal(resolveStaticDetectionVisible('running', true), true);
  assert.equal(resolveStaticDetectionVisible('idle', false), false);
  assert.equal(resolveStaticDetectionVisible('running', null), false);
  assert.equal(resolveStaticDetectionVisible('idle', null), true);
});

test('shouldRenderRuntimeRadarBaseVolume should suppress radar base domes when scanning is enabled', () => {
  assert.equal(shouldRenderRuntimeRadarBaseVolume({ kind: 'radar', radarScanEnabled: true }), false);
  assert.equal(shouldRenderRuntimeRadarBaseVolume({ kind: 'radar', radarScanEnabled: false }), true);
  assert.equal(shouldRenderRuntimeRadarBaseVolume({ kind: 'electronic-jamming', radarScanEnabled: true }), true);
});

test('shouldRenderRuntimeEmitterBeam should always keep EW tracking beam available even when radar scan budget is exhausted', () => {
  assert.equal(
    shouldRenderRuntimeEmitterBeam({
      emitter: {
        kind: 'electronic-jamming',
        mode: 'track',
      },
      renderRadarScan: true,
      radarScanCount: 8,
      maxRadarScans: 8,
    }),
    true,
  );

  assert.equal(
    shouldRenderRuntimeEmitterBeam({
      emitter: {
        kind: 'radar',
        mode: 'track',
      },
      renderRadarScan: true,
      radarScanCount: 8,
      maxRadarScans: 8,
    }),
    false,
  );

  assert.equal(
    shouldRenderRuntimeEmitterBeam({
      emitter: {
        kind: 'radar',
        mode: 'track',
      },
      renderRadarScan: true,
      radarScanCount: 7,
      maxRadarScans: 8,
    }),
    true,
  );
});

test('isRadarDetectionEmitterSource should infer radar scanning from entity capability when label is generic', () => {
  assert.equal(
    isRadarDetectionEmitterSource({
      entityType: 'air-aew',
      sensors: ['radar'],
      label: '蓝方预警机 探测范围',
    }),
    true,
  );

  assert.equal(
    isRadarDetectionEmitterSource({
      entityType: 'ground-ew',
      sensors: ['ew-suite'],
      label: '电子战覆盖范围',
    }),
    false,
  );
});

test('isRadarDetectionEmitterSource should keep radar jamming zones out of radar scan emitters', () => {
  assert.equal(
    isRadarDetectionEmitterSource({
      entityType: 'ground-radar',
      sensors: ['radar'],
      label: '红方雷达8-01 电子战干扰范围',
    }),
    false,
  );
});

test('getStaleRuntimeEmitterIds should remove old runtime scan entities when no emitter stays active', () => {
  assert.deepEqual(
    getStaleRuntimeEmitterIds(
      new Set(['emitter-radar-aew-scan', 'emitter-ew-jammer-pulse']),
      new Set<string>(),
    ),
    ['emitter-radar-aew-scan', 'emitter-ew-jammer-pulse'],
  );
});
