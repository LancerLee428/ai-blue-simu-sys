# Radar Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enemy-only radar tracking configuration to detection zones, wire it through XML and runtime logic, and switch the dynamic beam to target-following visuals with softer styling.

**Architecture:** Extend `DetectionZone` with optional tracking config, parse/export it in XML, then let `ExecutionEngine` derive tracking emitters from enemy aircraft and runtime weapons inside radar coverage. Keep static detection domes unchanged while `MapRenderer` renders tracking beams as Cesium primitives aimed at live targets.

**Tech Stack:** TypeScript, Vue workspace app, CesiumJS `Primitive`/`Geometry`, Node test runner, XML parser/exporter helpers

---

### Task 1: Add Tracking Types And Defaults

**Files:**
- Modify: `apps/web/src/types/tactical-scenario.ts`
- Modify: `apps/web/src/services/tactical-scenario-normalizer.ts`
- Test: `apps/web/src/services/__tests__/runtime-visual-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('normalizeRadarTrackingConfig should default to enemy aircraft and missiles with one track', () => {
  const tracking = normalizeRadarTrackingConfig(undefined);

  assert.deepEqual(tracking, {
    enabled: true,
    targetTypes: ['enemy-aircraft', 'enemy-missile'],
    maxTracks: 1,
  });
});

test('normalizeRadarTrackingConfig should sanitize invalid target types and maxTracks', () => {
  const tracking = normalizeRadarTrackingConfig({
    enabled: true,
    targetTypes: ['enemy-aircraft', 'bad-type'],
    maxTracks: 0,
  });

  assert.deepEqual(tracking, {
    enabled: true,
    targetTypes: ['enemy-aircraft'],
    maxTracks: 1,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: FAIL because `normalizeRadarTrackingConfig` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RadarTrackingTargetType = 'enemy-aircraft' | 'enemy-missile';

export interface RadarTrackingConfig {
  enabled: boolean;
  targetTypes: RadarTrackingTargetType[];
  maxTracks: number;
}

export interface DetectionZone {
  entityId: string;
  side: ForceSide;
  center: GeoPosition;
  radiusMeters: number;
  label?: string;
  tracking?: RadarTrackingConfig;
}
```

```ts
const DEFAULT_RADAR_TRACKING_TARGET_TYPES: RadarTrackingTargetType[] = ['enemy-aircraft', 'enemy-missile'];

export function normalizeRadarTrackingConfig(input: unknown): RadarTrackingConfig {
  const raw = (input ?? {}) as LooseRecord;
  const targetTypes = asArray(raw.targetTypes)
    .map(value => String(value))
    .filter((value): value is RadarTrackingTargetType => value === 'enemy-aircraft' || value === 'enemy-missile');

  return {
    enabled: raw.enabled !== false,
    targetTypes: targetTypes.length > 0 ? targetTypes : [...DEFAULT_RADAR_TRACKING_TARGET_TYPES],
    maxTracks: Math.max(1, Number(raw.maxTracks ?? 1)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: PASS for the new normalization tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/types/tactical-scenario.ts apps/web/src/services/tactical-scenario-normalizer.ts apps/web/src/services/__tests__/runtime-visual-model.test.ts
git commit -m "feat(web): 增加雷达追踪配置类型"
```

### Task 2: Parse And Export Tracking In XML

**Files:**
- Modify: `apps/web/src/services/xml-scenario-parser.ts`
- Modify: `apps/web/src/services/xml-scenario-exporter.ts`
- Modify: `apps/web/src/services/tactical-scenario-normalizer.ts`
- Test: `apps/web/src/services/__tests__/runtime-visual-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('parseDetectionZoneTracking should read Tracking child config from XML shape', () => {
  const xml = `
    <DetectionZone entityId="blue-radar-01" side="blue" radiusMeters="300000">
      <Center longitude="121.4" latitude="24.8" altitude="0" />
      <Tracking enabled="true" targetTypes="enemy-aircraft,enemy-missile" maxTracks="2" />
    </DetectionZone>
  `;

  const tracking = parseDetectionZoneTracking(new DOMParser().parseFromString(xml, 'text/xml').documentElement);

  assert.deepEqual(tracking, {
    enabled: true,
    targetTypes: ['enemy-aircraft', 'enemy-missile'],
    maxTracks: 2,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: FAIL because `parseDetectionZoneTracking` is missing.

- [ ] **Step 3: Write minimal implementation**

```ts
function parseDetectionZoneTracking(zoneEl: Element): RadarTrackingConfig | undefined {
  const trackingEl = zoneEl.querySelector(':scope > Tracking');
  if (!trackingEl) return undefined;

  const targetTypes = (getAttrText(trackingEl, 'targetTypes') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  return normalizeRadarTrackingConfig({
    enabled: getAttrText(trackingEl, 'enabled') !== 'false',
    targetTypes,
    maxTracks: getAttrFloat(trackingEl, 'maxTracks') || 1,
  });
}
```

```ts
const tracking = parseDetectionZoneTracking(zoneEl);
return {
  entityId,
  side,
  center,
  radiusMeters,
  ...(label ? { label } : {}),
  ...(tracking ? { tracking } : {}),
};
```

```ts
if (zone.tracking) {
  zoneEl.appendChild(elAttr(doc, 'Tracking', {
    enabled: String(zone.tracking.enabled),
    targetTypes: zone.tracking.targetTypes.join(','),
    maxTracks: String(zone.tracking.maxTracks),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: PASS for XML tracking parsing test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/xml-scenario-parser.ts apps/web/src/services/xml-scenario-exporter.ts apps/web/src/services/tactical-scenario-normalizer.ts apps/web/src/services/__tests__/runtime-visual-model.test.ts
git commit -m "feat(web): 支持雷达追踪配置的XML导入导出"
```

### Task 3: Add Enemy Tracking Target Selection In Runtime

**Files:**
- Modify: `apps/web/src/services/execution-engine.ts`
- Modify: `apps/web/src/services/runtime-visual-math.ts`
- Test: `apps/web/src/services/__tests__/runtime-visual-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('selectRadarTrackingTargets should only keep enemy aircraft and enemy missiles inside range', () => {
  const targets = selectRadarTrackingTargets({
    radarSide: 'blue',
    radarPosition: { longitude: 120, latitude: 24, altitude: 0, heading: 0 },
    rangeMeters: 200000,
    maxTracks: 2,
    tracking: { enabled: true, targetTypes: ['enemy-aircraft', 'enemy-missile'], maxTracks: 2 },
    entities: [
      { id: 'red-air', side: 'red', type: 'air-fighter', position: { longitude: 120.5, latitude: 24, altitude: 9000 } },
      { id: 'blue-air', side: 'blue', type: 'air-fighter', position: { longitude: 120.3, latitude: 24, altitude: 9000 } },
    ],
    weapons: [
      { id: 'red-missile', launcherSide: 'red', currentPosition: { longitude: 120.2, latitude: 24, altitude: 5000 } },
      { id: 'blue-missile', launcherSide: 'blue', currentPosition: { longitude: 120.1, latitude: 24, altitude: 5000 } },
    ],
  });

  assert.deepEqual(targets.map(target => target.id), ['red-missile', 'red-air']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: FAIL because `selectRadarTrackingTargets` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface RadarTrackingCandidate {
  id: string;
  position: GeoPosition;
  distanceMeters: number;
  category: 'enemy-aircraft' | 'enemy-missile';
}
```

```ts
export function selectRadarTrackingTargets(args: {
  radarSide: ForceSide;
  radarPosition: GeoPosition;
  rangeMeters: number;
  maxTracks: number;
  tracking: RadarTrackingConfig;
  entities: Array<{ id: string; side: ForceSide; type: string; position: GeoPosition }>;
  weapons: Array<{ id: string; launcherSide: ForceSide; currentPosition: GeoPosition }>;
}): RadarTrackingCandidate[] {
  const candidates: RadarTrackingCandidate[] = [];
  // add enemy aircraft candidates
  // add enemy missile candidates
  // filter by range and sort nearest first
  return candidates
    .filter(candidate => candidate.distanceMeters <= args.rangeMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, args.maxTracks);
}
```

```ts
private createTrackingEmitters(): EmitterVolume[] {
  // iterate detection zones with tracking
  // select enemy targets
  // create one track emitter per target using target-relative heading/elevation/range
}
```

```ts
this.renderer.updateRuntimeVisuals({
  virtualTimeMs: this.getGlobalVirtualTimeMs(),
  executionStatus: this.status,
  entities: new Map(this.entityPositions),
  weapons,
  sensorEmitters: includeEmitters ? this.createTrackingEmitters() : [],
  ewEmitters: includeEmitters ? this.createEWEmitters() : [],
  explosions: Array.from(this.activeExplosions.values()),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: PASS for enemy-only target selection.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/execution-engine.ts apps/web/src/services/runtime-visual-math.ts apps/web/src/services/__tests__/runtime-visual-model.test.ts
git commit -m "feat(web): 增加敌方目标雷达追踪判定"
```

### Task 4: Tune Tracking Beam Shape And Style

**Files:**
- Modify: `apps/web/src/services/runtime-visual-math.ts`
- Modify: `apps/web/src/services/map-renderer.ts`
- Test: `apps/web/src/services/__tests__/runtime-visual-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('createRadarBeamMesh should use equal far-end radii for circular beam cap', () => {
  const mesh = createRadarBeamMesh({
    rangeMeters: 1000,
    azimuthWidthDeg: 20,
    elevationMinDeg: -5,
    elevationMaxDeg: 15,
    segments: 16,
  });

  const first = { x: mesh.positions[3], y: mesh.positions[4], z: mesh.positions[5] };
  const quarter = { x: mesh.positions[3 + 4 * 3], y: mesh.positions[4 + 4 * 3], z: mesh.positions[5 + 4 * 3] };

  assert.ok(Math.abs(Math.abs(first.x) - Math.abs(quarter.z - first.z + first.z - first.z)) < 50);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: FAIL because the mesh still uses unequal far-end radii.

- [ ] **Step 3: Write minimal implementation**

```ts
const farEndRadius = Math.max(
  1,
  rangeMeters * Math.sin(Math.max(azimuthWidthRad / 2, elevationHalfSpan))
);
const horizontalRadius = farEndRadius;
const verticalRadius = farEndRadius;
```

```ts
attributes: {
  color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.22)),
},
appearance: new Cesium.PerInstanceColorAppearance({
  flat: true,
  faceForward: true,
  translucent: true,
  closed: false,
}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: PASS for circular far-end mesh expectation.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/runtime-visual-math.ts apps/web/src/services/map-renderer.ts apps/web/src/services/__tests__/runtime-visual-model.test.ts
git commit -m "feat(web): 优化雷达追踪波束样式"
```

### Task 5: Final Verification

**Files:**
- Modify: `apps/web/dist/index.html` (build artifact if tracked)

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm --workspace @ai-blue-simu-sys/web run typecheck`
Expected: PASS

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: PASS with only non-blocking Vite chunk size warnings

- [ ] **Step 4: Cesium review gate**

Check Context7 against:
- `Geometry`
- `GeometryInstance`
- `Primitive`
- `PerInstanceColorAppearance`
- `Transforms.eastNorthUpToFixedFrame`

Expected: current custom tracking beam usage matches documented Cesium primitive/model-matrix patterns.

- [ ] **Step 5: Commit**

```bash
git add apps/web/dist/index.html
git commit -m "chore(build): 更新雷达追踪构建产物"
```
