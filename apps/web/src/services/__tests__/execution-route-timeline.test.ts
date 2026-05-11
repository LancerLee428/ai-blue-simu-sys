import test from 'node:test';
import assert from 'node:assert/strict';

import { sampleRoutePositionAtTime } from '../execution-engine';
import type { Route } from '../../types/tactical-scenario';

test('sampleRoutePositionAtTime should put aircraft at launch point by route timestamp and keep it there afterward', () => {
  const route: Route = {
    entityId: 'red-fighter',
    side: 'red',
    points: [
      { timestamp: 0, position: { longitude: 121, latitude: 28, altitude: 14000 } },
      { timestamp: 6, position: { longitude: 123, latitude: 27.5, altitude: 15000 } },
      { timestamp: 12, position: { longitude: 126.28, latitude: 26.36, altitude: 16000 } },
    ],
  };

  const atLaunch = sampleRoutePositionAtTime(route, 12_000);
  const afterLaunch = sampleRoutePositionAtTime(route, 60_000);

  assert.equal(atLaunch?.longitude, route.points[2].position.longitude);
  assert.equal(atLaunch?.latitude, route.points[2].position.latitude);
  assert.equal(atLaunch?.altitude, route.points[2].position.altitude);
  assert.equal(afterLaunch?.longitude, route.points[2].position.longitude);
  assert.equal(afterLaunch?.latitude, route.points[2].position.latitude);
  assert.equal(afterLaunch?.altitude, route.points[2].position.altitude);
});

test('sampleRoutePositionAtTime should derive heading from the active route segment', () => {
  const route: Route = {
    entityId: 'red-fighter',
    side: 'red',
    points: [
      { timestamp: 0, position: { longitude: 120, latitude: 25, altitude: 12000 } },
      { timestamp: 10, position: { longitude: 121, latitude: 25, altitude: 12500 } },
      { timestamp: 20, position: { longitude: 121, latitude: 26, altitude: 13000 } },
    ],
  };

  const atStart = sampleRoutePositionAtTime(route, 0);
  const eastbound = sampleRoutePositionAtTime(route, 5_000);
  const northbound = sampleRoutePositionAtTime(route, 15_000);
  const afterRoute = sampleRoutePositionAtTime(route, 60_000);

  assert.ok(atStart?.heading !== undefined);
  assert.ok(eastbound?.heading !== undefined);
  assert.ok(northbound?.heading !== undefined);
  assert.ok(afterRoute?.heading !== undefined);
  assert.ok(Math.abs(atStart.heading - 90) < 0.5);
  assert.ok(Math.abs(eastbound.heading - 90) < 0.5);
  assert.ok(Math.abs(northbound.heading - 0) < 0.5);
  assert.ok(Math.abs(afterRoute.heading - 0) < 0.5);
});
