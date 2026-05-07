import type {
  EmitterVolume,
  ExecutionStatus,
  ForceSide,
  GeoPosition,
  RadarTrackingConfig,
  RadarTrackingTargetType,
} from '../types/tactical-scenario';

export interface RadarBeamMesh {
  positions: number[];
  indices: number[];
  perimeterStart: number;
  perimeterCount: number;
}

export interface RadarBeamMeshOptions {
  rangeMeters: number;
  azimuthWidthDeg: number;
  elevationMinDeg: number;
  elevationMaxDeg: number;
  segments?: number;
}

export interface RadarTrackingCandidate {
  id: string;
  category: RadarTrackingTargetType;
  position: GeoPosition;
  distanceMeters: number;
}

export interface RadarTrackingEntityInput {
  id: string;
  side: ForceSide;
  type: string;
  position: GeoPosition;
}

export interface RadarTrackingWeaponInput {
  id: string;
  launcherSide: ForceSide;
  currentPosition: GeoPosition;
}

export interface RadarScanEmitterModelOptions {
  virtualTimeMs: number;
  beamWidthDeg: number;
}

export function calculateHeadingDeg(from: GeoPosition, to: GeoPosition): number {
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const deltaLon = (to.longitude - from.longitude) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeDegrees(Math.atan2(y, x) * 180 / Math.PI);
}

export function calculateElevationDeg(from: GeoPosition, to: GeoPosition): number {
  const horizontalDistance = distanceMeters(
    { ...from, altitude: 0 },
    { ...to, altitude: 0 },
  );
  const altitudeDelta = (to.altitude ?? 0) - (from.altitude ?? 0);
  return Math.atan2(altitudeDelta, Math.max(1, horizontalDistance)) * 180 / Math.PI;
}

const DEFAULT_RADAR_TRACKING_TARGET_TYPES: RadarTrackingTargetType[] = ['enemy-aircraft', 'enemy-missile'];

const RADAR_CAPABLE_ENTITY_TYPES = new Set([
  'air-aew',
  'air-recon',
  'air-fighter',
  'air-multirole',
  'air-bomber',
  'air-jammer',
  'uav-recon',
  'uav-strike',
  'ship-carrier',
  'ship-destroyer',
  'ship-frigate',
  'ship-amphibious',
  'ground-sam',
  'ground-radar',
  'ground-ew',
  'ground-hq',
  'facility-airbase',
  'facility-port',
  'facility-radar',
]);

const AIR_TARGET_ENTITY_TYPES = new Set([
  'air-fighter',
  'air-multirole',
  'air-bomber',
  'air-jammer',
  'air-aew',
  'air-recon',
  'helo-attack',
  'helo-transport',
  'uav-strike',
  'uav-recon',
  'uav-swarm',
]);

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }
  return [];
}

function isRadarTrackingTargetType(value: unknown): value is RadarTrackingTargetType {
  return value === 'enemy-aircraft' || value === 'enemy-missile';
}

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function normalizeRadarTrackingConfig(input: unknown): RadarTrackingConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const targetTypes = asArray(raw.targetTypes)
    .filter(isRadarTrackingTargetType);

  return {
    enabled: raw.enabled !== false,
    targetTypes: targetTypes.length > 0 ? targetTypes : [...DEFAULT_RADAR_TRACKING_TARGET_TYPES],
    maxTracks: Math.max(1, Math.floor(Number(raw.maxTracks ?? 1) || 1)),
  };
}

export function distanceMeters(from: GeoPosition, to: GeoPosition): number {
  const earthRadius = 6_371_000;
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const deltaLat = (to.latitude - from.latitude) * Math.PI / 180;
  const deltaLon = (to.longitude - from.longitude) * Math.PI / 180;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const surfaceDistance = earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const altitudeDelta = (to.altitude ?? 0) - (from.altitude ?? 0);
  return Math.sqrt(surfaceDistance ** 2 + altitudeDelta ** 2);
}

export function selectRadarTrackingTargets(args: {
  radarSide: ForceSide;
  radarPosition: GeoPosition;
  rangeMeters: number;
  tracking: RadarTrackingConfig;
  entities: RadarTrackingEntityInput[];
  weapons: RadarTrackingWeaponInput[];
}): RadarTrackingCandidate[] {
  if (!args.tracking.enabled) return [];

  const targetTypes = new Set(args.tracking.targetTypes);
  const candidates: RadarTrackingCandidate[] = [];

  if (targetTypes.has('enemy-aircraft')) {
    args.entities
      .filter(entity => entity.side !== args.radarSide && AIR_TARGET_ENTITY_TYPES.has(entity.type))
      .forEach((entity) => {
        candidates.push({
          id: entity.id,
          category: 'enemy-aircraft',
          position: entity.position,
          distanceMeters: distanceMeters(args.radarPosition, entity.position),
        });
      });
  }

  if (targetTypes.has('enemy-missile')) {
    args.weapons
      .filter(weapon => weapon.launcherSide !== args.radarSide)
      .forEach((weapon) => {
        candidates.push({
          id: weapon.id,
          category: 'enemy-missile',
          position: weapon.currentPosition,
          distanceMeters: distanceMeters(args.radarPosition, weapon.currentPosition),
        });
      });
  }

  return candidates
    .filter(candidate => candidate.distanceMeters <= args.rangeMeters)
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, args.tracking.maxTracks);
}

export function tacticalAzimuthToCesiumClockDeg(azimuthDeg: number): number {
  return normalizeDegrees(90 - azimuthDeg);
}

export function getCesiumClockRangeForTacticalSector(args: {
  headingDeg: number;
  azimuthCenterDeg: number;
  azimuthWidthDeg: number;
}): { minimumClock: number; maximumClock: number } {
  const widthDeg = Math.max(0, Math.min(360, args.azimuthWidthDeg));
  if (widthDeg >= 359) {
    return { minimumClock: 0, maximumClock: Math.PI * 2 };
  }

  const centerClockDeg = tacticalAzimuthToCesiumClockDeg(args.headingDeg + args.azimuthCenterDeg);
  const minimumClockDeg = normalizeDegrees(centerClockDeg - widthDeg / 2);

  return {
    minimumClock: minimumClockDeg * Math.PI / 180,
    maximumClock: (minimumClockDeg + widthDeg) * Math.PI / 180,
  };
}

export function getScenarioVirtualTimeMs(
  phases: Array<{ duration: number }>,
  currentPhaseIndex: number,
  currentPhaseElapsedMs: number,
): number {
  const previousPhaseMs = phases
    .slice(0, Math.max(0, currentPhaseIndex))
    .reduce((total, phase) => total + Math.max(0, phase.duration) * 1000, 0);

  return previousPhaseMs + Math.max(0, currentPhaseElapsedMs);
}

export function createRadarBeamMesh(options: RadarBeamMeshOptions): RadarBeamMesh {
  const rangeMeters = Math.max(1, options.rangeMeters);
  const azimuthWidthRad = Math.max(0, Math.min(360, options.azimuthWidthDeg)) * Math.PI / 180;
  const minElevationRad = Math.max(-89, Math.min(89, options.elevationMinDeg)) * Math.PI / 180;
  const maxElevationRad = Math.max(-89, Math.min(89, options.elevationMaxDeg)) * Math.PI / 180;
  const elevationLow = Math.min(minElevationRad, maxElevationRad);
  const elevationHigh = Math.max(minElevationRad, maxElevationRad);
  const midElevation = (elevationLow + elevationHigh) / 2;
  const elevationHalfSpan = Math.max((elevationHigh - elevationLow) / 2, 1 * Math.PI / 180);
  const verticalRadius = Math.max(
    1,
    rangeMeters * Math.sin(Math.max(elevationHalfSpan, azimuthWidthRad / 2)),
  );
  const centerForward = rangeMeters * Math.cos(midElevation);
  const centerUp = rangeMeters * Math.sin(midElevation);
  const horizontalRadius = verticalRadius;
  const segments = Math.max(8, Math.round(options.segments ?? 24));
  const positions = [0, 0, 0];
  const indices: number[] = [];

  for (let index = 0; index < segments; index += 1) {
    const theta = (index / segments) * Math.PI * 2;
    const right = horizontalRadius * Math.cos(theta);
    const up = centerUp + verticalRadius * Math.sin(theta);
    positions.push(right, centerForward, up);
  }

  for (let index = 0; index < segments; index += 1) {
    const current = index + 1;
    const next = ((index + 1) % segments) + 1;
    indices.push(0, current, next);
  }

  return {
    positions,
    indices,
    perimeterStart: 1,
    perimeterCount: segments,
  };
}

export function shouldIncludeRuntimeEmitters(
  status: ExecutionStatus,
  debugVisible: boolean | null = null,
): boolean {
  return debugVisible ?? status === 'running';
}

export function shouldShowStaticDetectionVolumesForStatus(status: ExecutionStatus): boolean {
  return status === 'idle' || status === 'completed';
}

export function resolveStaticDetectionVisible(
  status: ExecutionStatus,
  debugVisible: boolean | null = null,
): boolean {
  return debugVisible ?? shouldShowStaticDetectionVolumesForStatus(status);
}

export function shouldRenderRuntimeRadarScan(
  status: ExecutionStatus,
  debugVisible: boolean | null = null,
): boolean {
  return debugVisible ?? status === 'running';
}

export function createRadarScanEmitterModel(
  emitter: EmitterVolume,
  options: RadarScanEmitterModelOptions,
): EmitterVolume {
  if (emitter.mode === 'track') {
    return {
      ...emitter,
      id: `${emitter.id}-scan`,
    };
  }

  const cycle = Math.max(1, emitter.pulseCycleMs);
  const progress = (options.virtualTimeMs % cycle) / cycle;
  const searchWidth = emitter.azimuthWidthDeg >= 359 ? 360 : emitter.azimuthWidthDeg;
  const beamWidth = Math.min(options.beamWidthDeg, searchWidth);
  const start = emitter.azimuthCenterDeg - searchWidth / 2;

  return {
    ...emitter,
    id: `${emitter.id}-scan`,
    mode: 'track',
    azimuthCenterDeg: start + searchWidth * progress,
    azimuthWidthDeg: beamWidth,
  };
}

export function shouldRenderRuntimeRadarBaseVolume(args: {
  kind: string;
  radarScanEnabled: boolean;
}): boolean {
  return args.kind !== 'radar' || !args.radarScanEnabled;
}

export function isRadarDetectionEmitterSource(args: {
  entityType: string;
  sensors?: string[];
  label?: string;
}): boolean {
  const label = args.label ?? '';
  if (label.includes('声纳') || label.toLowerCase().includes('sonar')) return false;
  if (label.includes('光学') || label.toLowerCase().includes('optical')) return false;
  if (label.includes('电子战') || label.toLowerCase().includes('ew')) return false;
  if (label.includes('雷达') || label.toLowerCase().includes('radar')) return true;

  if (args.sensors?.some(sensor => sensor.toLowerCase().includes('radar'))) return true;

  return RADAR_CAPABLE_ENTITY_TYPES.has(args.entityType);
}

export function getStaleRuntimeEmitterIds(
  renderedIds: Set<string>,
  activeIds: Set<string>,
): string[] {
  return Array.from(renderedIds).filter(id => !activeIds.has(id));
}
