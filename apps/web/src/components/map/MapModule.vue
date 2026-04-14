<script setup lang="ts">
import { ref, computed } from 'vue';
import * as Cesium from 'cesium';
import CesiumMap from '../cesium/CesiumMap.vue';
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

// 拖拽状态
const isDraggingOver = ref(false);
const draggedResource = ref<{ id: string; name: string; type: string } | null>(null);

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

function handleDragEnter(e: DragEvent) {
  e.preventDefault();
  isDraggingOver.value = true;

  // 尝试获取拖拽数据
  if (e.dataTransfer) {
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        draggedResource.value = JSON.parse(data);
      }
    } catch (err) {
      console.log('无法读取拖拽数据');
    }
  }
}

function handleDragLeave(e: DragEvent) {
  // 只有当真正离开容器时才取消状态
  const target = e.target as HTMLElement;
  if (target.classList.contains('map-module')) {
    isDraggingOver.value = false;
    draggedResource.value = null;
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDraggingOver.value = false;

  // 获取拖拽数据
  if (e.dataTransfer) {
    try {
      const data = e.dataTransfer.getData('application/json');
      if (data) {
        const resource = JSON.parse(data);

        // 计算放置位置（从鼠标位置转换到地图坐标）
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 精确计算地理坐标
        const position = {
          longitude: 121.0 + (x / rect.width) * 2,
          latitude: 25.0 - (y / rect.height) * 2,  // 修正纬度方向
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

  draggedResource.value = null;
}
</script>

<template>
  <div
    class="map-module"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
  >
    <CesiumMap
      :entities="entities"
      :source-entities="sourceEntities"
      :selected-entity-id="selectedEntityId"
      @select="(id) => emit('select', id)"
      @entity-dragged="handleEntityDragged"
      @map-click="handleMapClick"
      @viewer-ready="(v) => emit('viewerReady', v)"
    />
    <EntityPopup />
    <div v-if="isDraggingOver" class="drag-overlay">
      <div class="drag-hint">
        <span v-if="draggedResource">部署 {{ draggedResource.name }}</span>
        <span v-else>释放以部署实体</span>
      </div>
    </div>
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

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 214, 201, 0.1);
  border: 2px dashed rgba(0, 214, 201, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  pointer-events: none;
}

.drag-hint {
  background: rgba(0, 214, 201, 0.9);
  color: #000;
  padding: 16px 24px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  box-shadow: 0 8px 32px rgba(0, 214, 201, 0.3);
}
</style>
