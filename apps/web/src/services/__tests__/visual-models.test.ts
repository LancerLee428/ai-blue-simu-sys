import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getDefaultEntityVisualModel,
  resolveVisualModel,
  resolveWeaponVisualModel,
} from '../visual-models';

test('visual model aliases should resolve bundled aircraft ship missile and radar glb assets', () => {
  assert.match(resolveVisualModel({ alias: 'fj' }, 'air-fighter')?.uri ?? '', /\/assets\/3d-model\/fj\/ZDJ_01_v3\.glb(\?|$)/);
  assert.match(resolveVisualModel({ alias: 'jt' }, 'ship-destroyer')?.uri ?? '', /\/assets\/3d-model\/jt\/SMJT_01\.glb(\?|$)/);
  assert.match(resolveVisualModel({ alias: 'ld' }, 'ground-radar')?.uri ?? '', /\/assets\/3d-model\/ld\/ld_01\.glb(\?|$)/);
  assert.match(resolveWeaponVisualModel({ alias: 'dd' })?.uri ?? '', /\/assets\/3d-model\/dd\/XHDD_01\.glb(\?|$)/);
});

test('default aircraft and missile model heading offsets should use calibrated -90 degrees', () => {
  assert.equal(resolveVisualModel({ alias: 'fj' }, 'air-fighter')?.headingOffsetDeg, -90);
  assert.equal(resolveWeaponVisualModel({ alias: 'dd' })?.headingOffsetDeg, -90);
});

test('visual model resolver should honor XML uri and keep render tuning values', () => {
  const resolved = resolveVisualModel({
    uri: 'fj/custom-fighter.glb',
    scale: 0.07,
    minimumPixelSize: 88,
    headingOffsetDeg: 180,
    pitchOffsetDeg: -5,
    rollOffsetDeg: 3,
  }, 'air-fighter');

  assert.equal(resolved?.uri, 'fj/custom-fighter.glb');
  assert.equal(resolved?.scale, 0.07);
  assert.equal(resolved?.minimumPixelSize, 88);
  assert.equal(resolved?.headingOffsetDeg, 180);
  assert.equal(resolved?.pitchOffsetDeg, -5);
  assert.equal(resolved?.rollOffsetDeg, 3);
});

test('visual model resolver should map bundled XML relative paths to build asset URLs', () => {
  const resolved = resolveVisualModel({
    uri: 'fj/ZDJ_01_v3.glb',
    scale: 0.07,
  }, 'air-fighter');

  assert.match(resolved?.uri ?? '', /\/assets\/3d-model\/fj\/ZDJ_01_v3\.glb(\?|$)/);
  assert.equal(resolved?.scale, 0.07);
});

test('default visual model mapping should follow platform category', () => {
  assert.equal(getDefaultEntityVisualModel('air-jammer')?.alias, 'fj');
  assert.equal(getDefaultEntityVisualModel('ship-carrier')?.alias, 'jt');
  assert.equal(getDefaultEntityVisualModel('facility-radar')?.alias, 'ld');
  assert.equal(getDefaultEntityVisualModel('facility-target'), null);
});

test('example XML should reference the current bundled aircraft and radar model files', () => {
  const xml = readFileSync('data-example/东海联合打击-2024-1777165955760.xml', 'utf8');

  assert.match(xml, /uri="fj\/ZDJ_01_v3\.glb"/);
  assert.match(xml, /uri="ld\/ld_01\.glb"/);
  assert.doesNotMatch(xml, /uri="fj\/SMJT_01\.glb"/);
  assert.doesNotMatch(xml, /uri="ld\/SMJT_01\.glb"/);
});
