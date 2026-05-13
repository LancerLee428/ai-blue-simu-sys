<script setup lang="ts">
import { ref, computed, markRaw, onMounted, onUnmounted, shallowRef, watch } from "vue";
import * as Cesium from "cesium";
import { usePlatformStore } from "../stores/platform";
import { useEntityState } from "../composables/useEntityState";
import { useCommandSystem } from "../services/command-system";
import { CreateEntityCommand } from "../services/command-system";
import type { EntityConfig } from "../types/deployment";
import TopToolbar from "../components/toolbar/TopToolbar.vue";
import MapModule from "../components/map/MapModule.vue";
import LeftPanelModule from "../components/left-panel/LeftPanelModule.vue";
import RightPanelModule from "../components/right-panel/RightPanelModule.vue";
import ResourceGraphModule from "../components/right-panel/ResourceGraphModule.vue";
import DeploymentConfigModal from "../components/deployment/DeploymentConfigModal.vue";
import LeftSidebar from "../components/left-sidebar/LeftSidebar.vue";
import DecisionPanel from "../components/simulation/DecisionPanel.vue";
import SimulationDrawer from "../components/simulation/SimulationDrawer.vue";
import { MapRenderer } from "../services/map-renderer";
import { ExecutionEngine } from "../services/execution-engine";
import { moveScenarioEntityWithLinkedGeometry, deployRadarRecommendationWithLinkedGeometry } from "../services/scenario-edit-service";
import { useTacticalScenarioStore } from "../stores/tactical-scenario";
import { useActionPlanStore } from "../stores/action-plan";
import { usePanelState } from "../composables/usePanelState";
import type { RouteDecision } from "../services/ai-decision-visualizer";
import type { RadarDeploymentRecommendation } from "../types/tactical-scenario";
import {
  DEFAULT_SIMULATION_RUNTIME_CONFIG,
  loadSimulationRuntimeConfig,
  runAfterRafDelay,
  type SimulationRuntimeConfig,
} from "../services/simulation-runtime-config";

const store = usePlatformStore();
const tacticalStore = useTacticalScenarioStore();
const actionPlanStore = useActionPlanStore();
const { resourceGraphOpen, closeResourceGraph } = usePanelState();
const { entities, createEntity, updateEntity, deleteEntity } = useEntityState();
const { execute, undo, redo, canUndo, canRedo } = useCommandSystem();

// ExecutionEngine and LeftSidebar refs
const leftSidebarRef = ref<InstanceType<typeof LeftSidebar> | null>(null);
const executionEngineRef = shallowRef<ExecutionEngine | null>(null);
const mapRendererRef = shallowRef<MapRenderer | null>(null);

// 决策面板状态
const selectedRouteId = ref<string | null>(null);
const routeDecisions = ref<Map<string, RouteDecision>>(new Map());
const showSimulationDrawer = ref(false);
const staticDetectionVisible = ref(true);
const runtimeRadarScanVisible = ref<boolean | null>(null);
const runtimeJammingVisible = ref<boolean | null>(null);
const runtimeExplosionVisible = ref<boolean | null>(null);
const loadedRuntimePlanId = ref<string | null>(null);
const dismissedRecommendationIds = ref<Record<string, string>>({});
const runtimeConfig = ref<SimulationRuntimeConfig>(DEFAULT_SIMULATION_RUNTIME_CONFIG);
let cancelPendingPlayDelay: (() => void) | null = null;
let scheduledPlayToken = 0;

// 组件卸载时清理
onUnmounted(() => {
  cancelScheduledSimulationPlay();
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

function syncActivePlanToRuntime(options: { flyTo?: boolean } = {}) {
  const activePlan = actionPlanStore.activePlan;
  const engine = executionEngineRef.value;
  const renderer = mapRendererRef.value;
  if (!activePlan || !engine || !renderer) return false;
  if (loadedRuntimePlanId.value === activePlan.id) return true;

  engine.load(activePlan.scenario);
  renderer.renderScenario(activePlan.scenario);
  if (options.flyTo) {
    void renderer.flyToScenario(activePlan.scenario, runtimeConfig.value.camera);
  }
  loadedRuntimePlanId.value = activePlan.id;
  syncExecutionStateFromEngine();
  return true;
}

function cancelScheduledSimulationPlay() {
  scheduledPlayToken += 1;
  if (cancelPendingPlayDelay) {
    cancelPendingPlayDelay();
    cancelPendingPlayDelay = null;
  }
}

function startSimulationPlayback() {
  executionEngineRef.value?.play();
  syncExecutionStateFromEngine();
}

async function handleSimulationPlay() {
  cancelScheduledSimulationPlay();
  const activePlan = actionPlanStore.activePlan;
  if (!activePlan) return;

  const token = scheduledPlayToken;
  syncActivePlanToRuntime();

  const renderer = mapRendererRef.value;
  const config = runtimeConfig.value;
  if (renderer && config.playback.flyToBeforePlay) {
    await renderer.flyToScenario(activePlan.scenario, config.camera);
  }

  if (token !== scheduledPlayToken) return;
  cancelPendingPlayDelay = runAfterRafDelay(config.playback.startDelayAfterCameraMs, () => {
    if (token !== scheduledPlayToken) return;
    cancelPendingPlayDelay = null;
    startSimulationPlayback();
  });
}

function handleSimulationPause() {
  cancelScheduledSimulationPlay();
  executionEngineRef.value?.pause();
  syncExecutionStateFromEngine();
}

function handleSimulationReset() {
  cancelScheduledSimulationPlay();
  syncActivePlanToRuntime();
  executionEngineRef.value?.stop();
  syncExecutionStateFromEngine();
}

function handleSimulationStepForward(stepSeconds: number) {
  cancelScheduledSimulationPlay();
  syncActivePlanToRuntime();
  executionEngineRef.value?.step(stepSeconds);
  syncExecutionStateFromEngine();
}

function handleSimulationStepBackward(stepSeconds: number) {
  cancelScheduledSimulationPlay();
  syncActivePlanToRuntime();
  executionEngineRef.value?.step(-stepSeconds);
  syncExecutionStateFromEngine();
}

function handleSimulationPrevPhase() {
  cancelScheduledSimulationPlay();
  syncActivePlanToRuntime();
  executionEngineRef.value?.prevPhase();
  syncExecutionStateFromEngine();
}

function handleSimulationNextPhase() {
  cancelScheduledSimulationPlay();
  syncActivePlanToRuntime();
  executionEngineRef.value?.nextPhase();
  syncExecutionStateFromEngine();
}

function handleSimulationSetSpeed(speed: number) {
  executionEngineRef.value?.setSpeed(speed);
  syncExecutionStateFromEngine();
}

function handleToggleStaticDetection(visible: boolean) {
  syncActivePlanToRuntime();
  staticDetectionVisible.value = visible;
  mapRendererRef.value?.setRuntimeVisualDebugOptions({
    staticDetectionVisible: visible,
  });
}

function handleToggleRuntimeRadarScan(visible: boolean) {
  syncActivePlanToRuntime();
  runtimeRadarScanVisible.value = visible;
  mapRendererRef.value?.setRuntimeVisualDebugOptions({
    runtimeRadarScanVisible: visible,
  });
  executionEngineRef.value?.setRuntimeRadarEmitterDebugVisible(visible);
}

function handleToggleRuntimeJamming(visible: boolean) {
  syncActivePlanToRuntime();
  runtimeJammingVisible.value = visible;
  mapRendererRef.value?.setRuntimeVisualDebugOptions({
    runtimeJammingVisible: visible,
  });
  executionEngineRef.value?.setRuntimeEWEmitterDebugVisible(visible);
}

function handleToggleRuntimeExplosion(visible: boolean) {
  syncActivePlanToRuntime();
  runtimeExplosionVisible.value = visible;
  mapRendererRef.value?.setRuntimeVisualDebugOptions({
    runtimeExplosionVisible: visible,
  });
  executionEngineRef.value?.refreshRuntimeVisuals();
}

// 部署配置弹窗状态
const showDeploymentModal = ref(false);
const deploymentConfig = ref<{
  sourceEntityId: string;
  sourceEntityName: string;
  position: { longitude: number; latitude: number; altitude: number };
} | null>(null);

const pendingRadarRecommendation = computed<RadarDeploymentRecommendation | null>(() => {
  const activePlan = actionPlanStore.activePlan;
  if (!activePlan || activePlan.executionState.status !== 'completed') return null;

  const dismissedForPlan = dismissedRecommendationIds.value[activePlan.id];
  return (activePlan.scenario.postRunRecommendations ?? []).find((recommendation): recommendation is RadarDeploymentRecommendation => (
    recommendation.type === 'radar-deployment'
    && recommendation.status !== 'deployed'
    && recommendation.id !== dismissedForPlan
  )) ?? null;
});

onMounted(async () => {
  runtimeConfig.value = await loadSimulationRuntimeConfig();
  store.bootstrap();
});

watch(
  () => actionPlanStore.activePlanId,
  (planId) => {
    cancelScheduledSimulationPlay();
    loadedRuntimePlanId.value = null;
    runtimeRadarScanVisible.value = null;
    runtimeJammingVisible.value = null;
    runtimeExplosionVisible.value = null;
    mapRendererRef.value?.setRuntimeVisualDebugOptions({
      runtimeRadarScanVisible: null,
      runtimeJammingVisible: null,
      runtimeExplosionVisible: null,
    });
    executionEngineRef.value?.setRuntimeRadarEmitterDebugVisible(null);
    executionEngineRef.value?.setRuntimeEWEmitterDebugVisible(null);
    if (planId) {
      syncActivePlanToRuntime({ flyTo: true });
    }
  },
);

/**
 * 初始化战术引擎（Cesium viewer 就绪后调用）
 */
function handleViewerReady(viewer: Cesium.Viewer) {
  const renderer = markRaw(new MapRenderer(viewer));
  const engine = markRaw(new ExecutionEngine(viewer, renderer));

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

  syncActivePlanToRuntime({ flyTo: true });

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
      actionPlanStore.updateExecutionState(activePlanId, {
        currentTime,
        currentPhaseIndex,
      });
    }
  });
}

function handleDeployRecommendation(recommendationId: string) {
  const activePlan = actionPlanStore.activePlan;
  const engine = executionEngineRef.value;
  const renderer = mapRendererRef.value;
  if (!activePlan || !engine || !renderer) return;

  const recommendation = activePlan.scenario.postRunRecommendations?.find(item => item.id === recommendationId);
  if (!recommendation || recommendation.type !== 'radar-deployment') return;

  const deployment = deployRadarRecommendationWithLinkedGeometry(activePlan.scenario, recommendation);
  loadedRuntimePlanId.value = null;
  tacticalStore.applyScenarioEdit(
    deployment.scenario,
    `已部署 ${recommendation.location.name}，重置后可重新推演`,
  );
  actionPlanStore.updateActivePlanScenarioInMemory(deployment.scenario);
  syncActivePlanToRuntime();
  syncExecutionStateFromEngine();
}

function handleConfirmRecommendationDeployment() {
  const recommendation = pendingRadarRecommendation.value;
  if (!recommendation) return;
  handleDeployRecommendation(recommendation.id);
}

function handleDismissRecommendation() {
  const activePlan = actionPlanStore.activePlan;
  const recommendation = pendingRadarRecommendation.value;
  if (!activePlan || !recommendation) return;
  dismissedRecommendationIds.value = {
    ...dismissedRecommendationIds.value,
    [activePlan.id]: recommendation.id,
  };
}

function formatRecommendationCoordinate(value: number): string {
  return `${value.toFixed(4)}°`;
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
      config,
    );
    await execute(command);

    // 关闭弹窗
    showDeploymentModal.value = false;
    deploymentConfig.value = null;

    console.log("实体部署成功");
  } catch (error) {
    console.error("部署失败:", error);
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
  const scenario =
    actionPlanStore.activePlan?.scenario ?? tacticalStore.currentScenario;
  if (scenario) {
    const entity = scenario.forces
      .flatMap((force) => force.entities)
      .find((item) => item.id === payload.id);

    if (entity) {
      const nextScenario = moveScenarioEntityWithLinkedGeometry(
        scenario,
        payload.id,
        {
          longitude: payload.position.longitude,
          latitude: payload.position.latitude,
          altitude: entity.position.altitude,
        },
      );
      loadedRuntimePlanId.value = null;
      tacticalStore.applyScenarioEdit(
        nextScenario,
        `实体 ${entity.name} 位置已更新，行动路线和导弹轨迹已同步`,
      );
      actionPlanStore.updateActivePlanScenarioInMemory(nextScenario);
      syncExecutionStateFromEngine();
      return;
    }
  }

  // 使用命令系统包装更新操作
  // 这里简化处理，实际应该用 UpdateEntityCommand
  updateEntity(payload.id, {
    currentPosition: {
      longitude: payload.position.longitude,
      latitude: payload.position.latitude,
      altitude: 0,
    },
  });
}

/**
 * 处理实体状态更新
 */
function handleUpdateEntityStatus(payload: { id: string; status: string }) {
  updateEntity(payload.id, {
    currentStatus: payload.status as any,
  });
}

/**
 * 转换为 ScenarioEntity 格式（兼容旧的接口）
 */
const scenarioEntities = computed(() => {
  return entities.value.map((entity) => ({
    id: entity.id,
    sourceEntityId: entity.sourceEntityId,
    name: entity.name,
    category: entity.category,
    currentPosition: entity.currentPosition,
    currentStatus: entity.currentStatus,
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
      <div
        v-if="resourceGraphOpen"
        class="graph-modal-layer"
        @click.self="closeResourceGraph"
      >
        <ResourceGraphModule modal @close="closeResourceGraph" />
      </div>
    </Transition>

    <!-- AI Decision Panel -->
    <!-- <DecisionPanel
      :selected-route-id="selectedRouteId"
      :decisions="routeDecisions"
    /> -->

    <SimulationDrawer
      :open="showSimulationDrawer"
      :plan="actionPlanStore.activePlan"
      :static-detection-visible="staticDetectionVisible"
      :runtime-radar-scan-visible="runtimeRadarScanVisible"
      :runtime-jamming-visible="runtimeJammingVisible"
      :runtime-explosion-visible="runtimeExplosionVisible"
      @close="showSimulationDrawer = false"
      @play="handleSimulationPlay"
      @pause="handleSimulationPause"
      @reset="handleSimulationReset"
      @step-forward="handleSimulationStepForward"
      @step-backward="handleSimulationStepBackward"
      @prev-phase="handleSimulationPrevPhase"
      @next-phase="handleSimulationNextPhase"
      @set-speed="handleSimulationSetSpeed"
      @toggle-static-detection="handleToggleStaticDetection"
      @toggle-runtime-radar-scan="handleToggleRuntimeRadarScan"
      @toggle-runtime-jamming="handleToggleRuntimeJamming"
      @toggle-runtime-explosion="handleToggleRuntimeExplosion"
      @deploy-recommendation="handleDeployRecommendation"
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

    <Transition name="recommendation-modal">
      <div
        v-if="pendingRadarRecommendation"
        class="recommendation-modal-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="radar-recommendation-title"
      >
        <section class="recommendation-modal">
          <header class="recommendation-modal-header">
            <span>推演后雷达补盲建议</span>
            <strong>{{ pendingRadarRecommendation.priority === 'high' ? '高优先级' : pendingRadarRecommendation.priority === 'medium' ? '中优先级' : '低优先级' }}</strong>
          </header>
          <h2 id="radar-recommendation-title">{{ pendingRadarRecommendation.location.name }}</h2>
          <div class="recommendation-modal-grid">
            <span>经度 {{ formatRecommendationCoordinate(pendingRadarRecommendation.location.longitude) }}</span>
            <span>纬度 {{ formatRecommendationCoordinate(pendingRadarRecommendation.location.latitude) }}</span>
            <span>高度 {{ Math.round(pendingRadarRecommendation.location.altitude) }}m</span>
          </div>
          <p>{{ pendingRadarRecommendation.reason }}</p>
          <p v-if="pendingRadarRecommendation.expectedEffect" class="recommendation-modal-effect">
            {{ pendingRadarRecommendation.expectedEffect }}
          </p>
          <footer class="recommendation-modal-actions">
            <button type="button" class="recommendation-secondary" @click="handleDismissRecommendation">
              稍后处理
            </button>
            <button type="button" class="recommendation-primary" @click="handleConfirmRecommendationDeployment">
              确定部署
            </button>
          </footer>
        </section>
      </div>
    </Transition>
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
  transition:
    opacity 0.24s ease,
    transform 0.24s ease;
}

.graph-modal-enter-from,
.graph-modal-leave-to {
  opacity: 0;
  transform: scale(0.985);
}

.recommendation-modal-enter-active,
.recommendation-modal-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.recommendation-modal-enter-from,
.recommendation-modal-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.recommendation-modal-layer {
  position: fixed;
  inset: 0;
  z-index: 1800;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(2, 8, 15, 0.58);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.recommendation-modal {
  width: min(520px, calc(100vw - 48px));
  border: 1px solid rgba(0, 214, 201, 0.36);
  border-radius: 8px;
  padding: 20px;
  color: #e8fbff;
  background:
    linear-gradient(180deg, rgba(8, 28, 42, 0.98), rgba(4, 14, 24, 0.99));
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
}

.recommendation-modal-header,
.recommendation-modal-grid,
.recommendation-modal-actions {
  display: flex;
  align-items: center;
}

.recommendation-modal-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: #8debf4;
  font-size: 13px;
}

.recommendation-modal-header strong {
  flex: 0 0 auto;
  padding: 3px 8px;
  border-radius: 4px;
  color: #ffe6a8;
  background: rgba(255, 196, 87, 0.14);
}

.recommendation-modal h2 {
  margin: 0 0 12px;
  font-size: 20px;
  line-height: 1.3;
  color: #ffffff;
}

.recommendation-modal-grid {
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.recommendation-modal-grid span {
  min-width: 116px;
  padding: 6px 8px;
  border: 1px solid rgba(125, 211, 252, 0.2);
  border-radius: 4px;
  color: #bfeeff;
  background: rgba(8, 32, 48, 0.64);
  font-family: "SF Mono", Monaco, Consolas, monospace;
  font-size: 12px;
}

.recommendation-modal p {
  margin: 0;
  color: rgba(232, 251, 255, 0.86);
  font-size: 13px;
  line-height: 1.7;
}

.recommendation-modal-effect {
  margin-top: 10px !important;
  color: rgba(180, 248, 255, 0.78) !important;
}

.recommendation-modal-actions {
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.recommendation-primary,
.recommendation-secondary {
  height: 34px;
  border-radius: 6px;
  padding: 0 14px;
  cursor: pointer;
}

.recommendation-primary {
  border: 1px solid rgba(0, 214, 201, 0.58);
  color: #051316;
  background: #00d6c9;
}

.recommendation-primary:hover {
  background: #4ff1e7;
}

.recommendation-secondary {
  border: 1px solid rgba(148, 163, 184, 0.36);
  color: #dbeafe;
  background: rgba(15, 23, 42, 0.72);
}

.recommendation-secondary:hover {
  background: rgba(30, 41, 59, 0.84);
}
</style>
