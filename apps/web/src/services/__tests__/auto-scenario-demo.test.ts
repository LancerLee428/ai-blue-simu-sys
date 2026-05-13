import test from 'node:test';
import assert from 'node:assert/strict';

import { AUTO_DEMO_CONFIG } from '../../config/auto-demo';
import { scheduleAutoScenarioDemo, waitAutoDemoRafDelay } from '../auto-scenario-demo';

test('auto scenario demo scheduler should wait for readiness and three RAF seconds before running once', () => {
  const frames: FrameRequestCallback[] = [];
  const cancelled = new Set<number>();
  let nextFrameId = 1;
  let ready = false;
  let runs = 0;

  const controller = scheduleAutoScenarioDemo({
    delayMs: 3_000,
    isReady: () => ready,
    run: () => {
      runs += 1;
    },
    requestFrame: (callback) => {
      frames.push(callback);
      return nextFrameId++;
    },
    cancelFrame: (id) => {
      cancelled.add(id);
    },
  });

  const flush = (timestamp: number) => {
    const callback = frames.shift();
    assert.ok(callback, `expected a RAF callback at ${timestamp}`);
    callback(timestamp);
  };

  flush(0);
  flush(1_000);
  ready = true;
  flush(2_999);
  assert.equal(runs, 0);

  flush(3_000);
  assert.equal(runs, 1);
  assert.equal(controller.hasCompleted(), true);

  controller.cancel();
  assert.equal(frames.length, 0);
  assert.equal(cancelled.size, 0);
});

test('auto demo config should centralize import delay, camera, and play delay knobs', () => {
  assert.equal(AUTO_DEMO_CONFIG.planId, 'plan-auto-default-scenario');
  assert.equal(AUTO_DEMO_CONFIG.importDelayMs, 4_000);
  assert.equal(AUTO_DEMO_CONFIG.camera.flyDurationSec, 2);
  assert.equal(AUTO_DEMO_CONFIG.camera.headingDeg, 0);
  assert.equal(AUTO_DEMO_CONFIG.camera.pitchDeg, -60);
  assert.equal(AUTO_DEMO_CONFIG.camera.rangeMeters, null);
  assert.equal(AUTO_DEMO_CONFIG.playDelayAfterCameraArriveMs, 0);
});

test('auto demo RAF delay should resolve after configured play delay', async () => {
  const frames: FrameRequestCallback[] = [];
  let nextFrameId = 1;
  let resolved = false;

  const promise = waitAutoDemoRafDelay(500, {
    requestFrame: (callback) => {
      frames.push(callback);
      return nextFrameId++;
    },
  }).then(() => {
    resolved = true;
  });

  const flush = (timestamp: number) => {
    const callback = frames.shift();
    assert.ok(callback, `expected a RAF callback at ${timestamp}`);
    callback(timestamp);
  };

  flush(0);
  await Promise.resolve();
  assert.equal(resolved, false);

  flush(499);
  await Promise.resolve();
  assert.equal(resolved, false);

  flush(500);
  await promise;
  assert.equal(resolved, true);
});
