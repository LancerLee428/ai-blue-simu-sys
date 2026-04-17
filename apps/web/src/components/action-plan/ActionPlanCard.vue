<!-- apps/web/src/components/action-plan/ActionPlanCard.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ActionPlan } from '../../stores/action-plan';
import ForceStatusOverview from './ForceStatusOverview.vue';
import PhaseTimeline from '../ai-assistant/PhaseTimeline.vue';
import ExecutionControls from './ExecutionControls.vue';
import ActionLog from './ActionLog.vue';

const props = defineProps<{
  plan: ActionPlan;
  isActive: boolean;
}>();

const emit = defineEmits<{
  activate: [];
  delete: [];
  play: [];
  pause: [];
  stepForward: [];
  stepBackward: [];
  setSpeed: [speed: number];
  prevPhase: [];
  nextPhase: [];
}>();

const isExpanded = computed(() => props.isActive);

function formatCreatedAt(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
        <span class="plan-date">{{ formatCreatedAt(plan.createdAt) }}</span>
        <button
          class="delete-btn"
          @click.stop="emit('delete')"
          title="删除方案"
        >
          ×
        </button>
      </div>
    </div>

    <!-- 展开内容 -->
    <div v-if="isExpanded" class="card-body">
      <ForceStatusOverview :scenario="plan.scenario" />

      <PhaseTimeline
        :phases="plan.scenario.phases"
        :current-phase-index="0"
        :execution-status="plan.executionState.status"
        @execute="emit('play')"
        @pause="emit('pause')"
        @next="emit('nextPhase')"
        @prev="emit('prevPhase')"
        @reset="emit('pause')"
      />

      <ExecutionControls
        :status="plan.executionState.status"
        :speed="plan.executionState.speed"
        :current-time="plan.executionState.currentTime"
        @play="emit('play')"
        @pause="emit('pause')"
        @step-forward="emit('stepForward')"
        @step-backward="emit('stepBackward')"
        @set-speed="emit('setSpeed', $event)"
        @prev-phase="emit('prevPhase')"
        @next-phase="emit('nextPhase')"
      />

      <ActionLog />
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
  transition: all 0.15s;
}

.plan-card-active {
  border-color: rgba(0, 214, 201, 0.4);
  box-shadow: 0 0 12px rgba(0, 214, 201, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  user-select: none;
  background: rgba(107, 196, 255, 0.05);
  transition: background 0.15s;
}

.card-header:hover {
  background: rgba(107, 196, 255, 0.1);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #e2ebfb;
}

.expand-icon {
  color: #6bc4ff;
  font-size: 10px;
}

.plan-name {
  flex: 1;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-date {
  font-size: 11px;
  color: #4a5a6a;
}

.delete-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #ff6b6b;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.delete-btn:hover {
  background: rgba(255, 68, 68, 0.15);
}

.card-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
