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
  StateMachineConfig,
  StrikeTask,
  TacticalEvent,
  TacticalScenario,
  TaskConfig,
} from '../types/tactical-scenario';
import { PLATFORM_META } from '../types/tactical-scenario';

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

    return {
      entityId: entity.id,
      side,
      center: normalizePosition(zone.center ?? entity.position),
      radiusMeters: Number(zone.radiusMeters ?? zone.radius ?? 0),
      ...(zone.label ? { label: String(zone.label) } : {}),
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

  scenario.tasks = asArray<LooseRecord>(scenario.tasks)
    .map(normalizeTask)
    .filter((task): task is TaskConfig => task !== null);
  scenario.environment = normalizeEnvironment(scenario.environment as LooseRecord | undefined);
  scenario.interactions = normalizeInteractions(scenario.interactions as LooseRecord | undefined);

  if (!scenario.metadata) {
    scenario.metadata = {
      generatedAt: new Date().toISOString(),
      modelUsed: 'unknown',
      confidence: 1,
    };
  }

  return scenario;
}
