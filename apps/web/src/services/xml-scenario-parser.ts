// apps/web/src/services/xml-scenario-parser.ts
import type {
  TacticalScenario,
  EntitySpec,
  EquipmentComponent,
  ComponentParam,
  ScenarioMetadata,
  TaskConfig,
  BehaviorTreeConfig,
  BehaviorTreeNode,
  CompositeNode,
  ActionNode,
  ConditionNode,
  StateMachineConfig,
  MachineState,
  StateAction,
  InstructionSeqConfig,
  EnvironmentConfig,
  SpaceEnvironmentConfig,
  AtmosphereModelConfig,
  EffectModel,
  EnvironmentEvent,
  InteractionConfig,
  EquipmentGroup,
  GroupMember,
  CommandControlLink,
  CommunicationLink,
  DetectionLink,
  GeoPosition,
  KeplerianOrbit,
  Route,
  DetectionZone,
  StrikeTask,
  Phase,
  TacticalEvent,
  EntityStateInPhase,
  EntityStatus,
  TacticalEventType,
  VisualEffectsConfig,
  WeaponEffectConfig,
  ExplosionEffectConfig,
  RadarTrackingConfig,
} from '../types/tactical-scenario';
import type { PlatformType, ForceSide } from '../types/tactical-scenario';
import { keplerianToGeodetic } from './orbit-calculator';
import { normalizeRadarTrackingConfig } from './runtime-visual-math';

function getText(el: Element | null | undefined, selector: string): string {
  return el?.querySelector(selector)?.textContent?.trim() ?? '';
}

function getFloat(el: Element | null | undefined, selector: string): number {
  return parseFloat(el?.querySelector(selector)?.textContent?.trim() ?? '0') || 0;
}

function getInt(el: Element | null | undefined, selector: string): number {
  return parseInt(el?.querySelector(selector)?.textContent?.trim() ?? '0', 10) || 0;
}

function getAttrFloat(el: Element | null | undefined, attr: string): number {
  return parseFloat(el?.getAttribute(attr) ?? '0') || 0;
}

function getAttrText(el: Element | null | undefined, attr: string): string {
  return el?.getAttribute(attr)?.trim() ?? '';
}

function parseParams(el: Element | null | undefined): ComponentParam[] {
  if (!el) return [];
  return Array.from(el.querySelectorAll(':scope > Param')).map(p => ({
    key: p.getAttribute('key') ?? '',
    value: p.textContent?.trim() ?? '',
    unit: p.getAttribute('unit') ?? undefined,
  }));
}

function isMoverComponentType(type: string): boolean {
  return type.endsWith('_mover') || type === 'faclity_mover';
}

function hasChild(el: Element | null | undefined, selector: string): boolean {
  return Boolean(el?.querySelector(selector));
}

function parseComponents(equipEl: Element): EquipmentComponent[] {
  const componentsEl = equipEl.querySelector(':scope > Components');
  if (!componentsEl) return [];

  return Array.from(componentsEl.querySelectorAll(':scope > Component')).map(c => {
    const comp: EquipmentComponent = {
      id: c.getAttribute('id') ?? '',
      name: getText(c, 'Name'),
      type: getText(c, 'Type'),
    };

    const perfEl = c.querySelector(':scope > PerformanceParams');
    if (perfEl) comp.performanceParams = parseParams(perfEl);

    const dynEl = c.querySelector(':scope > DynamicParams');
    if (dynEl) comp.dynamicParams = parseParams(dynEl);

    const initParamsEl = c.querySelector(':scope > InitialParams');
    if (initParamsEl) comp.initialParams = parseParams(initParamsEl);

    const initStateEl = c.querySelector(':scope > InitialState');
    if (initStateEl) {
      const posType = getText(initStateEl, 'PositionType') || getText(initStateEl, 'OrbitType');
      if (posType === 'Geodetic') {
        comp.initialState = {
          positionType: 'Geodetic',
          longitude: getFloat(initStateEl, 'Longitude'),
          latitude: getFloat(initStateEl, 'Latitude'),
          altitude: getFloat(initStateEl, 'Altitude'),
        };
      } else if (posType === 'Keplerian') {
        comp.initialState = {
          positionType: 'Keplerian',
          orbitType: 'Keplerian',
          semiMajorAxis: getFloat(initStateEl, 'SemiMajorAxis'),
          eccentricity: getFloat(initStateEl, 'Eccentricity'),
          inclination: getFloat(initStateEl, 'Inclination'),
          raan: getFloat(initStateEl, 'RAAN'),
          argOfPerigee: getFloat(initStateEl, 'ArgOfPerigee'),
          trueAnomaly: getFloat(initStateEl, 'TrueAnomaly'),
          epoch: getText(initStateEl, 'Epoch'),
        };
      }
    }

    return comp;
  });
}

function parseLoadout(equipEl: Element): EntitySpec['loadout'] | undefined {
  const loadoutEl = equipEl.querySelector(':scope > Loadout');
  if (!loadoutEl) return undefined;

  const weapons = Array.from(loadoutEl.querySelectorAll(':scope > Weapons > Weapon'))
    .map(weaponEl => getAttrText(weaponEl, 'id') || weaponEl.textContent?.trim() || '')
    .filter(Boolean);
  const sensors = Array.from(loadoutEl.querySelectorAll(':scope > Sensors > Sensor'))
    .map(sensorEl => getAttrText(sensorEl, 'id') || sensorEl.textContent?.trim() || '')
    .filter(Boolean);

  if (weapons.length === 0 && sensors.length === 0) return undefined;
  return { weapons, sensors };
}

function parsePosition(equipEl: Element): GeoPosition {
  const moverEl = equipEl.querySelector(
    'Component[id*="mover"], Components > Component'
  );
  // 找到 space_mover 或 faclity_mover 组件
  const components = Array.from(equipEl.querySelectorAll('Components > Component'));
  const mover = components.find(c => {
    const t = getText(c, 'Type');
    return isMoverComponentType(t);
  }) ?? components.find(c => {
    const initStateEl = c.querySelector('InitialState');
    return hasChild(initStateEl, 'Longitude') && hasChild(initStateEl, 'Latitude');
  }) ?? moverEl;

  if (!mover) return { longitude: 0, latitude: 0, altitude: 0 };

  const initStateEl = mover.querySelector('InitialState');
  if (!initStateEl) return { longitude: 0, latitude: 0, altitude: 0 };

  const posType = getText(initStateEl, 'PositionType');
  const orbitType = getText(initStateEl, 'OrbitType');

  if (posType === 'Geodetic' || (hasChild(initStateEl, 'Longitude') && hasChild(initStateEl, 'Latitude'))) {
    const heading = getFloat(initStateEl, 'Heading') || getFloat(initStateEl, 'heading') || undefined;
    // 严格按照 XML 中的经纬高，不做任何修改
    return {
      longitude: getFloat(initStateEl, 'Longitude'),
      latitude: getFloat(initStateEl, 'Latitude'),
      altitude: getFloat(initStateEl, 'Altitude'),
      ...(heading !== undefined ? { heading } : {}),
    };
  }

  if (orbitType === 'Keplerian') {
    const orbit: KeplerianOrbit = {
      type: 'Keplerian',
      semiMajorAxis: getFloat(initStateEl, 'SemiMajorAxis'),
      eccentricity: getFloat(initStateEl, 'Eccentricity'),
      inclination: getFloat(initStateEl, 'Inclination'),
      raan: getFloat(initStateEl, 'RAAN'),
      argOfPerigee: getFloat(initStateEl, 'ArgOfPerigee'),
      trueAnomaly: getFloat(initStateEl, 'TrueAnomaly'),
      epoch: getText(initStateEl, 'Epoch'),
    };
    // 用开普勒根数计算 epoch 时刻的真实经纬高
    const geodetic = keplerianToGeodetic(orbit, 0);
    return { ...geodetic, orbit };
  }

  return { longitude: 0, latitude: 0, altitude: 0 };
}

function inferPlatformType(equipmentName: string, components: EquipmentComponent[], modelId: string | undefined): PlatformType {
  const haystack = [
    modelId,
    equipmentName,
    ...components.flatMap(component => [component.name, component.type]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(航母|carrier|出云|山东舰)/i.test(haystack)) return 'ship-carrier';
  if (/(驱逐舰|destroyer|055|摩耶)/i.test(haystack)) return 'ship-destroyer';
  if (/(潜艇|submarine|093|underwater)/i.test(haystack)) return 'ship-submarine';
  if (/(歼-16d|jammer|电子战)/i.test(haystack)) return 'air-jammer';
  if (/(预警机|aew|e-2c)/i.test(haystack)) return 'air-aew';
  if (/(无人机|uav|攻击-11)/i.test(haystack)) return 'uav-strike';
  if (/(战斗机|fighter|歼-16|f-15)/i.test(haystack)) return 'air-fighter';
  if (/(坦克|tank|99a)/i.test(haystack)) return 'ground-tank';
  if (/(自行火炮|spg|plz)/i.test(haystack)) return 'ground-spg';
  if (/(防空|sam|爱国者|hq-9|红旗)/i.test(haystack)) return 'ground-sam';
  if (/(雷达|radar|tpy)/i.test(haystack)) return 'ground-radar';
  if (/(sat|recon|dut)/i.test(haystack)) return 'uav-recon';
  if (/(ground|station)/i.test(haystack)) return 'facility-radar';
  return 'facility-command';
}

function parseEquipments(doc: Document, tag: 'Participating' | 'Supporting'): EntitySpec[] {
  const side: ForceSide = tag === 'Participating' ? 'red' : 'blue';
  const container = doc.querySelector(tag);
  if (!container) return [];

  return Array.from(container.querySelectorAll(':scope > Equipment')).map(eq => {
    const modelId = getText(eq, 'ModelId') || undefined;
    const name = getText(eq, 'Name');
    const components = parseComponents(eq);
    const entity: EntitySpec = {
      id: eq.getAttribute('id') ?? `equip-${Date.now()}`,
      name,
      type: inferPlatformType(name, components, modelId),
      side,
      position: parsePosition(eq),
      modelId,
      modelType: getText(eq, 'ModelType') || undefined,
      interfaceProtocol: getText(eq, 'InterfaceProtocol') || undefined,
      federateName: getText(eq, 'FederateName') || undefined,
      components,
      loadout: parseLoadout(eq),
      taskRef: eq.querySelector('TaskRef')?.getAttribute('taskId') ?? undefined,
    };
    return entity;
  });
}

function parseBehaviorTreeNode(el: Element): BehaviorTreeNode {
  const tag = el.tagName;

  if (tag === 'ActionNode') {
    const node: ActionNode = {
      nodeType: 'Action',
      name: el.getAttribute('name') ?? '',
      component: el.getAttribute('component') ?? '',
      params: parseParams(el.querySelector('Params')),
    };
    return node;
  }

  if (tag === 'ConditionNode') {
    const node: ConditionNode = {
      nodeType: 'Condition',
      name: el.getAttribute('name') ?? '',
      params: parseParams(el.querySelector('Params')),
    };
    return node;
  }

  // Sequence / Selector / Parallel
  const nodeType = tag as 'Sequence' | 'Selector' | 'Parallel';
  const children: BehaviorTreeNode[] = Array.from(el.children)
    .filter(c => ['ActionNode', 'ConditionNode', 'Sequence', 'Selector', 'Parallel'].includes(c.tagName))
    .map(c => parseBehaviorTreeNode(c));

  const node: CompositeNode = {
    nodeType,
    name: el.getAttribute('name') ?? '',
    children,
  };
  return node;
}

function parseBehaviorTree(taskEl: Element): BehaviorTreeConfig {
  const rootEl = taskEl.querySelector('BehaviorTree > Root');
  if (!rootEl) {
    return { root: { nodeType: 'Sequence', name: 'root', children: [] } };
  }
  const rootType = (rootEl.getAttribute('type') ?? 'Sequence') as 'Sequence' | 'Selector' | 'Parallel';
  const children: BehaviorTreeNode[] = Array.from(rootEl.children)
    .filter(c => ['ActionNode', 'ConditionNode', 'Sequence', 'Selector', 'Parallel'].includes(c.tagName))
    .map(c => parseBehaviorTreeNode(c));

  return {
    root: {
      nodeType: rootType,
      name: rootEl.getAttribute('name') ?? 'root',
      children,
    },
  };
}

function parseStateMachine(taskEl: Element): StateMachineConfig {
  const smEl = taskEl.querySelector('StateMachine');
  if (!smEl) return { initialState: '', states: [] };

  const states: MachineState[] = Array.from(smEl.querySelectorAll(':scope > State')).map(s => {
    const parseAction = (el: Element | null): StateAction | undefined => {
      if (!el) return undefined;
      return {
        component: el.getAttribute('component') ?? '',
        params: parseParams(el.querySelector('Params')),
      };
    };

    return {
      name: s.getAttribute('name') ?? '',
      entryAction: parseAction(s.querySelector('EntryAction')),
      exitAction: parseAction(s.querySelector('ExitAction')),
      transitions: Array.from(s.querySelectorAll('Transition')).map(t => ({
        event: t.getAttribute('event') ?? '',
        target: t.getAttribute('target') ?? '',
      })),
    };
  });

  return {
    initialState: smEl.getAttribute('initialState') ?? '',
    states,
  };
}

function parseInstructionSeq(taskEl: Element): InstructionSeqConfig {
  const seqEl = taskEl.querySelector('InstructionSequence');
  if (!seqEl) return { instructions: [] };

  return {
    instructions: Array.from(seqEl.querySelectorAll(':scope > Instruction')).map(ins => ({
      id: ins.getAttribute('id') ?? '',
      time: ins.getAttribute('time') ?? '',
      type: getText(ins, 'Type'),
      component: getText(ins, 'Component'),
      params: parseParams(ins.querySelector('Params')),
    })),
  };
}

function parseTasks(doc: Document): TaskConfig[] {
  const tasksEl = doc.querySelector('Tasks');
  if (!tasksEl) return [];

  return Array.from(tasksEl.querySelectorAll(':scope > Task')).map(t => {
    const type = t.getAttribute('type') as TaskConfig['type'];
    let config: TaskConfig['config'];

    if (type === 'BehaviorTree') config = parseBehaviorTree(t);
    else if (type === 'StateMachine') config = parseStateMachine(t);
    else config = parseInstructionSeq(t);

    return {
      id: t.getAttribute('id') ?? '',
      equipRef: t.getAttribute('equipRef') ?? '',
      name: getText(t, 'Name'),
      type,
      config,
    };
  });
}

function parseEnvironment(doc: Document): EnvironmentConfig | undefined {
  const envEl = doc.querySelector('Environment');
  if (!envEl) return undefined;

  // SpaceEnvironment
  const spaceEl = envEl.querySelector('SpaceEnvironment');
  let spaceEnvironment: SpaceEnvironmentConfig | undefined;
  if (spaceEl) {
    spaceEnvironment = {
      solarActivity: {
        fluxLevel: getFloat(spaceEl, 'FluxLevel'),
        sunspotNumber: getFloat(spaceEl, 'SunspotNumber'),
      },
      geomagneticField: {
        kpIndex: getFloat(spaceEl, 'KpIndex'),
        apIndex: getFloat(spaceEl, 'ApIndex'),
      },
      ionosphere: {
        modelType: getText(spaceEl, 'ModelType'),
        totalElectronContent: getFloat(spaceEl, 'TotalElectronContent'),
      },
      dataResolution: {
        latitudeStep: getFloat(spaceEl.querySelector('DataResolution'), 'LatitudeStep'),
        longitudeStep: getFloat(spaceEl.querySelector('DataResolution'), 'LongitudeStep'),
        altitudeStep: getFloat(spaceEl.querySelector('DataResolution'), 'AltitudeStep'),
      },
      timeStep: getFloat(spaceEl, 'TimeStep'),
      modelServiceUrl: getText(spaceEl, 'ModelServiceUrl'),
      dataGenerationUrl: getText(spaceEl, 'DataGenerationUrl'),
    };
  }

  // AtmosphereModel
  const atmosEl = envEl.querySelector('AtmosphereModel, Atmosphere');
  let atmosphereModel: AtmosphereModelConfig | undefined;
  if (atmosEl) {
    const coverEl = atmosEl.querySelector('CoverageArea');
    const resEl = atmosEl.querySelector('DataResolution');
    atmosphereModel = {
      weather: getText(atmosEl, 'Weather'),
      rainLevel: getText(atmosEl, 'RainLevel'),
      windSpeed: getFloat(atmosEl, 'WindSpeed'),
      windDirection: getFloat(atmosEl, 'WindDirection'),
      coverageArea: {
        lonMin: getFloat(coverEl, 'LonMin'),
        lonMax: getFloat(coverEl, 'LonMax'),
        latMin: getFloat(coverEl, 'LatMin'),
        latMax: getFloat(coverEl, 'LatMax'),
      },
      dataResolution: {
        latitudeStep: getFloat(resEl, 'LatitudeStep'),
        longitudeStep: getFloat(resEl, 'LongitudeStep'),
        altitudeStep: getFloat(resEl, 'AltitudeStep'),
      },
      timeStep: getFloat(atmosEl, 'TimeStep'),
      modelServiceUrl: getText(atmosEl, 'ModelServiceUrl'),
      dataGenerationUrl: getText(atmosEl, 'DataGenerationUrl'),
    };
  }

  // EffectModels
  const effectModels: EffectModel[] = Array.from(
    envEl.querySelectorAll('EffectModels > EffectModel')
  ).map(e => ({
    id: e.getAttribute('id') ?? '',
    category: e.getAttribute('category') ?? '',
    name: getText(e, 'Name'),
    enabled: getText(e, 'Enabled').toLowerCase() === 'true',
    params: parseParams(e.querySelector('Params')),
  }));

  // Events
  const events: EnvironmentEvent[] = Array.from(
    envEl.querySelectorAll('Events > Event')
  ).map(e => {
    const areaEl = e.querySelector('AffectedArea');
    return {
      id: e.getAttribute('id') ?? '',
      name: getText(e, 'Name'),
      startTime: getText(e, 'StartTime'),
      endTime: getText(e, 'EndTime'),
      type: getText(e, 'Type'),
      level: getInt(e, 'Level'),
      affectedArea: areaEl ? {
        lonMin: getFloat(areaEl, 'LonMin'),
        lonMax: getFloat(areaEl, 'LonMax'),
        latMin: getFloat(areaEl, 'LatMin'),
        latMax: getFloat(areaEl, 'LatMax'),
      } : undefined,
      params: parseParams(e.querySelector('Params')),
    };
  });

  return {
    generationModels: { spaceEnvironment, atmosphereModel },
    effectModels,
    events,
  };
}

function parseVisualEffects(doc: Document): VisualEffectsConfig | undefined {
  const effectsEl = doc.querySelector('VisualEffects');
  if (!effectsEl) return undefined;

  const weaponEffectsEl = effectsEl.querySelector(':scope > WeaponEffects');
  const explosionEffectsEl = effectsEl.querySelector(':scope > ExplosionEffects');
  const sensorEffectsEl = effectsEl.querySelector(':scope > SensorEffects');
  const ewEffectsEl = effectsEl.querySelector(':scope > ElectronicWarfareEffects');
  const weaponRuntimeEl = effectsEl.querySelector(':scope > WeaponRuntime');
  const performanceEl = effectsEl.querySelector(':scope > Performance');
  const performanceMode = getAttrText(performanceEl, 'mode');

  const weaponItems: WeaponEffectConfig[] = Array.from(
    effectsEl.querySelectorAll(':scope > WeaponEffects > WeaponEffect')
  ).map(effectEl => ({
    weaponId: getAttrText(effectEl, 'weaponId') || getAttrText(effectEl, 'id'),
    trailEnabled: getAttrText(effectEl, 'trailEnabled') !== 'false',
    trailColor: getAttrText(effectEl, 'trailColor') || '#ffd24a',
    trailWidth: getAttrFloat(effectEl, 'trailWidth') || 3,
    iconStyle: (getAttrText(effectEl, 'iconStyle') || 'missile') as WeaponEffectConfig['iconStyle'],
  })).filter(effect => effect.weaponId);

  const explosionItems: ExplosionEffectConfig[] = Array.from(
    effectsEl.querySelectorAll(':scope > ExplosionEffects > ExplosionEffect')
  ).map(effectEl => ({
    type: (getAttrText(effectEl, 'type') || 'missile-impact') as ExplosionEffectConfig['type'],
    radius: getAttrFloat(effectEl, 'radius') || 72,
    durationMs: getAttrFloat(effectEl, 'durationMs') || 1000,
    innerColor: getAttrText(effectEl, 'innerColor') || '#ffd27a',
    outerColor: getAttrText(effectEl, 'outerColor') || '#ff5500',
  }));

  return {
    enabled: getAttrText(effectsEl, 'enabled') !== 'false',
    weaponEffects: {
      enabled: getAttrText(weaponEffectsEl, 'enabled') !== 'false',
      items: weaponItems,
    },
    explosionEffects: {
      enabled: getAttrText(explosionEffectsEl, 'enabled') !== 'false',
      items: explosionItems,
    },
    sensorEffects: {
      enabled: getAttrText(sensorEffectsEl, 'enabled') !== 'false',
      radarScanEnabled: getAttrText(sensorEffectsEl, 'radarScanEnabled') !== 'false',
      scanSpeedDegPerSec: getAttrFloat(sensorEffectsEl, 'scanSpeedDegPerSec') || 60,
      beamWidthDeg: getAttrFloat(sensorEffectsEl, 'beamWidthDeg') || 18,
      ...(getAttrText(sensorEffectsEl, 'color') ? { color: getAttrText(sensorEffectsEl, 'color') } : {}),
    },
    electronicWarfareEffects: {
      enabled: getAttrText(ewEffectsEl, 'enabled') !== 'false',
      pulseEnabled: getAttrText(ewEffectsEl, 'pulseEnabled') !== 'false',
      pulseColor: getAttrText(ewEffectsEl, 'pulseColor') || '#ff9f1c',
      pulseDurationMs: getAttrFloat(ewEffectsEl, 'pulseDurationMs') || 2200,
    },
    weaponRuntime: {
      timeScaleForDemo: getAttrFloat(weaponRuntimeEl, 'timeScaleForDemo') || 0.08,
      forceImpactWithinPhase: getAttrText(weaponRuntimeEl, 'forceImpactWithinPhase') !== 'false',
    },
    performance: {
      mode: performanceMode === 'high' || performanceMode === 'medium' || performanceMode === 'low'
        ? performanceMode
        : 'medium',
      maxActiveExplosions: getAttrFloat(performanceEl, 'maxActiveExplosions') || 10,
      maxActiveScans: getAttrFloat(performanceEl, 'maxActiveScans') || 8,
      maxActivePulses: getAttrFloat(performanceEl, 'maxActivePulses') || 4,
      maxActiveTrails: getAttrFloat(performanceEl, 'maxActiveTrails') || 20,
    },
  };
}

function parseInteractions(doc: Document): InteractionConfig | undefined {
  const intEl = doc.querySelector('Interactions');
  if (!intEl) return undefined;

  // Groups
  const groups: EquipmentGroup[] = Array.from(
    intEl.querySelectorAll('Groups > Group')
  ).map(g => {
    const members: GroupMember[] = Array.from(g.querySelectorAll('Member')).map(m => ({
      equipRef: m.getAttribute('equipRef') ?? '',
      role: m.getAttribute('role') ?? undefined,
    }));
    return {
      id: g.getAttribute('id') ?? '',
      name: g.getAttribute('name') ?? '',
      members,
    };
  });

  // CommandControl
  const commandControl: CommandControlLink[] = Array.from(
    intEl.querySelectorAll('CommandControl > Link')
  ).map(l => ({
    id: l.getAttribute('id') ?? '',
    commander: l.querySelector('Commander')?.getAttribute('equipRef') ?? '',
    subordinate: l.querySelector('Subordinate')?.getAttribute('equipRef') ?? '',
    protocol: getText(l, 'Protocol'),
    latency: getFloat(l, 'Latency') || undefined,
  }));

  // Communications
  const communications: CommunicationLink[] = Array.from(
    intEl.querySelectorAll('Communications > Link')
  ).map(l => ({
    id: l.getAttribute('id') ?? '',
    sender: {
      equipRef: l.querySelector('Sender')?.getAttribute('equipRef') ?? '',
      component: l.querySelector('Sender')?.getAttribute('component') ?? undefined,
    },
    receiver: {
      equipRef: l.querySelector('Receiver')?.getAttribute('equipRef') ?? '',
      component: l.querySelector('Receiver')?.getAttribute('component') ?? undefined,
    },
    dataType: getText(l, 'DataType'),
    protocol: getText(l, 'Protocol'),
    maxRange: getFloat(l, 'MaxRange') || undefined,
    dataRate: getFloat(l, 'DataRate') || undefined,
  }));

  // DetectionLinks
  const detectionLinks: DetectionLink[] = Array.from(
    intEl.querySelectorAll('DetectionLinks > Link')
  ).map(l => ({
    id: l.getAttribute('id') ?? '',
    observer: {
      equipRef: l.querySelector('Observer')?.getAttribute('equipRef') ?? '',
      component: l.querySelector('Observer')?.getAttribute('component') ?? undefined,
    },
    target: l.querySelector('Target')?.getAttribute('equipRef') ?? '',
    sensorType: getText(l, 'SensorType'),
  }));

  return { groups, commandControl, communications, detectionLinks };
}

function isForceSide(value: string | null | undefined): value is ForceSide {
  return value === 'red' || value === 'blue';
}

function isEntityStatus(value: string | null | undefined): value is EntityStatus {
  return value === 'planned' || value === 'deployed' || value === 'engaged' || value === 'destroyed';
}

function isTacticalEventType(value: string | null | undefined): value is TacticalEventType {
  return value === 'movement'
    || value === 'detection'
    || value === 'attack'
    || value === 'destruction'
    || value === 'weapon-launch'
    || value === 'weapon-impact';
}

function getAllEntities(forces: TacticalScenario['forces']): EntitySpec[] {
  return forces.flatMap(force => force.entities);
}

function findEntity(forces: TacticalScenario['forces'], entityId: string): EntitySpec | undefined {
  return getAllEntities(forces).find(entity => entity.id === entityId);
}

function getEntitySide(forces: TacticalScenario['forces'], entityId: string): ForceSide | undefined {
  return forces.find(force => force.entities.some(entity => entity.id === entityId))?.side;
}

function parseGeoPositionElement(el: Element | null | undefined): GeoPosition | null {
  if (!el) return null;

  const longitude = getAttrText(el, 'longitude')
    ? getAttrFloat(el, 'longitude')
    : getFloat(el, 'Longitude');
  const latitude = getAttrText(el, 'latitude')
    ? getAttrFloat(el, 'latitude')
    : getFloat(el, 'Latitude');
  const altitude = getAttrText(el, 'altitude')
    ? getAttrFloat(el, 'altitude')
    : getFloat(el, 'Altitude');
  const headingAttr = getAttrText(el, 'heading');

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  return {
    longitude,
    latitude,
    altitude,
    ...(headingAttr ? { heading: getAttrFloat(el, 'heading') } : {}),
  };
}

function parseRoutes(doc: Document, forces: TacticalScenario['forces']): Route[] {
  const routesEl = doc.querySelector('Routes');
  if (!routesEl) return [];

  return Array.from(routesEl.querySelectorAll(':scope > Route'))
    .map(routeEl => {
      const entityId = getAttrText(routeEl, 'entityId') || getAttrText(routeEl, 'entityRef');
      if (!entityId || !findEntity(forces, entityId)) return null;

      const sideAttr = getAttrText(routeEl, 'side');
      const side = isForceSide(sideAttr) ? sideAttr : getEntitySide(forces, entityId);
      if (!side) return null;

      const points = Array.from(routeEl.querySelectorAll(':scope > Points > Point, :scope > Point'))
        .map(pointEl => {
          const position = parseGeoPositionElement(pointEl);
          if (!position) return null;
          const timestampText = getAttrText(pointEl, 'timestamp');
          return {
            position,
            ...(timestampText ? { timestamp: getAttrFloat(pointEl, 'timestamp') } : {}),
          };
        })
        .filter((point): point is Route['points'][number] => point !== null);

      if (points.length < 2) return null;

      const label = getAttrText(routeEl, 'label') || getText(routeEl, 'Label');
      return {
        entityId,
        side,
        points,
        ...(label ? { label } : {}),
      };
    })
    .filter((route): route is Route => route !== null);
}

function parseDetectionZones(doc: Document, forces: TacticalScenario['forces']): DetectionZone[] {
  const zonesEl = doc.querySelector('DetectionZones');
  if (!zonesEl) return [];

  return Array.from(zonesEl.querySelectorAll(':scope > DetectionZone'))
    .map(zoneEl => {
      const entityId = getAttrText(zoneEl, 'entityId') || getAttrText(zoneEl, 'entityRef');
      if (!entityId || !findEntity(forces, entityId)) return null;

      const sideAttr = getAttrText(zoneEl, 'side');
      const side = isForceSide(sideAttr) ? sideAttr : getEntitySide(forces, entityId);
      const center = parseGeoPositionElement(zoneEl.querySelector(':scope > Center'));
      const radiusText = getAttrText(zoneEl, 'radiusMeters');
      const radiusMeters = radiusText ? getAttrFloat(zoneEl, 'radiusMeters') : getFloat(zoneEl, 'RadiusMeters');

      if (!side || !center || radiusMeters <= 0) return null;

      const label = getAttrText(zoneEl, 'label') || getText(zoneEl, 'Label');
      const tracking = parseDetectionZoneTracking(zoneEl);
      return {
        entityId,
        side,
        center,
        radiusMeters,
        ...(label ? { label } : {}),
        ...(tracking ? { tracking } : {}),
      };
    })
    .filter((zone): zone is DetectionZone => zone !== null);
}

export function parseDetectionZoneTrackingAttributes(attributes: {
  enabled?: string;
  targetTypes?: string;
  maxTracks?: number;
}): RadarTrackingConfig | undefined {
  if (
    attributes.enabled === undefined
    && attributes.targetTypes === undefined
    && attributes.maxTracks === undefined
  ) {
    return undefined;
  }

  return normalizeRadarTrackingConfig({
    enabled: attributes.enabled !== 'false',
    targetTypes: attributes.targetTypes,
    maxTracks: attributes.maxTracks ?? 1,
  });
}

function parseDetectionZoneTracking(zoneEl: Element): RadarTrackingConfig | undefined {
  const trackingEl = zoneEl.querySelector(':scope > Tracking');
  if (!trackingEl) return undefined;

  return parseDetectionZoneTrackingAttributes({
    enabled: getAttrText(trackingEl, 'enabled'),
    targetTypes: getAttrText(trackingEl, 'targetTypes'),
    maxTracks: getAttrFloat(trackingEl, 'maxTracks') || 1,
  });
}

function parseStrikeTasks(doc: Document, forces: TacticalScenario['forces']): StrikeTask[] {
  const tasksEl = doc.querySelector('StrikeTasks');
  if (!tasksEl) return [];

  return Array.from(tasksEl.querySelectorAll(':scope > StrikeTask'))
    .map(taskEl => {
      const attackerEntityId = getAttrText(taskEl, 'attackerEntityId') || getAttrText(taskEl, 'attacker');
      const targetEntityId = getAttrText(taskEl, 'targetEntityId') || getAttrText(taskEl, 'target');
      if (!findEntity(forces, attackerEntityId) || !findEntity(forces, targetEntityId)) return null;

      return {
        id: getAttrText(taskEl, 'id') || `strike-${attackerEntityId}-${targetEntityId}`,
        attackerEntityId,
        targetEntityId,
        phaseId: getAttrText(taskEl, 'phaseId') || getText(taskEl, 'PhaseId'),
        timestamp: getAttrFloat(taskEl, 'timestamp') || getFloat(taskEl, 'Timestamp'),
        detail: getAttrText(taskEl, 'detail') || getText(taskEl, 'Detail') || '打击任务',
      };
    })
    .filter((task): task is StrikeTask => task !== null);
}

function parsePhases(doc: Document, forces: TacticalScenario['forces']): Phase[] {
  const phasesEl = doc.querySelector('Phases');
  if (!phasesEl) return [];

  return Array.from(phasesEl.querySelectorAll(':scope > Phase'))
    .map(phaseEl => {
      const events: TacticalEvent[] = Array.from(phaseEl.querySelectorAll(':scope > Events > Event'))
        .map(eventEl => {
          const typeText = getAttrText(eventEl, 'type');
          const type = isTacticalEventType(typeText) ? typeText : 'movement';
          const sourceEntityId = getAttrText(eventEl, 'sourceEntityId');
          if (!sourceEntityId || !findEntity(forces, sourceEntityId)) return null;

          const targetEntityId = getAttrText(eventEl, 'targetEntityId') || undefined;
          const weaponId = getAttrText(eventEl, 'weaponId') || undefined;
          const weaponType = getAttrText(eventEl, 'weaponType') || undefined;
          return {
            type,
            timestamp: getAttrFloat(eventEl, 'timestamp'),
            sourceEntityId,
            ...(targetEntityId ? { targetEntityId } : {}),
            ...(weaponId ? { weaponId } : {}),
            ...(weaponType ? { weaponType } : {}),
            detail: getAttrText(eventEl, 'detail') || getText(eventEl, 'Detail') || '',
          };
        })
        .filter((event): event is TacticalEvent => event !== null);

      const entityStates: EntityStateInPhase[] = Array.from(phaseEl.querySelectorAll(':scope > EntityStates > EntityState'))
        .map(stateEl => {
          const entityId = getAttrText(stateEl, 'entityId');
          const position = parseGeoPositionElement(stateEl.querySelector(':scope > Position'));
          if (!entityId || !findEntity(forces, entityId) || !position) return null;

          const statusText = getAttrText(stateEl, 'status');
          const detectionRangeText = getAttrText(stateEl, 'detectionRange');
          const attackTarget = getAttrText(stateEl, 'attackTarget');

          return {
            entityId,
            position,
            status: isEntityStatus(statusText) ? statusText : 'deployed',
            ...(detectionRangeText ? { detectionRange: getAttrFloat(stateEl, 'detectionRange') } : {}),
            ...(attackTarget ? { attackTarget } : {}),
          };
        })
        .filter((state): state is EntityStateInPhase => state !== null);

      return {
        id: getAttrText(phaseEl, 'id') || `phase-${Date.now()}`,
        name: getAttrText(phaseEl, 'name') || getText(phaseEl, 'Name') || '行动阶段',
        description: getText(phaseEl, 'Description'),
        duration: getAttrFloat(phaseEl, 'duration') || getFloat(phaseEl, 'Duration') || 60,
        events,
        entityStates,
      };
    });
}

function normalizeRangeMeters(value: number, unit?: string): number {
  const normalizedUnit = unit?.toLowerCase();
  if (normalizedUnit === 'km' || normalizedUnit === 'kilometer' || normalizedUnit === 'kilometers') {
    return value * 1000;
  }
  if (normalizedUnit === 'm' || normalizedUnit === 'meter' || normalizedUnit === 'meters') {
    return value;
  }

  // Most XML performance params in this project store long-range values in km.
  return value > 0 && value < 10000 ? value * 1000 : value;
}

function getParamRangeMeters(params: ComponentParam[] | undefined, keys: string[]): number | null {
  if (!params) return null;
  const lowerKeys = keys.map(key => key.toLowerCase());
  const param = params.find(p => lowerKeys.includes(p.key.toLowerCase()));
  if (!param) return null;

  const raw = typeof param.value === 'number' ? param.value : parseFloat(String(param.value));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return normalizeRangeMeters(raw, param.unit);
}

function isSensorComponent(comp: EquipmentComponent): boolean {
  return comp.type.startsWith('sensor_') || comp.type.includes('radar') || comp.type.includes('sonar');
}

function getComponentRangeMeters(comp: EquipmentComponent): number | null {
  const keys = ['maxDetectRange', 'detectionRange', 'sensorRange', 'radarRange', 'maxRange'];
  return getParamRangeMeters(comp.performanceParams, keys)
    ?? getParamRangeMeters(comp.dynamicParams, keys)
    ?? getParamRangeMeters(comp.initialParams, keys);
}

function getDefaultSensorRangeMeters(entity: EntitySpec, comp?: EquipmentComponent): number {
  const type = comp?.type ?? entity.type;
  if (type.includes('optical')) return 80000;
  if (type.includes('sonar')) return 120000;
  if (type.includes('radar')) return 400000;
  if (entity.type === 'facility-radar') return 500000;
  if (entity.type === 'ground-radar') return 400000;
  if (entity.type === 'uav-recon') return 150000;
  return 50000;
}

function inferDetectionZones(
  forces: TacticalScenario['forces'],
  interactions: InteractionConfig | undefined,
): DetectionZone[] {
  const zones = new Map<string, DetectionZone>();

  const addZone = (entity: EntitySpec, componentId?: string, labelSuffix = '探测范围') => {
    const component = componentId
      ? entity.components?.find(comp => comp.id === componentId)
      : entity.components?.find(isSensorComponent);

    if (componentId && !component) return;
    if (!component && !entity.components?.some(isSensorComponent)) return;

    const radiusMeters = component
      ? getComponentRangeMeters(component) ?? getDefaultSensorRangeMeters(entity, component)
      : getDefaultSensorRangeMeters(entity);

    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return;

    const side = getEntitySide(forces, entity.id);
    if (!side) return;

    zones.set(`${entity.id}:${component?.id ?? 'auto'}`, {
      entityId: entity.id,
      side,
      center: { ...entity.position },
      radiusMeters,
      label: `${entity.name} ${labelSuffix}`,
    });
  };

  getAllEntities(forces).forEach(entity => {
    entity.components?.filter(isSensorComponent).forEach(component => {
      addZone(entity, component.id, '传感器覆盖');
    });
  });

  interactions?.detectionLinks.forEach(link => {
    const observer = findEntity(forces, link.observer.equipRef);
    if (observer) addZone(observer, link.observer.component, link.sensorType || '探测链路');
  });

  return Array.from(zones.values());
}

function isMissingPosition(position: GeoPosition): boolean {
  return Math.abs(position.longitude) < 1e-9 && Math.abs(position.latitude) < 1e-9;
}

function recoverEntityPositionsFromTacticalLayers(
  forces: TacticalScenario['forces'],
  routes: Route[],
  detectionZones: DetectionZone[],
  phases: Phase[],
) {
  const entities = getAllEntities(forces);

  entities.forEach(entity => {
    if (!isMissingPosition(entity.position)) return;

    const routeStart = routes.find(route => route.entityId === entity.id)?.points[0]?.position;
    const zoneCenter = detectionZones.find(zone => zone.entityId === entity.id)?.center;
    const phaseState = phases
      .flatMap(phase => phase.entityStates)
      .find(state => state.entityId === entity.id)?.position;

    const recovered = routeStart ?? zoneCenter ?? phaseState;
    if (recovered && !isMissingPosition(recovered)) {
      entity.position = { ...recovered };
    }
  });
}

function parseMetadata(doc: Document): ScenarioMetadata | undefined {
  const metaEl = doc.querySelector('Metadata');
  if (!metaEl) return undefined;

  return {
    name: getText(metaEl, 'Name'),
    version: getText(metaEl, 'Version'),
    description: getText(metaEl, 'Description'),
    taskSource: getText(metaEl, 'TaskSource') || undefined,
    createUnit: getText(metaEl, 'CreateUnit') || undefined,
    author: getText(metaEl, 'Author') || undefined,
    createTime: getText(metaEl, 'CreateTime') || undefined,
    modifyTime: getText(metaEl, 'ModifyTime') || undefined,
    category: getText(metaEl, 'Category') || undefined,
    tags: Array.from(metaEl.querySelectorAll('Tags > Tag')).map(t => t.textContent?.trim() ?? ''),
  };
}

export class XmlScenarioParser {
  /**
   * 解析 XML 字符串为 TacticalScenario
   * 严格按照 XML 中的经纬度坐标，不做任何修改
   */
  parse(xmlContent: string): TacticalScenario {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      throw new Error(`XML 解析失败: ${parseError.textContent}`);
    }

    const scenarioMetadata = parseMetadata(doc);
    const simParamsEl = doc.querySelector('SimulationParameters');
    const startTime = getText(simParamsEl, 'StartTime') || undefined;
    const endTime = getText(simParamsEl, 'EndTime') || undefined;

    const participatingEntities = parseEquipments(doc, 'Participating');
    const supportingEntities = parseEquipments(doc, 'Supporting');

    const forces: TacticalScenario['forces'] = [];
    if (participatingEntities.length > 0) {
      forces.push({ side: 'red', name: '被试装备', entities: participatingEntities });
    }
    if (supportingEntities.length > 0) {
      forces.push({ side: 'blue', name: '陪试装备', entities: supportingEntities });
    }

    const tasks = parseTasks(doc);
    const environment = parseEnvironment(doc);
    const visualEffects = parseVisualEffects(doc);
    const interactions = parseInteractions(doc);
    const routes = parseRoutes(doc, forces);
    const explicitDetectionZones = parseDetectionZones(doc, forces);
    const strikeTasks = parseStrikeTasks(doc, forces);
    const phases = parsePhases(doc, forces);
    recoverEntityPositionsFromTacticalLayers(forces, routes, explicitDetectionZones, phases);
    const detectionZones = explicitDetectionZones.length > 0
      ? explicitDetectionZones
      : inferDetectionZones(forces, interactions);

    const id = scenarioMetadata?.name
      ? `scenario-${Date.now()}`
      : `scenario-${Date.now()}`;

    return {
      id,
      version: 1,
      summary: scenarioMetadata?.description ?? scenarioMetadata?.name ?? '导入的想定',
      forces,
      routes,
      detectionZones,
      strikeTasks,
      phases,
      metadata: {
        generatedAt: new Date().toISOString(),
        modelUsed: 'xml-import',
        confidence: 1,
        startTime,
        endTime,
      },
      scenarioMetadata,
      tasks: tasks.length > 0 ? tasks : undefined,
      environment,
      interactions,
      visualEffects,
    };
  }
}
