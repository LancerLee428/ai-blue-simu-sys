<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as Cesium from 'cesium';
import { useCesium } from '../../composables/useCesium';
import { useEntitySelection } from '../../composables/useEntitySelection';
import {
  getEntityGraphics,
  setInitialView,
  flyToEntity,
  highlightEntity,
  type ScenarioEntity,
} from '../../services/cesium-graphics';

interface Props {
  entities?: ScenarioEntity[];
  selectedEntityId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  entities: () => [],
  selectedEntityId: null,
});

const emit = defineEmits<{
  (e: 'select', id: string | null): void;
  (e: 'entityDragged', payload: { id: string; position: { longitude: number; latitude: number } }): void;
  (e: 'mapClick', position: { longitude: number; latitude: number }): void;
  (e: 'viewerReady', viewer: Cesium.Viewer): void;
}>();

const mapContainer = ref<HTMLDivElement | null>(null);
const { viewer, isReady, initViewer, destroyViewer } = useCesium();

// 拖拽状态
const draggingEntity = ref<{ id: string; startPosition: Cesium.Cartesian3 } | null>(null);
const manualEntityIds = new Set<string>();

/**
 * 增量更新手工部署实体，不影响 XML/AI 想定图层。
 */
function upsertManualEntities() {
  if (!viewer.value) return;

  const nextIds = new Set(props.entities.map(entity => entity.id));
  manualEntityIds.forEach((id) => {
    if (!nextIds.has(id)) {
      viewer.value!.entities.removeById(id);
      manualEntityIds.delete(id);
    }
  });

  props.entities.forEach((entity) => {
    const graphics = getEntityGraphics(entity);
    const existing = viewer.value!.entities.getById(entity.id);
    if (existing && !manualEntityIds.has(entity.id)) {
      return;
    }
    if (existing) {
      viewer.value!.entities.removeById(entity.id);
    }
    const cesiumEntity = viewer.value!.entities.add({
      id: entity.id,
      ...graphics,
    });
    (cesiumEntity as any).__manualDeploymentLayer = true;
    manualEntityIds.add(entity.id);
  });

  // 高亮选中的实体
  if (props.selectedEntityId) {
    highlightEntity(viewer.value, props.selectedEntityId, true);
  }
}

/**
 * 初始化拖拽处理器
 */
function initDragHandler() {
  if (!viewer.value) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.value.scene.canvas);

  // 拖拽功能已临时禁用 - 避免与地图拖拽冲突
  // TODO: 未来可以通过按住特定键（如 Ctrl）来启用实体拖拽

  // // 鼠标按下 - 检查是否点击了实体
  // handler.setInputAction((movement: any) => {
  //   const pickedObject = viewer.value?.scene.pick(movement.position);
  //   if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
  //     const entityId = pickedObject.id.id;
  //     const entity = viewer.value?.entities.getById(entityId);
  //     if (entity) {
  //       draggingEntity.value = {
  //         id: entityId,
  //         startPosition: movement.position.clone(),
  //       };
  //       // 禁用相机控制器，防止拖拽时地图移动
  //       viewer.value!.scene.screenSpaceCameraController.enableInputs = false;
  //     }
  //   }
  // }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  // // 鼠标移动 - 拖拽实体
  // handler.setInputAction((movement: any) => {
  //   if (draggingEntity.value) {
  //     const cartesian = viewer.value?.scene.camera.pickEllipsoid(
  //       movement.endPosition,
  //       viewer.value.scene.globe.ellipsoid
  //     );
  //     if (cartesian && draggingEntity.value) {
  //       const entity = viewer.value?.entities.getById(draggingEntity.value.id);
  //       if (entity) {
  //         entity.position = cartesian;
  //       }
  //     }
  //   }
  // }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // // 鼠标释放 - 结束拖拽
  // handler.setInputAction((movement: any) => {
  //   if (draggingEntity.value) {
  //     const cartesian = viewer.value?.scene.camera.pickEllipsoid(
  //       movement.position,
  //       viewer.value.scene.globe.ellipsoid
  //     );
  //     if (cartesian) {
  //       const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  //       const longitude = Cesium.Math.toDegrees(cartographic.longitude);
  //       const latitude = Cesium.Math.toDegrees(cartographic.latitude);

  //       emit('entityDragged', {
  //         id: draggingEntity.value.id,
  //         position: { longitude, latitude },
  //       });
  //     }

  //     draggingEntity.value = null;
  //     // 重新启用相机控制器
  //     viewer.value!.scene.screenSpaceCameraController.enableInputs = true;
  //   }
  // }, Cesium.ScreenSpaceEventType.LEFT_UP);

  return handler;
}

/**
 * 初始化点击处理器（处理空白区域点击）
 */
function initClickHandler() {
  if (!viewer.value) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.value.scene.canvas);

  handler.setInputAction((movement: any) => {
    // 检查是否点击了实体
    const pickedObject = viewer.value?.scene.pick(movement.position);

    if (!pickedObject || !Cesium.defined(pickedObject.id)) {
      // 点击了空白区域，获取地面坐标
      const cartesian = viewer.value?.scene.camera.pickEllipsoid(
        movement.position,
        viewer.value.scene.globe.ellipsoid
      );

      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const longitude = Cesium.Math.toDegrees(cartographic.longitude);
        const latitude = Cesium.Math.toDegrees(cartographic.latitude);

        emit('mapClick', { longitude, latitude });
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  return handler;
}

const { initSelectionHandler, destroySelectionHandler } = useEntitySelection(viewer);

let dragHandler: Cesium.ScreenSpaceEventHandler | null = null;
let clickHandler: Cesium.ScreenSpaceEventHandler | null = null;

onMounted(async () => {
  if (!mapContainer.value) return;

  // 等待地图初始化完成
  await initViewer(mapContainer.value);

  // 设置初始视角
  if (viewer.value) {
    setInitialView(viewer.value);
    emit('viewerReady', viewer.value);
  }

  initSelectionHandler((id) => emit('select', id));
  dragHandler = initDragHandler();
  clickHandler = initClickHandler();
  upsertManualEntities();
});

onBeforeUnmount(() => {
  destroySelectionHandler();
  destroyViewer();
  if (dragHandler) {
    dragHandler.destroy();
    dragHandler = null;
  }
  if (clickHandler) {
    clickHandler.destroy();
    clickHandler = null;
  }
});

// 监听实体变化
watch(() => props.entities, upsertManualEntities, { deep: true });

// 监听选中状态变化
watch(() => props.selectedEntityId, (newId, oldId) => {
  if (oldId && viewer.value) {
    highlightEntity(viewer.value, oldId, false);
  }
  if (newId && viewer.value) {
    highlightEntity(viewer.value, newId, true);
    flyToEntity(viewer.value, newId);
  }
});

/**
 * 暴露方法给父组件
 */
defineExpose({
  flyToEntity: (id: string) => {
    if (viewer.value) {
      flyToEntity(viewer.value, id);
    }
  },
  highlightEntity: (id: string, highlight: boolean) => {
    if (viewer.value) {
      highlightEntity(viewer.value, id, highlight);
    }
  },
  /**
   * 将屏幕像素坐标（相对于 canvas 左上角）精确转换为地球经纬度。
   * 使用 Cesium pickEllipsoid，可正确处理任意相机姿态。
   */
  screenToLatLng: (screenX: number, screenY: number): { longitude: number; latitude: number } | null => {
    if (!viewer.value) return null;
    const cartesian = viewer.value.scene.camera.pickEllipsoid(
      new Cesium.Cartesian2(screenX, screenY),
      viewer.value.scene.globe.ellipsoid,
    );
    if (!cartesian) return null;
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
    };
  },
});
</script>

<template>
  <div class="cesium-map-shell">
    <div ref="mapContainer" class="cesium-container"></div>
    <div v-if="!isReady" class="cesium-loading">
      <p>正在加载地图...</p>
    </div>
    <div v-if="isReady && draggingEntity" class="cesium-drag-indicator">
      <p>正在拖拽实体...</p>
    </div>
  </div>
</template>

<style scoped>
.cesium-map-shell {
  width: 100%;
  height: 100%;
  position: relative;
}

.cesium-container {
  width: 100%;
  height: 100%;
}

.cesium-loading,
.cesium-drag-indicator {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(4, 11, 20, 0.8);
  color: #8ea4c9;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  pointer-events: none;
  z-index: 1000;
  border: 1px solid rgba(142, 164, 201, 0.3);
}

.cesium-drag-indicator {
  background: rgba(255, 193, 7, 0.9);
  color: #000;
}
</style>
