/**
 * 地理坐标
 */
export interface GeoPosition {
  longitude: number;
  latitude: number;
  altitude: number;
}

/**
 * 平台类型（简化枚举）
 */
export type PlatformType =
  | 'aircraft-fighter'
  | 'aircraft-bomber'
  | 'aircraft-recon'
  | 'aircraft-helicopter'
  | 'ship'
  | 'ground-vehicle'
  | 'missile'
  | 'drone';

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
  };
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
