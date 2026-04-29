<!-- apps/web/src/components/action-plan/ActionPlanTreeItem.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ActionPlan } from '../../stores/action-plan';
import type { Route, EntitySpec, RouteDecision } from '../../types/tactical-scenario';
import RouteManagementPanel from '../left-sidebar/RouteManagementPanel.vue';

const props = defineProps<{
  plan: ActionPlan;
  isActive: boolean;
  routes?: Route[];
  entities?: EntitySpec[];
  routeDecisions?: Map<string, RouteDecision>;
  selectedRouteId?: string | null;
}>();

const emit = defineEmits<{
  activate: [];
  delete: [];
  selectRoute: [routeId: string];
}>();

const isExpanded = ref(props.isActive);
const activeTab = ref<'overview' | 'entities' | 'phases' | 'routes'>('overview');

function toggle() {
  isExpanded.value = !isExpanded.value;
  if (isExpanded.value) {
    emit('activate');
  }
}

const redEntities = computed(() =>
  props.plan.scenario.forces
    .filter(f => f.side === 'red')
    .flatMap(f => f.entities)
);
const blueEntities = computed(() =>
  props.plan.scenario.forces
    .filter(f => f.side === 'blue')
    .flatMap(f => f.entities)
);
const strikeTasks = computed(() => props.plan.scenario.strikeTasks || []);

function formatCreatedAt(date: Date): string {
  return new Date(date).toLocaleDateString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    idle: '待命', running: '推演中', paused: '已暂停', completed: '已完成',
  };
  return map[status] ?? status;
}

function getEntityIcon(type: string): string {
  const map: Record<string, string> = {
    'aircraft-fighter': '▲', 'aircraft-bomber': '▲', 'aircraft-recon': '△',
    'aircraft-helicopter': '○', 'ship': '◆', 'ground-vehicle': '■',
    'missile': '→', 'drone': '◎',
  };
  return map[type] || '●';
}
</script>

<template>
  <div class="tree-item" :class="{ 'tree-item--active': isActive }">
    <!-- 树节点行 -->
    <div class="tree-row" @click="toggle">
      <span class="tree-arrow">{{ isExpanded ? '▾' : '▸' }}</span>
      <span class="tree-name">{{ plan.name }}</span>
      <span class="tree-status" :class="`status-${plan.executionState.status}`">
        {{ getStatusLabel(plan.executionState.status) }}
      </span>
      <span class="tree-date">{{ formatCreatedAt(plan.createdAt) }}</span>
      <button class="tree-delete" type="button" title="删除" @click.stop="emit('delete')">×</button>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="tree-detail">
      <!-- Tab 栏 -->
      <div class="detail-tabs">
        <button
          class="detail-tab"
          :class="{ active: activeTab === 'overview' }"
          @click="activeTab = 'overview'"
        >概览</button>
        <button
          class="detail-tab"
          :class="{ active: activeTab === 'entities' }"
          @click="activeTab = 'entities'"
        >兵力</button>
        <button
          class="detail-tab"
          :class="{ active: activeTab === 'phases' }"
          @click="activeTab = 'phases'"
        >阶段</button>
        <button
          class="detail-tab"
          :class="{ active: activeTab === 'routes' }"
          @click="activeTab = 'routes'"
        >路线</button>
      </div>

      <!-- 概览 -->
      <div v-if="activeTab === 'overview'" class="detail-content">
        <div class="detail-section">
          <div class="detail-label">方案概述</div>
          <div class="detail-value">{{ plan.scenario.summary || '暂无概述' }}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">兵力概况</div>
          <div class="detail-sides">
            <span class="side-tag side-red">红方 {{ redEntities.length }}个</span>
            <span class="side-tag side-blue">蓝方 {{ blueEntities.length }}个</span>
          </div>
        </div>
        <div v-if="strikeTasks.length > 0" class="detail-section">
          <div class="detail-label">打击任务 ({{ strikeTasks.length }})</div>
          <div v-for="task in strikeTasks" :key="task.id" class="strike-row">
            <span class="strike-time">T+{{ task.timestamp }}s</span>
            <span class="strike-detail">{{ task.detail }}</span>
          </div>
        </div>
      </div>

      <!-- 兵力 -->
      <div v-if="activeTab === 'entities'" class="detail-content">
        <div class="detail-section">
          <div class="detail-label force-red">🔴 红方</div>
          <div v-for="e in redEntities" :key="e.id" class="entity-row">
            <span class="entity-icon" style="color:#ff4444">{{ getEntityIcon(e.type) }}</span>
            <span class="entity-name">{{ e.name }}</span>
            <span class="entity-type">{{ e.type.split('-').pop() }}</span>
          </div>
          <div v-if="redEntities.length === 0" class="empty-side">无红方实体</div>
        </div>
        <div class="detail-section">
          <div class="detail-label force-blue">🔵 蓝方</div>
          <div v-for="e in blueEntities" :key="e.id" class="entity-row">
            <span class="entity-icon" style="color:#4488ff">{{ getEntityIcon(e.type) }}</span>
            <span class="entity-name">{{ e.name }}</span>
            <span class="entity-type">{{ e.type.split('-').pop() }}</span>
          </div>
          <div v-if="blueEntities.length === 0" class="empty-side">无蓝方实体</div>
        </div>
      </div>

      <!-- 阶段 -->
      <div v-if="activeTab === 'phases'" class="detail-content">
        <div
          v-for="(phase, idx) in plan.scenario.phases"
          :key="phase.id"
          class="phase-row"
        >
          <div class="phase-header">
            <span class="phase-num">阶段{{ idx + 1 }}</span>
            <span class="phase-name">{{ phase.name }}</span>
            <span class="phase-dur">{{ phase.duration }}s</span>
          </div>
          <div class="phase-desc">{{ phase.description }}</div>
          <div v-if="phase.events?.length" class="phase-events">
            <div v-for="(evt, ei) in phase.events" :key="ei" class="event-row">
              <span class="event-time">T+{{ evt.timestamp }}s</span>
              <span class="event-type" :class="`event-${evt.type}`">{{ evt.type }}</span>
              <span class="event-detail">{{ evt.detail }}</span>
            </div>
          </div>
        </div>
        <div v-if="!plan.scenario.phases?.length" class="empty-side">暂无阶段数据</div>
      </div>

      <!-- 路线 -->
      <div v-if="activeTab === 'routes'" class="detail-content routes-content">
        <RouteManagementPanel
          :routes="routes ?? []"
          :entities="entities ?? []"
          :decisions="routeDecisions ?? new Map()"
          :selected-route-id="selectedRouteId ?? null"
          @select-route="emit('selectRoute', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 树节点 ── */
.tree-item {
  border-bottom: 1px solid rgba(73, 137, 255, 0.12);
}

.tree-item--active > .tree-row {
  background: rgba(28, 96, 254, 0.12);
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.tree-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.tree-arrow {
  flex-shrink: 0;
  width: 12px;
  font-size: 11px;
  color: #6bc4ff;
}

.tree-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #e2ebfb;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-status {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
}
.status-idle    { background: rgba(255,255,255,0.08); color: #8ea4c9; }
.status-running { background: rgba(0,214,201,0.15); color: #00d6c9; }
.status-paused  { background: rgba(255,193,7,0.15); color: #ffc107; }
.status-completed { background: rgba(76,175,80,0.15); color: #4caf50; }

.tree-date {
  flex-shrink: 0;
  font-size: 10px;
  color: #4a5a6a;
}

.tree-delete {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: bold;
  color: #ff4d4d;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 3px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}
.tree-delete:hover {
  opacity: 1;
  background: rgba(255, 68, 68, 0.15);
}

/* ── 展开内容 ── */
.tree-detail {
  border-top: 1px solid rgba(73, 137, 255, 0.12);
  background: rgba(1, 10, 30, 0.4);
  animation: slideDown 0.15s ease-out;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Tab 栏 */
.detail-tabs {
  display: flex;
  border-bottom: 1px solid rgba(73, 137, 255, 0.15);
}

.detail-tab {
  flex: 1;
  padding: 7px 0;
  font-size: 12px;
  font-weight: 600;
  background: none;
  border: none;
  color: #4a5a7a;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.detail-tab:hover { color: #8ea4c9; }
.detail-tab.active {
  color: #00d6c9;
  border-bottom-color: #00d6c9;
}

/* 内容区 */
.detail-content {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 11px;
  font-weight: 700;
  color: #6bc4ff;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.detail-label.force-red { color: #ff6b6b; }
.detail-label.force-blue { color: #6bc4ff; }

.detail-value {
  font-size: 12px;
  color: #b0c4d8;
  line-height: 1.5;
}

.detail-sides {
  display: flex;
  gap: 8px;
}

.side-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
}
.side-red  { background: rgba(200,40,40,0.18);   color: #ff6b6b; }
.side-blue { background: rgba(40,100,200,0.18);   color: #6bc4ff; }

/* 打击任务 */
.strike-row {
  display: flex;
  gap: 6px;
  font-size: 11px;
  padding: 2px 0;
}
.strike-time   { color: #ffc107; font-family: monospace; flex-shrink: 0; }
.strike-detail { color: #b0c4d8; }

/* 兵力列表 */
.entity-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  font-size: 11px;
  border-radius: 3px;
}
.entity-row:hover { background: rgba(255,255,255,0.03); }
.entity-icon  { font-size: 12px; width: 16px; text-align: center; flex-shrink: 0; }
.entity-name  { flex: 1; color: #b0c4d8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entity-type  { font-size: 10px; color: #4a5a6a; flex-shrink: 0; }
.empty-side   { font-size: 11px; color: #3a4a5a; padding: 3px 0; }

/* 阶段 */
.phase-row {
  padding: 6px 0;
  border-bottom: 1px solid rgba(73, 137, 255, 0.08);
}
.phase-row:last-child { border-bottom: none; }

.phase-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.phase-num  { font-size: 10px; font-weight: 700; color: #00d6c9; flex-shrink: 0; }
.phase-name { font-size: 12px; color: #e2ebfb; font-weight: 600; flex: 1; }
.phase-dur  { font-size: 10px; color: #4a5a6a; font-family: monospace; flex-shrink: 0; }

.phase-desc {
  font-size: 11px;
  color: #8ea4c9;
  line-height: 1.4;
  margin-bottom: 4px;
}

.phase-events {
  border-top: 1px solid rgba(107, 196, 255, 0.06);
  padding-top: 3px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-row {
  display: flex;
  gap: 5px;
  font-size: 10px;
  padding: 1px 0;
  align-items: center;
}
.event-time   { color: #ffc107; font-family: monospace; flex-shrink: 0; min-width: 46px; }
.event-type   { padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 600; flex-shrink: 0; }
.event-movement   { background: rgba(0,214,201,0.15); color: #00d6c9; }
.event-detection  { background: rgba(107,196,255,0.15); color: #6bc4ff; }
.event-attack     { background: rgba(255,68,68,0.15); color: #ff6b6b; }
.event-destruction{ background: rgba(255,0,0,0.2); color: #ff4444; }
.event-detail { color: #8ea4c9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 路线 Tab 内部滚动 */
.routes-content {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 10px;
}
.routes-content::-webkit-scrollbar { width: 4px; }
.routes-content::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(107, 196, 255, 0.2);
}
</style>
