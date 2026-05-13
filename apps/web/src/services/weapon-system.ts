import type {
  GeoPosition,
  Phase,
  TacticalEvent,
  TacticalScenario,
  Weapon,
  WeaponInterferenceState,
  WeaponImpactEvent,
  WeaponLaunchEvent,
  WeaponRuntimeConfig,
  WeaponSpec,
  WeaponStatus,
  WeaponTrajectoryKeyPoint,
} from '../types/tactical-scenario';
import { resolveWeaponSpecForAttack } from './weapon-database';
import { buildWeaponTrajectory } from './weapon-trajectory';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceMeters(from: GeoPosition, to: GeoPosition): number {
  const earthRadius = 6_371_000;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const horizontal = earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const vertical = to.altitude - from.altitude;
  return Math.sqrt(horizontal ** 2 + vertical ** 2);
}

function buildWeaponId(event: TacticalEvent, weaponSpec: WeaponSpec): string {
  return `weapon-${event.sourceEntityId}-${event.targetEntityId ?? 'unknown'}-${Math.round(event.timestamp * 10)}-${weaponSpec.id}`;
}

function toLaunchEvent(
  attackEvent: TacticalEvent,
  weaponId: string,
  weaponSpec: WeaponSpec,
): WeaponLaunchEvent {
  return {
    ...attackEvent,
    type: 'weapon-launch',
    weaponId,
    launcherId: attackEvent.sourceEntityId,
    targetEntityId: attackEvent.targetEntityId ?? '',
    weaponType: weaponSpec.type,
    detail: `${attackEvent.detail}，${weaponSpec.name} 已发射`,
  };
}

function toImpactEvent(
  attackEvent: TacticalEvent,
  weaponId: string,
  weaponSpec: WeaponSpec,
  hitPosition: GeoPosition,
  interference?: WeaponInterferenceState,
): WeaponImpactEvent {
  return {
    ...attackEvent,
    type: 'weapon-impact',
    weaponId,
    targetEntityId: attackEvent.targetEntityId ?? '',
    hitPosition,
    damage: Math.round(weaponSpec.warheadWeight * 10),
    weaponType: weaponSpec.type,
    detail: interference
      ? `${weaponSpec.name} 受 ${interference.jammerId} 干扰，落点偏移 ${Math.round(interference.lateralOffsetMeters)}m`
      : `${weaponSpec.name} 命中 ${attackEvent.targetEntityId ?? '目标'}`,
    ...(interference ? { interference } : {}),
  };
}

function getWeaponStatus(progress: number): WeaponStatus {
  if (progress < 0.12) return 'boosting';
  if (progress < 0.8) return 'cruising';
  return 'terminal';
}

function resolveTrajectoryKeyPoints(
  keyPoints: WeaponTrajectoryKeyPoint[] | undefined,
  launchPosition: GeoPosition,
): WeaponTrajectoryKeyPoint[] | undefined {
  if (!keyPoints || keyPoints.length < 2) return keyPoints;
  return keyPoints.map((point, index) => index === 0 || point.role === 'launch'
    ? { ...point, position: { ...launchPosition } }
    : point);
}

export interface WeaponSystemEntityPositionResolver {
  (entityId: string, timeMs?: number): GeoPosition | null;
}

export interface WeaponInterferenceResolverArgs {
  weaponId: string;
  weaponSpec: WeaponSpec;
  launcherId: string;
  launcherSide?: string | null;
  targetEntityId: string;
  launchPosition: GeoPosition;
  targetPosition: GeoPosition;
  currentTimeMs: number;
}

export interface WeaponInterferenceResolver {
  (args: WeaponInterferenceResolverArgs): WeaponInterferenceState | null;
}

export interface WeaponPhaseContext {
  scenario: TacticalScenario;
  phase: Phase;
  previousTimeMs: number;
  currentTimeMs: number;
  getEntityPositionAtTime: WeaponSystemEntityPositionResolver;
  getWeaponInterference?: WeaponInterferenceResolver;
  runtimeConfig?: WeaponRuntimeConfig;
}

export interface WeaponPhaseEvaluation {
  weapons: Weapon[];
  launches: WeaponLaunchEvent[];
  impacts: WeaponImpactEvent[];
}

export class WeaponSystem {
  estimateImpactTimeMs(args: {
    scenario: TacticalScenario;
    phase: Phase;
    attackEvent: TacticalEvent;
    getEntityPositionAtTime: WeaponSystemEntityPositionResolver;
    runtimeConfig?: WeaponRuntimeConfig;
  }): number {
    const attacker = this.findEntity(args.scenario, args.attackEvent.sourceEntityId);
    const target = args.attackEvent.targetEntityId
      ? this.findEntity(args.scenario, args.attackEvent.targetEntityId)
      : null;
    if (!attacker || !target) {
      return args.attackEvent.timestamp * 1000;
    }

    const weaponSpec = resolveWeaponSpecForAttack(attacker.loadout?.weapons, args.attackEvent.detail);
    if (!weaponSpec) {
      return args.attackEvent.timestamp * 1000;
    }
    const launchDelayMs = weaponSpec.launchDelay * 1000;
    const launchTimeMs = Math.round(args.attackEvent.timestamp * 1000 + launchDelayMs);
    const launchPosition = args.getEntityPositionAtTime(args.attackEvent.sourceEntityId, launchTimeMs) ?? attacker.position;
    const targetPosition = args.attackEvent.targetEntityId
      ? args.getEntityPositionAtTime(args.attackEvent.targetEntityId, launchTimeMs) ?? target.position
      : target.position;
    const distance = distanceMeters(launchPosition, targetPosition);
    const rawCruiseDurationMs = (distance / Math.max(weaponSpec.cruiseSpeedMps, 1)) * 1000;
    const cruiseDurationMs = rawCruiseDurationMs * Math.max(0.001, args.runtimeConfig?.timeScaleForDemo ?? 1);
    const rawImpactTimeMs = Math.round(launchTimeMs + cruiseDurationMs);

    if (args.runtimeConfig?.forceImpactWithinPhase) {
      const phaseEndMs = Math.max(args.attackEvent.timestamp * 1000 + 1, args.phase.duration * 1000);
      return Math.min(rawImpactTimeMs, phaseEndMs);
    }

    return rawImpactTimeMs;
  }

  evaluatePhase(context: WeaponPhaseContext): WeaponPhaseEvaluation {
    const launches: WeaponLaunchEvent[] = [];
    const impacts: WeaponImpactEvent[] = [];
    const weapons: Weapon[] = [];

    const attackEvents = context.phase.events.filter((event) => event.type === 'attack' && event.targetEntityId);

    for (const attackEvent of attackEvents) {
      const attacker = this.findEntity(context.scenario, attackEvent.sourceEntityId);
      const target = attackEvent.targetEntityId
        ? this.findEntity(context.scenario, attackEvent.targetEntityId)
        : null;
      if (!attacker || !target) continue;

      const weaponSpec = resolveWeaponSpecForAttack(attacker.loadout?.weapons, attackEvent.detail);
      if (!weaponSpec) continue;
      const weaponId = buildWeaponId(attackEvent, weaponSpec);
      const launchTimeMs = Math.round(attackEvent.timestamp * 1000 + weaponSpec.launchDelay * 1000);
      const launchPosition = context.getEntityPositionAtTime(attacker.id, launchTimeMs) ?? attacker.position;
      const targetPosition = context.getEntityPositionAtTime(target.id, launchTimeMs) ?? target.position;
      const impactTimeMs = this.estimateImpactTimeMs({
        scenario: context.scenario,
        phase: context.phase,
        attackEvent,
        getEntityPositionAtTime: context.getEntityPositionAtTime,
        runtimeConfig: context.runtimeConfig,
      });
      const interference = context.getWeaponInterference?.({
        weaponId,
        weaponSpec,
        launcherId: attacker.id,
        launcherSide: attacker.side,
        targetEntityId: target.id,
        launchPosition,
        targetPosition,
        currentTimeMs: context.currentTimeMs,
      }) ?? undefined;

      if (context.previousTimeMs < launchTimeMs && context.currentTimeMs >= launchTimeMs) {
        launches.push(toLaunchEvent(attackEvent, weaponId, weaponSpec));
      }

      const inFlightStart = Math.max(context.previousTimeMs, launchTimeMs);
      const inFlightEnd = Math.min(context.currentTimeMs, impactTimeMs);
      if (inFlightEnd > inFlightStart) {
        const weapon = this.buildWeapon({
          attackEvent,
          weaponId,
          weaponSpec,
          launchPosition,
          targetPosition,
          launchTimeMs,
          impactTimeMs,
          currentTimeMs: inFlightEnd,
          interference,
        });
        weapons.push(weapon);
      }

      if (context.previousTimeMs < impactTimeMs && context.currentTimeMs >= impactTimeMs) {
        const trajectoryResult = buildWeaponTrajectory({
          spec: weaponSpec,
          launchPosition,
          targetPosition,
          progress: 1,
          sampleCount: 3,
          keyPoints: resolveTrajectoryKeyPoints(attackEvent.weaponTrajectory?.points, launchPosition),
          interpolation: attackEvent.weaponTrajectory?.interpolation,
          interference,
        });
        impacts.push(toImpactEvent(
          attackEvent,
          weaponId,
          weaponSpec,
          trajectoryResult.adjustedTargetPosition,
          interference,
        ));
      }
    }

    return { weapons, launches, impacts };
  }

  private buildWeapon(args: {
    attackEvent: TacticalEvent;
    weaponId: string;
    weaponSpec: WeaponSpec;
    launchPosition: GeoPosition;
    targetPosition: GeoPosition;
    launchTimeMs: number;
    impactTimeMs: number;
    currentTimeMs: number;
    interference?: WeaponInterferenceState;
  }): Weapon {
    const durationMs = Math.max(args.impactTimeMs - args.launchTimeMs, 1);
    const progress = clamp((args.currentTimeMs - args.launchTimeMs) / durationMs, 0, 1);
    const sampleCount = Math.max(3, Math.ceil(progress * 12));
    const trajectoryResult = buildWeaponTrajectory({
      spec: args.weaponSpec,
      launchPosition: args.launchPosition,
      targetPosition: args.targetPosition,
      progress,
      sampleCount,
      keyPoints: resolveTrajectoryKeyPoints(args.attackEvent.weaponTrajectory?.points, args.launchPosition),
      interpolation: args.attackEvent.weaponTrajectory?.interpolation,
      interference: args.interference,
    });

    return {
      id: args.weaponId,
      spec: args.weaponSpec,
      launcherId: args.attackEvent.sourceEntityId,
      targetId: args.attackEvent.targetEntityId ?? '',
      launchTime: args.launchTimeMs,
      impactTime: args.impactTimeMs,
      launchPosition: { ...args.launchPosition },
      currentPosition: trajectoryResult.currentPosition,
      targetPosition: { ...trajectoryResult.adjustedTargetPosition },
      velocity: {
        x: trajectoryResult.adjustedTargetPosition.longitude - args.launchPosition.longitude,
        y: trajectoryResult.adjustedTargetPosition.latitude - args.launchPosition.latitude,
        z: trajectoryResult.adjustedTargetPosition.altitude - args.launchPosition.altitude,
      },
      status: getWeaponStatus(progress),
      trajectory: trajectoryResult.trajectory,
      fuelRemaining: clamp(1 - progress, 0, 1),
      ...(args.interference ? { interference: args.interference } : {}),
      adjustedTargetPosition: trajectoryResult.adjustedTargetPosition,
    };
  }

  private findEntity(scenario: TacticalScenario, entityId: string) {
    return scenario.forces.flatMap((force) => force.entities).find((entity) => entity.id === entityId) ?? null;
  }
}
