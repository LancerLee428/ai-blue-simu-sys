import { ref, reactive } from 'vue';
import type { ScenarioEntity, EntityConfig } from '../types/deployment';

/**
 * 实体状态管理器
 * 提供稳定的实体存储，解决随机位置问题
 */
export class EntityStateManager {
  private entities: Map<string, ScenarioEntity> = new Map();
  private listeners: Set<() => void> = new Set();

  /**
   * 获取所有实体
   */
  getAllEntities(): ScenarioEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * 获取单个实体
   */
  getEntity(id: string): ScenarioEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * 创建新实体
   */
  async createEntity(config: EntityConfig): Promise<ScenarioEntity> {
    const now = new Date().toISOString();

    const entity: ScenarioEntity = {
      id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceEntityId: config.sourceEntityId,
      name: config.name,
      category: 'platform', // 从源实体获取
      forceSide: config.forceSide ?? 'red',
      platformType: config.platformType ?? 'facility-command',
      modelId: config.modelId,
      speed: config.speed,

      // 位置信息 - 稳定存储，不再随机
      currentPosition: {
        longitude: config.position.longitude,
        latitude: config.position.latitude,
        altitude: config.position.altitude,
      },

      currentStatus: config.initialStatus ?? 'deployed',

      // 组织关系
      organization: {
        parentId: config.organization?.parentId,
        childrenIds: [],
        squadronId: config.organization?.squadronId,
        missionId: config.organization?.missionId,
      },

      // 装备配置
      loadout: {
        weapons: config.loadout?.weapons.map(w => ({
          ...w,
          status: 'operational',
          ammunition: 100
        })) || [],
        sensors: config.loadout?.sensors.map(s => ({
          ...s,
          status: 'operational',
          sensitivity: 80
        })) || [],
        communication: config.loadout?.communication.map(c => ({
          ...c,
          status: 'operational',
          encryption: true
        })) || [],
        equipmentStatus: {
          overall: 100,
          details: {
            propulsion: 100,
            weapons: 100,
            sensors: 100,
            communication: 100,
          }
        }
      },

      // 任务配置
      missionConfig: config.missionConfig,

      // 元数据
      metadata: {
        createdAt: now,
        updatedAt: now,
        createdBy: 'user',
        version: 1,
        tags: [],
        notes: ''
      }
    };

    this.entities.set(entity.id, entity);

    // 更新父实体的childrenIds
    if (entity.organization.parentId) {
      const parent = this.entities.get(entity.organization.parentId);
      if (parent) {
        parent.organization.childrenIds.push(entity.id);
        this.entities.set(parent.id, parent);
      }
    }

    this.notifyListeners();
    this.saveToLocalStorage();

    return entity;
  }

  /**
   * 更新实体
   */
  async updateEntity(id: string, updates: Partial<Omit<ScenarioEntity, 'id' | 'sourceEntityId' | 'metadata'>>): Promise<ScenarioEntity | null> {
    const existing = this.entities.get(id);
    if (!existing) return null;

    const updated: ScenarioEntity = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        updatedAt: new Date().toISOString(),
        version: existing.metadata.version + 1
      }
    };

    this.entities.set(id, updated);
    this.notifyListeners();
    this.saveToLocalStorage();

    return updated;
  }

  /**
   * 删除实体
   */
  async deleteEntity(id: string): Promise<boolean> {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // 从父实体的childrenIds中移除
    if (entity.organization.parentId) {
      const parent = this.entities.get(entity.organization.parentId);
      if (parent) {
        parent.organization.childrenIds = parent.organization.childrenIds.filter(childId => childId !== id);
        this.entities.set(parent.id, parent);
      }
    }

    // 递归删除子实体
    for (const childId of entity.organization.childrenIds) {
      await this.deleteEntity(childId);
    }

    this.entities.delete(id);
    this.notifyListeners();
    this.saveToLocalStorage();

    return true;
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  /**
   * 保存到本地存储
   */
  private saveToLocalStorage() {
    try {
      const data = JSON.stringify(Array.from(this.entities.values()));
      localStorage.setItem('scenario_entities', data);
    } catch (error) {
      console.error('保存到本地存储失败:', error);
    }
  }

  /**
   * 从本地存储加载
   */
  loadFromLocalStorage() {
    try {
      const data = localStorage.getItem('scenario_entities');
      if (data) {
        const entities = JSON.parse(data) as ScenarioEntity[];
        this.entities.clear();
        entities.forEach(entity => {
          this.entities.set(entity.id, entity);
        });
        this.notifyListeners();
      }
    } catch (error) {
      console.error('从本地存储加载失败:', error);
    }
  }

  /**
   * 清空所有实体
   */
  clearAll() {
    this.entities.clear();
    this.notifyListeners();
    this.saveToLocalStorage();
  }
}

// 全局单例
export const entityStateManager = new EntityStateManager();
