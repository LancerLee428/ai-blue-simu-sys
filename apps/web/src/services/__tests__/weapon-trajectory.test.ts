import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWeaponTrajectory } from '../weapon-trajectory';
import { WEAPON_DATABASE } from '../weapon-database';

const launch = { longitude: 121, latitude: 25, altitude: 9000 };
const seaTarget = { longitude: 121.4, latitude: 25.08, altitude: 0 };
const airTarget = { longitude: 121.35, latitude: 25.05, altitude: 10000 };

test('aam trajectory should keep an airborne intercept profile', () => {
  const result = buildWeaponTrajectory({
    spec: WEAPON_DATABASE['aim-120d'],
    launchPosition: launch,
    targetPosition: airTarget,
    progress: 0.5,
    sampleCount: 9,
  });

  assert.equal(result.trajectory.length, 9);
  assert.ok(result.currentPosition.altitude > launch.altitude - 500);
  assert.ok(result.trajectory.some(point => point.altitude > launch.altitude));
});

test('anti-ship trajectory should descend into low terminal approach', () => {
  const result = buildWeaponTrajectory({
    spec: WEAPON_DATABASE.harpoon,
    launchPosition: launch,
    targetPosition: seaTarget,
    progress: 1,
    sampleCount: 12,
  });

  const terminalPoint = result.trajectory[result.trajectory.length - 2];
  assert.ok(terminalPoint.altitude < launch.altitude * 0.5);
  assert.equal(result.currentPosition.altitude, seaTarget.altitude);
});

test('guided bomb trajectory should glide downward instead of flying a straight line', () => {
  const result = buildWeaponTrajectory({
    spec: WEAPON_DATABASE['agm-154'],
    launchPosition: launch,
    targetPosition: seaTarget,
    progress: 0.5,
    sampleCount: 9,
  });

  const linearMidAltitude = (launch.altitude + seaTarget.altitude) / 2;
  assert.notEqual(Math.round(result.currentPosition.altitude), Math.round(linearMidAltitude));
  assert.ok(result.currentPosition.altitude > seaTarget.altitude);
});

test('manual key points should drive trajectory before typed profile fallback', () => {
  const keyPoints = [
    { role: 'launch' as const, progress: 0, position: launch },
    { role: 'boost' as const, progress: 0.25, position: { longitude: 121.08, latitude: 25.02, altitude: 12500 } },
    { role: 'cruise' as const, progress: 0.65, position: { longitude: 121.25, latitude: 25.05, altitude: 10500 } },
    { role: 'impact' as const, progress: 1, position: seaTarget },
  ];

  const result = buildWeaponTrajectory({
    spec: WEAPON_DATABASE.harpoon,
    launchPosition: launch,
    targetPosition: seaTarget,
    progress: 0.65,
    sampleCount: 7,
    keyPoints,
    interpolation: 'linear',
  });

  assert.equal(result.trajectory.length, 7);
  assert.equal(Math.round(result.currentPosition.altitude), 10500);
});

test('manual key points should accept arbitrary point counts', () => {
  const keyPoints = Array.from({ length: 8 }, (_, index) => {
    const progress = index / 7;
    return {
      progress,
      position: {
        longitude: 121 + progress * 0.4,
        latitude: 25 + progress * 0.08,
        altitude: 9000 + Math.sin(progress * Math.PI) * 1800 - progress * 9000,
      },
    };
  });

  const result = buildWeaponTrajectory({
    spec: WEAPON_DATABASE['agm-154'],
    launchPosition: launch,
    targetPosition: seaTarget,
    progress: 1,
    sampleCount: 16,
    keyPoints,
    interpolation: 'catmull-rom',
  });

  assert.equal(result.trajectory.length, 16);
  assert.deepEqual(result.currentPosition, keyPoints[keyPoints.length - 1].position);
});

test('trajectory should keep nominal impact without interference and expose degraded status with interference', () => {
  const nominal = buildWeaponTrajectory({
    spec: WEAPON_DATABASE['aim-120d'],
    launchPosition: launch,
    targetPosition: airTarget,
    progress: 1,
    sampleCount: 5,
  });

  const degraded = buildWeaponTrajectory({
    spec: WEAPON_DATABASE['aim-120d'],
    launchPosition: launch,
    targetPosition: airTarget,
    progress: 0.5,
    sampleCount: 5,
    interference: {
      weaponId: 'weapon-test',
      jammerId: 'jammer-test',
      strength: 0.4,
      guidanceImpact: 'tracking-noise',
      lateralOffsetMeters: 120,
      verticalOffsetMeters: 20,
      hitProbabilityScale: 0.8,
    },
  });

  assert.deepEqual(nominal.adjustedTargetPosition, airTarget);
  assert.equal(nominal.statusHint, 'nominal');
  assert.equal(degraded.statusHint, 'degraded');
});
