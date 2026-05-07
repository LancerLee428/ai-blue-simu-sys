import test from 'node:test';
import assert from 'node:assert/strict';

import { DamageCalculator } from '../damage-calculator';
import type { EntitySpec } from '../../types/tactical-scenario';

function createTarget(overrides: Partial<EntitySpec> = {}): EntitySpec {
  return {
    id: 'target',
    name: '目标',
    type: 'ship-destroyer',
    side: 'blue',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    maxHealth: 800,
    health: 800,
    armor: 120,
    ...overrides,
  };
}

test('DamageCalculator should reduce health but keep target engaged when health remains', () => {
  const result = new DamageCalculator().applyDamage({
    target: createTarget(),
    rawDamage: 260,
  });

  assert.equal(result.status, 'engaged');
  assert.equal(result.damage, 140);
  assert.equal(result.remainingHealth, 660);
});

test('DamageCalculator should destroy target when health reaches zero', () => {
  const result = new DamageCalculator().applyDamage({
    target: createTarget({ health: 120 }),
    rawDamage: 420,
  });

  assert.equal(result.status, 'destroyed');
  assert.equal(result.remainingHealth, 0);
});
