<script setup lang="ts">
import { computed, ref } from 'vue';
import * as Cesium from 'cesium';
import CesiumMap from '../cesium/CesiumMap.vue';

// CesiumMap 实例引用，用于精确屏幕坐标→经纬度转换
const cesiumMapRef = ref<InstanceType<typeof CesiumMap> | null>(null);
import EntityPopup from './EntityPopup.vue';
import EntityPropertiesPanel from '../properties/EntityPropertiesPanel.vue';
import type { ScenarioEntity } from '../../services/cesium-graphics';
import type { ForceUnit, Platform } from '@ai-blue-simu-sys/ontology';

interface Props {
  entities?: ScenarioEntity[];
  sourceEntities?: Map<string, ForceUnit | Platform>;
  selectedEntityId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  entities: () => [],
  sourceEntities: () => new Map(),
  selectedEntityId: null,
});

const emit = defineEmits<{
  (e: 'select', id: string | null): void;
  (e: 'updateEntityPosition', payload: { id: string; position: { longitude: number; latitude: number } }): void;
  (e: 'updateEntityStatus', payload: { id: string; status: string }): void;
  (e: 'showDeploymentConfig', config: {
    sourceEntityId: string;
    sourceEntityName: string;
    position: { longitude: number; latitude: number; altitude: number };
  }): void;
  (e: 'viewerReady', viewer: Cesium.Viewer): void;
}>();

// 当前选中的实体
const selectedEntity = computed(() => {
  if (!props.selectedEntityId) return null;
  return props.entities.find(e => e.id === props.selectedEntityId) || null;
});

// 当前选中的源实体
const selectedSourceEntity = computed(() => {
  if (!selectedEntity.value) return null;
  return props.sourceEntities.get(selectedEntity.value.sourceEntityId);
});

/**
 * 处理实体拖拽
 */
function handleEntityDragged(payload: { id: string; position: { longitude: number; latitude: number } }) {
  emit('updateEntityPosition', payload);
}

/**
 * 处理地图点击（获取位置信息）
 */
function handleMapClick(position: { longitude: number; latitude: number }) {
  console.log('地图点击位置:', position);
}

/**
 * 处理位置更新
 */
function handleUpdatePosition(position: { longitude: number; latitude: number; altitude: number }) {
  if (selectedEntity.value) {
    emit('updateEntityPosition', {
      id: selectedEntity.value.id,
      position: { longitude: position.longitude, latitude: position.latitude },
    });
  }
}

/**
 * 处理状态更新
 */
function handleUpdateStatus(status: string) {
  if (selectedEntity.value) {
    emit('updateEntityStatus', {
      id: selectedEntity.value.id,
      status,
    });
  }
}

/**
 * 拖拽相关事件处理
 */
function handleDragOver(e: DragEvent) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();

  // 获取拖拽数据
  if (e.dataTransfer) {
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        const resource = JSON.parse(data);

        // 通过 Cesium pickEllipsoid 将屏幕坐标精确转换为地理坐标
        // 必须换算为相对于 canvas 左上角的像素坐标
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const latLng = cesiumMapRef.value?.screenToLatLng(screenX, screenY);

        const position = latLng
          ? { longitude: latLng.longitude, latitude: latLng.latitude, altitude: 0 }
          : {
              // 降级回退：Cesium 未就绪时（极少数情况）保留粗略估计
              longitude: 121.0 + (screenX / rect.width) * 2,
              latitude: 25.0 - (screenY / rect.height) * 2,
              altitude: 0,
            };

        // 发射事件显示配置弹窗
        emit('showDeploymentConfig', {
          sourceEntityId: resource.id,
          sourceEntityName: resource.name,
          position,
        });
      }
    } catch (err) {
      console.error('处理拖放失败:', err);
    }
  }
}
</script>

<template>
  <div
    class="map-module"
    @drop="handleDrop"
    @dragover="handleDragOver"
  >
    <CesiumMap
      ref="cesiumMapRef"
      :entities="entities"
      :source-entities="sourceEntities"
      :selected-entity-id="selectedEntityId"
      @select="(id) => emit('select', id)"
      @entity-dragged="handleEntityDragged"
      @map-click="handleMapClick"
      @viewer-ready="(v) => emit('viewerReady', v)"
    />
    <EntityPopup />
    <div class="properties-panel-overlay">
      <EntityPropertiesPanel
        :entity="selectedEntity"
        :source-entity="selectedSourceEntity"
        @update-position="handleUpdatePosition"
        @update-status="handleUpdateStatus"
      />
    </div>
  </div>
</template>

<style scoped>
.map-module {
  width: 100%;
  height: 100%;
  position: relative;
}

.properties-panel-overlay {
  position: absolute;
  top: 60px;
  right: 20px;
  width: 320px;
  max-height: calc(100% - 80px);
  z-index: 100;
}

</style>
