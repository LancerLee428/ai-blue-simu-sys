/**
 * 部署配置系统的完整类型定义
 */
import type { EntityStatus, ForceSide, PlatformType } from './tactical-scenario';

/**
 * 装备挂载配置
 */
export interface WeaponMount {
  equipmentId: string;
  slotName: string;
  status: 'operational' | 'damaged' | 'maintenance';
  ammunition: number; // 0-100
  count: number;
}

export interface SensorConfig {
  equipmentId: string;
  slotName: string;
  status: 'operational' | 'damaged' | 'maintenance';
  sensitivity: number; // 0-100
  mode: 'active' | 'passive';
}

export interface CommConfig {
  equipmentId: string;
  slotName: string;
  status: 'operational' | 'damaged' | 'maintenance';
  frequency: string;
  encryption: boolean;
}

export interface EquipmentStatus {
  overall: number; // 0-100 整体完好率
  details: {
    propulsion: number;
    weapons: number;
    sensors: number;
    communication: number;
  };
}

/**
 * 完整的场景实体
 */
export interface ScenarioEntity {
  // 基础信息
  id: string;
  sourceEntityId: string;
  name: string;
  category: 'force-unit' | 'platform';
  forceSide?: ForceSide;
  platformType?: PlatformType;
  modelId?: string;
  speed?: number;

  // 位置信息（稳定存储）
  currentPosition: {
    longitude: number;
    latitude: number;
    altitude: number;
  };

  // 状态信息
  currentStatus: EntityStatus;

  // 组织关系
  organization: {
    parentId?: string;
    childrenIds: string[];
    squadronId?: string;
    missionId?: string;
  };

  // 装备配置
  loadout: {
    weapons: WeaponMount[];
    sensors: SensorConfig[];
    communication: CommConfig[];
    equipmentStatus: EquipmentStatus;
  };

  // 任务配置
  missionConfig?: {
    primaryMission: string;
    secondaryMissions: string[];
    rulesOfEngagement: string;
    coordinationPoints: string[];
  };

  // 元数据
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    version: number;
    tags: string[];
    notes: string;
  };
}

/**
 * 实体创建配置
 */
export interface EntityConfig {
  sourceEntityId: string;
  name: string;
  forceSide?: ForceSide;
  platformType?: PlatformType;
  modelId?: string;
  speed?: number;
  initialStatus?: EntityStatus;
  position: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
  organization?: {
    parentId?: string;
    squadronId?: string;
    missionId?: string;
  };
  loadout?: {
    weapons: Omit<WeaponMount, 'status'>[];
    sensors: Omit<SensorConfig, 'status'>[];
    communication: Omit<CommConfig, 'status'>[];
  };
  missionConfig?: ScenarioEntity['missionConfig'];
}

/**
 * Ontology 装备定义
 */
export interface OntologyEquipment {
  id: string;
  name: string;
  type: 'weapon' | 'sensor' | 'communication';
  compatibility: string[];
  weight: number;
  powerRequirement: number;
  slotType: string;
  description?: string;
}

/**
 * 挂载点定义
 */
export interface MountPoint {
  id: string;
  name: string;
  slotType: string;
  maxCapacity: number;
  compatibleTypes: string[];
}

/**
 * 编队/编组定义
 */
export interface Squadron {
  id: string;
  name: string;
  type: 'air' | 'naval' | 'ground' | 'mixed';
  parentId?: string;
  commanderId?: string;
}

/**
 * 任务定义
 */
export interface Mission {
  id: string;
  name: string;
  type: 'strike' | 'reconnaissance' | 'escort' | 'patrol' | 'support';
  description: string;
  priority: 'low' | 'medium' | 'high';
}
