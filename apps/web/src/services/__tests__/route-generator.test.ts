import test from 'node:test';
import assert from 'node:assert/strict';

import { RouteGenerator } from '../route-generator';
import type { TacticalScenario } from '../../types/tactical-scenario';

function createScenario(): TacticalScenario {
  return {
    id: 'route-generator-test',
    version: 1,
    summary: '路线生成测试',
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
            id: 'blue-ship',
            name: '蓝方舰艇',
            type: 'ship-destroyer',
            side: 'blue',
            position: { longitude: 124, latitude: 25.2, altitude: 0 },
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [],
    strikeTasks: [],
    phases: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

test('fixRouteEndpoint should keep air platform extension at launch altitude', () => {
  const scenario = createScenario();
  const fixed = new RouteGenerator().fixRouteEndpoint({
    entityId: 'red-fighter',
    side: 'red',
    points: [
      { position: { longitude: 121, latitude: 25, altitude: 8000 } },
      { position: { longitude: 122, latitude: 25.1, altitude: 8000 } },
    ],
  }, scenario);

  const endPoint = fixed.points[fixed.points.length - 1].position;
  assert.ok(endPoint.longitude > 122);
  assert.ok(endPoint.longitude < 124);
  assert.equal(endPoint.altitude, 8000);
});

test('generateFromIntent should end air attack routes at a standoff launch point', () => {
  const scenario = createScenario();
  const route = new RouteGenerator().generateFromIntent({
    entityId: 'red-fighter',
    targetEntityId: 'blue-ship',
    side: 'red',
    approach: 'direct',
  }, scenario);

  assert.ok(route);
  const endPoint = route.points[route.points.length - 1].position;
  assert.ok(endPoint.longitude > 121);
  assert.ok(endPoint.longitude < 124);
  assert.ok(endPoint.latitude > 25);
  assert.ok(endPoint.latitude < 25.2);
  assert.equal(endPoint.altitude, 8000);
});
