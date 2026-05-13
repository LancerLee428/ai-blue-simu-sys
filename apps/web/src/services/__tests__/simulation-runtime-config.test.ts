import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SIMULATION_RUNTIME_CONFIG,
  normalizeSimulationRuntimeConfig,
} from '../simulation-runtime-config';

test('normalizeSimulationRuntimeConfig should accept editable camera and playback values', () => {
  const config = normalizeSimulationRuntimeConfig({
    camera: {
      enabled: true,
      longitude: 121.39,
      latitude: 37.52,
      altitude: 3_000_000,
      headingDeg: 35,
      pitchDeg: -55,
      rollDeg: 2,
      durationSeconds: 4,
    },
    playback: {
      flyToBeforePlay: false,
      startDelayAfterCameraMs: 1200,
    },
  });

  assert.deepEqual(config, {
    camera: {
      enabled: true,
      longitude: 121.39,
      latitude: 37.52,
      altitude: 3_000_000,
      headingDeg: 35,
      pitchDeg: -55,
      rollDeg: 2,
      durationSeconds: 4,
    },
    playback: {
      flyToBeforePlay: false,
      startDelayAfterCameraMs: 1200,
    },
  });
});

test('normalizeSimulationRuntimeConfig should clamp invalid numeric values and preserve defaults', () => {
  const config = normalizeSimulationRuntimeConfig({
    camera: {
      enabled: 'yes',
      longitude: 'bad',
      latitude: 32,
      altitude: -100,
      durationSeconds: -3,
    },
    playback: {
      flyToBeforePlay: true,
      startDelayAfterCameraMs: -50,
    },
  });

  assert.equal(config.camera.enabled, DEFAULT_SIMULATION_RUNTIME_CONFIG.camera.enabled);
  assert.equal(config.camera.longitude, DEFAULT_SIMULATION_RUNTIME_CONFIG.camera.longitude);
  assert.equal(config.camera.latitude, 32);
  assert.equal(config.camera.altitude, 1);
  assert.equal(config.camera.durationSeconds, 0);
  assert.equal(config.camera.headingDeg, DEFAULT_SIMULATION_RUNTIME_CONFIG.camera.headingDeg);
  assert.equal(config.camera.pitchDeg, DEFAULT_SIMULATION_RUNTIME_CONFIG.camera.pitchDeg);
  assert.equal(config.camera.rollDeg, DEFAULT_SIMULATION_RUNTIME_CONFIG.camera.rollDeg);
  assert.equal(config.playback.flyToBeforePlay, true);
  assert.equal(config.playback.startDelayAfterCameraMs, 0);
});
