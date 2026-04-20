<!-- apps/web/src/components/action-plan/ActionPlanCard.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ActionPlan } from '../../stores/action-plan';

const props = defineProps<{
  plan: ActionPlan;
  isActive: boolean;
}>();

const emit = defineEmits<{
  activate: [];
  delete: [];
  play: [];
  pause: [];
  stop: [];
  reset: [];
  stepForward: [];
  stepBackward: [];
  setSpeed: [speed: number];
  prevPhase: [];
  nextPhase: [];
}>();

const isExpanded = computed(() => props.isActive);
const activeTab = ref<'overview' | 'entities' | 'phases'>('overview');

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10];

// 红蓝方实体
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

// 打击任务
const strikeTasks = computed(() => props.plan.scenario.strikeTasks || []);

function formatCreatedAt(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `T+${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getEntityIcon(type: string): string {
  const map: Record<string, string> = {
    'aircraft-fighter': '▲', 'aircraft-bomber': '▲', 'aircraft-recon': '△',
    'aircraft-helicopter': '○', 'ship': '◆', 'ground-vehicle': '■',
    'missile': '→', 'drone': '◎',
  };
  return map[type] || '●';
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    idle: '待命', running: '推演中', paused: '已暂停', completed: '已完成',
  };
  return map[status] || status;
}
</script>

<template>
  <div class="plan-card" :class="{ 'plan-card-active': isActive }">
    <!-- 卡片头部 -->
    <div class="card-header" @click="emit('activate')">
      <div class="card-title">
        <span class="expand-icon">{{ isExpanded ? '▼' : '▶' }}</span>
        <span class="plan-name">{{ plan.name }}</span>
      </div>
      <div class="card-meta">
        <span class="status-badge" :class="`status-${plan.executionState.status}`">
          {{ getStatusLabel(plan.executionState.status) }}
        </span>
        <span class="plan-date">{{ formatCreatedAt(plan.createdAt) }}</span>
        <button class="delete-btn" @click.stop="emit('delete')" title="删除方案">×</button>
      </div>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="card-body">
      <!-- 标签栏 -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">概览</button>
        <button class="tab-btn" :class="{ active: activeTab === 'entities' }" @click="activeTab = 'entities'">兵力</button>
        <button class="tab-btn" :class="{ active: activeTab === 'phases' }" @click="activeTab = 'phases'">阶段</button>
      </div>

      <!-- 概览 Tab -->
      <div v-if="activeTab === 'overview'" class="tab-content">
        <div class="info-section">
          <div class="info-label">方案概述</div>
          <div class="info-value">{{ plan.scenario.summary }}</div>
        </div>
        <div class="info-section">
          <div class="info-label">兵力概况</div>
          <div class="info-row">
            <span class="side-tag side-red">红方 {{ redEntities.length }}个单位</span>
            <span class="side-tag side-blue">蓝方 {{ blueEntities.length }}个单位</span>
          </div>
        </div>
        <div v-if="strikeTasks.length > 0" class="info-section">
          <div class="info-label">打击任务 ({{ strikeTasks.length }})</div>
          <div v-for="task in strikeTasks" :key="task.id" class="strike-item">
            <span class="strike-time">T+{{ task.timestamp }}s</span>
            <span class="strike-detail">{{ task.detail }}</span>
          </div>
        </div>
      </div>

      <!-- 兵力 Tab -->
      <div v-if="activeTab === 'entities'" class="tab-content">
        <div class="force-section">
          <div class="force-header force-red">🔴 红方</div>
          <div v-for="e in redEntities" :key="e.id" class="entity-row">
            <span class="entity-shape" style="color: #ff4444;">{{ getEntityIcon(e.type) }}</span>
            <span class="entity-name">{{ e.name }}</span>
            <span class="entity-type">{{ e.type.split('-').pop() }}</span>
          </div>
          <div v-if="redEntities.length === 0" class="empty-side">无红方实体</div>
        </div>
        <div class="force-section">
          <div class="force-header force-blue">🔵 蓝方</div>
          <div v-for="e in blueEntities" :key="e.id" class="entity-row">
            <span class="entity-shape" style="color: #4488ff;">{{ getEntityIcon(e.type) }}</span>
            <span class="entity-name">{{ e.name }}</span>
            <span class="entity-type">{{ e.type.split('-').pop() }}</span>
          </div>
          <div v-if="blueEntities.length === 0" class="empty-side">无蓝方实体</div>
        </div>
      </div>

      <!-- 阶段 Tab -->
      <div v-if="activeTab === 'phases'" class="tab-content">
        <div
          v-for="(phase, idx) in plan.scenario.phases"
          :key="phase.id"
          class="phase-card"
          :class="{ 'phase-current': idx === 0 }"
        >
          <div class="phase-header">
            <span class="phase-num">阶段{{ idx + 1 }}</span>
            <span class="phase-name">{{ phase.name }}</span>
            <span class="phase-dur">{{ phase.duration }}s</span>
          </div>
          <div class="phase-desc">{{ phase.description }}</div>
          <div v-if="phase.events.length > 0" class="phase-events">
            <div v-for="(evt, ei) in phase.events" :key="ei" class="event-item">
              <span class="event-time">T+{{ evt.timestamp }}s</span>
              <span class="event-type" :class="`event-${evt.type}`">{{ evt.type }}</span>
              <span class="event-detail">{{ evt.detail }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 推演控制条 -->
      <div class="execution-bar">
        <div class="exec-time">{{ formatTime(plan.executionState.currentTime) }}</div>
        <div class="exec-controls">
          <button class="ctrl-btn" @click="emit('prevPhase')" title="上一阶段">⏮</button>
          <button class="ctrl-btn" @click="emit('stepBackward')" title="后退">⏪</button>
          <button
            class="ctrl-btn ctrl-play"
            @click="plan.executionState.status === 'running' ? emit('pause') : emit('play')"
          >
            {{ plan.executionState.status === 'running' ? '⏸' : '▶' }}
          </button>
          <button class="ctrl-btn" @click="emit('stepForward')" title="前进">⏩</button>
          <button class="ctrl-btn" @click="emit('nextPhase')" title="下一阶段">⏭</button>
          <button class="ctrl-btn ctrl-stop" @click="emit('reset')" title="重置">⏹</button>
        </div>
        <div class="speed-bar">
          <button
            v-for="s in SPEED_OPTIONS"
            :key="s"
            class="speed-chip"
            :class="{ active: plan.executionState.speed === s }"
            @click="emit('setSpeed', s)"
          >
            {{ s }}x
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-card {
  background: rgba(4, 11, 20, 0.96);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}
.plan-card-active {
  border-color: rgba(0, 214, 201, 0.4);
  box-shadow: 0 0 12px rgba(0, 214, 201, 0.1);
}
.card-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; cursor: pointer;
  background: rgba(107, 196, 255, 0.05);
  transition: background 0.15s;
}
.card-header:hover { background: rgba(107, 196, 255, 0.1); }
.card-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #e2ebfb; flex: 1; min-width: 0; }
.expand-icon { color: #6bc4ff; font-size: 10px; flex-shrink: 0; }
.plan-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.plan-date { font-size: 10px; color: #4a5a6a; }
.status-badge { font-size: 10px; padding: 2px 6px; border-radius: 8px; }
.status-idle { background: rgba(255,255,255,0.08); color: #8ea4c9; }
.status-running { background: rgba(0,214,201,0.15); color: #00d6c9; }
.status-paused { background: rgba(255,193,7,0.15); color: #ffc107; }
.status-completed { background: rgba(76,175,80,0.15); color: #4caf50; }
.delete-btn {
  width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: #ff6b6b; background: none; border: none; cursor: pointer; border-radius: 4px;
}
.delete-btn:hover { background: rgba(255,68,68,0.15); }
.card-body { display: flex; flex-direction: column; gap: 0; }

/* Tab Bar */
.tab-bar { display: flex; border-bottom: 1px solid rgba(107,196,255,0.1); }
.tab-btn {
  flex: 1; padding: 8px; font-size: 11px; font-weight: 600;
  background: none; border: none; color: #5a6a7a; cursor: pointer;
  border-bottom: 2px solid transparent; transition: all 0.15s;
}
.tab-btn:hover { color: #8ea4c9; }
.tab-btn.active { color: #00d6c9; border-bottom-color: #00d6c9; }
.tab-content { padding: 10px 12px; max-height: 280px; overflow-y: auto; }

/* Overview */
.info-section { margin-bottom: 10px; }
.info-label { font-size: 10px; color: #6bc4ff; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
.info-value { font-size: 12px; color: #b0c4d8; line-height: 1.5; }
.info-row { display: flex; gap: 8px; }
.side-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.side-red { background: rgba(255,68,68,0.12); color: #ff6b6b; }
.side-blue { background: rgba(68,136,255,0.12); color: #6bc4ff; }
.strike-item { display: flex; gap: 8px; font-size: 11px; padding: 3px 0; color: #9ab; }
.strike-time { color: #ffc107; font-family: monospace; flex-shrink: 0; }
.strike-detail { color: #b0c4d8; }

/* Entities */
.force-section { margin-bottom: 10px; }
.force-header { font-size: 11px; font-weight: 600; padding: 4px 0; margin-bottom: 4px; }
.force-red { color: #ff6b6b; }
.force-blue { color: #6bc4ff; }
.entity-row { display: flex; align-items: center; gap: 6px; padding: 3px 6px; font-size: 11px; border-radius: 4px; }
.entity-row:hover { background: rgba(255,255,255,0.03); }
.entity-shape { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.entity-name { flex: 1; color: #b0c4d8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entity-type { color: #4a5a6a; font-size: 10px; flex-shrink: 0; }
.empty-side { font-size: 11px; color: #3a4a5a; padding: 4px 6px; }

/* Phases */
.phase-card { padding: 8px; border: 1px solid rgba(107,196,255,0.1); border-radius: 6px; margin-bottom: 8px; }
.phase-current { border-color: rgba(0,214,201,0.3); }
.phase-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.phase-num { font-size: 10px; font-weight: 700; color: #00d6c9; }
.phase-name { font-size: 12px; color: #e2ebfb; font-weight: 600; flex: 1; }
.phase-dur { font-size: 10px; color: #4a5a6a; font-family: monospace; }
.phase-desc { font-size: 11px; color: #8ea4c9; line-height: 1.4; margin-bottom: 4px; }
.phase-events { border-top: 1px solid rgba(107,196,255,0.08); padding-top: 4px; }
.event-item { display: flex; gap: 6px; font-size: 10px; padding: 2px 0; align-items: center; }
.event-time { color: #ffc107; font-family: monospace; flex-shrink: 0; min-width: 42px; }
.event-type { padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 600; flex-shrink: 0; }
.event-movement { background: rgba(0,214,201,0.15); color: #00d6c9; }
.event-detection { background: rgba(107,196,255,0.15); color: #6bc4ff; }
.event-attack { background: rgba(255,68,68,0.15); color: #ff6b6b; }
.event-destruction { background: rgba(255,0,0,0.2); color: #ff4444; }
.event-detail { color: #8ea4c9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Execution Bar */
.execution-bar {
  padding: 10px 12px;
  border-top: 1px solid rgba(107,196,255,0.15);
  display: flex; flex-direction: column; gap: 8px;
  background: rgba(0,0,0,0.2);
}
.exec-time { text-align: center; font-size: 16px; font-weight: 700; color: #00d6c9; font-family: 'SF Mono', Monaco, Consolas, monospace; }
.exec-controls { display: flex; justify-content: center; gap: 6px; }
.ctrl-btn {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  font-size: 14px; background: rgba(107,196,255,0.08); border: 1px solid rgba(107,196,255,0.2);
  border-radius: 6px; color: #6bc4ff; cursor: pointer; transition: all 0.15s;
}
.ctrl-btn:hover { background: rgba(107,196,255,0.18); }
.ctrl-play { background: rgba(0,214,201,0.15); border-color: rgba(0,214,201,0.4); color: #00d6c9; width: 40px; }
.ctrl-play:hover { background: rgba(0,214,201,0.25); }
.ctrl-stop { color: #ff6b6b; border-color: rgba(255,68,68,0.3); }
.ctrl-stop:hover { background: rgba(255,68,68,0.15); }
.speed-bar { display: flex; justify-content: center; gap: 4px; }
.speed-chip {
  padding: 3px 8px; font-size: 10px; border-radius: 4px;
  background: rgba(107,196,255,0.06); border: 1px solid rgba(107,196,255,0.15);
  color: #5a6a7a; cursor: pointer; transition: all 0.15s;
}
.speed-chip:hover { color: #6bc4ff; }
.speed-chip.active { background: rgba(0,214,201,0.15); border-color: rgba(0,214,201,0.4); color: #00d6c9; }
</style>
