<!-- apps/web/src/components/action-plan/ActionPlanPanel.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useActionPlanStore } from '../../stores/action-plan';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';
import ActionPlanCard from './ActionPlanCard.vue';
import type { ExecutionEngine } from '../../services/execution-engine';

const actionPlanStore = useActionPlanStore();
const scenarioStore = useTacticalScenarioStore();

const activeTab = ref<'phases' | 'tasks' | 'environment' | 'interactions'>('phases');

const hasTasks = computed(() => (scenarioStore.currentScenario?.tasks?.length ?? 0) > 0);
const hasEnvironment = computed(() => !!scenarioStore.currentScenario?.environment);
const hasInteractions = computed(() => !!scenarioStore.currentScenario?.interactions);

// ExecutionEngine 引用（由外部注入）
let executionEngine: ExecutionEngine | null = null;

function initEngine(engine: ExecutionEngine) {
  executionEngine = engine;
}

function handlePlay() { executionEngine?.play(); }
function handlePause() { executionEngine?.pause(); }
function handleStepForward() { executionEngine?.step(1); }
function handleStepBackward() { executionEngine?.step(-1); }
function handleSetSpeed(speed: number) { executionEngine?.setSpeed(speed); }
function handlePrevPhase() { executionEngine?.prevPhase(); }
function handleNextPhase() { executionEngine?.nextPhase(); }
function handleReset() { executionEngine?.stop(); }

defineExpose({ initEngine });
</script>

<template>
  <div class="action-plan-panel">
    <div class="panel-header">
      <span class="panel-title">行动计划</span>
      <span class="panel-count">{{ actionPlanStore.plans.length }}</span>
    </div>

    <!-- Tab 导航 -->
    <div class="tab-nav">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'phases' }"
        @click="activeTab = 'phases'"
      >行动阶段</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'tasks' }"
        :disabled="!hasTasks"
        @click="activeTab = 'tasks'"
      >任务树</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'environment' }"
        :disabled="!hasEnvironment"
        @click="activeTab = 'environment'"
      >环境</button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'interactions' }"
        :disabled="!hasInteractions"
        @click="activeTab = 'interactions'"
      >交互</button>
    </div>

    <!-- 行动阶段 Tab -->
    <div v-if="activeTab === 'phases'" class="panel-body">
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
      <div v-if="actionPlanStore.plans.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">暂无行动计划</div>
        <div class="empty-hint">在 AI 助手中生成方案或导入 XML</div>
      </div>
    </div>

    <!-- 任务树 Tab -->
    <div v-else-if="activeTab === 'tasks'" class="panel-body">
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
            <div class="tree-children">
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
          <div class="sm-info">初始状态: {{ (task.config as any).initialState }}</div>
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
            <span class="ins-comp">{{ ins.component }}</span>
          </div>
        </template>
      </div>
    </div>

    <!-- 环境配置 Tab -->
    <div v-else-if="activeTab === 'environment'" class="panel-body">
      <template v-if="scenarioStore.currentScenario?.environment">
        <div class="section-title">环境生成模型</div>
        <div v-if="scenarioStore.currentScenario.environment.generationModels.spaceEnvironment" class="env-block">
          <div class="env-label">空间环境</div>
          <div class="env-row">太阳通量: {{ scenarioStore.currentScenario.environment.generationModels.spaceEnvironment.solarActivity.fluxLevel }} sfu</div>
          <div class="env-row">Kp 指数: {{ scenarioStore.currentScenario.environment.generationModels.spaceEnvironment.geomagneticField.kpIndex }}</div>
          <div class="env-row">电离层模型: {{ scenarioStore.currentScenario.environment.generationModels.spaceEnvironment.ionosphere.modelType }}</div>
        </div>
        <div v-if="scenarioStore.currentScenario.environment.generationModels.atmosphereModel" class="env-block">
          <div class="env-label">大气环境</div>
          <div class="env-row">天气: {{ scenarioStore.currentScenario.environment.generationModels.atmosphereModel.weather }}</div>
          <div class="env-row">风速: {{ scenarioStore.currentScenario.environment.generationModels.atmosphereModel.windSpeed }} m/s</div>
        </div>
        <div class="section-title">效应模型 ({{ scenarioStore.currentScenario.environment.effectModels.length }})</div>
        <div
          v-for="em in scenarioStore.currentScenario.environment.effectModels"
          :key="em.id"
          class="effect-row"
        >
          <span class="effect-status" :class="em.enabled ? 'enabled' : 'disabled'">{{ em.enabled ? '●' : '○' }}</span>
          <span class="effect-name">{{ em.name }}</span>
        </div>
        <div class="section-title">环境事件 ({{ scenarioStore.currentScenario.environment.events.length }})</div>
        <div
          v-for="ev in scenarioStore.currentScenario.environment.events"
          :key="ev.id"
          class="event-row"
        >
          <div class="event-name">{{ ev.name }}</div>
          <div class="event-time">{{ ev.startTime }} ~ {{ ev.endTime }}</div>
        </div>
      </template>
    </div>

    <!-- 交互关系 Tab -->
    <div v-else-if="activeTab === 'interactions'" class="panel-body">
      <template v-if="scenarioStore.currentScenario?.interactions">
        <div class="section-title">编组关系</div>
        <div
          v-for="g in scenarioStore.currentScenario.interactions.groups"
          :key="g.id"
          class="group-block"
        >
          <div class="group-name">{{ g.name }}</div>
          <div
            v-for="m in g.members"
            :key="m.equipRef"
            class="group-member"
          >
            <span class="member-ref">{{ m.equipRef }}</span>
            <span v-if="m.role" class="member-role">{{ m.role }}</span>
          </div>
        </div>
        <div class="section-title">指控关系 ({{ scenarioStore.currentScenario.interactions.commandControl.length }})</div>
        <div
          v-for="cc in scenarioStore.currentScenario.interactions.commandControl"
          :key="cc.id"
          class="link-row"
        >{{ cc.commander }} → {{ cc.subordinate }} ({{ cc.protocol }})</div>
        <div class="section-title">通信链路 ({{ scenarioStore.currentScenario.interactions.communications.length }})</div>
        <div
          v-for="comm in scenarioStore.currentScenario.interactions.communications"
          :key="comm.id"
          class="link-row"
        >{{ comm.sender.equipRef }} → {{ comm.receiver.equipRef }} [{{ comm.protocol }}]</div>
        <div class="section-title">探测关系 ({{ scenarioStore.currentScenario.interactions.detectionLinks.length }})</div>
        <div
          v-for="d in scenarioStore.currentScenario.interactions.detectionLinks"
          :key="d.id"
          class="link-row"
        >{{ d.observer.equipRef }} 探测 {{ d.target }} ({{ d.sensorType }})</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.action-plan-panel {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 320px;
  display: flex;
  flex-direction: column;
  background: rgba(4, 11, 20, 0.98);
  border-right: 1px solid rgba(107, 196, 255, 0.25);
  overflow: hidden;
  z-index: 400;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(107, 196, 255, 0.15);
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2ebfb;
}

.panel-count {
  font-size: 11px;
  color: #4a5a6a;
  background: rgba(107, 196, 255, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
}

.tab-nav {
  display: flex;
  border-bottom: 1px solid rgba(107, 196, 255, 0.15);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 8px 4px;
  font-size: 11px;
  color: #4a5a6a;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.2s, border-bottom 0.2s;
  border-bottom: 2px solid transparent;
}

.tab-btn:hover:not(:disabled) {
  color: #6bc4ff;
}

.tab-btn.active {
  color: #6bc4ff;
  border-bottom: 2px solid #6bc4ff;
}

.tab-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  text-align: center;
}

.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.empty-text { font-size: 14px; color: #b0c4d8; margin-bottom: 4px; }
.empty-hint { font-size: 12px; color: #4a5a6a; }

/* 任务树 */
.task-item { margin-bottom: 16px; border: 1px solid rgba(107,196,255,0.15); border-radius: 6px; padding: 10px; }
.task-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.task-type-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(107,196,255,0.15); color: #6bc4ff; }
.task-name { font-size: 13px; color: #e2ebfb; font-weight: 500; }
.task-meta { font-size: 11px; color: #4a5a6a; margin-bottom: 8px; }
.tree-node { padding: 4px 0 4px 12px; border-left: 1px solid rgba(107,196,255,0.2); margin: 2px 0; }
.root-node { border-left: none; padding-left: 0; }
.tree-children { padding-left: 12px; }
.node-type { font-size: 10px; color: #6bc4ff; margin-right: 6px; }
.node-name { font-size: 12px; color: #b0c4d8; }
.sm-info { font-size: 11px; color: #4a5a6a; margin-bottom: 6px; }
.sm-state { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 4px; }
.state-name { font-size: 12px; color: #e2ebfb; font-weight: 500; min-width: 80px; }
.state-transition { font-size: 10px; color: #4a5a6a; background: rgba(255,255,255,0.05); padding: 1px 5px; border-radius: 3px; }
.instruction-row { display: flex; gap: 8px; font-size: 11px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.ins-time { color: #6bc4ff; min-width: 90px; }
.ins-type { color: #e2ebfb; flex: 1; }
.ins-comp { color: #4a5a6a; }

/* 环境 */
.section-title { font-size: 11px; color: #6bc4ff; font-weight: 600; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.env-block { margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; }
.env-label { font-size: 12px; color: #e2ebfb; font-weight: 500; margin-bottom: 4px; }
.env-row { font-size: 11px; color: #4a5a6a; padding: 1px 0; }
.effect-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; }
.effect-status.enabled { color: #4caf50; }
.effect-status.disabled { color: #4a5a6a; }
.effect-name { color: #b0c4d8; }
.event-row { padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.event-name { font-size: 12px; color: #e2ebfb; }
.event-time { font-size: 10px; color: #4a5a6a; }

/* 交互 */
.group-block { margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; }
.group-name { font-size: 12px; color: #e2ebfb; font-weight: 500; margin-bottom: 6px; }
.group-member { display: flex; align-items: center; gap: 6px; padding: 2px 0 2px 8px; }
.member-ref { font-size: 11px; color: #b0c4d8; }
.member-role { font-size: 10px; color: #6bc4ff; background: rgba(107,196,255,0.1); padding: 1px 5px; border-radius: 3px; }
.link-row { font-size: 11px; color: #b0c4d8; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
</style>
