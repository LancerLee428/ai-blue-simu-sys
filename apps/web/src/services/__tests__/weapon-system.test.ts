import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { WeaponSystem } from '../weapon-system';
import { WEAPON_DATABASE } from '../weapon-database';
import type { Phase, TacticalScenario } from '../../types/tactical-scenario';

function createScenario(): TacticalScenario {
  const phase: Phase = {
    id: 'phase-1',
    name: '打击阶段',
    description: '验证导弹发射与命中',
    duration: 120,
    events: [
      {
        type: 'attack',
        timestamp: 10,
        sourceEntityId: 'red-fighter',
        targetEntityId: 'blue-ship',
        detail: '红方战机发射导弹攻击蓝方舰艇',
      },
    ],
    entityStates: [
      {
        entityId: 'red-fighter',
        position: { longitude: 121.0, latitude: 25.0, altitude: 8000, heading: 90 },
        status: 'engaged',
      },
      {
        entityId: 'blue-ship',
        position: { longitude: 121.25, latitude: 25.0, altitude: 0, heading: 270 },
        status: 'deployed',
      },
    ],
  };

  return {
    id: 'scenario-weapon-test',
    version: 1,
    summary: '武器系统测试',
    forces: [
      {
        side: 'red',
        name: '红方',
        entities: [
          {
            id: 'red-fighter',
            name: '红方战机',
            type: 'air-fighter',
            side: 'red',
            position: { longitude: 121.0, latitude: 25.0, altitude: 8000, heading: 90 },
            loadout: {
              weapons: ['aim-120d'],
              sensors: [],
            },
          },
        ],
      },
      {
        side: 'blue',
        name: '蓝方',
        entities: [
          {
            id: 'blue-ship',
            name: '蓝方舰艇',
            type: 'ship-destroyer',
            side: 'blue',
            position: { longitude: 121.25, latitude: 25.0, altitude: 0, heading: 270 },
            loadout: {
              weapons: [],
              sensors: [],
            },
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [],
    strikeTasks: [],
    phases: [phase],
    metadata: {
      generatedAt: new Date().toISOString(),
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

test('WeaponSystem should materialize an in-flight weapon before impact', () => {
  const scenario = createScenario();
  const phase = scenario.phases[0];
  const weaponSystem = new WeaponSystem();

  const evaluation = weaponSystem.evaluatePhase({
    scenario,
    phase,
    previousTimeMs: 0,
    currentTimeMs: 13_000,
    getEntityPositionAtTime(entityId) {
      const entity = scenario.forces.flatMap((force) => force.entities).find((item) => item.id === entityId);
      assert.ok(entity, `missing entity: ${entityId}`);
      return entity.position;
    },
  });

  assert.equal(evaluation.weapons.length, 1);
  assert.equal(evaluation.launches.length, 1);
  assert.equal(evaluation.impacts.length, 0);
  assert.notEqual(evaluation.weapons[0].status, 'hit');
  assert.ok(evaluation.weapons[0].trajectory.length > 2);
});

test('WeaponSystem should emit one impact when current time crosses impact time', () => {
  const scenario = createScenario();
  const phase = scenario.phases[0];
  const weaponSystem = new WeaponSystem();
  const impactTimeMs = weaponSystem.estimateImpactTimeMs({
    scenario,
    attackEvent: phase.events[0],
    phase,
    getEntityPositionAtTime(entityId) {
      const entity = scenario.forces.flatMap((force) => force.entities).find((item) => item.id === entityId);
      assert.ok(entity, `missing entity: ${entityId}`);
      return entity.position;
    },
  });

  const evaluation = weaponSystem.evaluatePhase({
    scenario,
    phase,
    previousTimeMs: impactTimeMs - 100,
    currentTimeMs: impactTimeMs + 100,
    getEntityPositionAtTime(entityId) {
      const entity = scenario.forces.flatMap((force) => force.entities).find((item) => item.id === entityId);
      assert.ok(entity, `missing entity: ${entityId}`);
      return entity.position;
    },
  });

  assert.ok(evaluation.weapons.length <= 1);
  assert.equal(evaluation.impacts.length, 1);
  assert.equal(evaluation.impacts[0].targetEntityId, 'blue-ship');
  assert.equal(evaluation.impacts[0].type, 'weapon-impact');
});

test('Weapon database should cover every weapon id used by the example XML', () => {
  const xml = readFileSync('data-example/东海联合打击-2024-1777165955760.xml', 'utf8');
  const weaponIds = Array.from(xml.matchAll(/<Weapon id="([^"]+)"/g), match => match[1]);
  const missingWeaponIds = Array.from(new Set(weaponIds.filter(id => !WEAPON_DATABASE[id])));

  assert.deepEqual(missingWeaponIds, []);
});

test('WeaponSystem should not silently fallback when an attacker only has unknown weapons', () => {
  const scenario = createScenario();
  const phase = scenario.phases[0];
  const attacker = scenario.forces[0].entities[0];
  attacker.loadout = {
    weapons: ['unknown-test-weapon'],
    sensors: [],
  };
  const weaponSystem = new WeaponSystem();

  const evaluation = weaponSystem.evaluatePhase({
    scenario,
    phase,
    previousTimeMs: 0,
    currentTimeMs: 120_000,
    getEntityPositionAtTime(entityId) {
      const entity = scenario.forces.flatMap((force) => force.entities).find((item) => item.id === entityId);
      assert.ok(entity, `missing entity: ${entityId}`);
      return entity.position;
    },
  });

  assert.equal(evaluation.weapons.length, 0);
  assert.equal(evaluation.launches.length, 0);
  assert.equal(evaluation.impacts.length, 0);
});

test('WeaponSystem should prefer a weapon mentioned in attack detail over loadout order', () => {
  const scenario = createScenario();
  const phase = scenario.phases[0];
  phase.events[0].detail = '红方战机使用 Harpoon 攻击蓝方舰艇';
  scenario.forces[0].entities[0].loadout = {
    weapons: ['aim-120d', 'harpoon'],
    sensors: [],
  };
  const weaponSystem = new WeaponSystem();

  const evaluation = weaponSystem.evaluatePhase({
    scenario,
    phase,
    previousTimeMs: 0,
    currentTimeMs: 22_000,
    getEntityPositionAtTime(entityId) {
      const entity = scenario.forces.flatMap((force) => force.entities).find((item) => item.id === entityId);
      assert.ok(entity, `missing entity: ${entityId}`);
      return entity.position;
    },
  });

  assert.equal(evaluation.launches.length, 1);
  assert.equal(evaluation.launches[0].weaponType, 'asm');
  assert.match(evaluation.launches[0].weaponId, /harpoon/);
});

test('WeaponSystem should compress impact time into phase when demo runtime config requests it', () => {
  const scenario = createScenario();
  const phase = scenario.phases[0];
  phase.duration = 40;
  scenario.forces[0].entities[0].position = { longitude: 121, latitude: 25, altitude: 8000 };
  scenario.forces[1].entities[0].position = { longitude: 126, latitude: 25, altitude: 0 };
  const weaponSystem = new WeaponSystem();

  const impactTimeMs = weaponSystem.estimateImpactTimeMs({
    scenario,
    phase,
    attackEvent: phase.events[0],
    getEntityPositionAtTime(entityId) {
      const entity = scenario.forces.flatMap((force) => force.entities).find((item) => item.id === entityId);
      assert.ok(entity, `missing entity: ${entityId}`);
      return entity.position;
    },
    runtimeConfig: {
      forceImpactWithinPhase: true,
      timeScaleForDemo: 0.02,
    },
  });

  assert.ok(impactTimeMs > phase.events[0].timestamp * 1000);
  assert.ok(impactTimeMs <= phase.duration * 1000);
});
