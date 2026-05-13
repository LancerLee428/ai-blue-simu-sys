import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createExplosionDescriptor,
  createExplosionParticleConfig,
  getExplosionStatusAtTime,
} from '../explosion-renderer';

test('createExplosionDescriptor should include professional visual layers and lifecycle defaults', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-test',
    type: 'ship-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 2210,
    effect: {
      type: 'ship-impact',
      radius: 96,
      durationMs: 1400,
      innerColor: '#ffe3a1',
      outerColor: '#ff3b30',
    },
    startTimeMs: 10_000,
  });

  assert.equal(descriptor.type, 'ship-impact');
  assert.equal(descriptor.status, 'active');
  assert.ok(descriptor.durationMs >= 3_000);
  assert.ok(descriptor.radius >= 96);
  assert.deepEqual(
    descriptor.layers.map(layer => layer.kind),
    ['flash', 'fireball', 'ground-burst', 'shockwave', 'smoke-column', 'sparks'],
  );
});

test('createExplosionDescriptor should cap radius by explicit effect when damage is low', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-low-damage',
    type: 'ground-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 10,
    effect: {
      type: 'ground-impact',
      radius: 84,
      durationMs: 1200,
      innerColor: '#ffd27a',
      outerColor: '#ff6b35',
    },
    startTimeMs: 0,
  });

  assert.equal(descriptor.radius, 84);
  assert.equal(descriptor.durationMs, 3_000);
});

test('createExplosionDescriptor should respect longer configured visual duration', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-long-duration',
    type: 'missile-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 650,
    effect: {
      type: 'missile-impact',
      radius: 72,
      durationMs: 8_000,
      innerColor: '#ffd27a',
      outerColor: '#ff5500',
    },
    startTimeMs: 10_000,
  });

  assert.equal(descriptor.durationMs, 8_000);
});

test('getExplosionStatusAtTime should derive lifecycle from virtual time', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-virtual-time',
    type: 'missile-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 650,
    effect: {
      type: 'missile-impact',
      radius: 72,
      durationMs: 1000,
      innerColor: '#ffd27a',
      outerColor: '#ff5500',
    },
    startTimeMs: 10_000,
  });

  assert.equal(getExplosionStatusAtTime(descriptor, 10_100).status, 'active');
  assert.equal(getExplosionStatusAtTime(descriptor, 12_300).status, 'fading');
  assert.equal(getExplosionStatusAtTime(descriptor, 13_100).status, 'complete');
});

test('getExplosionStatusAtTime should derive lifecycle from real visual time when provided', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-real-time',
    type: 'missile-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 650,
    effect: {
      type: 'missile-impact',
      radius: 72,
      durationMs: 1000,
      innerColor: '#ffd27a',
      outerColor: '#ff5500',
    },
    startTimeMs: 10_000,
    visualStartTimeMs: 50_000,
  });

  assert.equal(getExplosionStatusAtTime(descriptor, 200_000, 50_100).status, 'active');
  assert.equal(getExplosionStatusAtTime(descriptor, 200_000, 52_300).status, 'fading');
  assert.equal(getExplosionStatusAtTime(descriptor, 200_000, 53_100).status, 'complete');
});

test('createExplosionParticleConfig should split explosion into fire, smoke, dust and spark emitters', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-particles',
    type: 'ship-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 2400,
    effect: {
      type: 'ship-impact',
      radius: 96,
      durationMs: 1400,
      innerColor: '#ffe3a1',
      outerColor: '#ff3b30',
    },
    startTimeMs: 10_000,
  });

  const config = createExplosionParticleConfig(descriptor);

  assert.equal(config.fire.lifetimeSec > 0, true);
  assert.equal(config.smoke.lifetimeSec > config.fire.lifetimeSec, true);
  assert.equal(config.dust.emissionRate > 0, true);
  assert.equal(config.sparks.bursts.length > 0, true);
  assert.equal(config.smoke.imageSize.max > config.fire.imageSize.max, true);
});

test('createExplosionParticleConfig should keep every particle layer inside the descriptor lifetime', () => {
  const descriptor = createExplosionDescriptor({
    id: 'explosion-particle-lifetime',
    type: 'missile-impact',
    position: { longitude: 121, latitude: 25, altitude: 0 },
    damage: 1800,
    effect: {
      type: 'missile-impact',
      radius: 72,
      durationMs: 3_000,
      innerColor: '#ffd27a',
      outerColor: '#ff5500',
    },
    startTimeMs: 10_000,
  });
  const config = createExplosionParticleConfig(descriptor);
  const durationSec = descriptor.durationMs / 1000;

  for (const [layer, layerConfig] of Object.entries(config)) {
    assert.ok(
      layerConfig.lifetimeSec + layerConfig.particleLifeSec.max <= durationSec,
      `${layer} particle layer outlives explosion cleanup window`,
    );
  }
});

test('ExplosionRenderer should use Cesium particle systems instead of per-frame billboard images', () => {
  const sourcePath = fileURLToPath(new URL('../explosion-renderer.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes('createFrameCanvas'), false);
  assert.equal(source.includes('toDataURL'), false);
  assert.equal(/billboard\s*:/.test(source), false);
});

test('ExplosionRenderer particles should stay visible from the scenario overview camera', () => {
  const sourcePath = fileURLToPath(new URL('../explosion-renderer.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes('sizeInMeters: true'), false);
});

test('MapRenderer should not keep the legacy strike explosion animation path', () => {
  const sourcePath = fileURLToPath(new URL('../map-renderer.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes('renderStrikeExplosion'), false);
  assert.equal(source.includes('Date.now()'), false);
  assert.equal(source.includes('postRender.addEventListener'), false);
});

test('MapRenderer should not render strike task markers before runtime impact', () => {
  const sourcePath = fileURLToPath(new URL('../map-renderer.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');
  const renderScenarioBody = source.slice(
    source.indexOf('renderScenario(scenario: TacticalScenario): void'),
    source.indexOf('  /**\n   * 渲染进攻路线'),
  );

  assert.equal(renderScenarioBody.includes('renderStrikeTasks'), false);
  assert.equal(source.includes('recordWeaponImpact'), true);
});

test('MapRenderer should build unique static detection entity ids for duplicate source zones', () => {
  const sourcePath = fileURLToPath(new URL('../map-renderer.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes('getStaticDetectionEntityIds(zone, index)'), true);
  assert.equal(source.includes('id: `detection-ground-${zone.entityId}`'), false);
  assert.equal(source.includes('id: `detection-hemi-${zone.entityId}`'), false);
});

test('ExecutionEngine should record impact marker only when weapon impact fires', () => {
  const sourcePath = fileURLToPath(new URL('../execution-engine.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');
  const impactBlock = source.slice(
    source.indexOf('weaponEvaluation.impacts.forEach'),
    source.indexOf('this.syncRuntimeVisuals(weaponEvaluation.weapons)'),
  );

  assert.equal(impactBlock.includes('recordWeaponImpact'), true);
});

test('ExecutionEngine should not prune active explosions with a hard-coded 3000ms window', () => {
  const sourcePath = fileURLToPath(new URL('../execution-engine.ts', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes('visualTimeMs - explosion.triggeredAtMs >= 3_000'), false);
});

test('WorkbenchView should load the active action plan before runtime debug effects are toggled', () => {
  const sourcePath = fileURLToPath(new URL('../../views/WorkbenchView.vue', import.meta.url));
  const source = readFileSync(sourcePath, 'utf8');

  assert.equal(source.includes('function syncActivePlanToRuntime'), true);
  assert.equal(/watch\s*\(\s*\(\)\s*=>\s*actionPlanStore\.activePlanId/.test(source), true);
  assert.equal(source.includes('syncActivePlanToRuntime({ flyTo: true })'), true);
});
