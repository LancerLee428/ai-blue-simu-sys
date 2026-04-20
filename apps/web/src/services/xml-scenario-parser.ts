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
} from '../types/tactical-scenario';
import type { PlatformType, ForceSide } from '../types/tactical-scenario';
import { keplerianToGeodetic } from './orbit-calculator';

function getText(el: Element | null | undefined, selector: string): string {
  return el?.querySelector(selector)?.textContent?.trim() ?? '';
}

function getFloat(el: Element | null | undefined, selector: string): number {
  return parseFloat(el?.querySelector(selector)?.textContent?.trim() ?? '0') || 0;
}

function getInt(el: Element | null | undefined, selector: string): number {
  return parseInt(el?.querySelector(selector)?.textContent?.trim() ?? '0', 10) || 0;
}

function parseParams(el: Element | null | undefined): ComponentParam[] {
  if (!el) return [];
  return Array.from(el.querySelectorAll(':scope > Param')).map(p => ({
    key: p.getAttribute('key') ?? '',
    value: p.textContent?.trim() ?? '',
    unit: p.getAttribute('unit') ?? undefined,
  }));
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

function parsePosition(equipEl: Element): GeoPosition {
  const moverEl = equipEl.querySelector(
    'Component[id*="mover"], Components > Component'
  );
  // 找到 space_mover 或 faclity_mover 组件
  const components = Array.from(equipEl.querySelectorAll('Components > Component'));
  const mover = components.find(c => {
    const t = getText(c, 'Type');
    return t === 'space_mover' || t === 'faclity_mover';
  }) ?? moverEl;

  if (!mover) return { longitude: 0, latitude: 0, altitude: 0 };

  const initStateEl = mover.querySelector('InitialState');
  if (!initStateEl) return { longitude: 0, latitude: 0, altitude: 0 };

  const posType = getText(initStateEl, 'PositionType');
  const orbitType = getText(initStateEl, 'OrbitType');

  if (posType === 'Geodetic') {
    // 严格按照 XML 中的经纬高，不做任何修改
    return {
      longitude: getFloat(initStateEl, 'Longitude'),
      latitude: getFloat(initStateEl, 'Latitude'),
      altitude: getFloat(initStateEl, 'Altitude'),
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

function mapModelIdToPlatformType(modelId: string | undefined): PlatformType {
  if (!modelId) return 'facility-command';
  const id = modelId.toLowerCase();
  if (id.includes('sat') || id.includes('recon') || id.includes('dut')) return 'uav-recon';
  if (id.includes('ground') || id.includes('station')) return 'facility-radar';
  return 'facility-command';
}

function parseEquipments(doc: Document, tag: 'Participating' | 'Supporting'): EntitySpec[] {
  const side: ForceSide = tag === 'Participating' ? 'red' : 'blue';
  const container = doc.querySelector(tag);
  if (!container) return [];

  return Array.from(container.querySelectorAll(':scope > Equipment')).map(eq => {
    const modelId = getText(eq, 'ModelId') || undefined;
    const entity: EntitySpec = {
      id: eq.getAttribute('id') ?? `equip-${Date.now()}`,
      name: getText(eq, 'Name'),
      type: mapModelIdToPlatformType(modelId),
      side,
      position: parsePosition(eq),
      modelId,
      modelType: getText(eq, 'ModelType') || undefined,
      interfaceProtocol: getText(eq, 'InterfaceProtocol') || undefined,
      federateName: getText(eq, 'FederateName') || undefined,
      components: parseComponents(eq),
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
    const interactions = parseInteractions(doc);

    const id = scenarioMetadata?.name
      ? `scenario-${Date.now()}`
      : `scenario-${Date.now()}`;

    return {
      id,
      version: 1,
      summary: scenarioMetadata?.description ?? scenarioMetadata?.name ?? '导入的想定',
      forces,
      routes: [],
      detectionZones: [],
      strikeTasks: [],
      phases: [],
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
    };
  }
}
