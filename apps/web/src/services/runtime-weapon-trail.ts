import type { GeoPosition } from '../types/tactical-scenario';

export interface RuntimeWeaponTrailInput {
  trajectory: GeoPosition[];
  currentPosition: GeoPosition;
  samplesPerSegment?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toLocalMeters(point: GeoPosition, origin: GeoPosition) {
  const metersPerDegLat = 111_320;
  const metersPerDegLon = Math.cos((origin.latitude * Math.PI) / 180) * metersPerDegLat;
  return {
    x: (point.longitude - origin.longitude) * metersPerDegLon,
    y: (point.latitude - origin.latitude) * metersPerDegLat,
    z: point.altitude - origin.altitude,
  };
}

function distanceSqToSegment(point: GeoPosition, from: GeoPosition, to: GeoPosition): number {
  const p = toLocalMeters(point, from);
  const b = toLocalMeters(to, from);
  const lengthSq = b.x ** 2 + b.y ** 2 + b.z ** 2;
  if (lengthSq <= 0.000001) return p.x ** 2 + p.y ** 2 + p.z ** 2;

  const t = clamp((p.x * b.x + p.y * b.y + p.z * b.z) / lengthSq, 0, 1);
  const dx = p.x - b.x * t;
  const dy = p.y - b.y * t;
  const dz = p.z - b.z * t;
  return dx ** 2 + dy ** 2 + dz ** 2;
}

function findCurrentSegmentIndex(points: GeoPosition[], currentPosition: GeoPosition): number {
  let bestIndex = points.length - 2;
  let bestDistanceSq = Infinity;

  for (let index = 0; index < points.length - 1; index += 1) {
    const distanceSq = distanceSqToSegment(currentPosition, points[index], points[index + 1]);
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = index;
    }
  }

  return bestIndex;
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

function smoothValue(a: number, b: number, c: number, d: number, t: number): number {
  return clamp(catmullRom(a, b, c, d, t), Math.min(b, c), Math.max(b, c));
}

function interpolateSmooth(points: GeoPosition[], index: number, t: number): GeoPosition {
  const p0 = points[Math.max(0, index - 1)];
  const p1 = points[index];
  const p2 = points[index + 1];
  const p3 = points[Math.min(points.length - 1, index + 2)];
  const heading = p2.heading ?? p1.heading;

  return {
    longitude: smoothValue(p0.longitude, p1.longitude, p2.longitude, p3.longitude, t),
    latitude: smoothValue(p0.latitude, p1.latitude, p2.latitude, p3.latitude, t),
    altitude: smoothValue(p0.altitude, p1.altitude, p2.altitude, p3.altitude, t),
    ...(heading !== undefined ? { heading } : {}),
  };
}

function smoothTrailPoints(points: GeoPosition[], samplesPerSegment: number): GeoPosition[] {
  if (points.length <= 2) return points.map(point => ({ ...point }));

  const samples: GeoPosition[] = [{ ...points[0] }];
  for (let index = 0; index < points.length - 1; index += 1) {
    for (let step = 1; step <= samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      samples.push(step === samplesPerSegment
        ? { ...points[index + 1] }
        : interpolateSmooth(points, index, t));
    }
  }

  return samples;
}

function hasDifferentPosition(point: GeoPosition, previous: GeoPosition): boolean {
  return point.longitude !== previous.longitude
    || point.latitude !== previous.latitude
    || point.altitude !== previous.altitude;
}

export function buildRuntimeWeaponTrail(input: RuntimeWeaponTrailInput): GeoPosition[] {
  const trajectory = input.trajectory.filter(Boolean);
  if (trajectory.length === 0) return [{ ...input.currentPosition }];
  if (trajectory.length === 1) {
    return hasDifferentPosition(input.currentPosition, trajectory[0])
      ? [{ ...trajectory[0] }, { ...input.currentPosition }]
      : [{ ...trajectory[0] }];
  }

  const currentSegmentIndex = findCurrentSegmentIndex(trajectory, input.currentPosition);
  const visitedPoints = [
    ...trajectory.slice(0, currentSegmentIndex + 1).map(point => ({ ...point })),
    { ...input.currentPosition },
  ];
  const deduped = visitedPoints.filter((point, index, points) =>
    index === 0 || hasDifferentPosition(point, points[index - 1])
  );
  const samplesPerSegment = Math.max(4, Math.floor(input.samplesPerSegment ?? 10));

  return smoothTrailPoints(deduped, samplesPerSegment);
}
