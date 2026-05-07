# Radar Tracking Design

## Goal

Dynamic radar beams should represent target tracking, not a free-running sweep animation.
The static detection dome remains the sensor coverage area. A tracking beam appears only when an enemy dynamic target enters that coverage, follows the target while it remains inside, and disappears after it leaves.

## Data Model

Add optional tracking configuration to each `DetectionZone`.

```ts
type RadarTrackingTargetType = 'enemy-aircraft' | 'enemy-missile';

interface RadarTrackingConfig {
  enabled: boolean;
  targetTypes: RadarTrackingTargetType[];
  maxTracks: number;
}

interface DetectionZone {
  entityId: string;
  side: ForceSide;
  center: GeoPosition;
  radiusMeters: number;
  label?: string;
  tracking?: RadarTrackingConfig;
}
```

Default behavior:

- If `tracking` is absent, radar tracking is enabled for radar-capable detection zones with `targetTypes = ['enemy-aircraft', 'enemy-missile']` and `maxTracks = 1`.
- If `tracking.enabled === false`, the detection zone never creates dynamic tracking beams.
- Only enemy targets are eligible. A blue radar tracks red aircraft/missiles; a red radar tracks blue aircraft/missiles.

## XML Shape

Represent tracking as a child of `DetectionZone`.

```xml
<DetectionZone entityId="blue-radar-01" side="blue" radiusMeters="300000" label="蓝方雷达探测范围">
  <Center longitude="121.4" latitude="24.8" altitude="0" />
  <Tracking enabled="true" targetTypes="enemy-aircraft,enemy-missile" maxTracks="1" />
</DetectionZone>
```

Parser/exporter behavior:

- `xml-scenario-parser.ts` reads the optional `Tracking` child.
- `xml-scenario-exporter.ts` writes `Tracking` when the zone has tracking config.
- Invalid or missing `targetTypes` falls back to `enemy-aircraft,enemy-missile`.
- Invalid `maxTracks` falls back to `1`.

## Runtime Tracking Flow

`ExecutionEngine` owns detection and target selection because it already has current entity positions, runtime weapons, and execution time.

For each runtime visual sync:

1. Build radar-capable source emitters from `scenario.detectionZones`.
2. For each radar zone with tracking enabled, collect candidate enemy targets:
   - Enemy aircraft entities from `scenario.forces`, using current positions from `entityPositions`.
   - Enemy runtime missiles from `lastRuntimeWeapons`, using `weapon.currentPosition` and `weapon.launcherId` to resolve side.
3. Keep only candidates whose distance to the radar position is within `zone.radiusMeters`.
4. Sort candidates by distance and keep `maxTracks`.
5. Emit tracking `EmitterVolume` objects with:
   - `mode: 'track'`
   - `sourceEntityId` as the radar entity id
   - `headingDeg` and elevation values computed from radar position to target position
   - narrower `azimuthWidthDeg` for lock-on visual style
   - `rangeMeters` equal to target distance, clamped to a small positive minimum
6. Send those emitters to `MapRenderer`.

Existing debug button behavior remains useful:

- The dynamic scan button can force rendering for checking beam visuals.
- The real runtime behavior is target-driven. No eligible enemy target means no tracking beam.

## Visual Design

The dynamic beam should read as a soft lock-on cone:

- More transparent than the current beam.
- No hard, heavy outline.
- The far end should look circular rather than obviously elliptical.
- It should point from radar source to target and update as the target moves.

The current custom `Primitive` path stays, but the beam mesh and material values should be tuned:

- Use equal horizontal and vertical far-end radii for circular appearance.
- Use lower alpha for fill.
- Prefer light outline or no outline for the tracking beam.

## Testing

Add focused tests around pure runtime math:

- XML tracking parsing/export shape through parser/exporter tests or small unit helpers.
- Tracking config normalization defaults.
- Candidate filtering only selects enemy aircraft and enemy missiles.
- Candidate filtering excludes friendly aircraft/missiles and targets outside detection range.
- Beam mesh remains pointed at origin with a circular far-end radius.

Run required project gates:

- `npx tsx --test apps/web/src/services/__tests__/runtime-visual-model.test.ts`
- `npm --workspace @ai-blue-simu-sys/web run typecheck`
- `npm run build`

## Out Of Scope

- Multi-radar cooperative tracking.
- Radar probability of detection, occlusion, weather, or jamming effects.
- Persisting every runtime missile as a static XML entity.
- More than one target priority policy beyond nearest target first.
