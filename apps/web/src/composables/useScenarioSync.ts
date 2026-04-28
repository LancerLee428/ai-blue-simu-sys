import { ref, computed } from 'vue';
import { usePlatformStore } from '../stores/platform';
import type { ScenarioEntity } from '../services/cesium-graphics';

/**
 * Scenario 同步组合式函数
 * 处理 Cesium 实体与后端 Scenario 状态的双向同步
 */
export function useScenarioSync() {
  const store = usePlatformStore();

  // 本地实体列表（用于演示）
  const localEntities = ref<ScenarioEntity[]>([]);

  // 从 Pinia store 转换为 ScenarioEntity 格式
  const scenarioEntities = computed<ScenarioEntity[]>(() => {
    const entities: ScenarioEntity[] = [];

    // 从 store 加载现有实体
    if (store.platform?.scenarioWorkspace?.projections) {
      store.platform.scenarioWorkspace.projections.forEach((projection) => {
        entities.push({
          id: projection.id,
          sourceEntityId: projection.sourceEntityId,
          name: projection.name,
          category: projection.category,
          currentPosition: {
            // 从 location 字符串解析坐标（格式："台湾北部空域"）
            // 在实际应用中这里应该有真实的 GeoPosition 数据
            longitude: 121.0 + Math.random() * 2,
            latitude: 23.0 + Math.random() * 2,
            altitude: 0,
          },
          currentStatus: projection.status === 'deployed' ? 'deployed' : 'planned',
        });
      });
    }

    // 合并本地创建的实体
    localEntities.value.forEach(entity => {
      if (!entities.find(e => e.id === entity.id)) {
        entities.push(entity);
      }
    });

    return entities;
  });

  // 源实体映射
  const sourceEntities = computed(() => {
    const map = new Map();
    // 这里应该从 Ontology 加载源实体数据
    // 暂时返回空映射，后续会实现真实的 Ontology 集成
    return map;
  });

  /**
   * 更新实体位置
   */
  async function updateEntityPosition(
    entityId: string,
    position: { longitude: number; latitude: number }
  ) {
    console.log('更新实体位置:', entityId, position);

    // 找到对应的投影
    const projection = store.platform?.scenarioWorkspace?.projections.find(
      p => p.id === entityId
    );

    if (projection) {
      // 更新本地区域（乐观更新）
      const updatedPosition = `经度: ${position.longitude.toFixed(4)}, 纬度: ${position.latitude.toFixed(4)}`;

      // 在实际应用中，这里应该调用 API 更新后端
      // await store.updateProjectionPosition(entityId, position);

      console.log('位置已更新为:', updatedPosition);
    }
  }

  /**
   * 更新实体状态
   */
  async function updateEntityStatus(entityId: string, status: string) {
    console.log('更新实体状态:', entityId, status);

    // 找到对应的投影
    const projection = store.platform?.scenarioWorkspace?.projections.find(
      p => p.id === entityId
    );

    if (projection) {
      // 在实际应用中，这里应该调用 API 更新后端
      // await store.updateProjectionStatus(entityId, status);

      console.log('状态已更新为:', status);
    }
  }

  /**
   * 添加新实体到场景
   */
  async function addEntityToScenario(
    sourceEntityId: string,
    position: { longitude: number; latitude: number }
  ): Promise<ScenarioEntity> {
    console.log('添加实体到场景:', sourceEntityId, position);

    // 创建新实体
    const newEntity: ScenarioEntity = {
      id: `entity-${Date.now()}`,
      sourceEntityId,
      name: `部署实体 ${localEntities.value.length + 1}`,
      category: 'platform',
      currentPosition: {
        longitude: position.longitude,
        latitude: position.latitude,
        altitude: 0,
      },
      currentStatus: 'planned',
    };

    // 添加到本地列表
    localEntities.value.push(newEntity);

    // 在实际应用中，这里应该调用 API 创建新的投影
    // const newProjection = await store.createProjection(sourceEntityId, position);

    console.log('实体已添加到场景:', newEntity);
    return newEntity;
  }

  return {
    scenarioEntities,
    sourceEntities,
    updateEntityPosition,
    updateEntityStatus,
    addEntityToScenario,
  };
}