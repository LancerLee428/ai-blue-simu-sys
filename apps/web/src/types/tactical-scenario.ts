/**
 * 开普勒轨道根数
 */
export interface KeplerianOrbit {
  type: 'Keplerian';
  semiMajorAxis: number;   // 半长轴 (km)
  eccentricity: number;    // 偏心率
  inclination: number;     // 倾角 (deg)
  raan: number;            // 升交点赤经 (deg)
  argOfPerigee: number;    // 近地点幅角 (deg)
  trueAnomaly: number;     // 真近点角 (deg)
  epoch: string;           // 历元时间
}

/**
 * TLE 轨道
 */
export interface TLEOrbit {
  type: 'TLE';
  line1: string;
  line2: string;
}

export type OrbitState = KeplerianOrbit | TLEOrbit;

/**
 * 地理坐标
 */
export interface GeoPosition {
  longitude: number;
  latitude: number;
  altitude: number;
  orbit?: OrbitState;  // 轨道参数（航天装备使用）
}

// ---------------------------------------------------------------------------
// XML 想定扩展类型
// ---------------------------------------------------------------------------

/**
 * 组件参数
 */
export interface ComponentParam {
  key: string;
  value: string | number;
  unit?: string;
}

/**
 * 装备组件配置
 */
export interface EquipmentComponent {
  id: string;
  name: string;
  type: string;  // 如 'space_mover', 'sensor_optical', 'maneuver_adcs', 'comm_ka', 'support_eps', 'faclity_mover'
  performanceParams?: ComponentParam[];
  dynamicParams?: ComponentParam[];
  initialParams?: ComponentParam[];
  initialState?: {
    positionType?: 'Geodetic' | 'Keplerian';
    // 地面位置
    longitude?: number;
    latitude?: number;
    altitude?: number;
    // 轨道状态
    orbitType?: 'Keplerian';
    semiMajorAxis?: number;
    eccentricity?: number;
    inclination?: number;
    raan?: number;
    argOfPerigee?: number;
    trueAnomaly?: number;
    epoch?: string;
  };
}

// --- 任务配置类型 ---

export type BehaviorNodeType = 'Sequence' | 'Selector' | 'Parallel';

export interface ActionNode {
  nodeType: 'Action';
  name: string;
  component: string;
  params: ComponentParam[];
}

export interface ConditionNode {
  nodeType: 'Condition';
  name: string;
  params: ComponentParam[];
}

export interface CompositeNode {
  nodeType: BehaviorNodeType;
  name: string;
  children: BehaviorTreeNode[];
}

export type BehaviorTreeNode = ActionNode | ConditionNode | CompositeNode;

export interface BehaviorTreeConfig {
  root: CompositeNode;
}

export interface StateTransition {
  event: string;
  target: string;
}

export interface StateAction {
  component: string;
  params: ComponentParam[];
}

export interface MachineState {
  name: string;
  entryAction?: StateAction;
  exitAction?: StateAction;
  transitions: StateTransition[];
}

export interface StateMachineConfig {
  initialState: string;
  states: MachineState[];
}

export interface Instruction {
  id: string;
  time: string;  // 如 "T+0h:10m:00s"
  type: string;
  component: string;
  params: ComponentParam[];
}

export interface InstructionSeqConfig {
  instructions: Instruction[];
}

export interface TaskConfig {
  id: string;
  equipRef: string;
  name: string;
  type: 'BehaviorTree' | 'StateMachine' | 'InstructionSeq';
  config: BehaviorTreeConfig | StateMachineConfig | InstructionSeqConfig;
}

// --- 环境配置类型 ---

export interface SpaceEnvironmentConfig {
  solarActivity: { fluxLevel: number; sunspotNumber: number };
  geomagneticField: { kpIndex: number; apIndex: number };
  ionosphere: { modelType: string; totalElectronContent: number };
  dataResolution: { latitudeStep: number; longitudeStep: number; altitudeStep: number };
  timeStep: number;
  modelServiceUrl: string;
  dataGenerationUrl: string;
}

export interface AtmosphereModelConfig {
  weather: string;
  rainLevel: string;
  windSpeed: number;
  windDirection: number;
  coverageArea: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  dataResolution: { latitudeStep: number; longitudeStep: number; altitudeStep: number };
  timeStep: number;
  modelServiceUrl: string;
  dataGenerationUrl: string;
}

export interface EffectModel {
  id: string;
  category: string;
  name: string;
  enabled: boolean;
  params: ComponentParam[];
}

export interface EnvironmentEvent {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  type: string;
  level: number;
  affectedArea?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  params: ComponentParam[];
}

export interface EnvironmentConfig {
  generationModels: {
    spaceEnvironment?: SpaceEnvironmentConfig;
    atmosphereModel?: AtmosphereModelConfig;
  };
  effectModels: EffectModel[];
  events: EnvironmentEvent[];
}

// --- 交互配置类型 ---

export interface GroupMember {
  equipRef: string;
  role?: string;
}

export interface EquipmentGroup {
  id: string;
  name: string;
  members: GroupMember[];
  children?: EquipmentGroup[];
}

export interface CommandControlLink {
  id: string;
  commander: string;
  subordinate: string;
  protocol: string;
  latency?: number;
}

export interface CommunicationLink {
  id: string;
  sender: { equipRef: string; component?: string };
  receiver: { equipRef: string; component?: string };
  dataType: string;
  protocol: string;
  maxRange?: number;
  dataRate?: number;
}

export interface DetectionLink {
  id: string;
  observer: { equipRef: string; component?: string };
  target: string;
  sensorType: string;
}

export interface InteractionConfig {
  groups: EquipmentGroup[];
  commandControl: CommandControlLink[];
  communications: CommunicationLink[];
  detectionLinks: DetectionLink[];
}

// --- 想定元数据 ---

export interface ScenarioMetadata {
  name: string;
  version: string;
  description: string;
  taskSource?: string;
  createUnit?: string;
  author?: string;
  createTime?: string;
  modifyTime?: string;
  category?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// 平台分类体系
// ---------------------------------------------------------------------------

/**
 * 平台大类
 */
export type PlatformCategory = 'air' | 'naval' | 'ground' | 'munition' | 'facility';

/**
 * 部署域：实体合法存在的空间域
 *   air        — 空域（altitude > 0）
 *   ground     — 陆地地面（altitude ≈ 0，需在陆地）
 *   surface    — 海面（altitude ≈ 0，需在水域）
 *   underwater — 水下（altitude < 0，需在水域）
 */
export type DeploymentDomain = 'air' | 'ground' | 'surface' | 'underwater';

/**
 * 地形要求（初始部署位置的陆海约束）
 *   land  — 必须在陆地
 *   sea   — 必须在水域（海面或水下）
 *   any   — 无限制（公海/陆均可）
 */
export type TerrainRequirement = 'land' | 'sea' | 'any';

/**
 * 平台元数据（域约束 + 高度默认值）
 */
export interface PlatformMeta {
  category: PlatformCategory;
  /** 初始部署时允许的域（停放/锚泊状态） */
  deployDomains: DeploymentDomain[];
  /** 地形要求 */
  terrainRequirement: TerrainRequirement;
  /** 是否可自主移动 */
  mobile: boolean;
  /** 作战时的运动域 */
  operatingDomain: DeploymentDomain;
  /** 默认高度（米），用于 AI 高度自动修正 */
  defaultAltitude: number;
}

/**
 * 平台类型（二级分类，~25 种）
 *
 * 空中力量 ─────────────────────────────────────────────
 *   air-fighter      战斗机（歼-16/F-35 等）
 *   air-multirole    多用途战斗机（歼-20 等）
 *   air-bomber       轰炸机（歼轰-7/H-6K 等）
 *   air-jammer       电子战机（歼-16D 等）
 *   air-aew          预警机（空警-500 等）
 *   air-recon        侦察机（无侦-7 等有人/无人侦察）
 *   helo-attack      武装直升机（武直-10 等）
 *   helo-transport   运输直升机（直-20 等）
 *   uav-strike       察打一体无人机（翼龙-2 等）
 *   uav-recon        侦察无人机
 *   uav-swarm        无人机蜂群
 *
 * 海上力量 ─────────────────────────────────────────────
 *   ship-carrier     航空母舰
 *   ship-destroyer   驱逐舰
 *   ship-frigate     护卫舰
 *   ship-submarine   潜艇（可在水面/水下）
 *   ship-amphibious  两栖舰
 *   ship-usv         无人艇
 *
 * 地面力量 ─────────────────────────────────────────────
 *   ground-tank      坦克
 *   ground-ifv       步兵战车
 *   ground-spg       自行火炮
 *   ground-mlrs      多管火箭炮
 *   ground-sam       防空导弹系统
 *   ground-radar     地面雷达站
 *   ground-ew        电子战车
 *   ground-hq        指挥所
 *
 * 设施 ─────────────────────────────────────────────────
 *   facility-airbase   机场/军事基地
 *   facility-port      港口
 *   facility-command   指挥中心
 *   facility-radar     固定雷达站
 *   facility-target    打击目标（通用）
 */
export type PlatformType =
  // 空中力量
  | 'air-fighter'
  | 'air-multirole'
  | 'air-bomber'
  | 'air-jammer'
  | 'air-aew'
  | 'air-recon'
  | 'helo-attack'
  | 'helo-transport'
  | 'uav-strike'
  | 'uav-recon'
  | 'uav-swarm'
  // 海上力量
  | 'ship-carrier'
  | 'ship-destroyer'
  | 'ship-frigate'
  | 'ship-submarine'
  | 'ship-amphibious'
  | 'ship-usv'
  // 地面力量
  | 'ground-tank'
  | 'ground-ifv'
  | 'ground-spg'
  | 'ground-mlrs'
  | 'ground-sam'
  | 'ground-radar'
  | 'ground-ew'
  | 'ground-hq'
  // 设施
  | 'facility-airbase'
  | 'facility-port'
  | 'facility-command'
  | 'facility-radar'
  | 'facility-target';

/**
 * 所有平台类型的元数据表（验证器、图标服务共用）
 */
export const PLATFORM_META: Record<PlatformType, PlatformMeta> = {
  // ── 空中力量 ──────────────────────────────────────────
  'air-fighter':     { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 10000 },
  'air-multirole':   { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 10000 },
  'air-bomber':      { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 8000  },
  'air-jammer':      { category: 'air',      deployDomains: ['ground', 'surface'], terrainRequirement: 'any',  mobile: true,  operatingDomain: 'air',     defaultAltitude: 9000  },
  'air-aew':         { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 10000 },
  'air-recon':       { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 12000 },
  'helo-attack':     { category: 'air',      deployDomains: ['ground', 'surface'], terrainRequirement: 'any',  mobile: true,  operatingDomain: 'air',     defaultAltitude: 1500  },
  'helo-transport':  { category: 'air',      deployDomains: ['ground', 'surface'], terrainRequirement: 'any',  mobile: true,  operatingDomain: 'air',     defaultAltitude: 1000  },
  'uav-strike':      { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 5000  },
  'uav-recon':       { category: 'air',      deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'air',     defaultAltitude: 6000  },
  'uav-swarm':       { category: 'air',      deployDomains: ['ground', 'surface'], terrainRequirement: 'any',  mobile: true,  operatingDomain: 'air',     defaultAltitude: 500   },

  // ── 海上力量 ──────────────────────────────────────────
  'ship-carrier':    { category: 'naval',    deployDomains: ['surface'],           terrainRequirement: 'sea',  mobile: true,  operatingDomain: 'surface',  defaultAltitude: 0    },
  'ship-destroyer':  { category: 'naval',    deployDomains: ['surface'],           terrainRequirement: 'sea',  mobile: true,  operatingDomain: 'surface',  defaultAltitude: 0    },
  'ship-frigate':    { category: 'naval',    deployDomains: ['surface'],           terrainRequirement: 'sea',  mobile: true,  operatingDomain: 'surface',  defaultAltitude: 0    },
  'ship-submarine':  { category: 'naval',    deployDomains: ['surface', 'underwater'], terrainRequirement: 'sea', mobile: true, operatingDomain: 'underwater', defaultAltitude: -200 },
  'ship-amphibious': { category: 'naval',    deployDomains: ['surface'],           terrainRequirement: 'sea',  mobile: true,  operatingDomain: 'surface',  defaultAltitude: 0    },
  'ship-usv':        { category: 'naval',    deployDomains: ['surface'],           terrainRequirement: 'sea',  mobile: true,  operatingDomain: 'surface',  defaultAltitude: 0    },

  // ── 地面力量 ──────────────────────────────────────────
  'ground-tank':     { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-ifv':      { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-spg':      { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-mlrs':     { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-sam':      { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-radar':    { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: false, operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-ew':       { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: true,  operatingDomain: 'ground',   defaultAltitude: 0    },
  'ground-hq':       { category: 'ground',   deployDomains: ['ground'],            terrainRequirement: 'land', mobile: false, operatingDomain: 'ground',   defaultAltitude: 0    },

  // ── 设施 ──────────────────────────────────────────────
  'facility-airbase':  { category: 'facility', deployDomains: ['ground'],          terrainRequirement: 'land', mobile: false, operatingDomain: 'ground',   defaultAltitude: 0    },
  'facility-port':     { category: 'facility', deployDomains: ['ground'],          terrainRequirement: 'land', mobile: false, operatingDomain: 'ground',   defaultAltitude: 0    },
  'facility-command':  { category: 'facility', deployDomains: ['ground'],          terrainRequirement: 'land', mobile: false, operatingDomain: 'ground',   defaultAltitude: 0    },
  'facility-radar':    { category: 'facility', deployDomains: ['ground'],          terrainRequirement: 'land', mobile: false, operatingDomain: 'ground',   defaultAltitude: 0    },
  'facility-target':   { category: 'facility', deployDomains: ['ground', 'surface'], terrainRequirement: 'any', mobile: false, operatingDomain: 'ground',  defaultAltitude: 0    },
};

/**
 * 实体状态
 */
export type EntityStatus = 'planned' | 'deployed' | 'engaged' | 'destroyed';

/**
 * 红蓝方
 */
export type ForceSide = 'red' | 'blue';

/**
 * 打击事件类型
 */
export type TacticalEventType = 'movement' | 'detection' | 'attack' | 'destruction';

/**
 * 战术事件
 */
export interface TacticalEvent {
  type: TacticalEventType;
  timestamp: number;          // 阶段内相对时间（秒）
  sourceEntityId: string;
  targetEntityId?: string;
  detail: string;              // 人类可读描述
}

/**
 * 阶段内实体状态快照
 */
export interface EntityStateInPhase {
  entityId: string;
  position: GeoPosition;
  status: EntityStatus;
  detectionRange?: number;     // 探测半径（米）
  attackTarget?: string;       // 打击目标 entityId
}

/**
 * 行动阶段
 */
export interface Phase {
  id: string;
  name: string;               // 如"第一阶段：压制防空"
  description: string;
  duration: number;            // 预计持续时间（秒）
  events: TacticalEvent[];      // 关键事件（时刻轴顺序排列）
  entityStates: EntityStateInPhase[];
}

/**
 * 实体规格（AI 生成时使用）
 */
export interface EntitySpec {
  id: string;
  name: string;
  type: PlatformType;
  side: ForceSide;
  position: GeoPosition;
  loadout?: {
    weapons: string[];
    sensors: string[];
  };
  // XML 扩展字段
  modelId?: string;
  modelType?: string;
  interfaceProtocol?: string;
  federateName?: string;
  components?: EquipmentComponent[];
  taskRef?: string;
}

/**
 * 路线点
 */
export interface RoutePoint {
  position: GeoPosition;
  timestamp?: number;         // 从起点开始的相对时间（秒）
}

/**
 * 路线
 */
export interface Route {
  entityId: string;
  side: ForceSide;
  points: RoutePoint[];
  label?: string;             // 如"主攻路线"、"迂回路线"
}

/**
 * 探测范围
 */
export interface DetectionZone {
  entityId: string;
  side: ForceSide;
  center: GeoPosition;
  radiusMeters: number;
  label?: string;
}

/**
 * 打击任务
 */
export interface StrikeTask {
  id: string;
  attackerEntityId: string;
  targetEntityId: string;
  phaseId: string;
  timestamp: number;
  detail: string;
}

/**
 * 战术想定（AI 生成结果）
 */
export interface TacticalScenario {
  id: string;
  version: number;
  summary: string;             // 一句话方案描述

  // 红蓝双方兵力
  forces: {
    side: ForceSide;
    name: string;              // 如"红方空中突击群"
    entities: EntitySpec[];
  }[];

  // 进攻路线
  routes: Route[];

  // 探测范围
  detectionZones: DetectionZone[];

  // 打击任务
  strikeTasks: StrikeTask[];

  // 行动阶段
  phases: Phase[];

  // 元数据
  metadata: {
    generatedAt: string;
    modelUsed: string;
    confidence: number;
    startTime?: string;
    endTime?: string;
  };

  // XML 扩展字段
  scenarioMetadata?: ScenarioMetadata;
  tasks?: TaskConfig[];
  environment?: EnvironmentConfig;
  interactions?: InteractionConfig;
}

/**
 * AI 对话消息
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  scenario?: TacticalScenario;
}

/**
 * 执行状态
 */
export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed';

/**
 * 执行快照（用于撤销）
 */
export interface ExecutionSnapshot {
  phaseIndex: number;
  entityPositions: Record<string, GeoPosition>;
  entityStatuses: Record<string, EntityStatus>;
}
