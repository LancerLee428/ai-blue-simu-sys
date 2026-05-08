import type {
  ActionNode,
  BehaviorTreeConfig,
  BehaviorTreeNode,
  CommunicationLink,
  ComponentParam,
  CompositeNode,
  DetectionZone,
  EntitySpec,
  EntityStateInPhase,
  EnvironmentConfig,
  ForceSide,
  GeoPosition,
  InstructionSeqConfig,
  Phase,
  PlatformType,
  RadarTrackingConfig,
  StateMachineConfig,
  StrikeTask,
  TacticalEvent,
  TacticalScenario,
  TaskConfig,
  VisualEffectsConfig,
  WeaponEffectConfig,
  ExplosionEffectConfig,
} from '../types/tactical-scenario';
import { PLATFORM_META } from '../types/tactical-scenario';
import {
  normalizeElectronicWarfareConfig,
  normalizeRadarTrackingConfig,
} from './runtime-visual-math';

type LooseRecord = Record<string, any>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isSide(value: unknown): value is ForceSide {
  return value === 'red' || value === 'blue';
}

function isPlatformType(value: unknown): value is PlatformType {
  return typeof value === 'string' && value in PLATFORM_META;
}

function normalizePosition(position: Partial<GeoPosition> | undefined): GeoPosition {
  return {
    longitude: Number(position?.longitude ?? 0),
    latitude: Number(position?.latitude ?? 0),
    altitude: Number(position?.altitude ?? 0),
    ...(position?.heading !== undefined ? { heading: Number(position.heading) } : {}),
    ...(position?.orbit ? { orbit: position.orbit } : {}),
  };
}

function normalizeStringArray(value: unknown): string[] {
  return asArray(value)
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
}

function isAirTarget(entity: EntitySpec | undefined): boolean {
  return entity ? PLATFORM_META[entity.type]?.operatingDomain === 'air' : false;
}

function isNavalTarget(entity: EntitySpec | undefined): boolean {
  return entity ? PLATFORM_META[entity.type]?.category === 'naval' : false;
}

function inferWeaponForAttack(attacker: EntitySpec, target: EntitySpec | undefined): string {
  if (attacker.type === 'ground-sam') return 'hq-9';
  if (attacker.type === 'ship-destroyer' || attacker.type === 'ship-frigate') {
    return isAirTarget(target) ? 'sm-6' : 'yj-18';
  }
  if (attacker.type === 'ship-submarine') return 'yj-18';
  if (attacker.type === 'uav-strike') return isNavalTarget(target) ? 'harpoon' : 'agm-154';
  if (attacker.type === 'air-bomber') return 'storm-shadow';
  if (attacker.type === 'air-fighter' || attacker.type === 'air-multirole') {
    return isAirTarget(target) ? 'aim-120d' : isNavalTarget(target) ? 'harpoon' : 'agm-88';
  }
  return 'aim-120d';
}

function inferSensorForEntity(entity: EntitySpec): string | null {
  if (entity.type.includes('radar') || entity.type === 'air-aew') return 'radar';
  if (entity.type === 'ship-submarine') return 'sonar';
  if (entity.type === 'air-jammer' || entity.type === 'ground-ew') return 'ew-suite';
  if (PLATFORM_META[entity.type]?.category === 'air' || PLATFORM_META[entity.type]?.category === 'naval') {
    return 'radar';
  }
  return null;
}

function normalizeLoadout(entity: LooseRecord): EntitySpec['loadout'] | undefined {
  const raw = entity.loadout as LooseRecord | undefined;
  const weapons = normalizeStringArray(raw?.weapons ?? entity.weapons);
  const sensors = normalizeStringArray(raw?.sensors ?? entity.sensors);

  if (weapons.length === 0 && sensors.length === 0) return undefined;
  return { weapons, sensors };
}

function normalizeParam(param: LooseRecord): ComponentParam {
  return {
    key: String(param.key ?? param.name ?? ''),
    value: param.value ?? '',
    ...(param.unit ? { unit: String(param.unit) } : {}),
  };
}

function normalizeParams(params: unknown): ComponentParam[] {
  return asArray<LooseRecord>(params).map(normalizeParam).filter(param => param.key);
}

function normalizeActionNode(node: LooseRecord): BehaviorTreeNode {
  const type = String(node.nodeType ?? node.type ?? 'action').toLowerCase();

  if (type === 'condition') {
    return {
      nodeType: 'Condition',
      name: String(node.name ?? 'condition'),
      params: normalizeParams(node.params),
    };
  }

  if (type === 'sequence' || type === 'selector' || type === 'parallel') {
    const nodeType = type === 'selector' ? 'Selector' : type === 'parallel' ? 'Parallel' : 'Sequence';
    return {
      nodeType,
      name: String(node.name ?? nodeType),
      children: asArray<LooseRecord>(node.children ?? node.nodes).map(normalizeActionNode),
    };
  }

  return {
    nodeType: 'Action',
    name: String(node.name ?? 'action'),
    component: String(node.component ?? ''),
    params: normalizeParams(node.params),
  } satisfies ActionNode;
}

function normalizeBehaviorTreeConfig(config: LooseRecord): BehaviorTreeConfig {
  const rawRoot = config.root;

  if (rawRoot && typeof rawRoot === 'object') {
    const rootNode = normalizeActionNode(rawRoot) as BehaviorTreeNode;
    if (rootNode.nodeType !== 'Action' && rootNode.nodeType !== 'Condition') {
      return { root: rootNode as CompositeNode };
    }
  }

  const rootType = String(rawRoot ?? config.rootType ?? 'sequence').toLowerCase();
  const nodeType = rootType === 'selector' ? 'Selector' : rootType === 'parallel' ? 'Parallel' : 'Sequence';

  return {
    root: {
      nodeType,
      name: String(config.name ?? 'root'),
      children: asArray<LooseRecord>(config.nodes ?? config.children).map(normalizeActionNode),
    },
  };
}

function normalizeTask(task: LooseRecord): TaskConfig | null {
  const type = task.type === 'StateMachine' || task.type === 'InstructionSeq' ? task.type : 'BehaviorTree';
  const base = {
    id: String(task.id ?? `task-${Date.now()}`),
    equipRef: String(task.equipRef ?? task.entityId ?? ''),
    name: String(task.name ?? '任务'),
    type,
  };

  if (!base.equipRef) return null;

  if (type === 'StateMachine') {
    const config = task.config ?? {};
    return {
      ...base,
      type,
      config: {
        initialState: String(config.initialState ?? ''),
        states: asArray(config.states),
      } satisfies StateMachineConfig,
    };
  }

  if (type === 'InstructionSeq') {
    const config = task.config ?? {};
    return {
      ...base,
      type,
      config: {
        instructions: asArray(config.instructions),
      } satisfies InstructionSeqConfig,
    };
  }

  return {
    ...base,
    type,
    config: normalizeBehaviorTreeConfig(task.config ?? {}),
  };
}

function normalizeEffectModel(effect: LooseRecord, index: number) {
  return {
    id: String(effect.id ?? `${effect.type ?? effect.category ?? 'effect'}-${index + 1}`),
    category: String(effect.category ?? effect.type ?? 'environment'),
    name: String(effect.name ?? effect.type ?? '环境效应'),
    enabled: effect.enabled !== false,
    params: normalizeParams(effect.params),
  };
}

function normalizeEnvironment(environment: LooseRecord | undefined): EnvironmentConfig | undefined {
  if (!environment) return undefined;

  const generationModels = environment.generationModels ?? {};
  const rawAtmosphere = generationModels.atmosphereModel ?? generationModels.atmosphere;
  const atmosphereModel = typeof rawAtmosphere === 'string'
    ? {
        weather: rawAtmosphere === 'standard' ? 'clear' : rawAtmosphere,
        rainLevel: 'none',
        windSpeed: 0,
        windDirection: 0,
        coverageArea: { lonMin: 118, lonMax: 132, latMin: 22, latMax: 30 },
        dataResolution: { latitudeStep: 1, longitudeStep: 1, altitudeStep: 1000 },
        timeStep: 600,
        modelServiceUrl: '',
        dataGenerationUrl: '',
      }
    : rawAtmosphere;

  return {
    generationModels: {
      ...(generationModels.spaceEnvironment ? { spaceEnvironment: generationModels.spaceEnvironment } : {}),
      ...(atmosphereModel ? { atmosphereModel } : {}),
    },
    effectModels: asArray<LooseRecord>(environment.effectModels).map(normalizeEffectModel),
    events: asArray(environment.events),
  };
}

function getWeaponEffectDefaults(weaponId: string): WeaponEffectConfig {
  if (weaponId === 'harpoon' || weaponId === 'yj-18') {
    return {
      weaponId,
      trailEnabled: true,
      trailColor: '#ff9a1f',
      trailWidth: 4,
      iconStyle: 'anti-ship',
    };
  }
  if (weaponId === 'agm-154') {
    return {
      weaponId,
      trailEnabled: true,
      trailColor: '#ffd27a',
      trailWidth: 3,
      iconStyle: 'bomb',
    };
  }
  if (weaponId === 'rocket') {
    return {
      weaponId,
      trailEnabled: true,
      trailColor: '#ff6b35',
      trailWidth: 3,
      iconStyle: 'rocket',
    };
  }
  return {
    weaponId,
    trailEnabled: true,
    trailColor: '#ffd24a',
    trailWidth: 3,
    iconStyle: 'missile',
  };
}

function normalizeWeaponEffect(effect: LooseRecord): WeaponEffectConfig | null {
  const weaponId = String(effect.weaponId ?? effect.id ?? '').trim();
  if (!weaponId) return null;
  const defaults = getWeaponEffectDefaults(weaponId);
  return {
    weaponId,
    trailEnabled: effect.trailEnabled !== false,
    trailColor: String(effect.trailColor ?? defaults.trailColor),
    trailWidth: Number(effect.trailWidth ?? defaults.trailWidth),
    iconStyle: effect.iconStyle === 'anti-ship' || effect.iconStyle === 'bomb' || effect.iconStyle === 'rocket'
      ? effect.iconStyle
      : defaults.iconStyle,
  };
}

function normalizeExplosionEffect(effect: LooseRecord): ExplosionEffectConfig | null {
  const type = String(effect.type ?? '').trim();
  if (type !== 'missile-impact' && type !== 'ship-impact' && type !== 'ground-impact') return null;
  const defaults = getExplosionEffectDefaults(type);
  return {
    type,
    radius: Number(effect.radius ?? defaults.radius),
    durationMs: Number(effect.durationMs ?? defaults.durationMs),
    innerColor: String(effect.innerColor ?? defaults.innerColor),
    outerColor: String(effect.outerColor ?? defaults.outerColor),
  };
}

function getExplosionEffectDefaults(type: ExplosionEffectConfig['type']): ExplosionEffectConfig {
  if (type === 'ship-impact') {
    return { type, radius: 96, durationMs: 1400, innerColor: '#ffe3a1', outerColor: '#ff3b30' };
  }
  if (type === 'ground-impact') {
    return { type, radius: 84, durationMs: 1200, innerColor: '#ffd27a', outerColor: '#ff6b35' };
  }
  return { type, radius: 72, durationMs: 1000, innerColor: '#ffd27a', outerColor: '#ff5500' };
}

function inferExplosionTypes(scenario: TacticalScenario): ExplosionEffectConfig['type'][] {
  const types = new Set<ExplosionEffectConfig['type']>(['missile-impact']);
  for (const task of scenario.strikeTasks) {
    const target = findEntity(scenario, task.targetEntityId);
    if (target && PLATFORM_META[target.type]?.category === 'naval') {
      types.add('ship-impact');
    } else if (target && PLATFORM_META[target.type]?.operatingDomain === 'ground') {
      types.add('ground-impact');
    }
  }
  return Array.from(types);
}

function normalizeVisualEffects(input: unknown, scenario: TacticalScenario): VisualEffectsConfig {
  const raw = (input ?? {}) as LooseRecord;
  const weaponIds = new Set<string>();
  for (const entity of getAllEntities(scenario)) {
    for (const weaponId of entity.loadout?.weapons ?? []) {
      weaponIds.add(weaponId);
    }
  }

  const explicitWeaponEffects = asArray<LooseRecord>(raw.weaponEffects?.items ?? raw.weaponEffects)
    .map(normalizeWeaponEffect)
    .filter((effect): effect is WeaponEffectConfig => effect !== null);
  for (const effect of explicitWeaponEffects) {
    weaponIds.delete(effect.weaponId);
  }

  const explicitExplosionEffects = asArray<LooseRecord>(raw.explosionEffects?.items ?? raw.explosionEffects)
    .map(normalizeExplosionEffect)
    .filter((effect): effect is ExplosionEffectConfig => effect !== null);
  const explicitExplosionTypes = new Set(explicitExplosionEffects.map(effect => effect.type));

  return {
    enabled: raw.enabled !== false,
    weaponEffects: {
      enabled: raw.weaponEffects?.enabled !== false,
      items: [
        ...explicitWeaponEffects,
        ...Array.from(weaponIds).map(getWeaponEffectDefaults),
      ],
    },
    explosionEffects: {
      enabled: raw.explosionEffects?.enabled !== false,
      items: [
        ...explicitExplosionEffects,
        ...inferExplosionTypes(scenario)
          .filter(type => !explicitExplosionTypes.has(type))
          .map(getExplosionEffectDefaults),
      ],
    },
    sensorEffects: {
      enabled: raw.sensorEffects?.enabled !== false,
      radarScanEnabled: raw.sensorEffects?.radarScanEnabled !== false,
      scanSpeedDegPerSec: Number(raw.sensorEffects?.scanSpeedDegPerSec ?? 60),
      beamWidthDeg: Number(raw.sensorEffects?.beamWidthDeg ?? 18),
      ...(raw.sensorEffects?.color ? { color: String(raw.sensorEffects.color) } : {}),
    },
    electronicWarfareEffects: normalizeElectronicWarfareConfig(raw.electronicWarfareEffects),
    weaponRuntime: {
      timeScaleForDemo: Number(raw.weaponRuntime?.timeScaleForDemo ?? 0.08),
      forceImpactWithinPhase: raw.weaponRuntime?.forceImpactWithinPhase !== false,
    },
    performance: {
      mode: raw.performance?.mode === 'low' || raw.performance?.mode === 'medium' || raw.performance?.mode === 'high'
        ? raw.performance.mode
        : 'medium',
      maxActiveExplosions: Number(raw.performance?.maxActiveExplosions ?? 10),
      maxActiveScans: Number(raw.performance?.maxActiveScans ?? 8),
      maxActivePulses: Number(raw.performance?.maxActivePulses ?? 4),
      maxActiveTrails: Number(raw.performance?.maxActiveTrails ?? 20),
    },
  };
}

function normalizeCommunication(comm: LooseRecord, index: number): CommunicationLink | null {
  const senderRef = comm.sender?.equipRef ?? comm.from ?? comm.source ?? comm.sender;
  const receiverRef = comm.receiver?.equipRef ?? comm.to ?? comm.target ?? comm.receiver;
  if (!senderRef || !receiverRef) return null;

  return {
    id: String(comm.id ?? `comm-${index + 1}`),
    sender: {
      equipRef: String(senderRef),
      ...(comm.sender?.component ? { component: String(comm.sender.component) } : {}),
    },
    receiver: {
      equipRef: String(receiverRef),
      ...(comm.receiver?.component ? { component: String(comm.receiver.component) } : {}),
    },
    dataType: String(comm.dataType ?? comm.type ?? 'dataLink'),
    protocol: String(comm.protocol ?? comm.type ?? 'unknown'),
    ...(comm.maxRange !== undefined ? { maxRange: Number(comm.maxRange) } : {}),
    ...(comm.dataRate !== undefined ? { dataRate: Number(comm.dataRate) } : {}),
  };
}

function normalizeInteractions(interactions: LooseRecord | undefined) {
  if (!interactions) return undefined;

  return {
    groups: asArray(interactions.groups),
    commandControl: asArray(interactions.commandControl),
    communications: asArray<LooseRecord>(interactions.communications)
      .map(normalizeCommunication)
      .filter((comm): comm is CommunicationLink => comm !== null),
    detectionLinks: asArray(interactions.detectionLinks),
  };
}

function getAllEntities(scenario: TacticalScenario): EntitySpec[] {
  return scenario.forces.flatMap(force => force.entities);
}

function findEntity(scenario: TacticalScenario, entityId: string): EntitySpec | undefined {
  return getAllEntities(scenario).find(entity => entity.id === entityId);
}

function distanceMeters(a: GeoPosition, b: GeoPosition): number {
  const earthRadius = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function findNearestEnemy(scenario: TacticalScenario, entity: EntitySpec, position: GeoPosition): EntitySpec | undefined {
  return getAllEntities(scenario)
    .filter(candidate => candidate.side !== entity.side)
    .map(candidate => ({ candidate, distance: distanceMeters(position, candidate.position) }))
    .sort((a, b) => a.distance - b.distance)[0]?.candidate;
}

function normalizeDetectionZones(scenario: TacticalScenario): DetectionZone[] {
  return asArray<LooseRecord>(scenario.detectionZones).map(zone => {
    const entity = findEntity(scenario, String(zone.entityId ?? ''));
    const side = isSide(zone.side) ? zone.side : entity?.side;
    if (!entity || !side) return null;

    const trackingInput = (zone as LooseRecord).tracking;
    const tracking = trackingInput === undefined
      ? undefined
      : normalizeRadarTrackingConfig(trackingInput as RadarTrackingConfig);

    return {
      entityId: entity.id,
      side,
      center: normalizePosition(zone.center ?? entity.position),
      radiusMeters: Number(zone.radiusMeters ?? zone.radius ?? 0),
      ...(zone.label ? { label: String(zone.label) } : {}),
      ...(tracking ? { tracking } : {}),
    };
  }).filter((zone): zone is DetectionZone => zone !== null && zone.radiusMeters > 0);
}

function normalizePhases(scenario: TacticalScenario): Phase[] {
  return asArray<LooseRecord>(scenario.phases).map((phase, index) => {
    const events = asArray<LooseRecord>(phase.events).map(event => ({
      type: event.type ?? 'movement',
      timestamp: Number(event.timestamp ?? 0),
      sourceEntityId: String(event.sourceEntityId ?? ''),
      ...(event.targetEntityId ? { targetEntityId: String(event.targetEntityId) } : {}),
      ...(event.weaponId ? { weaponId: String(event.weaponId) } : {}),
      ...(event.weaponType ? { weaponType: String(event.weaponType) } : {}),
      detail: String(event.detail ?? ''),
    } as TacticalEvent)).filter(event => event.sourceEntityId);

    const entityStates = asArray<LooseRecord>(phase.entityStates).map(state => {
      const entityId = String(state.entityId ?? '');
      if (!entityId) return null;
      return {
        entityId,
        position: normalizePosition(state.position),
        status: state.status ?? 'deployed',
        ...(state.detectionRange !== undefined ? { detectionRange: Number(state.detectionRange) } : {}),
        ...(state.attackTarget ? { attackTarget: String(state.attackTarget) } : {}),
      } as EntityStateInPhase;
    }).filter((state): state is EntityStateInPhase => state !== null);

    return {
      id: String(phase.id ?? `phase-${index + 1}`),
      name: String(phase.name ?? '行动阶段'),
      description: String(phase.description ?? ''),
      duration: Number(phase.duration ?? 60),
      events,
      entityStates,
    };
  });
}

function inferStrikeTasksFromRoutes(scenario: TacticalScenario): StrikeTask[] {
  const existing = asArray<StrikeTask>(scenario.strikeTasks);
  if (existing.length > 0) return existing;

  return asArray<LooseRecord>(scenario.routes).map((route, index) => {
    const attacker = findEntity(scenario, String(route.entityId ?? ''));
    const points = asArray<{ position: GeoPosition; timestamp?: number }>(route.points);
    const lastPoint = points[points.length - 1];
    if (!attacker || !lastPoint?.position) return null;

    const target = findNearestEnemy(scenario, attacker, normalizePosition(lastPoint.position));
    if (!target) return null;

    return {
      id: `strike-${attacker.id}-${target.id}-${index + 1}`,
      attackerEntityId: attacker.id,
      targetEntityId: target.id,
      phaseId: scenario.phases[0]?.id ?? 'phase-auto-generated',
      timestamp: Number(lastPoint.timestamp ?? scenario.phases[0]?.duration ?? 60),
      detail: `${attacker.name} 攻击 ${target.name}`,
    };
  }).filter((task): task is StrikeTask => task !== null);
}

function addAttackEventsFromStrikeTasks(scenario: TacticalScenario): void {
  if (scenario.phases.length === 0 || scenario.strikeTasks.length === 0) return;

  const phaseById = new Map(scenario.phases.map(phase => [phase.id, phase]));
  for (const task of scenario.strikeTasks) {
    const phase = phaseById.get(task.phaseId) ?? scenario.phases[0];
    const exists = phase.events.some(event =>
      event.type === 'attack'
      && event.sourceEntityId === task.attackerEntityId
      && event.targetEntityId === task.targetEntityId
    );
    if (exists) continue;

    phase.events.push({
      type: 'attack',
      timestamp: task.timestamp,
      sourceEntityId: task.attackerEntityId,
      targetEntityId: task.targetEntityId,
      detail: task.detail,
    });
  }
}

function ensureAttackLoadouts(scenario: TacticalScenario): void {
  const entities = getAllEntities(scenario);

  for (const entity of entities) {
    const sensor = inferSensorForEntity(entity);
    if (!sensor) continue;
    entity.loadout = {
      weapons: entity.loadout?.weapons ?? [],
      sensors: entity.loadout?.sensors?.length ? entity.loadout.sensors : [sensor],
    };
  }

  for (const task of scenario.strikeTasks) {
    const attacker = findEntity(scenario, task.attackerEntityId);
    const target = findEntity(scenario, task.targetEntityId);
    if (!attacker) continue;

    const existingWeapons = attacker.loadout?.weapons ?? [];
    if (existingWeapons.length > 0) continue;

    attacker.loadout = {
      weapons: [inferWeaponForAttack(attacker, target)],
      sensors: attacker.loadout?.sensors ?? [],
    };
  }
}

export function normalizeTacticalScenario(input: TacticalScenario): TacticalScenario {
  const scenario = clone(input);

  scenario.forces = asArray<LooseRecord>(scenario.forces).map(force => {
    const side = isSide(force.side) ? force.side : 'red';
    return {
      side,
      name: String(force.name ?? (side === 'red' ? '红方' : '蓝方')),
      entities: asArray<LooseRecord>(force.entities).map(entity => ({
        ...entity,
        id: String(entity.id ?? `entity-${Date.now()}`),
        name: String(entity.name ?? entity.id ?? '未命名实体'),
        type: isPlatformType(entity.type) ? entity.type : 'facility-target',
        side: isSide(entity.side) ? entity.side : side,
        position: normalizePosition(entity.position),
        loadout: normalizeLoadout(entity),
        components: asArray(entity.components),
      })),
    };
  });

  scenario.routes = asArray(scenario.routes);
  scenario.detectionZones = normalizeDetectionZones(scenario);
  scenario.phases = normalizePhases(scenario);

  if (scenario.phases.length === 0 && scenario.routes.length > 0) {
    const duration = Math.max(
      60,
      ...scenario.routes.map(route => Number(route.points?.[route.points.length - 1]?.timestamp ?? 0)),
    );
    scenario.phases = [{
      id: 'phase-auto-generated',
      name: '机动阶段',
      description: '根据路线自动生成的机动阶段',
      duration,
      events: [],
      entityStates: scenario.routes.map(route => ({
        entityId: route.entityId,
        position: normalizePosition(route.points[route.points.length - 1]?.position),
        status: 'deployed',
      })),
    }];
  }

  scenario.strikeTasks = inferStrikeTasksFromRoutes(scenario);
  addAttackEventsFromStrikeTasks(scenario);
  ensureAttackLoadouts(scenario);

  scenario.tasks = asArray<LooseRecord>(scenario.tasks)
    .map(normalizeTask)
    .filter((task): task is TaskConfig => task !== null);
  scenario.environment = normalizeEnvironment(scenario.environment as LooseRecord | undefined);
  scenario.interactions = normalizeInteractions(scenario.interactions as LooseRecord | undefined);
  scenario.visualEffects = normalizeVisualEffects((scenario as LooseRecord).visualEffects, scenario);

  if (!scenario.metadata) {
    scenario.metadata = {
      generatedAt: new Date().toISOString(),
      modelUsed: 'unknown',
      confidence: 1,
    };
  }

  return scenario;
}
