<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import * as Cesium from 'cesium';
import { usePlatformStore } from '../stores/platform';
import { useEntityState } from '../composables/useEntityState';
import { useCommandSystem } from '../services/command-system';
import { CreateEntityCommand } from '../services/command-system';
import type { EntityConfig } from '../types/deployment';
import TopToolbar from '../components/toolbar/TopToolbar.vue';
import MapModule from '../components/map/MapModule.vue';
import LeftPanelModule from '../components/left-panel/LeftPanelModule.vue';
import RightPanelModule from '../components/right-panel/RightPanelModule.vue';
import ResourceGraphModule from '../components/right-panel/ResourceGraphModule.vue';
import DeploymentConfigModal from '../components/deployment/DeploymentConfigModal.vue';
import LeftSidebar from '../components/left-sidebar/LeftSidebar.vue';
import DecisionPanel from '../components/simulation/DecisionPanel.vue';
import SimulationDrawer from '../components/simulation/SimulationDrawer.vue';
import { MapRenderer } from '../services/map-renderer';
import { ExecutionEngine } from '../services/execution-engine';
import { useTacticalScenarioStore } from '../stores/tactical-scenario';
import { useActionPlanStore } from '../stores/action-plan';
import { usePanelState } from '../composables/usePanelState';
import type { RouteDecision } from '../services/ai-decision-visualizer';

const store = usePlatformStore();
const tacticalStore = useTacticalScenarioStore();
const actionPlanStore = useActionPlanStore();
const { resourceGraphOpen, closeResourceGraph } = usePanelState();
const { entities, createEntity, updateEntity, deleteEntity } = useEntityState();
const { execute, undo, redo, canUndo, canRedo } = useCommandSystem();

// ExecutionEngine and LeftSidebar refs
const leftSidebarRef = ref<InstanceType<typeof LeftSidebar> | null>(null);
const executionEngineRef = ref<ExecutionEngine | null>(null);
const mapRendererRef = ref<MapRenderer | null>(null);

// 决策面板状态
const selectedRouteId = ref<string | null>(null);
const routeDecisions = ref<Map<string, RouteDecision>>(new Map());
const showSimulationDrawer = ref(false);

// 组件卸载时清理
onUnmounted(() => {
  // 先停止执行引擎，但不重置（避免重复销毁 Cesium viewer）
  if (executionEngineRef.value) {
    executionEngineRef.value.pause();
    executionEngineRef.value = null;
  }
  if (leftSidebarRef.value) {
    leftSidebarRef.value = null;
  }
});

// 撤销重做处理函数
function handleUndo() {
  undo();
}

function handleRedo() {
  redo();
}

function syncExecutionStateFromEngine() {
  const activePlanId = actionPlanStore.activePlanId;
  const engine = executionEngineRef.value;
  if (!activePlanId || !engine) return;

  const state = engine.getStatus();
  actionPlanStore.updateExecutionState(activePlanId, {
    status: state.status,
    currentTime: state.currentTime,
    currentPhaseIndex: state.currentPhaseIndex,
    speed: state.speed,
  });
}

function handleSimulationPlay() {
  executionEngineRef.value?.play();
  syncExecutionStateFromEngine();
}

function handleSimulationPause() {
  executionEngineRef.value?.pause();
  syncExecutionStateFromEngine();
}

function handleSimulationReset() {
  executionEngineRef.value?.stop();
  syncExecutionStateFromEngine();
}

function handleSimulationStepForward(stepSeconds: number) {
  executionEngineRef.value?.step(stepSeconds);
  syncExecutionStateFromEngine();
}

function handleSimulationStepBackward(stepSeconds: number) {
  executionEngineRef.value?.step(-stepSeconds);
  syncExecutionStateFromEngine();
}

function handleSimulationPrevPhase() {
  executionEngineRef.value?.prevPhase();
  syncExecutionStateFromEngine();
}

function handleSimulationNextPhase() {
  executionEngineRef.value?.nextPhase();
  syncExecutionStateFromEngine();
}

function handleSimulationSetSpeed(speed: number) {
  executionEngineRef.value?.setSpeed(speed);
  syncExecutionStateFromEngine();
}

// 部署配置弹窗状态
const showDeploymentModal = ref(false);
const deploymentConfig = ref<{
  sourceEntityId: string;
  sourceEntityName: string;
  position: { longitude: number; latitude: number; altitude: number };
} | null>(null);

onMounted(() => {
  store.bootstrap();
});

/**
 * 初始化战术引擎（Cesium viewer 就绪后调用）
 */
function handleViewerReady(viewer: Cesium.Viewer) {
  const renderer = new MapRenderer(viewer);
  const engine = new ExecutionEngine(viewer, renderer);

  // 保存引用以便清理
  executionEngineRef.value = engine;
  mapRendererRef.value = renderer;

  tacticalStore.initEngine(engine, renderer);

  // 注入 ExecutionEngine 到 LeftSidebar
  if (leftSidebarRef.value) {
    leftSidebarRef.value.initEngine(engine);
  }

  // 设置路线点击回调
  renderer.setOnRouteClick((routeId: string, decision: RouteDecision) => {
    selectedRouteId.value = routeId;
    routeDecisions.value = renderer.getRouteDecisions();

    // 同步到 LeftSidebar
    if (leftSidebarRef.value) {
      leftSidebarRef.value.setRouteDecisions(routeDecisions.value);
    }
  });

  // 初始化时同步路线决策数据
  if (leftSidebarRef.value) {
    leftSidebarRef.value.setRouteDecisions(renderer.getRouteDecisions());
  }

  // 设置状态变化回调 - 同步到 ActionPlan Store
  engine.setOnStatusChange((status) => {
    const activePlanId = actionPlanStore.activePlanId;
    if (activePlanId) {
      const state = engine.getStatus();
      actionPlanStore.updateExecutionState(activePlanId, {
        status,
        currentTime: state.currentTime,
        currentPhaseIndex: state.currentPhaseIndex,
        speed: state.speed,
      });
    }
  });

  // 设置进度更新回调 - 节流 100ms（在 RAF 中实现）
  engine.setOnProgressUpdate(({ currentTime, progress, currentPhaseIndex }) => {
    const activePlanId = actionPlanStore.activePlanId;
    if (activePlanId) {
      actionPlanStore.updateExecutionState(activePlanId, { currentTime, currentPhaseIndex });
    }
  });
}

/**
 * 显示部署配置弹窗
 */
function handleShowDeploymentConfig(config: {
  sourceEntityId: string;
  sourceEntityName: string;
  position: { longitude: number; latitude: number; altitude: number };
}) {
  deploymentConfig.value = config;
  showDeploymentModal.value = true;
}

/**
 * 确认部署配置
 */
async function handleDeploymentConfirm(config: EntityConfig) {
  try {
    // 创建命令并执行
    const command = new CreateEntityCommand(
      { createEntity, updateEntity, deleteEntity },
      config
    );
    await execute(command);

    // 关闭弹窗
    showDeploymentModal.value = false;
    deploymentConfig.value = null;

    console.log('实体部署成功');
  } catch (error) {
    console.error('部署失败:', error);
  }
}

/**
 * 取消部署配置
 */
function handleDeploymentCancel() {
  showDeploymentModal.value = false;
  deploymentConfig.value = null;
}

/**
 * 处理实体位置更新
 */
function handleUpdateEntityPosition(payload: {
  id: string;
  position: { longitude: number; latitude: number };
}) {
  // 使用命令系统包装更新操作
  // 这里简化处理，实际应该用 UpdateEntityCommand
  updateEntity(payload.id, {
    currentPosition: {
      longitude: payload.position.longitude,
      latitude: payload.position.latitude,
      altitude: 0
    }
  });
}

/**
 * 处理实体状态更新
 */
function handleUpdateEntityStatus(payload: {
  id: string;
  status: string;
}) {
  updateEntity(payload.id, {
    currentStatus: payload.status as any
  });
}

/**
 * 转换为 ScenarioEntity 格式（兼容旧的接口）
 */
const scenarioEntities = computed(() => {
  return entities.value.map(entity => ({
    id: entity.id,
    sourceEntityId: entity.sourceEntityId,
    name: entity.name,
    category: entity.category,
    currentPosition: entity.currentPosition,
    currentStatus: entity.currentStatus
  }));
});
</script>

<template>
  <div class="workbench-root">
    <!-- Cesium full-screen base -->
    <MapModule
      :entities="scenarioEntities"
      :source-entities="new Map()"
      :selected-entity-id="store.selectedPointId"
      @select="(id) => store.selectPoint(id ?? null)"
      @update-entity-position="handleUpdateEntityPosition"
      @update-entity-status="handleUpdateEntityStatus"
      @show-deployment-config="handleShowDeploymentConfig"
      @viewer-ready="handleViewerReady"
    />

    <!-- Toolbar -->
    <TopToolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      :simulation-open="showSimulationDrawer"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-simulation="showSimulationDrawer = !showSimulationDrawer"
    />

    <!-- Left panel: action plan management -->
    <LeftSidebar ref="leftSidebarRef" />

    <!-- Right panel: AI assistant + resource tree -->
    <RightPanelModule />

    <Transition name="graph-modal">
      <div v-if="resourceGraphOpen" class="graph-modal-layer" @click.self="closeResourceGraph">
        <ResourceGraphModule modal @close="closeResourceGraph" />
      </div>
    </Transition>

    <!-- AI Decision Panel -->
    <DecisionPanel
      :selected-route-id="selectedRouteId"
      :decisions="routeDecisions"
    />

    <SimulationDrawer
      :open="showSimulationDrawer"
      :plan="actionPlanStore.activePlan"
      @close="showSimulationDrawer = false"
      @play="handleSimulationPlay"
      @pause="handleSimulationPause"
      @reset="handleSimulationReset"
      @step-forward="handleSimulationStepForward"
      @step-backward="handleSimulationStepBackward"
      @prev-phase="handleSimulationPrevPhase"
      @next-phase="handleSimulationNextPhase"
      @set-speed="handleSimulationSetSpeed"
    />

    <!-- 部署配置弹窗 -->
    <DeploymentConfigModal
      :visible="showDeploymentModal"
      mode="create"
      :source-entity-id="deploymentConfig?.sourceEntityId"
      :initial-position="deploymentConfig?.position"
      @confirm="handleDeploymentConfirm"
      @cancel="handleDeploymentCancel"
    />
  </div>
</template>

<style scoped>
.workbench-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: #040b14;
}

.graph-modal-layer {
  position: fixed;
  inset: 58px 34px 28px;
  z-index: 1300;
  padding: 0;
  border: 1px solid rgba(142, 164, 201, 0.22);
  border-radius: 16px;
  background: rgba(4, 11, 20, 0.62);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.graph-modal-enter-active,
.graph-modal-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.graph-modal-enter-from,
.graph-modal-leave-to {
  opacity: 0;
  transform: scale(0.985);
}
</style>
