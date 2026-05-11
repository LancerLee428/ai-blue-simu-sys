import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTacticalScenario } from '../tactical-scenario-normalizer';
import type { TacticalScenario } from '../../types/tactical-scenario';

function createMinimalScenario(): TacticalScenario {
  return {
    id: 'scenario-generation-chain',
    version: 1,
    summary: '生成链路测试',
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
            position: { longitude: 121, latitude: 25, altitude: 8000 },
          },
        ],
      },
      {
        side: 'blue',
        name: '蓝方',
        entities: [
          {
            id: 'blue-aew',
            name: '蓝方预警机',
            type: 'air-aew',
            side: 'blue',
            position: { longitude: 122, latitude: 25, altitude: 10000 },
          },
          {
            id: 'blue-ship',
            name: '蓝方舰艇',
            type: 'ship-destroyer',
            side: 'blue',
            position: { longitude: 122.2, latitude: 25.1, altitude: 0 },
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [],
    strikeTasks: [
      {
        id: 'strike-red-fighter-blue-aew',
        attackerEntityId: 'red-fighter',
        targetEntityId: 'blue-aew',
        phaseId: 'phase-1',
        timestamp: 20,
        detail: '红方战机攻击蓝方预警机',
      },
    ],
    phases: [
      {
        id: 'phase-1',
        name: '打击阶段',
        description: '验证攻击事件补全',
        duration: 60,
        events: [],
        entityStates: [],
      },
    ],
    metadata: {
      generatedAt: new Date().toISOString(),
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

test('normalizer should infer loadout for strike attackers and add matching attack events', () => {
  const scenario = normalizeTacticalScenario(createMinimalScenario());
  const attacker = scenario.forces.flatMap(force => force.entities).find(entity => entity.id === 'red-fighter');
  const phase = scenario.phases[0];

  assert.deepEqual(attacker?.loadout?.weapons, ['aim-120d']);
  assert.equal(phase.events.length, 1);
  assert.equal(phase.events[0].type, 'attack');
  assert.equal(phase.events[0].sourceEntityId, 'red-fighter');
  assert.equal(phase.events[0].targetEntityId, 'blue-aew');
});

test('normalizer should infer visual effects for generated weapon engagements', () => {
  const scenario = normalizeTacticalScenario(createMinimalScenario());

  assert.equal(scenario.visualEffects?.weaponEffects.enabled, true);
  assert.equal(scenario.visualEffects?.explosionEffects.enabled, true);
  assert.ok(scenario.visualEffects?.weaponEffects.items.some(effect => effect.weaponId === 'aim-120d'));
  assert.ok(scenario.visualEffects?.explosionEffects.items.some(effect => effect.type === 'missile-impact'));
});

test('normalizer should keep explicit loadout weapons in visual effects', () => {
  const input = createMinimalScenario();
  const attacker = input.forces[0].entities[0];
  attacker.loadout = {
    weapons: ['hhq-9', 'rocket'],
    sensors: ['radar'],
  };
  input.strikeTasks[0].detail = '红方战机使用 HHQ-9 攻击蓝方预警机';

  const scenario = normalizeTacticalScenario(input);
  const weaponEffectIds = scenario.visualEffects?.weaponEffects.items.map(effect => effect.weaponId) ?? [];

  assert.ok(weaponEffectIds.includes('hhq-9'));
  assert.ok(weaponEffectIds.includes('rocket'));
});

test('normalizer should lift air routes to platform default altitude without moving surface routes', () => {
  const input = createMinimalScenario();
  input.routes = [
    {
      entityId: 'red-fighter',
      side: 'red',
      points: [
        { position: { longitude: 121, latitude: 25, altitude: 0 } },
        { position: { longitude: 121.2, latitude: 25.1, altitude: 0 } },
      ],
    },
    {
      entityId: 'blue-ship',
      side: 'blue',
      points: [
        { position: { longitude: 122.2, latitude: 25.1, altitude: 0 } },
        { position: { longitude: 122.3, latitude: 25.1, altitude: 0 } },
      ],
    },
  ];

  const scenario = normalizeTacticalScenario(input);
  const airRoute = scenario.routes.find(route => route.entityId === 'red-fighter');
  const shipRoute = scenario.routes.find(route => route.entityId === 'blue-ship');

  assert.equal(airRoute?.points[0].position.altitude, 10000);
  assert.equal(airRoute?.points[1].position.altitude, 10000);
  assert.equal(shipRoute?.points[0].position.altitude, 0);
});

test('normalizer should align attacker route timestamps to strike launch time when route has no timing', () => {
  const input = createMinimalScenario();
  input.routes = [
    {
      entityId: 'red-fighter',
      side: 'red',
      points: [
        { position: { longitude: 121, latitude: 25, altitude: 8000 } },
        { position: { longitude: 121.5, latitude: 25, altitude: 9000 } },
      ],
    },
  ];

  const scenario = normalizeTacticalScenario(input);
  const route = scenario.routes.find(item => item.entityId === 'red-fighter');

  assert.equal(route?.points[0].timestamp, 0);
  assert.equal(route?.points[1].timestamp, input.strikeTasks[0].timestamp);
});

test('normalizer should copy strike task weapon trajectories onto generated attack events', () => {
  const input = createMinimalScenario();
  input.strikeTasks[0].weaponTrajectory = {
    mode: 'manual',
    interpolation: 'catmull-rom',
    points: [
      { role: 'launch', progress: 0, position: { longitude: 121, latitude: 25, altitude: 10000 } },
      { role: 'boost', progress: 0.2, position: { longitude: 121.2, latitude: 25.02, altitude: 12500 } },
      { role: 'impact', progress: 1, position: { longitude: 122, latitude: 25, altitude: 10000 } },
    ],
  };

  const scenario = normalizeTacticalScenario(input);
  const attackEvent = scenario.phases[0].events.find(event => event.type === 'attack');

  assert.equal(attackEvent?.weaponTrajectory?.points.length, 3);
  assert.equal(attackEvent?.weaponTrajectory?.points[1].role, 'boost');
});

test('normalizer should merge strike task weapon trajectories onto existing attack events', () => {
  const input = createMinimalScenario();
  input.phases[0].events = [
    {
      type: 'attack',
      timestamp: 20,
      sourceEntityId: 'red-fighter',
      targetEntityId: 'blue-aew',
      detail: '红方战机攻击蓝方预警机',
    },
  ];
  input.strikeTasks[0].weaponTrajectory = {
    mode: 'manual',
    interpolation: 'linear',
    points: [
      { role: 'launch', progress: 0, position: { longitude: 121, latitude: 25, altitude: 14000 } },
      { role: 'boost', progress: 0.3, position: { longitude: 121.3, latitude: 25.05, altitude: 17000 } },
      { role: 'impact', progress: 1, position: { longitude: 122, latitude: 25, altitude: 14000 } },
    ],
  };

  const scenario = normalizeTacticalScenario(input);
  const attackEvent = scenario.phases[0].events.find(event => event.type === 'attack');

  assert.equal(scenario.phases[0].events.length, 1);
  assert.equal(attackEvent?.weaponTrajectory?.points[1].position.altitude, 17000);
});
