<!-- apps/web/src/components/action-plan/ActionPlanPanel.vue -->
<script setup lang="ts">
import { useActionPlanStore } from '../../stores/action-plan';
import ActionPlanCard from './ActionPlanCard.vue';
import type { ExecutionEngine } from '../../services/execution-engine';

const actionPlanStore = useActionPlanStore();

// ExecutionEngine 引用（由外部注入）
let executionEngine: ExecutionEngine | null = null;

function initEngine(engine: ExecutionEngine) {
  executionEngine = engine;
}

function handlePlay() {
  executionEngine?.play();
}

function handlePause() {
  executionEngine?.pause();
}

function handleStepForward() {
  executionEngine?.step(1);
}

function handleStepBackward() {
  executionEngine?.step(-1);
}

function handleSetSpeed(speed: number) {
  executionEngine?.setSpeed(speed);
}

function handlePrevPhase() {
  executionEngine?.prevPhase();
}

function handleNextPhase() {
  executionEngine?.nextPhase();
}

defineExpose({
  initEngine,
});
</script>

<template>
  <div class="action-plan-panel">
    <div class="panel-header">
      <span class="panel-title">行动计划</span>
      <span class="panel-count">{{ actionPlanStore.plans.length }}</span>
    </div>

    <div class="panel-body">
      <ActionPlanCard
        v-for="plan in actionPlanStore.plans"
        :key="plan.id"
        :plan="plan"
        :is-active="plan.id === actionPlanStore.activePlanId"
        @activate="actionPlanStore.activatePlan(plan.id)"
        @delete="actionPlanStore.deletePlan(plan.id)"
        @play="handlePlay"
        @pause="handlePause"
        @step-forward="handleStepForward"
        @step-backward="handleStepBackward"
        @set-speed="handleSetSpeed"
        @prev-phase="handlePrevPhase"
        @next-phase="handleNextPhase"
      />

      <div v-if="actionPlanStore.plans.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">暂无行动计划</div>
        <div class="empty-hint">在 AI 助手中生成方案</div>
      </div>
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

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  color: #b0c4d8;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: #4a5a6a;
}
</style>
