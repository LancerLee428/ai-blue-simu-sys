// apps/web/src/services/xml-scenario-exporter.ts
import type {
  TacticalScenario,
  EntitySpec,
  EquipmentComponent,
  ComponentParam,
  TaskConfig,
  BehaviorTreeConfig,
  BehaviorTreeNode,
  CompositeNode,
  ActionNode,
  ConditionNode,
  StateMachineConfig,
  InstructionSeqConfig,
  EnvironmentConfig,
  InteractionConfig,
  ScenarioMetadata,
} from '../types/tactical-scenario';

function el(doc: Document, tag: string, text?: string): Element {
  const e = doc.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

function elAttr(doc: Document, tag: string, attrs: Record<string, string>, text?: string): Element {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function appendParams(doc: Document, parent: Element, params: ComponentParam[]) {
  const paramsEl = doc.createElement('Params');
  for (const p of params) {
    const paramEl = doc.createElement('Param');
    paramEl.setAttribute('key', p.key);
    if (p.unit) paramEl.setAttribute('unit', p.unit);
    paramEl.textContent = String(p.value);
    paramsEl.appendChild(paramEl);
  }
  parent.appendChild(paramsEl);
}

function exportMetadata(doc: Document, root: Element, meta: ScenarioMetadata) {
  const metaEl = doc.createElement('Metadata');
  metaEl.appendChild(el(doc, 'Name', meta.name));
  metaEl.appendChild(el(doc, 'Version', meta.version));
  metaEl.appendChild(el(doc, 'Description', meta.description));
  if (meta.taskSource) metaEl.appendChild(el(doc, 'TaskSource', meta.taskSource));
  if (meta.createUnit) metaEl.appendChild(el(doc, 'CreateUnit', meta.createUnit));
  if (meta.author) metaEl.appendChild(el(doc, 'Author', meta.author));
  if (meta.createTime) metaEl.appendChild(el(doc, 'CreateTime', meta.createTime));
  if (meta.modifyTime) metaEl.appendChild(el(doc, 'ModifyTime', meta.modifyTime));
  if (meta.category) metaEl.appendChild(el(doc, 'Category', meta.category));
  if (meta.tags && meta.tags.length > 0) {
    const tagsEl = doc.createElement('Tags');
    for (const tag of meta.tags) tagsEl.appendChild(el(doc, 'Tag', tag));
    metaEl.appendChild(tagsEl);
  }
  root.appendChild(metaEl);
}

function exportComponent(doc: Document, comp: EquipmentComponent): Element {
  const compEl = elAttr(doc, 'Component', { id: comp.id });
  compEl.appendChild(el(doc, 'Name', comp.name));
  compEl.appendChild(el(doc, 'Type', comp.type));

  if (comp.performanceParams?.length) {
    const perfEl = doc.createElement('PerformanceParams');
    for (const p of comp.performanceParams) {
      const paramEl = elAttr(doc, 'Param', { key: p.key, ...(p.unit ? { unit: p.unit } : {}) }, String(p.value));
      perfEl.appendChild(paramEl);
    }
    compEl.appendChild(perfEl);
  }

  if (comp.dynamicParams?.length) {
    const dynEl = doc.createElement('DynamicParams');
    for (const p of comp.dynamicParams) {
      const paramEl = elAttr(doc, 'Param', { key: p.key, ...(p.unit ? { unit: p.unit } : {}) }, String(p.value));
      dynEl.appendChild(paramEl);
    }
    compEl.appendChild(dynEl);
  }

  if (comp.initialParams?.length) {
    const initEl = doc.createElement('InitialParams');
    for (const p of comp.initialParams) {
      const paramEl = elAttr(doc, 'Param', { key: p.key, ...(p.unit ? { unit: p.unit } : {}) }, String(p.value));
      initEl.appendChild(paramEl);
    }
    compEl.appendChild(initEl);
  }

  if (comp.initialState) {
    const stateEl = doc.createElement('InitialState');
    const s = comp.initialState;
    if (s.positionType === 'Geodetic') {
      stateEl.appendChild(el(doc, 'PositionType', 'Geodetic'));
      stateEl.appendChild(elAttr(doc, 'Longitude', { unit: 'deg' }, String(s.longitude ?? 0)));
      stateEl.appendChild(elAttr(doc, 'Latitude', { unit: 'deg' }, String(s.latitude ?? 0)));
      stateEl.appendChild(elAttr(doc, 'Altitude', { unit: 'm' }, String(s.altitude ?? 0)));
    } else if (s.positionType === 'Keplerian') {
      stateEl.appendChild(el(doc, 'OrbitType', 'Keplerian'));
      stateEl.appendChild(elAttr(doc, 'SemiMajorAxis', { unit: 'km' }, String(s.semiMajorAxis ?? 0)));
      stateEl.appendChild(el(doc, 'Eccentricity', String(s.eccentricity ?? 0)));
      stateEl.appendChild(elAttr(doc, 'Inclination', { unit: 'deg' }, String(s.inclination ?? 0)));
      stateEl.appendChild(elAttr(doc, 'RAAN', { unit: 'deg' }, String(s.raan ?? 0)));
      stateEl.appendChild(elAttr(doc, 'ArgOfPerigee', { unit: 'deg' }, String(s.argOfPerigee ?? 0)));
      stateEl.appendChild(elAttr(doc, 'TrueAnomaly', { unit: 'deg' }, String(s.trueAnomaly ?? 0)));
      if (s.epoch) stateEl.appendChild(el(doc, 'Epoch', s.epoch));
    }
    compEl.appendChild(stateEl);
  }

  return compEl;
}

function exportEquipments(doc: Document, root: Element, forces: TacticalScenario['forces']) {
  const participating = forces.find(f => f.side === 'red');
  const supporting = forces.find(f => f.side === 'blue');

  if (participating) {
    const partEl = doc.createElement('Participating');
    for (const entity of participating.entities) {
      partEl.appendChild(exportEquipment(doc, entity));
    }
    root.appendChild(partEl);
  }

  if (supporting) {
    const suppEl = doc.createElement('Supporting');
    for (const entity of supporting.entities) {
      suppEl.appendChild(exportEquipment(doc, entity));
    }
    root.appendChild(suppEl);
  }
}

function exportEquipment(doc: Document, entity: EntitySpec): Element {
  const eqEl = elAttr(doc, 'Equipment', { id: entity.id });
  eqEl.appendChild(el(doc, 'Name', entity.name));
  if (entity.modelId) eqEl.appendChild(el(doc, 'ModelId', entity.modelId));
  if (entity.modelType) eqEl.appendChild(el(doc, 'ModelType', entity.modelType));
  if (entity.interfaceProtocol) eqEl.appendChild(el(doc, 'InterfaceProtocol', entity.interfaceProtocol));
  if (entity.federateName) eqEl.appendChild(el(doc, 'FederateName', entity.federateName));

  if (entity.components?.length) {
    const compsEl = doc.createElement('Components');
    for (const comp of entity.components) {
      compsEl.appendChild(exportComponent(doc, comp));
    }
    eqEl.appendChild(compsEl);
  }

  if (entity.taskRef) {
    eqEl.appendChild(elAttr(doc, 'TaskRef', { taskId: entity.taskRef }));
  }

  return eqEl;
}

function exportBehaviorNode(doc: Document, node: BehaviorTreeNode): Element {
  if (node.nodeType === 'Action') {
    const n = node as ActionNode;
    const nodeEl = elAttr(doc, 'ActionNode', { name: n.name, component: n.component });
    if (n.params.length) appendParams(doc, nodeEl, n.params);
    return nodeEl;
  }
  if (node.nodeType === 'Condition') {
    const n = node as ConditionNode;
    const nodeEl = elAttr(doc, 'ConditionNode', { name: n.name });
    if (n.params.length) appendParams(doc, nodeEl, n.params);
    return nodeEl;
  }
  const n = node as CompositeNode;
  const nodeEl = elAttr(doc, n.nodeType, { name: n.name });
  for (const child of n.children) nodeEl.appendChild(exportBehaviorNode(doc, child));
  return nodeEl;
}

function exportTasks(doc: Document, root: Element, tasks: TaskConfig[]) {
  const tasksEl = doc.createElement('Tasks');

  for (const task of tasks) {
    const taskEl = elAttr(doc, 'Task', { id: task.id, equipRef: task.equipRef, type: task.type });
    taskEl.appendChild(el(doc, 'Name', task.name));

    if (task.type === 'BehaviorTree') {
      const cfg = task.config as BehaviorTreeConfig;
      const btEl = doc.createElement('BehaviorTree');
      const rootEl = elAttr(doc, 'Root', { type: cfg.root.nodeType, name: cfg.root.name });
      for (const child of cfg.root.children) rootEl.appendChild(exportBehaviorNode(doc, child));
      btEl.appendChild(rootEl);
      taskEl.appendChild(btEl);
    } else if (task.type === 'StateMachine') {
      const cfg = task.config as StateMachineConfig;
      const smEl = elAttr(doc, 'StateMachine', { initialState: cfg.initialState });
      for (const state of cfg.states) {
        const stateEl = elAttr(doc, 'State', { name: state.name });
        if (state.entryAction) {
          const entryEl = elAttr(doc, 'EntryAction', { component: state.entryAction.component });
          if (state.entryAction.params.length) appendParams(doc, entryEl, state.entryAction.params);
          stateEl.appendChild(entryEl);
        }
        if (state.exitAction) {
          const exitEl = elAttr(doc, 'ExitAction', { component: state.exitAction.component });
          if (state.exitAction.params.length) appendParams(doc, exitEl, state.exitAction.params);
          stateEl.appendChild(exitEl);
        }
        for (const t of state.transitions) {
          stateEl.appendChild(elAttr(doc, 'Transition', { event: t.event, target: t.target }));
        }
        smEl.appendChild(stateEl);
      }
      taskEl.appendChild(smEl);
    } else {
      const cfg = task.config as InstructionSeqConfig;
      const seqEl = doc.createElement('InstructionSequence');
      for (const ins of cfg.instructions) {
        const insEl = elAttr(doc, 'Instruction', { id: ins.id, time: ins.time });
        insEl.appendChild(el(doc, 'Type', ins.type));
        insEl.appendChild(el(doc, 'Component', ins.component));
        if (ins.params.length) appendParams(doc, insEl, ins.params);
        seqEl.appendChild(insEl);
      }
      taskEl.appendChild(seqEl);
    }

    tasksEl.appendChild(taskEl);
  }

  root.appendChild(tasksEl);
}

function exportEnvironment(doc: Document, root: Element, env: EnvironmentConfig) {
  const envEl = doc.createElement('Environment');
  const genEl = doc.createElement('GenerationModels');

  if (env.generationModels.spaceEnvironment) {
    const s = env.generationModels.spaceEnvironment;
    const spaceEl = doc.createElement('SpaceEnvironment');
    const solarEl = doc.createElement('SolarActivity');
    solarEl.appendChild(elAttr(doc, 'FluxLevel', { unit: 'sfu' }, String(s.solarActivity.fluxLevel)));
    solarEl.appendChild(el(doc, 'SunspotNumber', String(s.solarActivity.sunspotNumber)));
    spaceEl.appendChild(solarEl);
    const geoEl = doc.createElement('GeomagneticField');
    geoEl.appendChild(el(doc, 'KpIndex', String(s.geomagneticField.kpIndex)));
    geoEl.appendChild(el(doc, 'ApIndex', String(s.geomagneticField.apIndex)));
    spaceEl.appendChild(geoEl);
    const ionEl = doc.createElement('Ionosphere');
    ionEl.appendChild(el(doc, 'ModelType', s.ionosphere.modelType));
    ionEl.appendChild(elAttr(doc, 'TotalElectronContent', { unit: 'TECU' }, String(s.ionosphere.totalElectronContent)));
    spaceEl.appendChild(ionEl);
    const resEl = doc.createElement('DataResolution');
    resEl.appendChild(elAttr(doc, 'LatitudeStep', { unit: 'deg' }, String(s.dataResolution.latitudeStep)));
    resEl.appendChild(elAttr(doc, 'LongitudeStep', { unit: 'deg' }, String(s.dataResolution.longitudeStep)));
    resEl.appendChild(elAttr(doc, 'AltitudeStep', { unit: 'km' }, String(s.dataResolution.altitudeStep)));
    spaceEl.appendChild(resEl);
    spaceEl.appendChild(elAttr(doc, 'TimeStep', { unit: 's' }, String(s.timeStep)));
    spaceEl.appendChild(el(doc, 'ModelServiceUrl', s.modelServiceUrl));
    spaceEl.appendChild(el(doc, 'DataGenerationUrl', s.dataGenerationUrl));
    genEl.appendChild(spaceEl);
  }

  if (env.generationModels.atmosphereModel) {
    const a = env.generationModels.atmosphereModel;
    const atmosEl = doc.createElement('AtmosphereModel');
    atmosEl.appendChild(el(doc, 'Weather', a.weather));
    atmosEl.appendChild(el(doc, 'RainLevel', a.rainLevel));
    atmosEl.appendChild(elAttr(doc, 'WindSpeed', { unit: 'm/s' }, String(a.windSpeed)));
    atmosEl.appendChild(elAttr(doc, 'WindDirection', { unit: 'deg' }, String(a.windDirection)));
    const coverEl = doc.createElement('CoverageArea');
    coverEl.appendChild(elAttr(doc, 'LonMin', { unit: 'deg' }, String(a.coverageArea.lonMin)));
    coverEl.appendChild(elAttr(doc, 'LonMax', { unit: 'deg' }, String(a.coverageArea.lonMax)));
    coverEl.appendChild(elAttr(doc, 'LatMin', { unit: 'deg' }, String(a.coverageArea.latMin)));
    coverEl.appendChild(elAttr(doc, 'LatMax', { unit: 'deg' }, String(a.coverageArea.latMax)));
    atmosEl.appendChild(coverEl);
    const resEl = doc.createElement('DataResolution');
    resEl.appendChild(elAttr(doc, 'LatitudeStep', { unit: 'deg' }, String(a.dataResolution.latitudeStep)));
    resEl.appendChild(elAttr(doc, 'LongitudeStep', { unit: 'deg' }, String(a.dataResolution.longitudeStep)));
    resEl.appendChild(elAttr(doc, 'AltitudeStep', { unit: 'm' }, String(a.dataResolution.altitudeStep)));
    atmosEl.appendChild(resEl);
    atmosEl.appendChild(elAttr(doc, 'TimeStep', { unit: 's' }, String(a.timeStep)));
    atmosEl.appendChild(el(doc, 'ModelServiceUrl', a.modelServiceUrl));
    atmosEl.appendChild(el(doc, 'DataGenerationUrl', a.dataGenerationUrl));
    genEl.appendChild(atmosEl);
  }

  envEl.appendChild(genEl);

  if (env.effectModels.length) {
    const effectsEl = doc.createElement('EffectModels');
    for (const em of env.effectModels) {
      const emEl = elAttr(doc, 'EffectModel', { id: em.id, category: em.category });
      emEl.appendChild(el(doc, 'Name', em.name));
      emEl.appendChild(el(doc, 'Enabled', String(em.enabled)));
      if (em.params.length) appendParams(doc, emEl, em.params);
      effectsEl.appendChild(emEl);
    }
    envEl.appendChild(effectsEl);
  }

  if (env.events.length) {
    const eventsEl = doc.createElement('Events');
    for (const ev of env.events) {
      const evEl = elAttr(doc, 'Event', { id: ev.id });
      evEl.appendChild(el(doc, 'Name', ev.name));
      evEl.appendChild(el(doc, 'StartTime', ev.startTime));
      evEl.appendChild(el(doc, 'EndTime', ev.endTime));
      evEl.appendChild(el(doc, 'Type', ev.type));
      evEl.appendChild(el(doc, 'Level', String(ev.level)));
      if (ev.affectedArea) {
        const areaEl = doc.createElement('AffectedArea');
        areaEl.appendChild(elAttr(doc, 'LonMin', { unit: 'deg' }, String(ev.affectedArea.lonMin)));
        areaEl.appendChild(elAttr(doc, 'LonMax', { unit: 'deg' }, String(ev.affectedArea.lonMax)));
        areaEl.appendChild(elAttr(doc, 'LatMin', { unit: 'deg' }, String(ev.affectedArea.latMin)));
        areaEl.appendChild(elAttr(doc, 'LatMax', { unit: 'deg' }, String(ev.affectedArea.latMax)));
        evEl.appendChild(areaEl);
      }
      if (ev.params.length) appendParams(doc, evEl, ev.params);
      eventsEl.appendChild(evEl);
    }
    envEl.appendChild(eventsEl);
  }

  root.appendChild(envEl);
}

function exportInteractions(doc: Document, root: Element, interactions: InteractionConfig) {
  const intEl = doc.createElement('Interactions');

  if (interactions.groups.length) {
    const groupsEl = doc.createElement('Groups');
    for (const g of interactions.groups) {
      const gEl = elAttr(doc, 'Group', { id: g.id, name: g.name });
      for (const m of g.members) {
        gEl.appendChild(elAttr(doc, 'Member', { equipRef: m.equipRef, ...(m.role ? { role: m.role } : {}) }));
      }
      groupsEl.appendChild(gEl);
    }
    intEl.appendChild(groupsEl);
  }

  if (interactions.commandControl.length) {
    const ccEl = doc.createElement('CommandControl');
    for (const cc of interactions.commandControl) {
      const linkEl = elAttr(doc, 'Link', { id: cc.id });
      linkEl.appendChild(elAttr(doc, 'Commander', { equipRef: cc.commander }));
      linkEl.appendChild(elAttr(doc, 'Subordinate', { equipRef: cc.subordinate }));
      linkEl.appendChild(el(doc, 'Protocol', cc.protocol));
      if (cc.latency !== undefined) linkEl.appendChild(elAttr(doc, 'Latency', { unit: 'ms' }, String(cc.latency)));
      ccEl.appendChild(linkEl);
    }
    intEl.appendChild(ccEl);
  }

  if (interactions.communications.length) {
    const commsEl = doc.createElement('Communications');
    for (const comm of interactions.communications) {
      const linkEl = elAttr(doc, 'Link', { id: comm.id });
      linkEl.appendChild(elAttr(doc, 'Sender', { equipRef: comm.sender.equipRef, ...(comm.sender.component ? { component: comm.sender.component } : {}) }));
      linkEl.appendChild(elAttr(doc, 'Receiver', { equipRef: comm.receiver.equipRef, ...(comm.receiver.component ? { component: comm.receiver.component } : {}) }));
      linkEl.appendChild(el(doc, 'DataType', comm.dataType));
      linkEl.appendChild(el(doc, 'Protocol', comm.protocol));
      if (comm.maxRange !== undefined) linkEl.appendChild(elAttr(doc, 'MaxRange', { unit: 'km' }, String(comm.maxRange)));
      if (comm.dataRate !== undefined) linkEl.appendChild(elAttr(doc, 'DataRate', { unit: 'Gbps' }, String(comm.dataRate)));
      commsEl.appendChild(linkEl);
    }
    intEl.appendChild(commsEl);
  }

  if (interactions.detectionLinks.length) {
    const detEl = doc.createElement('DetectionLinks');
    for (const d of interactions.detectionLinks) {
      const linkEl = elAttr(doc, 'Link', { id: d.id });
      linkEl.appendChild(elAttr(doc, 'Observer', { equipRef: d.observer.equipRef, ...(d.observer.component ? { component: d.observer.component } : {}) }));
      linkEl.appendChild(elAttr(doc, 'Target', { equipRef: d.target }));
      linkEl.appendChild(el(doc, 'SensorType', d.sensorType));
      detEl.appendChild(linkEl);
    }
    intEl.appendChild(detEl);
  }

  root.appendChild(intEl);
}

export class XmlScenarioExporter {
  /**
   * 将 TacticalScenario 导出为 XML 字符串
   */
  export(scenario: TacticalScenario): string {
    const doc = document.implementation.createDocument(null, 'Scenario', null);
    const root = doc.documentElement;

    // 1. Metadata
    if (scenario.scenarioMetadata) {
      exportMetadata(doc, root, scenario.scenarioMetadata);
    }

    // 2. SimulationParameters
    if (scenario.metadata.startTime || scenario.metadata.endTime) {
      const simEl = doc.createElement('SimulationParameters');
      if (scenario.metadata.startTime) simEl.appendChild(el(doc, 'StartTime', scenario.metadata.startTime));
      if (scenario.metadata.endTime) simEl.appendChild(el(doc, 'EndTime', scenario.metadata.endTime));
      root.appendChild(simEl);
    }

    // 3. Equipments
    exportEquipments(doc, root, scenario.forces);

    // 4. Environment
    if (scenario.environment) {
      exportEnvironment(doc, root, scenario.environment);
    }

    // 5. Tasks
    if (scenario.tasks?.length) {
      exportTasks(doc, root, scenario.tasks);
    }

    // 6. Interactions
    if (scenario.interactions) {
      exportInteractions(doc, root, scenario.interactions);
    }

    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(doc);
    // 添加 XML 声明
    return `<?xml version="1.0" encoding="UTF-8"?>\n${raw}`;
  }
}
