import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetectionZoneTrackingAttributes } from '../xml-scenario-parser';
import { getDetectionZoneTrackingAttributes } from '../xml-scenario-exporter';

import {
  createRadarScanEmitterModel,
  createRadarBeamMesh,
  getCesiumClockRangeForTacticalSector,
  getScenarioVirtualTimeMs,
  getStaleRuntimeEmitterIds,
  isRadarDetectionEmitterSource,
  normalizeRadarTrackingConfig,
  resolveStaticDetectionVisible,
  selectRadarTrackingTargets,
  shouldRenderRuntimeRadarBaseVolume,
  shouldIncludeRuntimeEmitters,
  shouldRenderRuntimeRadarScan,
  shouldShowStaticDetectionVolumesForStatus,
} from '../runtime-visual-math';
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

test('normalizeRadarTrackingConfig should default to enemy aircraft and missiles with one track', () => {
  assert.deepEqual(
    normalizeRadarTrackingConfig(undefined),
    {
      enabled: true,
      targetTypes: ['enemy-aircraft', 'enemy-missile'],
      maxTracks: 1,
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

test('getStaleRuntimeEmitterIds should remove old runtime scan entities when no emitter stays active', () => {
  assert.deepEqual(
    getStaleRuntimeEmitterIds(
      new Set(['emitter-radar-aew-scan', 'emitter-ew-jammer-pulse']),
      new Set<string>(),
    ),
    ['emitter-radar-aew-scan', 'emitter-ew-jammer-pulse'],
  );
});
