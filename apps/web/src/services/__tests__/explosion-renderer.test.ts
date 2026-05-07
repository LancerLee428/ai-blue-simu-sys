import test from 'node:test';
import assert from 'node:assert/strict';

import { createExplosionDescriptor, getExplosionStatusAtTime } from '../explosion-renderer';

test('createExplosionDescriptor should include professional visual layers and lifecycle defaults', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-test',
    type: 'ship-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 2210,
    effect: {
      type: 'ship-impact',
      radius: 96,
      durationMs: 1400,
      innerColor: '#ffe3a1',
      outerColor: '#ff3b30',
    },
    startTimeMs: 10_000,
  });

  assert.equal(descriptor.type, 'ship-impact');
  assert.equal(descriptor.status, 'active');
  assert.ok(descriptor.durationMs >= 3_000);
  assert.ok(descriptor.radius >= 96);
  assert.deepEqual(
    descriptor.layers.map(layer => layer.kind),
    ['flash', 'fireball', 'shockwave', 'smoke', 'debris'],
  );
});

test('createExplosionDescriptor should cap radius by explicit effect when damage is low', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-low-damage',
    type: 'ground-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 10,
    effect: {
      type: 'ground-impact',
      radius: 84,
      durationMs: 1200,
      innerColor: '#ffd27a',
      outerColor: '#ff6b35',
    },
    startTimeMs: 0,
  });

  assert.equal(descriptor.radius, 84);
  assert.equal(descriptor.durationMs, 3_000);
});

test('getExplosionStatusAtTime should derive lifecycle from virtual time', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-virtual-time',
    type: 'missile-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 650,
    effect: {
      type: 'missile-impact',
      radius: 72,
      durationMs: 1000,
      innerColor: '#ffd27a',
      outerColor: '#ff5500',
    },
    startTimeMs: 10_000,
  });

  assert.equal(getExplosionStatusAtTime(descriptor, 10_100).status, 'active');
  assert.equal(getExplosionStatusAtTime(descriptor, 12_300).status, 'fading');
  assert.equal(getExplosionStatusAtTime(descriptor, 13_100).status, 'complete');
});
