import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { GeoPosition } from '../../types/tactical-scenario';
import { buildRuntimeWeaponTrail } from '../runtime-weapon-trail';

const fullTrajectory: GeoPosition[] = [
  { longitude: 120.0, latitude: 24.0, altitude: 9000 },
  { longitude: 120.1, latitude: 24.06, altitude: 11800 },
  { longitude: 120.2, latitude: 24.09, altitude: 9300 },
  { longitude: 120.3, latitude: 24.1, altitude: 1200 },
];

test('runtime weapon trail should end at current missile position instead of pre-drawing future path', () => {
  const currentPosition: GeoPosition = { longitude: 120.15, latitude: 24.075, altitude: 10600 };

  const trail = buildRuntimeWeaponTrail({
    trajectory: fullTrajectory,
    currentPosition,
    samplesPerSegment: 4,
  });

  assert.deepEqual(trail.at(-1), currentPosition);
  assert.ok(trail.every(point => point.longitude <= currentPosition.longitude));
  assert.ok(!trail.some(point => point.longitude === fullTrajectory.at(-1)?.longitude));
});

test('runtime weapon trail should smooth visited trajectory points into curve samples', () => {
  const currentPosition: GeoPosition = { longitude: 120.2, latitude: 24.09, altitude: 9300 };

  const trail = buildRuntimeWeaponTrail({
    trajectory: fullTrajectory,
    currentPosition,
    samplesPerSegment: 6,
  });

  assert.deepEqual(trail[0], fullTrajectory[0]);
  assert.deepEqual(trail.at(-1), currentPosition);
  assert.ok(trail.length > 3);
  assert.ok(trail.some(point =>
    point.longitude !== fullTrajectory[0].longitude
    && point.longitude !== fullTrajectory[1].longitude
    && point.longitude !== currentPosition.longitude
  ));
});
