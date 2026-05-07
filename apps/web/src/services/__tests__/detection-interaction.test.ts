import test from 'node:test';
import assert from 'node:assert/strict';

import { DetectionInteraction, type DetectionEvent } from '../detection-interaction';
import type { TacticalScenario } from '../../types/tactical-scenario';

function createScenario(): TacticalScenario {
  return {
    id: 'scenario-detection-runtime-position',
    version: 1,
    summary: '探测运行时位置测试',
    forces: [
      {
        side: 'red',
        name: '红方',
        entities: [
          {
            id: 'red-aew',
            name: '红方预警机',
            type: 'air-aew',
            side: 'red',
            position: { longitude: 120, latitude: 25, altitude: 9000 },
          },
        ],
      },
      {
        side: 'blue',
        name: '蓝方',
        entities: [
          {
            id: 'blue-fighter',
            name: '蓝方战斗机',
            type: 'air-fighter',
            side: 'blue',
            position: { longitude: 121, latitude: 25, altitude: 9000 },
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [
      {
        entityId: 'red-aew',
        side: 'red',
        center: { longitude: 120, latitude: 25, altitude: 9000 },
        radiusMeters: 30_000,
        label: '红方预警机 雷达探测范围',
      },
    ],
    strikeTasks: [],
    phases: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

test('DetectionInteraction should measure from runtime detector position, not static zone center', () => {
  const interaction = new DetectionInteraction();
  const events: DetectionEvent[] = [];
  interaction.setScenario(createScenario());
  interaction.setOnDetectionEvent(event => events.push(event));

  interaction.checkDetections(
    new Map([
      ['red-aew', { longitude: 121.01, latitude: 25, altitude: 9000 }],
      ['blue-fighter', { longitude: 121.02, latitude: 25, altitude: 9000 }],
    ]),
    12,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].detectorEntityId, 'red-aew');
  assert.equal(events[0].detectedEntityId, 'blue-fighter');
  assert.ok(events[0].distance < 30_000);
});
