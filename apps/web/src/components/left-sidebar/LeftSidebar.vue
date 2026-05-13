<!-- apps/web/src/components/left-sidebar/LeftSidebar.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useActionPlanStore } from '../../stores/action-plan';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';
import ActionPlanCard from '../action-plan/ActionPlanCard.vue';
import RouteManagementPanel from './RouteManagementPanel.vue';
import type { ExecutionEngine } from '../../services/execution-engine';
import type { RouteDecision } from '../../services/ai-decision-visualizer';
import type { EntitySpec, EnvironmentConfig } from '../../types/tactical-scenario';
import {
  updateScenarioEntityWithLinkedGeometry,
  updateScenarioRoutePointWithLinkedGeometry,
} from '../../services/scenario-edit-service';
import {
  buildFormationTree,
  getFormationRoleMarker,
  type FormationCategoryNode,
  type FormationGroupNode,
} from '../../services/formation-tree';

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
const expandedFormationNodes = ref<Record<string, boolean>>({});
const entityEditorOpen = ref(false);
const entityEditorError = ref('');
const entityEditorDraft = ref<{
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  altitude: number;
} | null>(null);
const routePointEditorOpen = ref(false);
const routePointEditorError = ref('');
const routePointEditorDraft = ref<{
  routeIndex: number;
  pointIndex: number;
  entityName: string;
  routeLabel: string;
  timestamp?: number;
  longitude: number;
  latitude: number;
  altitude: number;
} | null>(null);

function toggleSection(key: keyof typeof sections.value) {
  sections.value[key] = !sections.value[key];
}

const activeScenario = computed(() => scenarioStore.currentScenario ?? actionPlanStore.activePlan?.scenario ?? null);

function getNodeKey(kind: 'side' | 'formation' | 'category', id: string): string {
  return `${kind}:${id}`;
}

function isFormationNodeExpanded(kind: 'side' | 'formation' | 'category', id: string): boolean {
  return expandedFormationNodes.value[getNodeKey(kind, id)] ?? true;
}

function toggleFormationNode(kind: 'side' | 'formation' | 'category', id: string) {
  const key = getNodeKey(kind, id);
  expandedFormationNodes.value = {
    ...expandedFormationNodes.value,
    [key]: !isFormationNodeExpanded(kind, id),
  };
}

function getFormationCount(formation: FormationGroupNode): number {
  return formation.categories.reduce((sum, category) => sum + category.members.length, 0);
}

function getCategoryCount(category: FormationCategoryNode): number {
  return category.members.length;
}

const forcesBySide = computed(() => buildFormationTree(activeScenario.value));

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
  const scenario = activeScenario.value;
  if (!scenario) return [];
  return scenario.forces.flatMap(f => f.entities);
});

// 所有路线列表
const allRoutes = computed(() => {
  const scenario = activeScenario.value;
  return scenario?.routes || [];
});

const eventLogItems = computed(() => {
  const scenario = activeScenario.value;
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
  if (!activeScenario.value?.environment) return;
  environmentDraft.value = cloneEnvironment(activeScenario.value.environment);
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

function openEntityEditor(entity: EntitySpec) {
  entityEditorDraft.value = {
    id: entity.id,
    name: entity.name,
    longitude: entity.position.longitude,
    latitude: entity.position.latitude,
    altitude: entity.position.altitude ?? 0,
  };
  entityEditorError.value = '';
  entityEditorOpen.value = true;
}

function closeEntityEditor() {
  entityEditorOpen.value = false;
  entityEditorDraft.value = null;
  entityEditorError.value = '';
}

function parseEditorNumber(value: number, label: string): number {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    throw new Error(`${label} 必须是有效数字`);
  }
  return next;
}

function saveEntityEditor() {
  const draft = entityEditorDraft.value;
  const scenario = activeScenario.value;
  if (!draft || !scenario) return;

  try {
    const longitude = parseEditorNumber(draft.longitude, '经度');
    const latitude = parseEditorNumber(draft.latitude, '纬度');
    const altitude = parseEditorNumber(draft.altitude, '高度');
    const nextScenario = updateScenarioEntityWithLinkedGeometry(
      scenario,
      draft.id,
      {
        name: draft.name,
        position: { longitude, latitude, altitude },
      },
    );

    const entityName = draft.name.trim() || draft.id;
    scenarioStore.applyScenarioEdit(nextScenario, `实体 ${entityName} 已精确调整，关联行动路线、探测区和导弹轨迹已同步`);
    actionPlanStore.updateActivePlanScenarioInMemory(nextScenario);
    closeEntityEditor();
  } catch (err) {
    entityEditorError.value = err instanceof Error ? err.message : String(err);
  }
}

function openRoutePointEditor(routeIndex: number, pointIndex: number) {
  const route = allRoutes.value[routeIndex];
  const point = route?.points[pointIndex];
  if (!route || !point) return;

  const entity = allEntities.value.find(item => item.id === route.entityId);
  routePointEditorDraft.value = {
    routeIndex,
    pointIndex,
    entityName: entity?.name ?? route.entityId,
    routeLabel: route.label ?? `路线-${route.entityId}`,
    timestamp: point.timestamp,
    longitude: point.position.longitude,
    latitude: point.position.latitude,
    altitude: point.position.altitude ?? 0,
  };
  routePointEditorError.value = '';
  routePointEditorOpen.value = true;
}

function closeRoutePointEditor() {
  routePointEditorOpen.value = false;
  routePointEditorDraft.value = null;
  routePointEditorError.value = '';
}

function saveRoutePointEditor() {
  const draft = routePointEditorDraft.value;
  const scenario = activeScenario.value;
  if (!draft || !scenario) return;

  try {
    const longitude = parseEditorNumber(draft.longitude, '经度');
    const latitude = parseEditorNumber(draft.latitude, '纬度');
    const altitude = parseEditorNumber(draft.altitude, '高度');

    if (draft.pointIndex === 0) {
      const confirmed = window.confirm(
        `当前修改的是 ${draft.entityName} 的行动路线起始点。确定后，该资源实体的部署位置也会同步变化。`,
      );
      if (!confirmed) return;
    }

    const result = updateScenarioRoutePointWithLinkedGeometry(
      scenario,
      draft.routeIndex,
      draft.pointIndex,
      { longitude, latitude, altitude },
    );
    const linkedMessage = result.linkedLaunchPointsChanged > 0
      ? `，并同步 ${result.linkedLaunchPointsChanged} 个导弹发射轨迹点`
      : '';
    const entityMessage = result.entityPositionChanged
      ? '，资源实体位置已同步变化'
      : '';

    scenarioStore.applyScenarioEdit(
      result.scenario,
      `行动路线「${draft.routeLabel}」第 ${draft.pointIndex + 1} 个关键点已更新${entityMessage}${linkedMessage}`,
    );
    actionPlanStore.updateActivePlanScenarioInMemory(result.scenario);
    closeRoutePointEditor();
  } catch (err) {
    routePointEditorError.value = err instanceof Error ? err.message : String(err);
  }
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
          <button
            type="button"
            class="group-name tree-toggle"
            :class="group.side"
            @click.stop="toggleFormationNode('side', group.id)"
          >
            <span class="tree-caret">{{ isFormationNodeExpanded('side', group.id) ? '▼' : '▶' }}</span>
            <span>{{ group.name }}</span>
            <span class="group-count">{{ group.total }}</span>
          </button>
          <div
            v-if="isFormationNodeExpanded('side', group.id)"
            v-for="formation in group.groups"
            :key="formation.id"
            class="formation-item"
          >
            <button
              type="button"
              class="formation-name tree-toggle"
              @click.stop="toggleFormationNode('formation', formation.id)"
            >
              <span class="tree-caret">{{ isFormationNodeExpanded('formation', formation.id) ? '▼' : '▶' }}</span>
              <span>{{ formation.name }}</span>
              <span class="formation-count">{{ getFormationCount(formation) }}</span>
            </button>
            <div
              v-if="isFormationNodeExpanded('formation', formation.id)"
              v-for="category in formation.categories"
              :key="category.id"
              class="category-item"
            >
              <button
                type="button"
                class="category-name tree-toggle"
                @click.stop="toggleFormationNode('category', category.id)"
              >
                <span class="tree-caret">{{ isFormationNodeExpanded('category', category.id) ? '▼' : '▶' }}</span>
                <span
                  class="entity-role"
                  :class="`entity-role--${category.marker.toLowerCase()}`"
                >
                  <span class="entity-role__label">{{ category.marker }}</span>
                </span>
                <span>{{ category.name }}</span>
                <span class="category-count">{{ getCategoryCount(category) }}</span>
              </button>
              <div
                v-if="isFormationNodeExpanded('category', category.id)"
                v-for="member in category.members"
                :key="member.id"
                class="entity-item"
                title="双击精确调整名称和经纬高"
                @dblclick.stop="openEntityEditor(member)"
              >
                <span class="entity-icon" :class="member.side">●</span>
                <span class="entity-name">{{ member.name }}</span>
                <span
                  class="entity-role entity-role--small"
                  :class="`entity-role--${getFormationRoleMarker(member.formationRole).toLowerCase()}`"
                >
                  <span class="entity-role__label">{{ getFormationRoleMarker(member.formationRole) }}</span>
                </span>
              </div>
            </div>
          </div>
          <div v-if="group.total === 0" class="empty-side">暂无{{ group.name }}兵力</div>
        </div>
      </div>
    </div>

    <div
      v-if="entityEditorOpen && entityEditorDraft"
      class="entity-editor-backdrop"
      @click.self="closeEntityEditor"
    >
      <div class="entity-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="entity-editor-title">
        <div class="entity-editor-header">
          <h3 id="entity-editor-title">精确调整实体</h3>
          <button type="button" class="entity-editor-close" aria-label="关闭" @click="closeEntityEditor">×</button>
        </div>
        <div class="entity-editor-body">
          <label class="entity-editor-field">
            <span>名称</span>
            <input v-model.trim="entityEditorDraft.name" type="text" />
          </label>
          <label class="entity-editor-field">
            <span>经度</span>
            <input v-model.number="entityEditorDraft.longitude" type="number" step="0.000001" />
          </label>
          <label class="entity-editor-field">
            <span>纬度</span>
            <input v-model.number="entityEditorDraft.latitude" type="number" step="0.000001" />
          </label>
          <label class="entity-editor-field">
            <span>高度</span>
            <input v-model.number="entityEditorDraft.altitude" type="number" step="1" />
          </label>
          <p v-if="entityEditorError" class="entity-editor-error">{{ entityEditorError }}</p>
        </div>
        <div class="entity-editor-actions">
          <button type="button" class="entity-editor-button entity-editor-button-secondary" @click="closeEntityEditor">取消</button>
          <button type="button" class="entity-editor-button entity-editor-button-primary" @click="saveEntityEditor">保存到草稿</button>
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
          @edit-route-point="openRoutePointEditor"
        />
      </div>
    </div>

    <div
      v-if="routePointEditorOpen && routePointEditorDraft"
      class="entity-editor-backdrop"
      @click.self="closeRoutePointEditor"
    >
      <div class="entity-editor-dialog route-point-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="route-point-editor-title">
        <div class="entity-editor-header">
          <h3 id="route-point-editor-title">编辑路线关键点</h3>
          <button type="button" class="entity-editor-close" aria-label="关闭" @click="closeRoutePointEditor">×</button>
        </div>
        <div class="entity-editor-body">
          <div class="route-point-editor-summary">
            <span>{{ routePointEditorDraft.entityName }}</span>
            <strong>{{ routePointEditorDraft.routeLabel }}</strong>
            <em>关键点 {{ routePointEditorDraft.pointIndex + 1 }}</em>
            <em v-if="routePointEditorDraft.timestamp !== undefined">T+{{ routePointEditorDraft.timestamp }}s</em>
          </div>
          <div v-if="routePointEditorDraft.pointIndex === 0" class="route-point-editor-warning">
            修改起始点会同步改变该资源实体的部署位置。
          </div>
          <label class="entity-editor-field">
            <span>经度</span>
            <input v-model.number="routePointEditorDraft.longitude" type="number" step="0.000001" />
          </label>
          <label class="entity-editor-field">
            <span>纬度</span>
            <input v-model.number="routePointEditorDraft.latitude" type="number" step="0.000001" />
          </label>
          <label class="entity-editor-field">
            <span>高度</span>
            <input v-model.number="routePointEditorDraft.altitude" type="number" step="1" />
          </label>
          <p v-if="routePointEditorError" class="entity-editor-error">{{ routePointEditorError }}</p>
        </div>
        <div class="entity-editor-actions">
          <button type="button" class="entity-editor-button entity-editor-button-secondary" @click="closeRoutePointEditor">取消</button>
          <button type="button" class="entity-editor-button entity-editor-button-primary" @click="saveRoutePointEditor">保存到草稿</button>
        </div>
      </div>
    </div>

    <!-- 任务树 -->
    <div class="section">
      <div class="section-header" @click="toggleSection('tasks')">
        <span class="toggle-icon">{{ sections.tasks ? '▼' : '▶' }}</span>
        <span class="section-title">任务树</span>
        <span class="section-badge">{{ activeScenario?.tasks?.length ?? 0 }}</span>
      </div>
      <div v-if="sections.tasks" class="section-body">
        <div
          v-for="task in activeScenario?.tasks"
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
        <div v-if="!activeScenario?.tasks?.length" class="empty-hint">
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
          {{ activeScenario?.interactions ? '✓' : '-' }}
        </span>
      </div>
      <div v-if="sections.interactions" class="section-body">
        <template v-if="activeScenario?.interactions">
          <div v-if="activeScenario.interactions.commandControl.length" class="subsection-title">
            指控关系 ({{ activeScenario.interactions.commandControl.length }})
          </div>
          <div
            v-for="cc in activeScenario.interactions.commandControl"
            :key="cc.id"
            class="link-row"
          >{{ cc.commander }} → {{ cc.subordinate }}</div>

          <div v-if="activeScenario.interactions.communications.length" class="subsection-title">
            通信链路 ({{ activeScenario.interactions.communications.length }})
          </div>
          <div
            v-for="comm in activeScenario.interactions.communications"
            :key="comm.id"
            class="link-row"
          >{{ comm.sender.equipRef }} → {{ comm.receiver.equipRef }}</div>

          <div v-if="activeScenario.interactions.detectionLinks.length" class="subsection-title">
            探测关系 ({{ activeScenario.interactions.detectionLinks.length }})
          </div>
          <div
            v-for="d in activeScenario.interactions.detectionLinks"
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
        :disabled="!activeScenario?.environment"
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
  gap: 6px;
  width: 100%;
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

.tree-toggle {
  appearance: none;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.tree-toggle:hover {
  color: #e2ebfb;
}

.tree-caret {
  width: 12px;
  flex: 0 0 12px;
  color: #6b7f99;
  font-size: 10px;
  line-height: 1;
}

.formation-item {
  margin-left: 4px;
  padding: 5px 0 5px 10px;
  border-left: 1px solid rgba(107, 196, 255, 0.18);
}

.formation-name {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  color: #d9e7f6;
  font-size: 12px;
  font-weight: 600;
}

.formation-count,
.category-count {
  flex: 0 0 auto;
  font-size: 10px;
  color: #8ea4c9;
  background: rgba(142, 164, 201, 0.12);
  border-radius: 999px;
  padding: 1px 6px;
}

.category-item {
  margin: 5px 0 2px 10px;
  padding-left: 9px;
  border-left: 1px solid rgba(142, 164, 201, 0.12);
}

.category-name {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  color: #9fb8d6;
  font-size: 11px;
  padding: 2px 0;
}

.group-name > span:nth-child(2),
.formation-name > span:nth-child(2),
.category-name > span:nth-child(3) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0 4px 14px;
  font-size: 12px;
  border-left: 1px solid rgba(107, 196, 255, 0.1);
  margin-left: 4px;
  cursor: pointer;
}

.entity-item:hover {
  background: rgba(107, 196, 255, 0.08);
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
  min-width: 0;
  color: #b0c4d8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-role {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  color: #08111f;
  border: 1px solid transparent;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.06);
}

.entity-role--l {
  background: #31d07f;
  border-color: rgba(49, 208, 127, 0.85);
  border-radius: 3px;
}

.entity-role--v {
  background: #4dabf7;
  border-color: rgba(77, 171, 247, 0.9);
  transform: rotate(45deg) scale(0.82);
}

.entity-role--v .entity-role__label {
  display: inline-block;
  transform: rotate(-45deg) scale(1.22);
}

.entity-role--c {
  background: #ffd43b;
  border-color: rgba(255, 212, 59, 0.9);
  border-radius: 50%;
}

.entity-role--small {
  width: 16px;
  height: 16px;
  flex-basis: 16px;
  font-size: 9px;
}

.empty-side {
  padding: 6px 0 8px 12px;
  margin-left: 4px;
  border-left: 1px solid rgba(107, 196, 255, 0.12);
  font-size: 11px;
  color: #4a5a6a;
}

.entity-editor-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(1, 7, 16, 0.52);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.entity-editor-dialog {
  width: min(360px, calc(100vw - 40px));
  border: 1px solid rgba(107, 196, 255, 0.24);
  border-radius: 8px;
  background: rgba(7, 18, 34, 0.98);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.route-point-editor-dialog {
  width: min(390px, calc(100vw - 40px));
}

.entity-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(107, 196, 255, 0.16);
}

.entity-editor-header h3 {
  margin: 0;
  color: #e2ebfb;
  font-size: 14px;
  font-weight: 700;
}

.entity-editor-close {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(142, 164, 201, 0.2);
  border-radius: 6px;
  background: rgba(142, 164, 201, 0.08);
  color: #9fb8d6;
  cursor: pointer;
}

.entity-editor-body {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.entity-editor-field {
  display: grid;
  gap: 5px;
  color: #9fb8d6;
  font-size: 11px;
}

.entity-editor-field input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 6px;
  background: rgba(3, 10, 20, 0.75);
  color: #e2ebfb;
  font-size: 12px;
  padding: 8px 9px;
  outline: none;
}

.entity-editor-field input:focus {
  border-color: rgba(107, 196, 255, 0.62);
  box-shadow: 0 0 0 2px rgba(107, 196, 255, 0.12);
}

.entity-editor-error {
  margin: 0;
  color: #ff8585;
  font-size: 11px;
}

.route-point-editor-summary {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid rgba(107, 196, 255, 0.14);
  border-radius: 6px;
  background: rgba(107, 196, 255, 0.06);
  color: #9fb8d6;
  font-size: 11px;
}

.route-point-editor-summary strong {
  color: #e2ebfb;
  font-size: 12px;
}

.route-point-editor-summary em {
  color: #6bc4ff;
  font-style: normal;
}

.route-point-editor-warning {
  border: 1px solid rgba(251, 191, 36, 0.34);
  border-radius: 6px;
  background: rgba(251, 191, 36, 0.08);
  color: #ffd987;
  font-size: 11px;
  line-height: 1.45;
  padding: 8px 9px;
}

.entity-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(107, 196, 255, 0.12);
}

.entity-editor-button {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
}

.entity-editor-button-secondary {
  background: rgba(142, 164, 201, 0.1);
  border-color: rgba(142, 164, 201, 0.18);
  color: #b0c4d8;
}

.entity-editor-button-primary {
  background: rgba(77, 171, 247, 0.18);
  border-color: rgba(77, 171, 247, 0.42);
  color: #e2ebfb;
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
