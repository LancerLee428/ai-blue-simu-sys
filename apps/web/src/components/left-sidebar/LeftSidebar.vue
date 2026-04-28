<!-- apps/web/src/components/left-sidebar/LeftSidebar.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useActionPlanStore } from '../../stores/action-plan';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';
import ActionPlanCard from '../action-plan/ActionPlanCard.vue';
import RouteManagementPanel from './RouteManagementPanel.vue';
import type { ExecutionEngine } from '../../services/execution-engine';
import type { RouteDecision } from '../../services/ai-decision-visualizer';
import type { EnvironmentConfig, ForceSide } from '../../types/tactical-scenario';

const actionPlanStore = useActionPlanStore();
const scenarioStore = useTacticalScenarioStore();

// 折叠状态
const sections = ref({
  forces: true,       // 编成编组
  actionPlan: true,   // 行动计划
  routes: true,       // 行动路线
  tasks: false,       // 任务树
  interactions: false,// 交互关系
});

// 路线决策数据和选中状态
const routeDecisions = ref<Map<string, RouteDecision>>(new Map());
const selectedRouteId = ref<string | null>(null);
const showEnvironmentDialog = ref(false);
const showEventLogFloat = ref(false);
const environmentDraft = ref<EnvironmentConfig | null>(null);

function toggleSection(key: keyof typeof sections.value) {
  sections.value[key] = !sections.value[key];
}

// 编成编组（固定红方/蓝方）
const forcesBySide = computed(() => {
  const scenario = scenarioStore.currentScenario;
  const sides: { side: ForceSide; name: string }[] = [
    { side: 'red', name: '红方' },
    { side: 'blue', name: '蓝方' },
  ];

  return sides.map(({ side, name }) => ({
    id: side,
    side,
    name,
    members: scenario?.forces
      .filter(force => force.side === side)
      .flatMap(force => force.entities.map(entity => ({ ...entity, side }))) ?? [],
  }));
});

// ExecutionEngine 引用
let executionEngine: ExecutionEngine | null = null;

function initEngine(engine: ExecutionEngine) {
  executionEngine = engine;
}

function handlePlay() { executionEngine?.play(); }
function handlePause() { executionEngine?.pause(); }
function handleStepForward() { executionEngine?.step(1); }
function handleStepBackward() { executionEngine?.step(-1); }
function handleSetSpeed(speed: number) {
  executionEngine?.setSpeed(speed);
  // 立即同步倍速到 Store
  if (actionPlanStore.activePlanId) {
    actionPlanStore.updateExecutionState(actionPlanStore.activePlanId, { speed });
  }
}
function handlePrevPhase() { executionEngine?.prevPhase(); }
function handleNextPhase() { executionEngine?.nextPhase(); }
function handleReset() { executionEngine?.stop(); }

// 设置路线决策数据
function setRouteDecisions(decisions: Map<string, RouteDecision>) {
  routeDecisions.value = decisions;
}

// 选择路线
function handleSelectRoute(routeId: string) {
  selectedRouteId.value = routeId;
}

// 所有实体列表
const allEntities = computed(() => {
  const scenario = scenarioStore.currentScenario;
  if (!scenario) return [];
  return scenario.forces.flatMap(f => f.entities);
});

// 所有路线列表
const allRoutes = computed(() => {
  const scenario = scenarioStore.currentScenario;
  return scenario?.routes || [];
});

const eventLogItems = computed(() => {
  const scenario = scenarioStore.currentScenario;
  if (!scenario) return [];

  const phaseEvents = scenario.phases.flatMap(phase =>
    phase.events.map(event => ({
      id: `${phase.id}-${event.timestamp}-${event.detail}`,
      time: `${phase.name} / ${event.timestamp}s`,
      title: event.type,
      detail: event.detail,
    })),
  );

  const environmentEvents = (scenario.environment?.events ?? []).map(event => ({
    id: event.id,
    time: `${event.startTime} ~ ${event.endTime}`,
    title: event.name,
    detail: event.type,
  }));

  return [...phaseEvents, ...environmentEvents];
});

function cloneEnvironment(environment: EnvironmentConfig): EnvironmentConfig {
  return JSON.parse(JSON.stringify(environment)) as EnvironmentConfig;
}

function openEnvironmentDialog() {
  if (!scenarioStore.currentScenario?.environment) return;
  environmentDraft.value = cloneEnvironment(scenarioStore.currentScenario.environment);
  showEnvironmentDialog.value = true;
}

function closeEnvironmentDialog() {
  showEnvironmentDialog.value = false;
  environmentDraft.value = null;
}

function saveEnvironmentDialog() {
  if (!environmentDraft.value) return;
  scenarioStore.updateEnvironment(cloneEnvironment(environmentDraft.value));
  closeEnvironmentDialog();
}

function toggleEventLogFloat() {
  showEventLogFloat.value = !showEventLogFloat.value;
}

defineExpose({ initEngine, setRouteDecisions, openEnvironmentDialog, toggleEventLogFloat });
</script>

<template>
  <div class="left-sidebar">
    <!-- 编成编组 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('forces')">
        <span class="toggle-icon">{{ sections.forces ? '▼' : '▶' }}</span>
        <span class="section-title">编成编组</span>
        <span class="section-badge">{{ allEntities.length }}</span>
      </div>
      <div v-if="sections.forces" class="section-body">
        <div v-for="group in forcesBySide" :key="group.id" class="group-item">
          <div class="group-name" :class="group.side">
            <span>{{ group.name }}</span>
            <span class="group-count">{{ group.members.length }}</span>
          </div>
          <div
            v-for="member in group.members"
            :key="member.id"
            class="entity-item"
          >
            <span class="entity-icon" :class="member.side">●</span>
            <span class="entity-name">{{ member.name }}</span>
            <span class="entity-role">{{ member.type }}</span>
          </div>
          <div v-if="group.members.length === 0" class="empty-side">暂无{{ group.name }}兵力</div>
        </div>
      </div>
    </div>

    <!-- 行动计划 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('actionPlan')">
        <span class="toggle-icon">{{ sections.actionPlan ? '▼' : '▶' }}</span>
        <span class="section-title">行动计划</span>
        <span class="section-badge">{{ actionPlanStore.plans.length }}</span>
      </div>
      <div v-if="sections.actionPlan" class="section-body">
        <ActionPlanCard
          v-for="plan in actionPlanStore.plans"
          :key="plan.id"
          :plan="plan"
          :is-active="plan.id === actionPlanStore.activePlanId"
          :show-execution-controls="false"
          @activate="actionPlanStore.activatePlan(plan.id)"
          @delete="actionPlanStore.deletePlan(plan.id)"
          @play="handlePlay"
          @pause="handlePause"
          @stop="handlePause"
          @reset="handleReset"
          @step-forward="handleStepForward"
          @step-backward="handleStepBackward"
          @set-speed="handleSetSpeed"
          @prev-phase="handlePrevPhase"
          @next-phase="handleNextPhase"
        />
        <div v-if="actionPlanStore.plans.length === 0" class="empty-hint">
          暂无行动计划
        </div>
      </div>
    </div>

    <!-- 行动路线 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('routes')">
        <span class="toggle-icon">{{ sections.routes ? '▼' : '▶' }}</span>
        <span class="section-title">行动路线</span>
        <span class="section-badge">{{ allRoutes.length }}</span>
      </div>
      <div v-if="sections.routes" class="section-body">
        <RouteManagementPanel
          :routes="allRoutes"
          :entities="allEntities"
          :decisions="routeDecisions"
          :selected-route-id="selectedRouteId"
          @select-route="handleSelectRoute"
        />
      </div>
    </div>

    <!-- 任务树 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('tasks')">
        <span class="toggle-icon">{{ sections.tasks ? '▼' : '▶' }}</span>
        <span class="section-title">任务树</span>
        <span class="section-badge">{{ scenarioStore.currentScenario?.tasks?.length ?? 0 }}</span>
      </div>
      <div v-if="sections.tasks" class="section-body">
        <div
          v-for="task in scenarioStore.currentScenario?.tasks"
          :key="task.id"
          class="task-item"
        >
          <div class="task-header">
            <span class="task-type-badge">{{ task.type }}</span>
            <span class="task-name">{{ task.name }}</span>
          </div>
          <div class="task-meta">装备: {{ task.equipRef }}</div>

          <!-- BehaviorTree -->
          <template v-if="task.type === 'BehaviorTree'">
            <div class="tree-node root-node">
              <span class="node-type">{{ (task.config as any).root.nodeType }}</span>
              <span class="node-name">{{ (task.config as any).root.name }}</span>
              <div v-if="(task.config as any).root.children?.length" class="tree-children">
                <div
                  v-for="(child, i) in (task.config as any).root.children"
                  :key="i"
                  class="tree-node"
                >
                  <span class="node-type">{{ child.nodeType }}</span>
                  <span class="node-name">{{ child.name }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- StateMachine -->
          <template v-else-if="task.type === 'StateMachine'">
            <div class="sm-info">初始: {{ (task.config as any).initialState }}</div>
            <div
              v-for="state in (task.config as any).states"
              :key="state.name"
              class="sm-state"
            >
              <span class="state-name">{{ state.name }}</span>
              <span
                v-for="t in state.transitions"
                :key="t.event"
                class="state-transition"
              >{{ t.event }} → {{ t.target }}</span>
            </div>
          </template>

          <!-- InstructionSeq -->
          <template v-else>
            <div
              v-for="ins in (task.config as any).instructions"
              :key="ins.id"
              class="instruction-row"
            >
              <span class="ins-time">{{ ins.time }}</span>
              <span class="ins-type">{{ ins.type }}</span>
            </div>
          </template>
        </div>
        <div v-if="!scenarioStore.currentScenario?.tasks?.length" class="empty-hint">
          暂无任务树
        </div>
      </div>
    </div>

    <!-- 交互关系 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('interactions')">
        <span class="toggle-icon">{{ sections.interactions ? '▼' : '▶' }}</span>
        <span class="section-title">交互关系</span>
        <span class="section-badge">
          {{ scenarioStore.currentScenario?.interactions ? '✓' : '-' }}
        </span>
      </div>
      <div v-if="sections.interactions" class="section-body">
        <template v-if="scenarioStore.currentScenario?.interactions">
          <div v-if="scenarioStore.currentScenario.interactions.commandControl.length" class="subsection-title">
            指控关系 ({{ scenarioStore.currentScenario.interactions.commandControl.length }})
          </div>
          <div
            v-for="cc in scenarioStore.currentScenario.interactions.commandControl"
            :key="cc.id"
            class="link-row"
          >{{ cc.commander }} → {{ cc.subordinate }}</div>

          <div v-if="scenarioStore.currentScenario.interactions.communications.length" class="subsection-title">
            通信链路 ({{ scenarioStore.currentScenario.interactions.communications.length }})
          </div>
          <div
            v-for="comm in scenarioStore.currentScenario.interactions.communications"
            :key="comm.id"
            class="link-row"
          >{{ comm.sender.equipRef }} → {{ comm.receiver.equipRef }}</div>

          <div v-if="scenarioStore.currentScenario.interactions.detectionLinks.length" class="subsection-title">
            探测关系 ({{ scenarioStore.currentScenario.interactions.detectionLinks.length }})
          </div>
          <div
            v-for="d in scenarioStore.currentScenario.interactions.detectionLinks"
            :key="d.id"
            class="link-row"
          >{{ d.observer.equipRef }} 探测 {{ d.target }}</div>
        </template>
        <div v-else class="empty-hint">暂无交互关系</div>
      </div>
    </div>

    <div class="corner-actions">
      <button
        class="corner-action"
        type="button"
        :disabled="!scenarioStore.currentScenario?.environment"
        title="环境配置"
        @click="openEnvironmentDialog"
      >
        环境配置
      </button>
      <button
        class="corner-action"
        :class="{ active: showEventLogFloat }"
        type="button"
        title="事件日志"
        @click="toggleEventLogFloat"
      >
        事件日志
      </button>
    </div>

    <div v-if="showEventLogFloat" class="event-log-popover">
      <div class="popover-header">
        <span>事件日志</span>
        <button type="button" class="icon-button" @click="showEventLogFloat = false">×</button>
      </div>
      <div class="popover-body">
        <div v-for="item in eventLogItems" :key="item.id" class="log-row">
          <div class="log-time">{{ item.time }}</div>
          <div class="log-title">{{ item.title }}</div>
          <div class="log-detail">{{ item.detail }}</div>
        </div>
        <div v-if="eventLogItems.length === 0" class="empty-hint">暂无事件记录</div>
      </div>
    </div>

    <div v-if="showEnvironmentDialog" class="modal-backdrop" @click.self="closeEnvironmentDialog">
      <div class="environment-modal">
        <div class="modal-header">
          <span>环境配置</span>
          <button type="button" class="icon-button" @click="closeEnvironmentDialog">×</button>
        </div>
        <div v-if="environmentDraft" class="modal-body">
          <div v-if="environmentDraft.generationModels.atmosphereModel" class="form-section">
            <div class="form-section-title">大气环境</div>
            <label class="field-row">
              <span>天气</span>
              <input v-model="environmentDraft.generationModels.atmosphereModel.weather" />
            </label>
            <label class="field-row">
              <span>降雨等级</span>
              <input v-model="environmentDraft.generationModels.atmosphereModel.rainLevel" />
            </label>
            <label class="field-row">
              <span>风速 m/s</span>
              <input v-model.number="environmentDraft.generationModels.atmosphereModel.windSpeed" type="number" step="0.1" />
            </label>
            <label class="field-row">
              <span>风向 deg</span>
              <input v-model.number="environmentDraft.generationModels.atmosphereModel.windDirection" type="number" step="1" />
            </label>
          </div>

          <div v-if="environmentDraft.generationModels.spaceEnvironment" class="form-section">
            <div class="form-section-title">空间环境</div>
            <label class="field-row">
              <span>太阳通量</span>
              <input v-model.number="environmentDraft.generationModels.spaceEnvironment.solarActivity.fluxLevel" type="number" step="1" />
            </label>
            <label class="field-row">
              <span>Kp 指数</span>
              <input v-model.number="environmentDraft.generationModels.spaceEnvironment.geomagneticField.kpIndex" type="number" step="0.1" />
            </label>
            <label class="field-row">
              <span>电离层模型</span>
              <input v-model="environmentDraft.generationModels.spaceEnvironment.ionosphere.modelType" />
            </label>
          </div>

          <div class="form-section">
            <div class="form-section-title">效应模型</div>
            <label
              v-for="effect in environmentDraft.effectModels"
              :key="effect.id"
              class="check-row"
            >
              <input v-model="effect.enabled" type="checkbox" />
              <span>{{ effect.name }}</span>
              <em>{{ effect.category }}</em>
            </label>
            <div v-if="environmentDraft.effectModels.length === 0" class="empty-hint">暂无效应模型</div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="secondary-button" @click="closeEnvironmentDialog">取消</button>
          <button type="button" class="primary-button" @click="saveEnvironmentDialog">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.left-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 320px;
  display: flex;
  flex-direction: column;
  background: rgba(4, 11, 20, 0.98);
  border-right: 1px solid rgba(107, 196, 255, 0.25);
  overflow-y: auto;
  z-index: 1050;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
}

/* 折叠区块 */
.section {
  border-bottom: 1px solid rgba(107, 196, 255, 0.1);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.section-header:hover {
  background: rgba(107, 196, 255, 0.05);
}

.toggle-icon {
  font-size: 10px;
  color: #6bc4ff;
  width: 12px;
  transition: transform 0.2s;
}

.section-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #e2ebfb;
}

.section-badge {
  font-size: 11px;
  color: #4a5a6a;
  background: rgba(107, 196, 255, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
}

.section-body {
  padding: 8px 16px 12px;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 态势总览 */
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
}

.stat-label {
  font-weight: 500;
}

.stat-label.red {
  color: #ff6b6b;
}

.stat-label.blue {
  color: #4dabf7;
}

.stat-value {
  color: #e2ebfb;
  font-weight: 600;
}

.meta-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(107, 196, 255, 0.1);
}

.meta-row {
  font-size: 12px;
  color: #b0c4d8;
  padding: 2px 0;
}

.meta-row.small {
  font-size: 10px;
  color: #4a5a6a;
}

/* 兵力列表 */
.group-item {
  margin-bottom: 12px;
}

.group-name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: #6bc4ff;
  margin-bottom: 4px;
  padding: 4px 0;
}

.group-name.red {
  color: #ff6b6b;
}

.group-name.blue {
  color: #4dabf7;
}

.group-count {
  font-size: 10px;
  color: #8ea4c9;
  background: rgba(107, 196, 255, 0.1);
  border-radius: 999px;
  padding: 1px 6px;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0 4px 12px;
  font-size: 12px;
  border-left: 1px solid rgba(107, 196, 255, 0.15);
  margin-left: 4px;
}

.entity-icon {
  font-size: 8px;
}

.entity-icon.red {
  color: #ff6b6b;
}

.entity-icon.blue {
  color: #4dabf7;
}

.entity-name {
  flex: 1;
  color: #b0c4d8;
}

.entity-role {
  font-size: 10px;
  color: #6bc4ff;
  background: rgba(107, 196, 255, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
}

.empty-side {
  padding: 6px 0 8px 12px;
  margin-left: 4px;
  border-left: 1px solid rgba(107, 196, 255, 0.12);
  font-size: 11px;
  color: #4a5a6a;
}

/* 空状态 */
.empty-hint {
  font-size: 12px;
  color: #4a5a6a;
  text-align: center;
  padding: 16px 0;
}

/* 任务树 */
.task-item {
  margin-bottom: 12px;
  border: 1px solid rgba(107, 196, 255, 0.15);
  border-radius: 6px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.task-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.task-type-badge {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  background: rgba(107, 196, 255, 0.15);
  color: #6bc4ff;
}

.task-name {
  font-size: 12px;
  color: #e2ebfb;
  font-weight: 500;
}

.task-meta {
  font-size: 10px;
  color: #4a5a6a;
  margin-bottom: 6px;
}

.tree-node {
  padding: 3px 0 3px 10px;
  border-left: 1px solid rgba(107, 196, 255, 0.2);
  margin: 2px 0;
}

.root-node {
  border-left: none;
  padding-left: 0;
}

.tree-children {
  padding-left: 10px;
}

.node-type {
  font-size: 9px;
  color: #6bc4ff;
  margin-right: 4px;
}

.node-name {
  font-size: 11px;
  color: #b0c4d8;
}

.sm-info {
  font-size: 10px;
  color: #4a5a6a;
  margin-bottom: 4px;
}

.sm-state {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  margin-bottom: 3px;
}

.state-name {
  font-size: 11px;
  color: #e2ebfb;
  font-weight: 500;
  min-width: 60px;
}

.state-transition {
  font-size: 9px;
  color: #4a5a6a;
  background: rgba(255, 255, 255, 0.05);
  padding: 1px 4px;
  border-radius: 2px;
}

.instruction-row {
  display: flex;
  gap: 6px;
  font-size: 10px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.ins-time {
  color: #6bc4ff;
  min-width: 70px;
}

.ins-type {
  color: #b0c4d8;
  flex: 1;
}

/* 环境配置 */
.subsection-title {
  font-size: 10px;
  color: #6bc4ff;
  font-weight: 600;
  margin: 10px 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.env-block {
  margin-bottom: 8px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}

.env-label {
  font-size: 11px;
  color: #e2ebfb;
  font-weight: 500;
  margin-bottom: 3px;
}

.env-row {
  font-size: 10px;
  color: #4a5a6a;
  padding: 1px 0;
}

.effect-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 0;
  font-size: 11px;
}

.effect-status.enabled {
  color: #4caf50;
}

.effect-status.disabled {
  color: #4a5a6a;
}

.effect-name {
  color: #b0c4d8;
}

.event-row {
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.event-name {
  font-size: 11px;
  color: #e2ebfb;
}

.event-time {
  font-size: 9px;
  color: #4a5a6a;
}

/* 交互关系 */
.link-row {
  font-size: 10px;
  color: #b0c4d8;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.corner-actions {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 460;
  display: flex;
  gap: 8px;
}

.corner-action {
  height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(107, 196, 255, 0.25);
  border-radius: 6px;
  color: #d8e8ff;
  background: rgba(5, 16, 30, 0.88);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
}

.corner-action:hover,
.corner-action.active {
  border-color: rgba(107, 196, 255, 0.6);
  background: rgba(11, 32, 54, 0.94);
}

.corner-action:disabled {
  cursor: not-allowed;
  color: #526477;
  border-color: rgba(107, 196, 255, 0.12);
  background: rgba(5, 16, 30, 0.5);
}

.event-log-popover {
  position: fixed;
  left: 332px;
  bottom: 16px;
  z-index: 1100;
  width: 360px;
  max-height: 420px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(107, 196, 255, 0.28);
  border-radius: 6px;
  background: rgba(4, 11, 20, 0.96);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
}

.popover-header,
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  color: #e2ebfb;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid rgba(107, 196, 255, 0.16);
}

.popover-body {
  padding: 8px 12px 12px;
  overflow: auto;
}

.log-row {
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.log-time {
  font-size: 10px;
  color: #6bc4ff;
}

.log-title {
  margin-top: 3px;
  font-size: 12px;
  color: #e2ebfb;
}

.log-detail {
  margin-top: 2px;
  font-size: 11px;
  color: #8ea4c9;
  line-height: 1.4;
}

.icon-button {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  color: #8ea4c9;
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.icon-button:hover {
  color: #e2ebfb;
  background: rgba(107, 196, 255, 0.1);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
}

.environment-modal {
  width: min(520px, calc(100vw - 32px));
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(107, 196, 255, 0.28);
  border-radius: 8px;
  background: rgba(4, 11, 20, 0.98);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}

.modal-body {
  padding: 14px 16px;
  overflow: auto;
}

.form-section {
  margin-bottom: 16px;
}

.form-section-title {
  margin-bottom: 8px;
  color: #6bc4ff;
  font-size: 12px;
  font-weight: 600;
}

.field-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #8ea4c9;
}

.field-row input {
  width: 100%;
  min-width: 0;
  height: 30px;
  border: 1px solid rgba(107, 196, 255, 0.18);
  border-radius: 5px;
  padding: 0 8px;
  color: #e2ebfb;
  background: rgba(255, 255, 255, 0.04);
}

.check-row {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  font-size: 12px;
  color: #d8e8ff;
}

.check-row em {
  color: #4a5a6a;
  font-style: normal;
  font-size: 10px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(107, 196, 255, 0.16);
}

.primary-button,
.secondary-button {
  height: 32px;
  border-radius: 5px;
  padding: 0 14px;
  font-size: 12px;
  cursor: pointer;
}

.primary-button {
  border: 1px solid rgba(107, 196, 255, 0.68);
  color: #04101d;
  background: #6bc4ff;
}

.secondary-button {
  border: 1px solid rgba(107, 196, 255, 0.22);
  color: #d8e8ff;
  background: rgba(255, 255, 255, 0.04);
}

@media (max-width: 760px) {
  .event-log-popover {
    left: 16px;
    right: 16px;
    width: auto;
  }
}
</style>
