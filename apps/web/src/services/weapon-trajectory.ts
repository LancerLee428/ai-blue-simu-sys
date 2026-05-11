import type {
  GeoPosition,
  WeaponInterferenceState,
  WeaponSpec,
  WeaponTrajectoryKeyPoint,
  WeaponType,
} from '../types/tactical-scenario';

export interface WeaponTrajectoryInput {
  spec: WeaponSpec;
  launchPosition: GeoPosition;
  targetPosition: GeoPosition;
  progress: number;
  sampleCount: number;
  keyPoints?: WeaponTrajectoryKeyPoint[];
  interpolation?: 'linear' | 'catmull-rom';
  interference?: WeaponInterferenceState;
}

export interface WeaponTrajectoryResult {
  currentPosition: GeoPosition;
  trajectory: GeoPosition[];
  adjustedTargetPosition: GeoPosition;
  statusHint: 'nominal' | 'degraded' | 'miss';
}

interface NormalizedTrajectoryPoint {
  progress: number;
  position: GeoPosition;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInCubic(t: number): number {
  return t ** 3;
}

function interpolatePosition(from: GeoPosition, to: GeoPosition, t: number): GeoPosition {
  return {
    longitude: lerp(from.longitude, to.longitude, t),
    latitude: lerp(from.latitude, to.latitude, t),
    altitude: lerp(from.altitude, to.altitude, t),
    ...((to.heading ?? from.heading) !== undefined ? { heading: to.heading ?? from.heading } : {}),
  };
}

function normalizeKeyPoints(keyPoints: WeaponTrajectoryKeyPoint[] | undefined): NormalizedTrajectoryPoint[] {
  const points = (keyPoints ?? [])
    .filter(point => point.position)
    .map((point, index, array) => ({
      progress: clamp(
        point.progress ?? (array.length <= 1 ? 0 : index / (array.length - 1)),
        0,
        1,
      ),
      position: { ...point.position },
    }))
    .sort((left, right) => left.progress - right.progress);

  if (points.length < 2) return [];
  points[0].progress = 0;
  points[points.length - 1].progress = 1;
  return points;
}

function sampleLinearKeyPoints(points: NormalizedTrajectoryPoint[], progress: number): GeoPosition {
  const exact = points.find(point => Math.abs(point.progress - progress) < 0.001);
  if (exact) return { ...exact.position };
  if (progress <= 0) return { ...points[0].position };
  if (progress >= 1) return { ...points[points.length - 1].position };
  const nextIndex = points.findIndex(point => point.progress >= progress);
  if (nextIndex <= 0) return { ...points[0].position };
  const next = points[nextIndex];
  const previous = points[nextIndex - 1];
  const localT = (progress - previous.progress) / Math.max(0.000001, next.progress - previous.progress);
  return interpolatePosition(previous.position, next.position, clamp(localT, 0, 1));
}

function catmullRom(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * b
    + (-a + c) * t
    + (2 * a - 5 * b + 4 * c - d) * t2
    + (-a + 3 * b - 3 * c + d) * t3
  );
}

function sampleCatmullRomKeyPoints(points: NormalizedTrajectoryPoint[], progress: number): GeoPosition {
  const exact = points.find(point => Math.abs(point.progress - progress) < 0.001);
  if (exact) return { ...exact.position };
  if (progress <= 0) return { ...points[0].position };
  if (progress >= 1) return { ...points[points.length - 1].position };
  const nextIndex = points.findIndex(point => point.progress >= progress);
  if (nextIndex <= 0) return { ...points[0].position };
  const p1Index = nextIndex - 1;
  const p2Index = nextIndex;
  const p0 = points[Math.max(0, p1Index - 1)];
  const p1 = points[p1Index];
  const p2 = points[p2Index];
  const p3 = points[Math.min(points.length - 1, p2Index + 1)];
  const localT = clamp((progress - p1.progress) / Math.max(0.000001, p2.progress - p1.progress), 0, 1);

  return {
    longitude: catmullRom(p0.position.longitude, p1.position.longitude, p2.position.longitude, p3.position.longitude, localT),
    latitude: catmullRom(p0.position.latitude, p1.position.latitude, p2.position.latitude, p3.position.latitude, localT),
    altitude: catmullRom(p0.position.altitude, p1.position.altitude, p2.position.altitude, p3.position.altitude, localT),
    ...((p2.position.heading ?? p1.position.heading) !== undefined ? { heading: p2.position.heading ?? p1.position.heading } : {}),
  };
}

function sampleKeyPoints(
  points: NormalizedTrajectoryPoint[],
  progress: number,
  interpolation: 'linear' | 'catmull-rom',
): GeoPosition {
  return interpolation === 'catmull-rom'
    ? sampleCatmullRomKeyPoints(points, progress)
    : sampleLinearKeyPoints(points, progress);
}

function resolveProfileAltitude(type: WeaponType, launchAlt: number, targetAlt: number, t: number): number {
  const safeLaunchAlt = Math.max(0, launchAlt);
  const safeTargetAlt = Math.max(0, targetAlt);

  if (type.startsWith('aam') || type.startsWith('sam')) {
    const apex = Math.max(safeLaunchAlt, safeTargetAlt) + Math.max(1200, Math.abs(safeLaunchAlt - safeTargetAlt) * 0.25);
    if (t < 0.35) {
      return lerp(safeLaunchAlt, apex, easeOutCubic(t / 0.35));
    }
    if (t < 0.82) {
      return lerp(apex, Math.max(safeTargetAlt, safeLaunchAlt * 0.85), (t - 0.35) / 0.47);
    }
    return lerp(Math.max(safeTargetAlt, safeLaunchAlt * 0.85), safeTargetAlt, easeInCubic((t - 0.82) / 0.18));
  }

  if (type === 'asm' || type === 'ssm' || type === 'cruise') {
    const cruiseAlt = Math.max(safeTargetAlt + 80, Math.min(safeLaunchAlt, 1200));
    if (t < 0.25) {
      return lerp(safeLaunchAlt, cruiseAlt, easeOutCubic(t / 0.25));
    }
    if (t < 0.85) {
      return cruiseAlt;
    }
    return lerp(cruiseAlt, safeTargetAlt, easeInCubic((t - 0.85) / 0.15));
  }

  if (type === 'bomb') {
    const glideHold = Math.max(safeTargetAlt + 500, safeLaunchAlt * 0.58);
    if (t < 0.65) {
      return lerp(safeLaunchAlt, glideHold, (t / 0.65) ** 1.35);
    }
    return lerp(glideHold, safeTargetAlt, easeInCubic((t - 0.65) / 0.35));
  }

  if (type === 'agm' || type === 'rocket' || type === 'ballistic') {
    const apex = Math.max(safeLaunchAlt, safeTargetAlt) + (type === 'ballistic' ? 5000 : 1600);
    const arc = Math.sin(Math.PI * t) * (apex - lerp(safeLaunchAlt, safeTargetAlt, t));
    return lerp(safeLaunchAlt, safeTargetAlt, t) + Math.max(0, arc);
  }

  return lerp(safeLaunchAlt, safeTargetAlt, t);
}

export function buildWeaponTrajectory(input: WeaponTrajectoryInput): WeaponTrajectoryResult {
  const progress = clamp(input.progress, 0, 1);
  const sampleCount = Math.max(2, Math.floor(input.sampleCount));
  const keyPoints = normalizeKeyPoints(input.keyPoints);
  const interpolation = input.interpolation ?? 'catmull-rom';
  const adjustedTargetPosition = keyPoints.length >= 2
    ? { ...keyPoints[keyPoints.length - 1].position }
    : { ...input.targetPosition };

  const trajectory = Array.from({ length: sampleCount }, (_, index) => {
    const sampleT = sampleCount === 1 ? progress : (progress * index) / (sampleCount - 1);
    if (keyPoints.length >= 2) {
      return sampleKeyPoints(keyPoints, sampleT, interpolation);
    }
    if (sampleT <= 0) return { ...input.launchPosition };
    if (sampleT >= 1) return { ...adjustedTargetPosition };

    const horizontal = interpolatePosition(input.launchPosition, adjustedTargetPosition, sampleT);
    return {
      ...horizontal,
      altitude: resolveProfileAltitude(
        input.spec.type,
        input.launchPosition.altitude,
        adjustedTargetPosition.altitude,
        sampleT,
      ),
    };
  });

  const currentPosition = trajectory[trajectory.length - 1] ?? { ...input.launchPosition };

  return {
    currentPosition,
    trajectory,
    adjustedTargetPosition,
    statusHint: input.interference ? 'degraded' : 'nominal',
  };
}
