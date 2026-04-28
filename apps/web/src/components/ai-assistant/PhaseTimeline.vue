<!-- apps/web/src/components/ai-assistant/PhaseTimeline.vue -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { Phase } from '../../types/tactical-scenario';

interface Props {
  phases: Phase[];
  currentPhaseIndex: number;
  executionStatus: 'idle' | 'running' | 'paused' | 'completed';
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'execute'): void;
  (e: 'pause'): void;
  (e: 'next'): void;
  (e: 'prev'): void;
  (e: 'reset'): void;
}>();

const activePhaseRef = ref<HTMLElement | null>(null);

function scrollToActive() {
  nextTick(() => {
    activePhaseRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

watch(() => props.currentPhaseIndex, scrollToActive);
</script>

<template>
  <div class="phase-timeline">
    <div class="timeline-header">
      <span class="timeline-title">阶段时间线</span>
      <span class="phase-counter">{{ currentPhaseIndex + 1 }} / {{ phases.length }}</span>
    </div>

    <div class="phases-list">
      <div
        v-for="(phase, idx) in phases"
        :key="phase.id"
        class="phase-item"
        :class="{
          'is-active': idx === currentPhaseIndex,
          'is-done': idx < currentPhaseIndex,
          'is-pending': idx > currentPhaseIndex,
        }"
        :ref="(el) => { if (idx === currentPhaseIndex) activePhaseRef = el as HTMLElement }"
      >
        <div class="phase-marker">
          <span v-if="idx < currentPhaseIndex" class="marker-icon done">✓</span>
          <span v-else-if="idx === currentPhaseIndex" class="marker-icon active">
            {{ executionStatus === 'running' ? '▶' : '●' }}
          </span>
          <span v-else class="marker-icon">○</span>
        </div>
        <div class="phase-content">
          <div class="phase-name">{{ phase.name }}</div>
          <div class="phase-desc">{{ phase.description }}</div>
          <div class="phase-meta">预计 {{ phase.duration }}秒 · {{ phase.events.length }}个事件</div>
        </div>
      </div>
    </div>

    <div class="timeline-controls">
      <button
        v-if="executionStatus === 'idle' || executionStatus === 'paused'"
        class="ctrl-btn ctrl-btn-primary"
        @click="emit('execute')"
      >
        {{ executionStatus === 'idle' ? '▶ 执行' : '▶ 继续' }}
      </button>
      <button
        v-if="executionStatus === 'running'"
        class="ctrl-btn ctrl-btn-warning"
        @click="emit('pause')"
      >
        ⏸ 暂停
      </button>
      <button class="ctrl-btn" :disabled="currentPhaseIndex <= 0" @click="emit('prev')">◀ 上一阶段</button>
      <button class="ctrl-btn" :disabled="currentPhaseIndex >= phases.length - 1" @click="emit('next')">下一阶段 ▶</button>
      <button class="ctrl-btn ctrl-btn-danger" @click="emit('reset')">↺ 重置</button>
    </div>
  </div>
</template>

<style scoped>
.phase-timeline {
  padding: 12px;
  border-top: 1px solid rgba(107, 196, 255, 0.15);
}
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.timeline-title {
  font-size: 12px;
  font-weight: 600;
  color: #6bc4ff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.phase-counter {
  font-size: 12px;
  color: #8ea4c9;
  font-family: monospace;
}
.phases-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}
.phase-item {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid transparent;
  transition: all 0.2s;
}
.phase-item.is-active {
  background: rgba(107, 196, 255, 0.1);
  border-left-color: #6bc4ff;
}
.phase-item.is-done {
  opacity: 0.6;
  border-left-color: #00d6c9;
}
.phase-marker {
  flex-shrink: 0;
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.marker-icon { color: #6bc4ff; }
.marker-icon.done { color: #00d6c9; }
.marker-icon.active { color: #6bc4ff; }
.phase-item.is-pending .marker-icon { color: #3a4a5a; }
.phase-content { flex: 1; min-width: 0; }
.phase-name {
  font-size: 13px;
  font-weight: 500;
  color: #e2ebfb;
  margin-bottom: 2px;
}
.phase-desc { font-size: 11px; color: #8ea4c9; margin-bottom: 4px; }
.phase-meta { font-size: 10px; color: #4a5a6a; font-family: monospace; }
.timeline-controls {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ctrl-btn {
  flex: 1;
  min-width: 80px;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid rgba(107, 196, 255, 0.3);
  background: rgba(107, 196, 255, 0.08);
  color: #6bc4ff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.ctrl-btn:hover:not(:disabled) { background: rgba(107, 196, 255, 0.18); }
.ctrl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ctrl-btn-primary {
  background: rgba(0, 214, 201, 0.2);
  border-color: rgba(0, 214, 201, 0.5);
  color: #00d6c9;
}
.ctrl-btn-warning {
  background: rgba(255, 193, 7, 0.2);
  border-color: rgba(255, 193, 7, 0.5);
  color: #ffc107;
}
.ctrl-btn-danger {
  background: rgba(255, 68, 68, 0.15);
  border-color: rgba(255, 68, 68, 0.3);
  color: #ff6b6b;
}
</style>
