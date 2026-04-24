<!-- apps/web/src/components/left-sidebar/LeftSidebar.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useActionPlanStore } from '../../stores/action-plan';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';
import ActionPlanCard from '../action-plan/ActionPlanCard.vue';
import RouteManagementPanel from './RouteManagementPanel.vue';
import type { ExecutionEngine } from '../../services/execution-engine';
import type { RouteDecision } from '../../services/ai-decision-visualizer';

const actionPlanStore = useActionPlanStore();
const scenarioStore = useTacticalScenarioStore();

// 折叠状态
const sections = ref({
  situation: true,    // 态势总览
  forces: true,       // 兵力列表
  actionPlan: true,   // 行动计划
  routes: true,       // 行动路线
  tasks: false,       // 任务树
  environment: false, // 环境配置
  interactions: false,// 交互关系
  eventLog: false,    // 事件日志
});

// 路线决策数据和选中状态
const routeDecisions = ref<Map<string, RouteDecision>>(new Map());
const selectedRouteId = ref<string | null>(null);

function toggleSection(key: keyof typeof sections.value) {
  sections.value[key] = !sections.value[key];
}

// 态势统计
const situationStats = computed(() => {
  const scenario = scenarioStore.currentScenario;
  if (!scenario) return { red: 0, blue: 0, total: 0 };

  const redForce = scenario.forces.find(f => f.side === 'red');
  const blueForce = scenario.forces.find(f => f.side === 'blue');

  const red = redForce?.entities.length ?? 0;
  const blue = blueForce?.entities.length ?? 0;

  return { red, blue, total: red + blue };
});

// 兵力列表（按编组组织）
const forcesByGroup = computed(() => {
  const scenario = scenarioStore.currentScenario;
  if (!scenario) return [];

  const groups = scenario.interactions?.groups ?? [];
  const allEntities = scenario.forces.flatMap(f => f.entities);

  // 构建编组树
  const result = groups.map(group => {
    const members = group.members.map(m => {
      const entity = allEntities.find(e => e.id === m.equipRef);
      return entity ? { ...entity, role: m.role } : null;
    }).filter(Boolean);

    return {
      id: group.id,
      name: group.name,
      members,
    };
  });

  // 未编组的装备
  const groupedIds = new Set(groups.flatMap(g => g.members.map(m => m.equipRef)));
  const ungrouped = allEntities.filter(e => !groupedIds.has(e.id));

  if (ungrouped.length > 0) {
    result.push({
      id: 'ungrouped',
      name: '未编组',
      members: ungrouped.map(e => ({ ...e, role: undefined })),
    });
  }

  return result;
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

defineExpose({ initEngine, setRouteDecisions });
</script>

<template>
  <div class="left-sidebar">
    <!-- 态势总览 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('situation')">
        <span class="toggle-icon">{{ sections.situation ? '▼' : '▶' }}</span>
        <span class="section-title">态势总览</span>
        <span class="section-badge">{{ situationStats.total }}</span>
      </div>
      <div v-if="sections.situation" class="section-body">
        <div class="stat-row">
          <span class="stat-label red">红方</span>
          <span class="stat-value">{{ situationStats.red }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label blue">蓝方</span>
          <span class="stat-value">{{ situationStats.blue }}</span>
        </div>
        <div v-if="scenarioStore.currentScenario?.scenarioMetadata" class="meta-info">
          <div class="meta-row">{{ scenarioStore.currentScenario.scenarioMetadata.name }}</div>
          <div class="meta-row small">{{ scenarioStore.currentScenario.scenarioMetadata.version }}</div>
        </div>
      </div>
    </div>

    <!-- 兵力列表 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('forces')">
        <span class="toggle-icon">{{ sections.forces ? '▼' : '▶' }}</span>
        <span class="section-title">兵力列表</span>
        <span class="section-badge">{{ forcesByGroup.length }}</span>
      </div>
      <div v-if="sections.forces" class="section-body">
        <div v-for="group in forcesByGroup" :key="group.id" class="group-item">
          <div class="group-name">{{ group.name }}</div>
          <div
            v-for="member in group.members"
            :key="member.id"
            class="entity-item"
          >
            <span class="entity-icon" :class="member.side">●</span>
            <span class="entity-name">{{ member.name }}</span>
            <span v-if="member.role" class="entity-role">{{ member.role }}</span>
          </div>
        </div>
        <div v-if="forcesByGroup.length === 0" class="empty-hint">暂无兵力数据</div>
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

    <!-- 环境配置 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('environment')">
        <span class="toggle-icon">{{ sections.environment ? '▼' : '▶' }}</span>
        <span class="section-title">环境配置</span>
        <span class="section-badge">
          {{ scenarioStore.currentScenario?.environment ? '✓' : '-' }}
        </span>
      </div>
      <div v-if="sections.environment" class="section-body">
        <template v-if="scenarioStore.currentScenario?.environment">
          <div v-if="scenarioStore.currentScenario.environment.generationModels.spaceEnvironment" class="env-block">
            <div class="env-label">空间环境</div>
            <div class="env-row">太阳通量: {{ scenarioStore.currentScenario.environment.generationModels.spaceEnvironment.solarActivity.fluxLevel }} sfu</div>
            <div class="env-row">Kp: {{ scenarioStore.currentScenario.environment.generationModels.spaceEnvironment.geomagneticField.kpIndex }}</div>
          </div>
          <div v-if="scenarioStore.currentScenario.environment.generationModels.atmosphereModel" class="env-block">
            <div class="env-label">大气环境</div>
            <div class="env-row">天气: {{ scenarioStore.currentScenario.environment.generationModels.atmosphereModel.weather }}</div>
            <div class="env-row">风速: {{ scenarioStore.currentScenario.environment.generationModels.atmosphereModel.windSpeed }} m/s</div>
          </div>
          <div v-if="scenarioStore.currentScenario.environment.effectModels.length" class="subsection-title">
            效应模型 ({{ scenarioStore.currentScenario.environment.effectModels.length }})
          </div>
          <div
            v-for="em in scenarioStore.currentScenario.environment.effectModels"
            :key="em.id"
            class="effect-row"
          >
            <span class="effect-status" :class="em.enabled ? 'enabled' : 'disabled'">{{ em.enabled ? '●' : '○' }}</span>
            <span class="effect-name">{{ em.name }}</span>
          </div>
          <div v-if="scenarioStore.currentScenario.environment.events.length" class="subsection-title">
            环境事件 ({{ scenarioStore.currentScenario.environment.events.length }})
          </div>
          <div
            v-for="ev in scenarioStore.currentScenario.environment.events"
            :key="ev.id"
            class="event-row"
          >
            <div class="event-name">{{ ev.name }}</div>
            <div class="event-time">{{ ev.startTime }} ~ {{ ev.endTime }}</div>
          </div>
        </template>
        <div v-else class="empty-hint">暂无环境配置</div>
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

    <!-- 事件日志 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('eventLog')">
        <span class="toggle-icon">{{ sections.eventLog ? '▼' : '▶' }}</span>
        <span class="section-title">事件日志</span>
        <span class="section-badge">0</span>
      </div>
      <div v-if="sections.eventLog" class="section-body">
        <div class="empty-hint">暂无事件记录</div>
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
  z-index: 400;
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
  font-size: 12px;
  font-weight: 600;
  color: #6bc4ff;
  margin-bottom: 4px;
  padding: 4px 0;
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
</style>
