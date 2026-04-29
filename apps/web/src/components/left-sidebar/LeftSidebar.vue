<!-- apps/web/src/components/left-sidebar/LeftSidebar.vue -->
<script setup lang="ts">
import { ref, computed } from "vue";
import { useActionPlanStore } from "../../stores/action-plan";
import { useTacticalScenarioStore } from "../../stores/tactical-scenario";
import { useEntityState } from "../../composables/useEntityState";
import RouteManagementPanel from "./RouteManagementPanel.vue";
import ActionPlanCard from "../action-plan/ActionPlanCard.vue";
import ActionPlanTreeItem from "../action-plan/ActionPlanTreeItem.vue";
import type { ExecutionEngine } from "../../services/execution-engine";
import type { RouteDecision } from "../../services/ai-decision-visualizer";
import type {
  EnvironmentConfig,
  EntitySpec,
  ForceSide,
  PlatformType,
} from "../../types/tactical-scenario";
import headerImage from "../../assets/left-panel/header.png";
import panelImage from "../../assets/left-panel/left-wrapper.png";
import titleIconImage from "../../assets/left-panel/title-icon.png";

const actionPlanStore = useActionPlanStore();
const scenarioStore = useTacticalScenarioStore();
const { entities: manualDeploymentEntities } = useEntityState();

// 折叠状态
const sections = ref({
  forces: true, // 编成编组
  actionPlan: true, // 行动计划
});
const activeForceSide = ref<ForceSide>("red");
const collapsedForceIds = ref<Set<string>>(new Set());

// 路线决策数据和选中状态
const routeDecisions = ref<Map<string, RouteDecision>>(new Map());
const selectedRouteId = ref<string | null>(null);
const selectedEntityId = ref<string | null>(null);
const showEnvironmentDialog = ref(false);
const environmentDraft = ref<EnvironmentConfig | null>(null);

function toggleSection(key: keyof typeof sections.value) {
  sections.value[key] = !sections.value[key];
}

function isForceOpen(forceId: string) {
  return !collapsedForceIds.value.has(forceId);
}

function toggleForce(forceId: string) {
  if (collapsedForceIds.value.has(forceId)) {
    collapsedForceIds.value.delete(forceId);
  } else {
    collapsedForceIds.value.add(forceId);
  }
}

function manualEntityToSpec(entity: (typeof manualDeploymentEntities.value)[number]): EntitySpec {
  return {
    id: entity.id,
    name: entity.name,
    type: (entity.platformType ?? "facility-command") as PlatformType,
    side: entity.forceSide ?? "red",
    position: {
      longitude: entity.currentPosition.longitude,
      latitude: entity.currentPosition.latitude,
      altitude: entity.currentPosition.altitude,
    },
    modelId: entity.modelId,
  };
}

const manualEntitiesBySide = computed(() => {
  const groups: Record<ForceSide, EntitySpec[]> = { red: [], blue: [] };
  manualDeploymentEntities.value.forEach((entity) => {
    const side = entity.forceSide ?? "red";
    groups[side].push(manualEntityToSpec(entity));
  });
  return groups;
});

// 编成编组（固定红方/蓝方）
const forcesBySide = computed(() => {
  const scenario = scenarioStore.currentScenario;
  const sides: { side: ForceSide; name: string }[] = [
    { side: "red", name: "红方" },
    { side: "blue", name: "蓝方" },
  ];

  return sides.map(({ side, name }) => ({
    id: side,
    side,
    name,
    members:
      [
        ...(scenario?.forces
        .filter((force) => force.side === side)
        .flatMap((force) =>
          force.entities.map((entity) => ({ ...entity, side })),
        ) ?? []),
        ...manualEntitiesBySide.value[side],
      ],
  }));
});

const activeForces = computed(() => {
  const scenario = scenarioStore.currentScenario;
  const scenarioForces =
    scenario?.forces.filter((force) => force.side === activeForceSide.value) ??
    [];
  const manualEntities = manualEntitiesBySide.value[activeForceSide.value];
  if (manualEntities.length === 0) return scenarioForces;

  return [
    ...scenarioForces,
    {
      id: `manual-${activeForceSide.value}`,
      side: activeForceSide.value,
      name: "手工部署兵力",
      entities: manualEntities,
    },
  ];
});

const activePlan = computed(() => actionPlanStore.activePlan);

function initEngine(_engine: ExecutionEngine) {
  // 由 Workbench 保持原有初始化调用；左侧旧推演控制已迁移到甘特图。
}

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
  return [
    ...(scenario?.forces.flatMap((f) => f.entities) ?? []),
    ...manualEntitiesBySide.value.red,
    ...manualEntitiesBySide.value.blue,
  ];
});

// 所有路线列表
const allRoutes = computed(() => {
  const scenario = scenarioStore.currentScenario;
  return scenario?.routes || [];
});

function cloneEnvironment(environment: EnvironmentConfig): EnvironmentConfig {
  return JSON.parse(JSON.stringify(environment)) as EnvironmentConfig;
}

function openEnvironmentDialog() {
  if (!scenarioStore.currentScenario?.environment) return;
  environmentDraft.value = cloneEnvironment(
    scenarioStore.currentScenario.environment,
  );
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

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    idle: "待命",
    running: "推演中",
    paused: "已暂停",
    completed: "已完成",
  };
  return map[status] ?? status;
}

defineExpose({ initEngine, setRouteDecisions, openEnvironmentDialog });
</script>

<template>
  <div
    class="left-sidebar"
    :style="{
      '--panel-bg': `url(${panelImage})`,
      '--header-bg': `url(${headerImage})`,
    }"
  >
    <div class="sidebar-title">
      <span>编成编组</span>
    </div>

    <div class="sidebar-scroll">
      <!-- 兵力列表 -->
      <section class="design-section force-section">
        <button
          class="section-heading"
          type="button"
          @click="toggleSection('forces')"
        >
          <img :src="titleIconImage" class="heading-icon-img" alt="" />
          <span>兵力列表</span>
          <span class="heading-count">{{ allEntities.length }}</span>
        </button>

        <div v-if="sections.forces" class="design-section__body force-body">
          <div class="side-tabs">
            <button
              v-for="group in forcesBySide"
              :key="group.id"
              type="button"
              class="side-tab"
              :class="{ active: activeForceSide === group.side }"
              @click="activeForceSide = group.side"
            >
              {{ group.name }}
            </button>
          </div>

          <div class="force-tree">
            <div
              v-for="force in activeForces"
              :key="force.id"
              class="force-node"
            >
              <button
                class="force-node__header"
                type="button"
                @click="toggleForce(force.id)"
              >
                <span class="node-arrow">{{
                  isForceOpen(force.id) ? "▾" : "▸"
                }}</span>
                <span class="node-icon"></span>
                <span class="node-name">{{ force.name }}</span>
                <span class="node-count">{{ force.entities.length }}</span>
              </button>

              <div v-if="isForceOpen(force.id)" class="force-node__children">
                <div
                  v-for="member in force.entities"
                  :key="member.id"
                  class="entity-item"
                  :class="{ active: selectedEntityId === member.id }"
                  @click="selectedEntityId = member.id"
                >
                  <span class="entity-name">{{ member.name }}</span>
                  <span class="entity-role">{{ member.type }}</span>
                </div>
              </div>
            </div>

            <div v-if="activeForces.length === 0" class="empty-hint">
              暂无{{ activeForceSide === "red" ? "红方" : "蓝方" }}兵力
            </div>
          </div>
        </div>
      </section>

      <!-- 行动计划 -->
      <section class="design-section plan-section">
        <button
          class="section-heading"
          type="button"
          @click="toggleSection('actionPlan')"
        >
          <img :src="titleIconImage" class="heading-icon-img" alt="" />
          <span>行动计划</span>
          <span class="heading-count">{{ actionPlanStore.plans.length }}</span>
        </button>

        <div v-if="sections.actionPlan" class="design-section__body plan-body">
          <ActionPlanTreeItem
            v-for="plan in actionPlanStore.plans"
            :key="plan.id"
            :plan="plan"
            :is-active="plan.id === actionPlanStore.activePlanId"
            :routes="allRoutes"
            :entities="allEntities"
            :route-decisions="routeDecisions"
            :selected-route-id="selectedRouteId"
            @activate="actionPlanStore.activatePlan(plan.id)"
            @delete="actionPlanStore.deletePlan(plan.id)"
            @select-route="handleSelectRoute"
          />

          <div v-if="actionPlanStore.plans.length === 0" class="empty-hint">
            暂无行动计划
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="showEnvironmentDialog"
      class="modal-backdrop"
      @click.self="closeEnvironmentDialog"
    >
      <div class="environment-modal">
        <div class="modal-header">
          <span>环境配置</span>
          <button
            type="button"
            class="icon-button"
            @click="closeEnvironmentDialog"
          >
            ×
          </button>
        </div>
        <div v-if="environmentDraft" class="modal-body">
          <div
            v-if="environmentDraft.generationModels.atmosphereModel"
            class="form-section"
          >
            <div class="form-section-title">大气环境</div>
            <label class="field-row">
              <span>天气</span>
              <input
                v-model="
                  environmentDraft.generationModels.atmosphereModel.weather
                "
              />
            </label>
            <label class="field-row">
              <span>降雨等级</span>
              <input
                v-model="
                  environmentDraft.generationModels.atmosphereModel.rainLevel
                "
              />
            </label>
            <label class="field-row">
              <span>风速 m/s</span>
              <input
                v-model.number="
                  environmentDraft.generationModels.atmosphereModel.windSpeed
                "
                type="number"
                step="0.1"
              />
            </label>
            <label class="field-row">
              <span>风向 deg</span>
              <input
                v-model.number="
                  environmentDraft.generationModels.atmosphereModel
                    .windDirection
                "
                type="number"
                step="1"
              />
            </label>
          </div>

          <div
            v-if="environmentDraft.generationModels.spaceEnvironment"
            class="form-section"
          >
            <div class="form-section-title">空间环境</div>
            <label class="field-row">
              <span>太阳通量</span>
              <input
                v-model.number="
                  environmentDraft.generationModels.spaceEnvironment
                    .solarActivity.fluxLevel
                "
                type="number"
                step="1"
              />
            </label>
            <label class="field-row">
              <span>Kp 指数</span>
              <input
                v-model.number="
                  environmentDraft.generationModels.spaceEnvironment
                    .geomagneticField.kpIndex
                "
                type="number"
                step="0.1"
              />
            </label>
            <label class="field-row">
              <span>电离层模型</span>
              <input
                v-model="
                  environmentDraft.generationModels.spaceEnvironment.ionosphere
                    .modelType
                "
              />
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
            <div
              v-if="environmentDraft.effectModels.length === 0"
              class="empty-hint"
            >
              暂无效应模型
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="secondary-button"
            @click="closeEnvironmentDialog"
          >
            取消
          </button>
          <button
            type="button"
            class="primary-button"
            @click="saveEnvironmentDialog"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.left-sidebar {
  position: fixed;
  left: 8px;
  top: 0;
  bottom: 0;
  width: 313px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0px 16px;
  background: transparent;
  border-right: 0;
  overflow: hidden;
  z-index: 1050;
  pointer-events: none;
  font-size: 14px;
}

.sidebar-title {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  padding: 0 36px;
  color: #e7f2ff;
  background: var(--header-bg) center center / 100% 100% no-repeat;
  font-weight: 800;
  pointer-events: auto;
  span {
    position: relative;
    top: -2px;
  }
}

.sidebar-title__chevron {
  color: #91c6ff;
  font-size: 18px;
  filter: drop-shadow(0 0 6px rgba(85, 160, 255, 0.85));
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 3px;
  pointer-events: auto;
}

.sidebar-scroll::-webkit-scrollbar {
  width: 6px;
}

.sidebar-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(93, 153, 230, 0.42);
}

.design-section {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(54, 125, 244, 0.42);
  /* background: linear-gradient(
    90.43deg,
    #020c24 0.65%,
    #051e57 51.22%,
    #020c24 99.73%
  ); */
  background: url("../../assets/left-panel/left-wrapper.png") no-repeat;
  background-size: 100% 100%;
}

.force-section {
  flex: 1;
  min-height: 0;
}

.plan-section {
  height: 312px;
  flex-shrink: 0;
}

.section-heading {
  width: 100%;
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 24px;
  border: 0;
  color: #ffffff;
  background: rgba(4, 24, 68, 0.56);
  border-bottom: 1px solid rgba(73, 137, 255, 0.42);
  cursor: pointer;
  font-size: 16px;
  font-weight: 800;
  text-align: left;
}

.heading-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.heading-count {
  margin-left: auto;
  min-width: 28px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  color: #b9d9ff;
  background: rgba(68, 139, 255, 0.18);
  font-size: 13px;
}

.design-section__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

.side-tabs {
  flex-shrink: 0;
  display: flex;
  height: 42px;
  border-bottom: 1px solid rgba(73, 137, 255, 0.38);
  background: rgba(1, 18, 54, 0.34);
}

.side-tab {
  flex: 1;
  border: 0;
  border-right: 1px solid rgba(73, 137, 255, 0.18);
  color: #ffffff;
  background: rgba(3, 20, 55, 0.48);
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
}

.side-tab.active {
  background: url("../../assets/left-panel/tab-active.png") center / 100% 100%
    no-repeat;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.7);
}

.force-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 4px;
}

.force-tree::-webkit-scrollbar {
  width: 6px;
}

.force-tree::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(93, 153, 230, 0.42);
}

.force-node {
  margin-bottom: 16px;
}

.force-node__header {
  width: 100%;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  color: #ffffff;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  text-align: left;
}

.node-arrow {
  width: 14px;
  color: #ffffff;
  font-size: 12px;
}

.node-icon {
  color: #ffffff;
  background: url("../../assets/left-panel/tree-icon.png") center / 100% 100%
    no-repeat;
  width: 10px;
  height: 10px;
}

.node-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-count {
  color: #b9d9ff;
  font-size: 12px;
  font-weight: 700;
}

.force-node__children {
  display: grid;
  gap: 10px;
  padding: 8px 10px 0 32px;
}

.entity-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 700;
  width: 262px;
  height: 47px;
  padding: 0 16px;
  color: #ffffff;
  background: rgba(145, 163, 191, 0.12);
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.entity-item:hover {
  background: rgba(145, 163, 191, 0.2);
}

.entity-item.active {
  background: linear-gradient(
    90.52deg,
    #1c60fe 0.78%,
    rgba(34, 46, 68, 0) 98.37%
  );
  border-color: rgba(1, 33, 107, 0.5);
  box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.8);
}

.entity-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-role {
  flex-shrink: 0;
  color: #b9d9ff;
  font-size: 12px;
  opacity: 0.82;
}

.plan-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
}

.plan-body::-webkit-scrollbar {
  width: 6px;
}

.plan-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(93, 153, 230, 0.42);
}

.plan-summary {
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.58;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.42);
}

.compact-plan-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.compact-plan {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid rgba(73, 137, 255, 0.26);
  border-radius: 4px;
  color: #dcecff;
  background: rgba(5, 34, 86, 0.36);
  cursor: pointer;
  text-align: left;
}

.compact-plan.active {
  border-color: rgba(90, 160, 255, 0.76);
  background: linear-gradient(
    90deg,
    rgba(24, 94, 219, 0.72),
    rgba(8, 42, 106, 0.42)
  );
}

.compact-plan__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 700;
}

.compact-plan__status {
  color: #9fc9ff;
  font-size: 12px;
}

.route-block {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(93, 153, 230, 0.24);
}

.route-block__title {
  margin-bottom: 8px;
  color: #dcecff;
  font-size: 14px;
  font-weight: 800;
}

.route-block :deep(.route-card) {
  border-color: rgba(73, 137, 255, 0.28);
  border-radius: 4px;
  background: rgba(5, 34, 86, 0.42);
}

.route-block :deep(.route-card:hover),
.route-block :deep(.route-selected) {
  border-color: rgba(90, 160, 255, 0.62);
  background: rgba(22, 78, 158, 0.46);
}

.empty-hint {
  font-size: 14px;
  color: rgba(220, 236, 255, 0.66);
  text-align: center;
  padding: 18px 0;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  border-bottom: 1px solid rgba(63, 137, 255, 0.4);
  background: rgba(3, 24, 62, 0.48);
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
  background: rgba(0, 0, 0, 0.5);
}

.environment-modal {
  width: min(520px, calc(100vw - 32px));
  max-height: min(720px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(46, 119, 255, 0.44);
  border-radius: 0;
  background:
    linear-gradient(180deg, rgba(3, 21, 58, 0.78), rgba(3, 27, 64, 0.68)),
    url("../../assets/chat/chat- background.png") center / cover no-repeat;
  box-shadow:
    inset 0 0 0 1px rgba(120, 180, 255, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.55);
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
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
}

.field-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #d6e8ff;
}

.field-row input {
  width: 100%;
  min-width: 0;
  height: 30px;
  border: 1px solid rgba(94, 159, 255, 0.36);
  border-radius: 4px;
  padding: 0 8px;
  color: #e2ebfb;
  background: rgba(5, 34, 86, 0.54);
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
  border: 1px solid rgba(92, 170, 255, 0.84);
  color: #ffffff;
  background: linear-gradient(180deg, #2c7dea, #1557b7);
}

.secondary-button {
  border: 1px solid rgba(107, 196, 255, 0.34);
  color: #d8e8ff;
  background: rgba(5, 34, 86, 0.48);
}
</style>
