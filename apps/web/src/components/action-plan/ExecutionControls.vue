<!-- apps/web/src/components/action-plan/ExecutionControls.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ExecutionStatus } from '../../types/tactical-scenario';

const props = defineProps<{
  status: ExecutionStatus;
  speed: number;
  currentTime: number;
}>();

const emit = defineEmits<{
  play: [];
  pause: [];
  stepForward: [];
  stepBackward: [];
  setSpeed: [speed: number];
  prevPhase: [];
  nextPhase: [];
}>();

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 20];

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `T+${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

function handleSpeedClick(speed: number) {
  emit('setSpeed', speed);
}
</script>

<template>
  <div class="execution-controls">
    <!-- 倍速选择器 -->
    <div class="speed-selector">
      <div class="speed-label">倍速:</div>
      <div class="speed-options">
        <button
          v-for="speed in SPEED_OPTIONS"
          :key="speed"
          class="speed-btn"
          :class="{ 'speed-btn-active': speed === props.speed }"
          @click="handleSpeedClick(speed)"
        >
          {{ speed }}x
        </button>
      </div>
    </div>

    <!-- 播放控制 -->
    <div class="playback-controls">
      <button class="control-btn" @click="emit('prevPhase')" title="上一阶段">
        ⏮
      </button>
      <button class="control-btn" @click="emit('stepBackward')" title="后退1秒">
        ⏪
      </button>
      <button
        class="control-btn control-btn-primary"
        @click="props.status === 'running' ? emit('pause') : emit('play')"
      >
        {{ props.status === 'running' ? '⏸' : '▶️' }}
      </button>
      <button class="control-btn" @click="emit('stepForward')" title="前进1秒">
        ⏩
      </button>
      <button class="control-btn" @click="emit('nextPhase')" title="下一阶段">
        ⏭
      </button>
    </div>

    <!-- 当前时间显示 -->
    <div class="time-display">
      {{ formatTime(props.currentTime) }}
    </div>
  </div>
</template>

<style scoped>
.execution-controls {
  padding: 12px;
  background: rgba(4, 11, 20, 0.95);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 8px;
}

.speed-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.speed-label {
  font-size: 11px;
  color: #6bc4ff;
  font-weight: 600;
  min-width: 40px;
}

.speed-options {
  display: flex;
  gap: 4px;
  flex: 1;
}

.speed-btn {
  flex: 1;
  padding: 4px 6px;
  font-size: 11px;
  background: rgba(107, 196, 255, 0.08);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 4px;
  color: #6bc4ff;
  cursor: pointer;
  transition: all 0.15s;
}

.speed-btn:hover {
  background: rgba(107, 196, 255, 0.18);
}

.speed-btn-active {
  background: rgba(0, 214, 201, 0.2) !important;
  border-color: rgba(0, 214, 201, 0.5) !important;
  color: #00d6c9 !important;
}

.playback-controls {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.control-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: rgba(107, 196, 255, 0.08);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 6px;
  color: #6bc4ff;
  cursor: pointer;
  transition: all 0.15s;
}

.control-btn:hover {
  background: rgba(107, 196, 255, 0.18);
}

.control-btn-primary {
  background: rgba(0, 214, 201, 0.15);
  border-color: rgba(0, 214, 201, 0.4);
  color: #00d6c9;
}

.control-btn-primary:hover {
  background: rgba(0, 214, 201, 0.25);
}

.time-display {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: #00d6c9;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}
</style>
