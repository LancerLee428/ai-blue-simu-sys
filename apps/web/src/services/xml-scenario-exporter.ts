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
  Route,
  DetectionZone,
  StrikeTask,
  Phase,
  VisualEffectsConfig,
  ElectronicWarfareEffectsConfig,
  VisualModelConfig,
} from '../types/tactical-scenario';
import { normalizeTacticalScenario } from './tactical-scenario-normalizer';

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

function appendInitialStateValue(doc: Document, parent: Element, key: string, value: unknown) {
  if (value === undefined || value === null || key === 'positionType' || key === 'orbitType') return;
  if (typeof value === 'object') return;
  parent.appendChild(el(doc, key, String(value)));
}

function getVisualModelAttributes(model: VisualModelConfig | undefined): Record<string, string> {
  if (!model) return {};

  return {
    ...(model.alias ? { alias: model.alias } : {}),
    ...(model.uri ? { uri: model.uri } : {}),
    ...(model.scale !== undefined ? { scale: String(model.scale) } : {}),
    ...(model.minimumPixelSize !== undefined ? { minimumPixelSize: String(model.minimumPixelSize) } : {}),
    ...(model.maximumScale !== undefined ? { maximumScale: String(model.maximumScale) } : {}),
    ...(model.headingOffsetDeg !== undefined ? { headingOffsetDeg: String(model.headingOffsetDeg) } : {}),
    ...(model.pitchOffsetDeg !== undefined ? { pitchOffsetDeg: String(model.pitchOffsetDeg) } : {}),
    ...(model.rollOffsetDeg !== undefined ? { rollOffsetDeg: String(model.rollOffsetDeg) } : {}),
    ...(model.heightOffsetMeters !== undefined ? { heightOffsetMeters: String(model.heightOffsetMeters) } : {}),
  };
}

function getWeaponVisualModelAttributes(model: VisualModelConfig | undefined): Record<string, string> {
  if (!model) return {};

  return {
    ...(model.alias ? { modelAlias: model.alias } : {}),
    ...(model.uri ? { modelUri: model.uri } : {}),
    ...(model.scale !== undefined ? { modelScale: String(model.scale) } : {}),
    ...(model.minimumPixelSize !== undefined ? { modelMinimumPixelSize: String(model.minimumPixelSize) } : {}),
    ...(model.maximumScale !== undefined ? { modelMaximumScale: String(model.maximumScale) } : {}),
    ...(model.headingOffsetDeg !== undefined ? { modelHeadingOffsetDeg: String(model.headingOffsetDeg) } : {}),
    ...(model.pitchOffsetDeg !== undefined ? { modelPitchOffsetDeg: String(model.pitchOffsetDeg) } : {}),
    ...(model.rollOffsetDeg !== undefined ? { modelRollOffsetDeg: String(model.rollOffsetDeg) } : {}),
    ...(model.heightOffsetMeters !== undefined ? { modelHeightOffsetMeters: String(model.heightOffsetMeters) } : {}),
  };
}

function ensureGeodeticState(doc: Document, compEl: Element, pos: EntitySpec['position']) {
  let stateEl = compEl.querySelector(':scope > InitialState');
  if (!stateEl) {
    stateEl = doc.createElement('InitialState');
    compEl.appendChild(stateEl);
  }

  const replaceChildText = (tag: string, value: string, attrs: Record<string, string> = {}) => {
    const existing = stateEl!.querySelector(`:scope > ${tag}`);
    if (existing) stateEl!.removeChild(existing);
    stateEl!.appendChild(elAttr(doc, tag, attrs, value));
  };

  replaceChildText('PositionType', 'Geodetic');
  replaceChildText('Longitude', String(pos.longitude), { unit: 'deg' });
  replaceChildText('Latitude', String(pos.latitude), { unit: 'deg' });
  replaceChildText('Altitude', String(pos.altitude ?? 0), { unit: 'm' });
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
    const s = comp.initialState as any;
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
    } else {
      Object.entries(s).forEach(([key, value]) => appendInitialStateValue(doc, stateEl, key, value));
    }
    if (stateEl.childNodes.length > 0) compEl.appendChild(stateEl);
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
  if (entity.visualModel) eqEl.appendChild(elAttr(doc, 'VisualModel', getVisualModelAttributes(entity.visualModel)));
  if (entity.interfaceProtocol) eqEl.appendChild(el(doc, 'InterfaceProtocol', entity.interfaceProtocol));
  if (entity.federateName) eqEl.appendChild(el(doc, 'FederateName', entity.federateName));

  // 写入组件（含位置）
  const pos = entity.position;
  const hasPos = pos && (pos.longitude !== 0 || pos.latitude !== 0);

  if (entity.components?.length) {
    const compsEl = doc.createElement('Components');
    let posWritten = false;
    for (const comp of entity.components) {
      const compEl = exportComponent(doc, comp);
      // 找 mover 组件写入实体位置
      if (!posWritten && hasPos && comp.type.endsWith('_mover')) {
        // 如果组件自身没有 Geodetic 位置，则注入实体级坐标
        if (!comp.initialState?.positionType || comp.initialState.positionType === 'Geodetic') {
          // 替换或补写 InitialState
          ensureGeodeticState(doc, compEl, pos);
          posWritten = true;
        }
      }
      compsEl.appendChild(compEl);
    }
    // 若没有 mover 组件但有位置，把位置写到第一个组件
    if (!posWritten && hasPos) {
      const firstCompEl = compsEl.querySelector('Component');
      if (firstCompEl) {
        ensureGeodeticState(doc, firstCompEl, pos);
      }
    }
    eqEl.appendChild(compsEl);
  } else if (hasPos) {
    // 没有组件但有位置：自动生成一个 mover 组件承载位置
    const compsEl = doc.createElement('Components');
    const compEl = elAttr(doc, 'Component', { id: `${entity.id}_mover` });
    compEl.appendChild(el(doc, 'Name', `${entity.name}机动系统`));
    compEl.appendChild(el(doc, 'Type', 'facility_mover'));
    const stateEl = doc.createElement('InitialState');
    stateEl.appendChild(el(doc, 'PositionType', 'Geodetic'));
    stateEl.appendChild(elAttr(doc, 'Longitude', { unit: 'deg' }, String(pos.longitude)));
    stateEl.appendChild(elAttr(doc, 'Latitude', { unit: 'deg' }, String(pos.latitude)));
    stateEl.appendChild(elAttr(doc, 'Altitude', { unit: 'm' }, String(pos.altitude ?? 0)));
    compEl.appendChild(stateEl);
    compsEl.appendChild(compEl);
    eqEl.appendChild(compsEl);
  }

  if (entity.taskRef) {
    eqEl.appendChild(elAttr(doc, 'TaskRef', { taskId: entity.taskRef }));
  }

  if (entity.loadout && (entity.loadout.weapons.length > 0 || entity.loadout.sensors.length > 0)) {
    const loadoutEl = doc.createElement('Loadout');

    if (entity.loadout.weapons.length > 0) {
      const weaponsEl = doc.createElement('Weapons');
      for (const weaponId of entity.loadout.weapons) {
        weaponsEl.appendChild(elAttr(doc, 'Weapon', { id: weaponId }));
      }
      loadoutEl.appendChild(weaponsEl);
    }

    if (entity.loadout.sensors.length > 0) {
      const sensorsEl = doc.createElement('Sensors');
      for (const sensorId of entity.loadout.sensors) {
        sensorsEl.appendChild(elAttr(doc, 'Sensor', { id: sensorId }));
      }
      loadoutEl.appendChild(sensorsEl);
    }

    eqEl.appendChild(loadoutEl);
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
      if (cfg?.root) {
        const btEl = doc.createElement('BehaviorTree');
        const rootEl = elAttr(doc, 'Root', { type: cfg.root.nodeType ?? 'Sequence', name: cfg.root.name ?? 'root' });
        for (const child of (cfg.root.children ?? [])) rootEl.appendChild(exportBehaviorNode(doc, child));
        btEl.appendChild(rootEl);
        taskEl.appendChild(btEl);
      }
    } else if (task.type === 'StateMachine') {
      const cfg = task.config as StateMachineConfig;
      const smEl = elAttr(doc, 'StateMachine', { initialState: cfg.initialState ?? '' });
      for (const state of (cfg.states ?? [])) {
        const stateEl = elAttr(doc, 'State', { name: state.name });
        if (state.entryAction) {
          const entryEl = elAttr(doc, 'EntryAction', { component: state.entryAction.component });
          if (state.entryAction.params?.length) appendParams(doc, entryEl, state.entryAction.params);
          stateEl.appendChild(entryEl);
        }
        if (state.exitAction) {
          const exitEl = elAttr(doc, 'ExitAction', { component: state.exitAction.component });
          if (state.exitAction.params?.length) appendParams(doc, exitEl, state.exitAction.params);
          stateEl.appendChild(exitEl);
        }
        for (const t of (state.transitions ?? [])) {
          stateEl.appendChild(elAttr(doc, 'Transition', { event: t.event, target: t.target }));
        }
        smEl.appendChild(stateEl);
      }
      taskEl.appendChild(smEl);
    } else {
      const cfg = task.config as InstructionSeqConfig;
      const seqEl = doc.createElement('InstructionSequence');
      for (const ins of (cfg.instructions ?? [])) {
        const insEl = elAttr(doc, 'Instruction', { id: ins.id, time: ins.time });
        insEl.appendChild(el(doc, 'Type', ins.type));
        insEl.appendChild(el(doc, 'Component', ins.component));
        if (ins.params?.length) appendParams(doc, insEl, ins.params);
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
    if (a.weather != null) atmosEl.appendChild(el(doc, 'Weather', a.weather));
    if (a.rainLevel != null) atmosEl.appendChild(el(doc, 'RainLevel', a.rainLevel));
    if (a.windSpeed != null && isFinite(a.windSpeed)) atmosEl.appendChild(elAttr(doc, 'WindSpeed', { unit: 'm/s' }, String(a.windSpeed)));
    if (a.windDirection != null && isFinite(a.windDirection)) atmosEl.appendChild(elAttr(doc, 'WindDirection', { unit: 'deg' }, String(a.windDirection)));
    if (a.coverageArea) {
      const coverEl = doc.createElement('CoverageArea');
      coverEl.appendChild(elAttr(doc, 'LonMin', { unit: 'deg' }, String(a.coverageArea.lonMin)));
      coverEl.appendChild(elAttr(doc, 'LonMax', { unit: 'deg' }, String(a.coverageArea.lonMax)));
      coverEl.appendChild(elAttr(doc, 'LatMin', { unit: 'deg' }, String(a.coverageArea.latMin)));
      coverEl.appendChild(elAttr(doc, 'LatMax', { unit: 'deg' }, String(a.coverageArea.latMax)));
      atmosEl.appendChild(coverEl);
    }
    if (a.dataResolution) {
      const resEl = doc.createElement('DataResolution');
      resEl.appendChild(elAttr(doc, 'LatitudeStep', { unit: 'deg' }, String(a.dataResolution.latitudeStep)));
      resEl.appendChild(elAttr(doc, 'LongitudeStep', { unit: 'deg' }, String(a.dataResolution.longitudeStep)));
      resEl.appendChild(elAttr(doc, 'AltitudeStep', { unit: 'm' }, String(a.dataResolution.altitudeStep)));
      atmosEl.appendChild(resEl);
    }
    if (a.timeStep !== undefined) atmosEl.appendChild(elAttr(doc, 'TimeStep', { unit: 's' }, String(a.timeStep)));
    if (a.modelServiceUrl) atmosEl.appendChild(el(doc, 'ModelServiceUrl', a.modelServiceUrl));
    if (a.dataGenerationUrl) atmosEl.appendChild(el(doc, 'DataGenerationUrl', a.dataGenerationUrl));
    genEl.appendChild(atmosEl);
  }

  envEl.appendChild(genEl);

  if (env.effectModels?.length) {
    const effectsEl = doc.createElement('EffectModels');
    for (const em of env.effectModels) {
      // 跳过字段不完整的 effectModel（AI 可能生成空对象）
      if (!em?.id || em.id === 'undefined') continue;
      const emEl = elAttr(doc, 'EffectModel', { id: em.id, category: em.category ?? '' });
      if (em.name) emEl.appendChild(el(doc, 'Name', em.name));
      if (em.enabled != null) emEl.appendChild(el(doc, 'Enabled', String(em.enabled)));
      if (em.params?.length) appendParams(doc, emEl, em.params);
      effectsEl.appendChild(emEl);
    }
    envEl.appendChild(effectsEl);
  }

  if (env.events?.length) {
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
      if (ev.params?.length) appendParams(doc, evEl, ev.params);
      eventsEl.appendChild(evEl);
    }
    envEl.appendChild(eventsEl);
  }

  root.appendChild(envEl);
}

function exportVisualEffects(doc: Document, root: Element, visualEffects: VisualEffectsConfig) {
  const effectsEl = elAttr(doc, 'VisualEffects', {
    enabled: String(visualEffects.enabled !== false),
  });

  const weaponEffectsEl = elAttr(doc, 'WeaponEffects', {
    enabled: String(visualEffects.weaponEffects.enabled),
  });
  for (const effect of visualEffects.weaponEffects.items) {
    weaponEffectsEl.appendChild(elAttr(doc, 'WeaponEffect', {
      weaponId: effect.weaponId,
      trailEnabled: String(effect.trailEnabled),
      trailColor: effect.trailColor,
      trailWidth: String(effect.trailWidth),
      iconStyle: effect.iconStyle,
      ...getWeaponVisualModelAttributes(effect.visualModel),
    }));
  }
  effectsEl.appendChild(weaponEffectsEl);

  const explosionEffectsEl = elAttr(doc, 'ExplosionEffects', {
    enabled: String(visualEffects.explosionEffects.enabled),
  });
  for (const effect of visualEffects.explosionEffects.items) {
    explosionEffectsEl.appendChild(elAttr(doc, 'ExplosionEffect', {
      type: effect.type,
      radius: String(effect.radius),
      durationMs: String(effect.durationMs),
      innerColor: effect.innerColor,
      outerColor: effect.outerColor,
    }));
  }
  effectsEl.appendChild(explosionEffectsEl);

  if (visualEffects.sensorEffects) {
    effectsEl.appendChild(elAttr(doc, 'SensorEffects', {
      enabled: String(visualEffects.sensorEffects.enabled),
      radarScanEnabled: String(visualEffects.sensorEffects.radarScanEnabled),
      scanSpeedDegPerSec: String(visualEffects.sensorEffects.scanSpeedDegPerSec),
      beamWidthDeg: String(visualEffects.sensorEffects.beamWidthDeg),
      ...(visualEffects.sensorEffects.color ? { color: visualEffects.sensorEffects.color } : {}),
    }));
  }

  if (visualEffects.electronicWarfareEffects) {
    effectsEl.appendChild(elAttr(
      doc,
      'ElectronicWarfareEffects',
      getElectronicWarfareEffectAttributes(visualEffects.electronicWarfareEffects),
    ));
  }

  if (visualEffects.weaponRuntime) {
    effectsEl.appendChild(elAttr(doc, 'WeaponRuntime', {
      ...(visualEffects.weaponRuntime.timeScaleForDemo !== undefined
        ? { timeScaleForDemo: String(visualEffects.weaponRuntime.timeScaleForDemo) }
        : {}),
      ...(visualEffects.weaponRuntime.forceImpactWithinPhase !== undefined
        ? { forceImpactWithinPhase: String(visualEffects.weaponRuntime.forceImpactWithinPhase) }
        : {}),
    }));
  }

  if (visualEffects.performance) {
    effectsEl.appendChild(elAttr(doc, 'Performance', {
      mode: visualEffects.performance.mode,
      maxActiveExplosions: String(visualEffects.performance.maxActiveExplosions),
      maxActiveScans: String(visualEffects.performance.maxActiveScans),
      maxActivePulses: String(visualEffects.performance.maxActivePulses),
      maxActiveTrails: String(visualEffects.performance.maxActiveTrails),
    }));
  }

  root.appendChild(effectsEl);
}

function exportInteractions(doc: Document, root: Element, interactions: InteractionConfig) {
  const intEl = doc.createElement('Interactions');

  if (interactions.groups?.length) {
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

  if (interactions.commandControl?.length) {
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

  if (interactions.communications?.length) {
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

  if (interactions.detectionLinks?.length) {
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

function exportRoutes(doc: Document, root: Element, routes: Route[]) {
  if (!routes || routes.length === 0) return;
  const routesEl = doc.createElement('Routes');
  for (const route of routes) {
    const routeEl = elAttr(doc, 'Route', { 
      entityId: route.entityId, 
      side: route.side,
      ...(route.label ? { label: route.label } : {})
    });
    const pointsEl = doc.createElement('Points');
    for (const p of route.points) {
      const ptAttr: Record<string, string> = {
        longitude: String(p.position.longitude),
        latitude: String(p.position.latitude),
        altitude: String(p.position.altitude ?? 0)
      };
      if (p.timestamp !== undefined) {
        ptAttr.timestamp = String(p.timestamp);
      }
      pointsEl.appendChild(elAttr(doc, 'Point', ptAttr));
    }
    routeEl.appendChild(pointsEl);
    routesEl.appendChild(routeEl);
  }
  root.appendChild(routesEl);
}

export function getElectronicWarfareEffectAttributes(
  config: ElectronicWarfareEffectsConfig,
): Record<string, string> {
  return {
    enabled: String(config.enabled),
    areaEnabled: String(config.areaEnabled),
    trackingEnabled: String(config.trackingEnabled),
    trackingTargetTypes: config.trackingTargetTypes.join(','),
    maxTracks: String(config.maxTracks),
    pulseEnabled: String(config.pulseEnabled),
    pulseColor: config.pulseColor,
    pulseDurationMs: String(config.pulseDurationMs),
  };
}

function exportDetectionZones(doc: Document, root: Element, zones: DetectionZone[]) {
  if (!zones || zones.length === 0) return;
  const zonesEl = doc.createElement('DetectionZones');
  for (const zone of zones) {
    const zoneEl = elAttr(doc, 'DetectionZone', {
      entityId: zone.entityId,
      side: zone.side,
      radiusMeters: String(zone.radiusMeters),
      ...(zone.label ? { label: zone.label } : {})
    });
    const centerEl = elAttr(doc, 'Center', {
      longitude: String(zone.center.longitude),
      latitude: String(zone.center.latitude),
      altitude: String(zone.center.altitude ?? 0)
    });
    zoneEl.appendChild(centerEl);
    if (zone.tracking) {
      zoneEl.appendChild(elAttr(doc, 'Tracking', getDetectionZoneTrackingAttributes(zone)));
    }
    zonesEl.appendChild(zoneEl);
  }
  root.appendChild(zonesEl);
}

export function getDetectionZoneTrackingAttributes(zone: DetectionZone): Record<string, string> {
  if (!zone.tracking) return {};

  return {
    enabled: String(zone.tracking.enabled),
    targetTypes: zone.tracking.targetTypes.join(','),
    maxTracks: String(zone.tracking.maxTracks),
  };
}

function exportStrikeTasks(doc: Document, root: Element, tasks: StrikeTask[]) {
  if (!tasks || tasks.length === 0) return;
  const tasksEl = doc.createElement('StrikeTasks');
  for (const task of tasks) {
    const taskEl = elAttr(doc, 'StrikeTask', {
      id: task.id,
      attackerEntityId: task.attackerEntityId,
      targetEntityId: task.targetEntityId,
      phaseId: task.phaseId,
      timestamp: String(task.timestamp),
      detail: task.detail
    });
    exportWeaponTrajectory(doc, taskEl, task.weaponTrajectory);
    tasksEl.appendChild(taskEl);
  }
  root.appendChild(tasksEl);
}

function exportWeaponTrajectory(
  doc: Document,
  taskEl: Element,
  trajectory: StrikeTask['weaponTrajectory'],
): void {
  if (!trajectory || trajectory.points.length < 2) return;

  const trajectoryEl = elAttr(doc, 'WeaponTrajectory', {
    mode: trajectory.mode ?? 'manual',
    interpolation: trajectory.interpolation ?? 'catmull-rom',
  });

  trajectory.points.forEach((point, index) => {
    trajectoryEl.appendChild(elAttr(doc, 'TrajectoryPoint', {
      index: String(index),
      ...(point.id ? { id: point.id } : {}),
      ...(point.role ? { role: point.role } : {}),
      ...(point.progress !== undefined ? { progress: String(point.progress) } : {}),
      longitude: String(point.position.longitude),
      latitude: String(point.position.latitude),
      altitude: String(point.position.altitude ?? 0),
    }));
  });

  taskEl.appendChild(trajectoryEl);
}

function exportPhases(doc: Document, root: Element, phases: Phase[]) {
  if (!phases || phases.length === 0) return;
  const phasesEl = doc.createElement('Phases');
  for (const phase of phases) {
    const phaseEl = elAttr(doc, 'Phase', {
      id: phase.id,
      name: phase.name,
      duration: String(phase.duration)
    });
    phaseEl.appendChild(el(doc, 'Description', phase.description));
    
    if (phase.events && phase.events.length > 0) {
      const eventsEl = doc.createElement('Events');
      for (const ev of phase.events) {
        const evAttr: Record<string, string> = {
          type: ev.type,
          timestamp: String(ev.timestamp),
          sourceEntityId: ev.sourceEntityId,
          detail: ev.detail
        };
        if (ev.targetEntityId) {
          evAttr.targetEntityId = ev.targetEntityId;
        }
        if ('weaponId' in ev && (ev as any).weaponId) {
          evAttr.weaponId = String((ev as any).weaponId);
        }
        if ('weaponType' in ev && (ev as any).weaponType) {
          evAttr.weaponType = String((ev as any).weaponType);
        }
        eventsEl.appendChild(elAttr(doc, 'Event', evAttr));
      }
      phaseEl.appendChild(eventsEl);
    }
    
    if (phase.entityStates && phase.entityStates.length > 0) {
      const statesEl = doc.createElement('EntityStates');
      for (const st of phase.entityStates) {
        const stAttr: Record<string, string> = {
          entityId: st.entityId,
          status: st.status
        };
        if (st.detectionRange !== undefined) stAttr.detectionRange = String(st.detectionRange);
        if (st.attackTarget) stAttr.attackTarget = st.attackTarget;
        
        const stEl = elAttr(doc, 'EntityState', stAttr);
        stEl.appendChild(elAttr(doc, 'Position', {
          longitude: String(st.position.longitude),
          latitude: String(st.position.latitude),
          altitude: String(st.position.altitude ?? 0)
        }));
        statesEl.appendChild(stEl);
      }
      phaseEl.appendChild(statesEl);
    }
    
    phasesEl.appendChild(phaseEl);
  }
  root.appendChild(phasesEl);
}

export class XmlScenarioExporter {
  /**
   * 将 TacticalScenario 导出为 XML 字符串
   */
  export(scenario: TacticalScenario): string {
    scenario = normalizeTacticalScenario(scenario);

    const doc = document.implementation.createDocument(null, 'Scenario', null);
    const root = doc.documentElement;

    if (scenario.id) root.setAttribute('id', scenario.id);
    if (scenario.version !== undefined) root.setAttribute('version', String(scenario.version));

    if (scenario.summary) {
      root.appendChild(el(doc, 'Summary', scenario.summary));
    }

    // 1. Metadata
    if (scenario.scenarioMetadata) {
      exportMetadata(doc, root, scenario.scenarioMetadata);
    }

    // 2. SimulationParameters
    if (scenario.metadata) {
      const simEl = doc.createElement('SimulationParameters');
      if (scenario.metadata.startTime) simEl.appendChild(el(doc, 'StartTime', scenario.metadata.startTime));
      if (scenario.metadata.endTime) simEl.appendChild(el(doc, 'EndTime', scenario.metadata.endTime));
      if (scenario.metadata.generatedAt) simEl.appendChild(el(doc, 'GeneratedAt', scenario.metadata.generatedAt));
      if (scenario.metadata.modelUsed) simEl.appendChild(el(doc, 'ModelUsed', scenario.metadata.modelUsed));
      if (scenario.metadata.confidence !== undefined) simEl.appendChild(el(doc, 'Confidence', String(scenario.metadata.confidence)));
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

    // 7. Routes
    if (scenario.routes?.length) {
      exportRoutes(doc, root, scenario.routes);
    }

    // 8. DetectionZones
    if (scenario.detectionZones?.length) {
      exportDetectionZones(doc, root, scenario.detectionZones);
    }

    // 9. VisualEffects
    if (scenario.visualEffects) {
      exportVisualEffects(doc, root, scenario.visualEffects);
    }

    // 10. StrikeTasks
    if (scenario.strikeTasks?.length) {
      exportStrikeTasks(doc, root, scenario.strikeTasks);
    }

    // 11. Phases
    if (scenario.phases?.length) {
      exportPhases(doc, root, scenario.phases);
    }

    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(doc);
    // 添加 XML 声明
    return `<?xml version="1.0" encoding="UTF-8"?>\n${raw}`;
  }
}
