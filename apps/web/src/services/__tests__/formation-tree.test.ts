import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFormationTree } from '../formation-tree';
import type { TacticalScenario, PlatformType } from '../../types/tactical-scenario';

type ScenarioOverrides = {
  interactions?: TacticalScenario['interactions'] | null;
  blueEntityType?: PlatformType;
};

function createScenario(overrides: ScenarioOverrides = {}): TacticalScenario {
  return {
    id: 'formation-tree-demo',
    version: 1,
    summary: '编组树演示',
    forces: [
      {
        side: 'red',
        name: '红方',
        entities: [
          {
            id: 'red-air-01',
            name: '飞机1-01',
            type: 'air-fighter',
            side: 'red',
            position: { longitude: 121, latitude: 25, altitude: 10000 },
            formationRole: 'L',
          },
          {
            id: 'red-radar-01',
            name: '雷达1-01',
            type: 'ground-radar',
            side: 'red',
            position: { longitude: 122, latitude: 25, altitude: 0 },
            formationRole: 'C',
          },
        ],
      },
      {
        side: 'blue',
        name: '蓝方',
        entities: [
          {
            id: 'blue-platform-01',
            name: '平台1-01',
            type: overrides.blueEntityType ?? 'ship-destroyer',
            side: 'blue',
            position: { longitude: 123, latitude: 26, altitude: 0 },
            formationRole: 'C',
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [],
    strikeTasks: [],
    phases: [],
    metadata: {
      generatedAt: '2026-05-12T00:00:00.000Z',
      modelUsed: 'test',
      confidence: 1,
    },
    ...(overrides.interactions !== null ? {
      interactions: overrides.interactions ?? {
      groups: [
        {
          id: 'red-group-01',
          name: '红方空情引导编组1',
          side: 'red',
          type: 'formation',
          members: [
            {
              equipRef: 'red-air-01',
              role: '飞机1-L',
              categoryId: 'red-group-01-air',
              categoryName: '飞机1',
              formationRole: 'L',
            },
            {
              equipRef: 'red-radar-01',
              role: '雷达1-C',
              categoryId: 'red-group-01-radar',
              categoryName: '雷达1',
              formationRole: 'C',
            },
          ],
        },
        {
          id: 'blue-group-01',
          name: '蓝方导弹编组1',
          side: 'blue',
          type: 'formation',
          members: [],
          children: [
            {
              id: 'blue-group-01-platform',
              name: '平台1',
              type: 'category',
              formationRole: 'C',
              members: [{ equipRef: 'blue-platform-01', role: '平台1-C' }],
            },
          ],
        },
      ],
      commandControl: [],
      communications: [],
      detectionLinks: [],
    },
    } : {}),
  };
}

test('buildFormationTree should preserve formation and category hierarchy', () => {
  const tree = buildFormationTree(createScenario());
  const red = tree.find(side => side.side === 'red');
  const blue = tree.find(side => side.side === 'blue');

  assert.equal(red?.total, 2);
  assert.equal(red?.groups[0].name, '红方空情引导编组1');
  assert.deepEqual(red?.groups[0].categories.map(category => category.name), ['飞机1', '雷达1']);
  assert.deepEqual(red?.groups[0].categories.map(category => category.marker), ['L', 'C']);
  assert.equal(blue?.total, 1);
  assert.equal(blue?.groups[0].categories[0].name, '平台1');
});

test('buildFormationTree should fall back to side entity categories when no scenario exists', () => {
  const tree = buildFormationTree(undefined);

  assert.equal(tree.length, 2);
  assert.equal(tree[0].side, 'red');
  assert.equal(tree[0].total, 0);
  assert.equal(tree[1].side, 'blue');
  assert.equal(tree[1].total, 0);
});

test('buildFormationTree should still show entities after action plan storage loses group metadata', () => {
  const tree = buildFormationTree(createScenario({ interactions: null, blueEntityType: 'ground-sam' }));
  const red = tree.find(side => side.side === 'red');
  const blue = tree.find(side => side.side === 'blue');

  assert.equal(red?.groups[0].name, '红方未编组资源');
  assert.deepEqual(red?.groups[0].categories.map(category => category.name), ['飞机', '雷达']);
  assert.equal(blue?.groups[0].name, '蓝方未编组资源');
  assert.deepEqual(blue?.groups[0].categories.map(category => category.name), ['导弹']);
});
