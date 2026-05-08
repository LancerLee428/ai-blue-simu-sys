import type {
  GeoPosition,
  Phase,
  TacticalEvent,
  TacticalScenario,
  Weapon,
  WeaponImpactEvent,
  WeaponLaunchEvent,
  WeaponRuntimeConfig,
  WeaponSpec,
  WeaponStatus,
} from '../types/tactical-scenario';
import { resolveWeaponSpecForAttack } from './weapon-database';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPosition(from: GeoPosition, to: GeoPosition, t: number): GeoPosition {
  return {
    longitude: lerp(from.longitude, to.longitude, t),
    latitude: lerp(from.latitude, to.latitude, t),
    altitude: lerp(from.altitude, to.altitude, t),
    heading: to.heading ?? from.heading,
  };
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
): WeaponImpactEvent {
  return {
    ...attackEvent,
    type: 'weapon-impact',
    weaponId,
    targetEntityId: attackEvent.targetEntityId ?? '',
    hitPosition,
    damage: Math.round(weaponSpec.warheadWeight * 10),
    weaponType: weaponSpec.type,
    detail: `${weaponSpec.name} 命中 ${attackEvent.targetEntityId ?? '目标'}`,
  };
}

function getWeaponStatus(progress: number): WeaponStatus {
  if (progress < 0.12) return 'boosting';
  if (progress < 0.8) return 'cruising';
  return 'terminal';
}

export interface WeaponSystemEntityPositionResolver {
  (entityId: string): GeoPosition | null;
}

export interface WeaponPhaseContext {
  scenario: TacticalScenario;
  phase: Phase;
  previousTimeMs: number;
  currentTimeMs: number;
  getEntityPositionAtTime: WeaponSystemEntityPositionResolver;
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

    const launchPosition = attacker.position;
    const targetPosition = target.position;
    const weaponSpec = resolveWeaponSpecForAttack(attacker.loadout?.weapons, args.attackEvent.detail);
    if (!weaponSpec) {
      return args.attackEvent.timestamp * 1000;
    }
    const launchDelayMs = weaponSpec.launchDelay * 1000;
    const distance = distanceMeters(launchPosition, targetPosition);
    const rawCruiseDurationMs = (distance / Math.max(weaponSpec.cruiseSpeedMps, 1)) * 1000;
    const cruiseDurationMs = rawCruiseDurationMs * Math.max(0.001, args.runtimeConfig?.timeScaleForDemo ?? 1);
    const rawImpactTimeMs = Math.round(args.attackEvent.timestamp * 1000 + launchDelayMs + cruiseDurationMs);

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
      const launchPosition = context.getEntityPositionAtTime(attacker.id) ?? attacker.position;
      const targetPosition = context.getEntityPositionAtTime(target.id) ?? target.position;
      const impactTimeMs = this.estimateImpactTimeMs({
        scenario: context.scenario,
        phase: context.phase,
        attackEvent,
        getEntityPositionAtTime: context.getEntityPositionAtTime,
        runtimeConfig: context.runtimeConfig,
      });

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
        });
        weapons.push(weapon);
      }

      if (context.previousTimeMs < impactTimeMs && context.currentTimeMs >= impactTimeMs) {
        impacts.push(toImpactEvent(attackEvent, weaponId, weaponSpec, targetPosition));
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
  }): Weapon {
    const durationMs = Math.max(args.impactTimeMs - args.launchTimeMs, 1);
    const progress = clamp((args.currentTimeMs - args.launchTimeMs) / durationMs, 0, 1);
    const currentPosition = lerpPosition(args.launchPosition, args.targetPosition, progress);
    const sampleCount = Math.max(3, Math.ceil(progress * 12));
    const trajectory = Array.from({ length: sampleCount }, (_, index) => {
      const sampleT = sampleCount === 1 ? progress : (progress * index) / (sampleCount - 1);
      return lerpPosition(args.launchPosition, args.targetPosition, sampleT);
    });

    return {
      id: args.weaponId,
      spec: args.weaponSpec,
      launcherId: args.attackEvent.sourceEntityId,
      targetId: args.attackEvent.targetEntityId ?? '',
      launchTime: args.launchTimeMs,
      impactTime: args.impactTimeMs,
      launchPosition: { ...args.launchPosition },
      currentPosition,
      targetPosition: { ...args.targetPosition },
      velocity: {
        x: args.targetPosition.longitude - args.launchPosition.longitude,
        y: args.targetPosition.latitude - args.launchPosition.latitude,
        z: args.targetPosition.altitude - args.launchPosition.altitude,
      },
      status: getWeaponStatus(progress),
      trajectory,
      fuelRemaining: clamp(1 - progress, 0, 1),
    };
  }

  private findEntity(scenario: TacticalScenario, entityId: string) {
    return scenario.forces.flatMap((force) => force.entities).find((entity) => entity.id === entityId) ?? null;
  }
}
