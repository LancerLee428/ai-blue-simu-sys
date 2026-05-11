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
const dragModifierPressed = ref(false);
const draggingEntity = ref<{ id: string; altitude: number } | null>(null);

function setCameraInputsEnabled(enabled: boolean) {
  if (!viewer.value) return;
  viewer.value.scene.screenSpaceCameraController.enableInputs = enabled;
}

function getEntityPosition(entity: Cesium.Entity): Cesium.Cartesian3 | null {
  const value = entity.position?.getValue(Cesium.JulianDate.now());
  return value ?? null;
}

function getEntityAltitude(entity: Cesium.Entity): number {
  const position = getEntityPosition(entity);
  if (!position) return 0;
  return Cesium.Cartographic.fromCartesian(position).height;
}

function pickGlobePosition(windowPosition: Cesium.Cartesian2 | undefined): Cesium.Cartesian3 | null {
  if (!viewer.value || !windowPosition) return null;
  return viewer.value.scene.camera.pickEllipsoid(
    windowPosition,
    viewer.value.scene.globe.ellipsoid,
  ) ?? null;
}

function isDraggableEntity(entity: Cesium.Entity): boolean {
  return Boolean((entity as any).__entityType);
}

function stopEntityDrag(finalWindowPosition?: Cesium.Cartesian2) {
  if (!draggingEntity.value) return;

  const dragged = draggingEntity.value;
  const cartesian = pickGlobePosition(finalWindowPosition);
  if (cartesian) {
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);

    emit('entityDragged', {
      id: dragged.id,
      position: { longitude, latitude },
    });
  }

  draggingEntity.value = null;
  setCameraInputsEnabled(true);
}

function handleDragKeyDown(event: KeyboardEvent) {
  if (event.key === 'Alt' || event.key === 'Meta') {
    dragModifierPressed.value = true;
  }
}

function handleDragKeyUp(event: KeyboardEvent) {
  if (event.key === 'Alt' || event.key === 'Meta') {
    dragModifierPressed.value = event.altKey || event.metaKey;
  }
}

function handleDragWindowBlur() {
  dragModifierPressed.value = false;
  stopEntityDrag();
}

function attachDragKeyboardGuards() {
  window.addEventListener('keydown', handleDragKeyDown);
  window.addEventListener('keyup', handleDragKeyUp);
  window.addEventListener('blur', handleDragWindowBlur);
}

function detachDragKeyboardGuards() {
  window.removeEventListener('keydown', handleDragKeyDown);
  window.removeEventListener('keyup', handleDragKeyUp);
  window.removeEventListener('blur', handleDragWindowBlur);
}

/**
 * 更新或创建实体
 */
function upsertEntities() {
  if (!viewer.value) return;
  viewer.value.entities.removeAll();

  // 只渲染 AI 生成的方案实体，不使用测试数据
  const entitiesToRender = props.entities;

  entitiesToRender.forEach((entity) => {
    const graphics = getEntityGraphics(entity);
    viewer.value!.entities.add({
      id: entity.id,
      ...graphics,
    });
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

  handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    if (!dragModifierPressed.value || !viewer.value) return;

    const pickedObject = viewer.value.scene.pick(movement.position);
    if (!Cesium.defined(pickedObject) || !Cesium.defined(pickedObject.id)) return;

    const pickedEntity = pickedObject.id as Cesium.Entity;
    const entityId = pickedEntity.id;
    if (!entityId) return;

    const entity = viewer.value.entities.getById(entityId);
    if (!entity || !isDraggableEntity(entity)) return;

    draggingEntity.value = {
      id: entityId,
      altitude: getEntityAltitude(entity),
    };
    setCameraInputsEnabled(false);
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    if (!draggingEntity.value || !viewer.value) return;

    const cartesian = pickGlobePosition(movement.endPosition);
    if (!cartesian) return;

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const nextPosition = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      draggingEntity.value.altitude,
    );
    const entity = viewer.value.entities.getById(draggingEntity.value.id);
    if (entity) {
      (entity as any).position = nextPosition;
      viewer.value.scene.requestRender();
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    stopEntityDrag(movement.position);
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

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
  attachDragKeyboardGuards();
  dragHandler = initDragHandler();
  clickHandler = initClickHandler();
  upsertEntities();
});

onBeforeUnmount(() => {
  stopEntityDrag();
  detachDragKeyboardGuards();
  destroySelectionHandler();
  if (dragHandler) {
    dragHandler.destroy();
    dragHandler = null;
  }
  if (clickHandler) {
    clickHandler.destroy();
    clickHandler = null;
  }
  destroyViewer();
});

// 监听实体变化
watch(() => props.entities, upsertEntities, { deep: true });

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
});
</script>

<template>
  <div class="cesium-map-shell">
    <div ref="mapContainer" class="cesium-container"></div>
    <div v-if="!isReady" class="cesium-loading">
      <p>正在加载地图...</p>
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

.cesium-loading {
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
</style>
