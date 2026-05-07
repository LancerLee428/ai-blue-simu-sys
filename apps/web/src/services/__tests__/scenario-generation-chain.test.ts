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
