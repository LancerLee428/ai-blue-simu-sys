import { ref, computed, onMounted } from 'vue';
import { entityStateManager } from '../services/entity-state-manager';
import type { ScenarioEntity, EntityConfig } from '../types/deployment';

/**
 * 实体状态管理 Composable
 * 提供响应式的实体状态访问
 */
export function useEntityState() {
  const entities = ref<ScenarioEntity[]>([]);
  const loading = ref(false);

  // 初始化 - 从本地存储加载
  onMounted(() => {
    loading.value = true;
    entityStateManager.loadFromLocalStorage();
    entities.value = entityStateManager.getAllEntities();
    loading.value = false;

    // 订阅状态变化
    const unsubscribe = entityStateManager.subscribe(() => {
      entities.value = entityStateManager.getAllEntities();
    });

    // 组件卸载时取消订阅
    return unsubscribe;
  });

  /**
   * 创建新实体
   */
  async function createEntity(config: EntityConfig): Promise<ScenarioEntity> {
    const entity = await entityStateManager.createEntity(config);
    return entity;
  }

  /**
   * 更新实体
   */
  async function updateEntity(id: string, updates: Partial<Omit<ScenarioEntity, 'id' | 'sourceEntityId' | 'metadata'>>) {
    return await entityStateManager.updateEntity(id, updates);
  }

  /**
   * 删除实体
   */
  async function deleteEntity(id: string) {
    return await entityStateManager.deleteEntity(id);
  }

  /**
   * 获取单个实体
   */
  function getEntity(id: string): ScenarioEntity | undefined {
    return entityStateManager.getEntity(id);
  }

  /**
   * 按编队分组
   */
  const entitiesBySquadron = computed(() => {
    const groups = new Map<string, ScenarioEntity[]>();
    entities.value.forEach(entity => {
      const squadronId = entity.organization.squadronId || 'ungrouped';
      if (!groups.has(squadronId)) {
        groups.set(squadronId, []);
      }
      groups.get(squadronId)!.push(entity);
    });
    return groups;
  });

  /**
   * 获取实体树结构
   */
  const entityTree = computed(() => {
    const roots = entities.value.filter(e => !e.organization.parentId);

    function buildTree(entity: ScenarioEntity): ScenarioEntity & { children: ScenarioEntity[] } {
      const children = entity.organization.childrenIds
        .map(id => entities.value.find(e => e.id === id))
        .filter(Boolean) as ScenarioEntity[];

      return {
        ...entity,
        children: children.map(buildTree)
      };
    }

    return roots.map(buildTree);
  });

  return {
    entities,
    loading,
    entitiesBySquadron,
    entityTree,
    createEntity,
    updateEntity,
    deleteEntity,
    getEntity
  };
}