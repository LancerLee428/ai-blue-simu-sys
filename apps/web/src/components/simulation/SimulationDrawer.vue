<!-- apps/web/src/components/simulation/SimulationDrawer.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ActionPlan } from '../../stores/action-plan';
import type { Phase, TacticalEvent } from '../../types/tactical-scenario';

const props = defineProps<{
  open: boolean;
  plan: ActionPlan | null;
}>();

const emit = defineEmits<{
  close: [];
  play: [];
  pause: [];
  reset: [];
  stepForward: [stepSeconds: number];
  stepBackward: [stepSeconds: number];
  prevPhase: [];
  nextPhase: [];
  setSpeed: [speed: number];
}>();

const speedOptions = [0.5, 1, 2, 5, 10];
const stepOptions = [1, 5, 10, 30, 60];
const stepSeconds = ref(10);

const phases = computed(() => props.plan?.scenario.phases ?? []);
const totalDuration = computed(() => phases.value.reduce((sum, phase) => sum + phase.duration, 0));
const currentPhaseIndex = computed(() => props.plan?.executionState.currentPhaseIndex ?? 0);
const currentPhaseElapsed = computed(() => props.plan?.executionState.currentTime ?? 0);
const executionStatus = computed(() => props.plan?.executionState.status ?? 'idle');
const currentTotalTime = computed(() => {
  return phaseStartSeconds(currentPhaseIndex.value) + currentPhaseElapsed.value;
});
const playheadPercent = computed(() => {
  if (totalDuration.value <= 0) return 0;
  return clamp((currentTotalTime.value / totalDuration.value) * 100, 0, 100);
});

const timelineRows = computed(() => {
  let cursor = 0;
  return phases.value.map((phase, index) => {
    const start = cursor;
    cursor += phase.duration;
    const state = getPhaseState(index);
    const progress = getPhaseProgress(phase, index, state);
    return {
      phase,
      index,
      state,
      progress,
      start,
      end: cursor,
      left: percent(start),
      width: Math.max(percent(phase.duration), 1.5),
      events: phase.events.map(event => ({
        event,
        left: percent(start + event.timestamp),
      })),
    };
  });
});

type PhaseVisualState = 'phase-pending' | 'phase-active' | 'phase-complete' | 'phase-final';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function percent(seconds: number): number {
  if (totalDuration.value <= 0) return 0;
  return clamp((seconds / totalDuration.value) * 100, 0, 100);
}

function phaseStartSeconds(index: number): number {
  return phases.value.slice(0, index).reduce((sum, phase) => sum + phase.duration, 0);
}

function getPhaseState(index: number): PhaseVisualState {
  if (executionStatus.value === 'completed') return 'phase-final';
  if (executionStatus.value === 'idle') return 'phase-pending';
  if (index < currentPhaseIndex.value) return 'phase-complete';
  if (index === currentPhaseIndex.value) return 'phase-active';
  return 'phase-pending';
}

function getPhaseProgress(phase: Phase, index: number, state: PhaseVisualState): number {
  if (state === 'phase-complete' || state === 'phase-final') return 100;
  if (state !== 'phase-active' || phase.duration <= 0) return 0;
  return clamp((currentPhaseElapsed.value / phase.duration) * 100, 0, 100);
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `T+${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getStatusLabel(status: string | undefined): string {
  const map: Record<string, string> = {
    idle: '待命',
    running: '推演中',
    paused: '已暂停',
    completed: '已完成',
  };
  return map[status ?? 'idle'] ?? status ?? '待命';
}

function getEventLabel(event: TacticalEvent): string {
  const map: Record<string, string> = {
    movement: '机动',
    detection: '探测',
    attack: '打击',
    destruction: '毁伤',
  };
  return map[event.type] ?? event.type;
}

function handlePlayToggle() {
  if (props.plan?.executionState.status === 'running') {
    emit('pause');
  } else {
    emit('play');
  }
}
</script>

<template>
  <Transition name="simulation-drawer">
  <div v-if="open" class="simulation-drawer">
    <div class="drawer-header">
      <div class="title-block">
        <div class="drawer-title">仿真推演</div>
        <div class="drawer-subtitle">{{ plan?.name ?? '暂无行动计划' }}</div>
      </div>
      <div class="status-strip">
        <span class="status-badge" :class="`status-${plan?.executionState.status ?? 'idle'}`">
          {{ getStatusLabel(plan?.executionState.status) }}
        </span>
        <span class="time-readout">{{ formatTime(currentTotalTime) }} / {{ formatTime(totalDuration) }}</span>
      </div>
      <button type="button" class="close-button" @click="emit('close')">×</button>
    </div>

    <div class="control-bar">
      <button type="button" class="control-button" :disabled="!plan" @click="emit('prevPhase')">⏮</button>
      <button type="button" class="control-button" :disabled="!plan" @click="emit('stepBackward', stepSeconds)">⏪</button>
      <button type="button" class="play-button" :disabled="!plan" @click="handlePlayToggle">
        {{ plan?.executionState.status === 'running' ? '暂停' : '开始' }}
      </button>
      <button type="button" class="control-button" :disabled="!plan" @click="emit('stepForward', stepSeconds)">⏩</button>
      <button type="button" class="control-button" :disabled="!plan" @click="emit('nextPhase')">⏭</button>
      <button type="button" class="danger-button" :disabled="!plan" @click="emit('reset')">重置</button>

      <div class="selector-group">
        <span>步长</span>
        <button
          v-for="option in stepOptions"
          :key="option"
          type="button"
          class="chip-button"
          :class="{ active: stepSeconds === option }"
          @click="stepSeconds = option"
        >
          {{ option }}s
        </button>
      </div>

      <div class="selector-group">
        <span>倍速</span>
        <button
          v-for="option in speedOptions"
          :key="option"
          type="button"
          class="chip-button"
          :class="{ active: plan?.executionState.speed === option }"
          :disabled="!plan"
          @click="emit('setSpeed', option)"
        >
          {{ option }}x
        </button>
      </div>
    </div>

    <div class="gantt-wrap">
      <div v-if="plan && phases.length > 0" class="gantt-board">
        <div class="time-axis">
          <span>0s</span>
          <span>{{ Math.round(totalDuration / 2) }}s</span>
          <span>{{ totalDuration }}s</span>
        </div>

        <div class="timeline-lane">
          <div
            v-for="row in timelineRows"
            :key="row.phase.id"
            class="phase-bar"
            :class="[
              row.state,
              {
                active: row.index === currentPhaseIndex,
                'is-running': row.state === 'phase-active' && plan.executionState.status === 'running',
              },
            ]"
            :style="{ left: `${row.left}%`, width: `${row.width}%`, '--phase-progress': `${row.progress}%` }"
          >
            <span>{{ row.phase.name }}</span>
            <em>{{ row.phase.duration }}s</em>
          </div>
          <div class="playhead" :style="{ left: `${playheadPercent}%` }"></div>
        </div>

        <div class="event-lane">
          <div
            v-for="row in timelineRows"
            :key="`${row.phase.id}-events`"
            class="event-row"
          >
            <span class="row-label">阶段{{ row.index + 1 }}</span>
            <div class="row-line">
              <button
                v-for="item in row.events"
                :key="`${row.phase.id}-${item.event.timestamp}-${item.event.detail}`"
                type="button"
                class="event-dot"
                :class="`event-${item.event.type}`"
                :style="{ left: `${item.left}%` }"
                :title="`${formatTime(row.start + item.event.timestamp)} ${getEventLabel(item.event)}：${item.event.detail}`"
              >
                {{ getEventLabel(item.event).slice(0, 1) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="empty-state">暂无可推演的行动计划</div>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
.simulation-drawer-enter-active,
.simulation-drawer-leave-active {
  transition:
    transform 0.22s ease,
    opacity 0.22s ease;
}

.simulation-drawer-enter-from,
.simulation-drawer-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

.simulation-drawer-enter-to,
.simulation-drawer-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.simulation-drawer {
  position: fixed;
  left: 320px;
  right: 0;
  bottom: 0;
  z-index: 1150;
  height: 286px;
  max-height: 34vh;
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(107, 196, 255, 0.28);
  background:
    linear-gradient(180deg, rgba(7, 20, 34, 0.98), rgba(3, 10, 18, 0.99));
  box-shadow: 0 -14px 32px rgba(0, 0, 0, 0.46);
}

.drawer-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 32px;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(107, 196, 255, 0.14);
}

.drawer-title {
  color: #e2ebfb;
  font-size: 15px;
  font-weight: 700;
}

.drawer-subtitle {
  margin-top: 3px;
  color: #6f839c;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-strip {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-badge {
  border-radius: 999px;
  padding: 3px 9px;
  font-size: 12px;
}

.status-idle { color: #8ea4c9; background: rgba(255, 255, 255, 0.08); }
.status-running { color: #00d6c9; background: rgba(0, 214, 201, 0.16); }
.status-paused { color: #ffc107; background: rgba(255, 193, 7, 0.16); }
.status-completed { color: #4caf50; background: rgba(76, 175, 80, 0.16); }

.time-readout {
  color: #00d6c9;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 14px;
  font-weight: 700;
}

.close-button {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 5px;
  color: #8ea4c9;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
}

.close-button:hover {
  color: #e2ebfb;
  background: rgba(107, 196, 255, 0.1);
}

.control-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(107, 196, 255, 0.1);
  overflow-x: auto;
}

.control-bar::-webkit-scrollbar {
  height: 4px;
}

.control-bar::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(2, 124, 167, 0.45);
}

.control-button,
.play-button,
.danger-button,
.chip-button {
  height: 30px;
  border: 1px solid rgba(107, 196, 255, 0.22);
  border-radius: 6px;
  color: #d8e8ff;
  background: rgba(107, 196, 255, 0.07);
  cursor: pointer;
  white-space: nowrap;
}

.control-button {
  width: 36px;
}

.play-button {
  min-width: 68px;
  border-color: rgba(0, 214, 201, 0.45);
  color: #00d6c9;
  background: rgba(0, 214, 201, 0.13);
}

.danger-button {
  min-width: 58px;
  border-color: rgba(255, 107, 107, 0.34);
  color: #ff6b6b;
}

.control-button:disabled,
.play-button:disabled,
.danger-button:disabled,
.chip-button:disabled {
  cursor: not-allowed;
  color: #4a5a6a;
  border-color: rgba(107, 196, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
}

.selector-group {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: 8px;
  color: #6f839c;
  font-size: 12px;
}

.chip-button {
  min-width: 44px;
  padding: 0 9px;
}

.chip-button.active {
  color: #00d6c9;
  border-color: rgba(0, 214, 201, 0.48);
  background: rgba(0, 214, 201, 0.14);
}

.gantt-wrap {
  flex: 1;
  min-height: 0;
  padding: 10px 16px 12px;
  overflow: auto;
}

.gantt-wrap::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.gantt-wrap::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(2, 124, 167, 0.48);
}

.gantt-board {
  min-width: 760px;
  border: 1px solid rgba(2, 124, 167, 0.22);
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 18, 30, 0.45);
}

.time-axis {
  display: flex;
  justify-content: space-between;
  height: 30px;
  padding: 0 12px 0 72px;
  align-items: center;
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 600;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  background: rgba(0, 28, 42, 0.72);
  border-bottom: 1px solid rgba(2, 124, 167, 0.25);
}

.timeline-lane {
  position: relative;
  height: 42px;
  margin: 0;
  margin-left: 72px;
  background:
    linear-gradient(to right, rgba(2, 124, 167, 0.12) 1px, transparent 1px),
    rgba(0, 12, 22, 0.42);
  background-size: 44px 100%, auto;
  border-bottom: 1px solid rgba(2, 124, 167, 0.14);
}

.phase-bar {
  position: absolute;
  top: 8px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 52px;
  border-radius: 3px;
  padding: 0 8px;
  color: rgba(255, 255, 255, 0.9);
  background: linear-gradient(90deg, rgba(38, 64, 92, 0.78), rgba(22, 42, 64, 0.82));
  border: 1px solid rgba(125, 164, 204, 0.22);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  overflow: hidden;
  transition: filter 0.15s, box-shadow 0.15s;
}

.phase-bar::before,
.phase-bar::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.phase-bar.phase-pending {
  color: rgba(202, 219, 239, 0.72);
  background:
    repeating-linear-gradient(
      135deg,
      rgba(148, 163, 184, 0.08) 0,
      rgba(148, 163, 184, 0.08) 6px,
      rgba(15, 31, 48, 0.08) 6px,
      rgba(15, 31, 48, 0.08) 12px
    ),
    linear-gradient(90deg, rgba(43, 63, 86, 0.72), rgba(24, 43, 64, 0.76));
  border-color: rgba(125, 164, 204, 0.2);
}

.phase-bar.phase-active {
  color: #eaffff;
  background: linear-gradient(90deg, rgba(16, 44, 68, 0.9), rgba(13, 62, 78, 0.92));
  border-color: rgba(0, 214, 201, 0.54);
  box-shadow:
    0 0 12px rgba(0, 214, 201, 0.28),
    inset 0 0 0 1px rgba(0, 214, 201, 0.08);
}

.phase-bar.phase-active::before {
  inset: 0 auto 0 0;
  width: var(--phase-progress);
  background:
    linear-gradient(90deg, rgba(0, 214, 201, 0.78), rgba(71, 225, 255, 0.9)),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.08) 0,
      rgba(255, 255, 255, 0.08) 8px,
      transparent 8px,
      transparent 18px
    );
  box-shadow: inset -10px 0 14px rgba(180, 248, 255, 0.24);
}

.phase-bar.phase-active::after {
  top: -7px;
  bottom: -7px;
  left: var(--phase-progress);
  width: 12px;
  transform: translateX(-50%);
  border-radius: 999px;
  background: linear-gradient(180deg, transparent, rgba(195, 255, 255, 0.96), transparent);
  filter: blur(1px);
  opacity: 0.74;
  box-shadow: 0 0 14px rgba(128, 245, 255, 0.8);
}

.phase-bar.phase-active.is-running::before {
  background-size: auto, 30px 100%;
  animation: waterFlow 0.9s linear infinite;
}

.phase-bar.phase-active.is-running::after {
  animation: waterPulse 1.08s ease-in-out infinite;
}

.phase-bar.phase-complete {
  color: #e8fff7;
  background: linear-gradient(90deg, rgba(18, 128, 98, 0.9), rgba(34, 197, 94, 0.86));
  border-color: rgba(74, 222, 128, 0.44);
  box-shadow:
    0 0 10px rgba(34, 197, 94, 0.24),
    inset 0 0 0 1px rgba(204, 251, 241, 0.06);
}

.phase-bar.phase-final {
  color: #fff9e8;
  background: linear-gradient(90deg, rgba(15, 136, 122, 0.92), rgba(234, 179, 8, 0.88));
  border-color: rgba(250, 204, 21, 0.52);
  box-shadow:
    0 0 12px rgba(250, 204, 21, 0.26),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.phase-bar span {
  position: relative;
  z-index: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
}

.phase-bar em {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  font-style: normal;
  font-size: 10px;
  opacity: 0.74;
}

@keyframes waterFlow {
  from {
    background-position: 0 0, 0 0;
  }
  to {
    background-position: 0 0, 30px 0;
  }
}

@keyframes waterPulse {
  0%, 100% {
    opacity: 0.52;
    transform: translateX(-50%) scaleY(0.86);
  }
  50% {
    opacity: 0.92;
    transform: translateX(-50%) scaleY(1.06);
  }
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
  z-index: 8;
}

.playhead::after {
  content: '';
  position: absolute;
  top: 0;
  left: -1px;
  width: 4px;
  height: 100%;
  background: rgba(56, 189, 248, 0.2);
  filter: blur(2px);
}

.event-lane {
  display: flex;
  flex-direction: column;
  gap: 0;
  background:
    linear-gradient(to right, rgba(2, 124, 167, 0.1) 1px, transparent 1px);
  background-size: 44px 100%;
}

.event-row {
  display: grid;
  grid-template-columns: 60px 1fr;
  align-items: center;
  gap: 12px;
  min-height: 30px;
  border-bottom: 1px solid rgba(2, 124, 167, 0.08);
}

.event-row:nth-child(odd) {
  background: rgba(255, 255, 255, 0.012);
}

.row-label {
  color: #6f839c;
  font-size: 12px;
  text-align: right;
}

.row-line {
  position: relative;
  height: 24px;
}

.event-dot {
  position: absolute;
  top: 5px;
  width: 16px;
  height: 16px;
  transform: translateX(-50%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  color: #06111c;
  cursor: pointer;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.18);
}

.event-dot:hover {
  transform: translateX(-50%) scale(1.12);
}

.event-movement { background: #00d6c9; }
.event-detection { background: #6bc4ff; }
.event-attack { background: #ff6b6b; }
.event-destruction { background: #ff3333; }

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  color: #5d7188;
  font-size: 13px;
  border: 1px solid rgba(2, 124, 167, 0.18);
  border-radius: 6px;
  background: rgba(0, 18, 30, 0.36);
}

@media (max-width: 760px) {
  .simulation-drawer {
    left: 0;
    height: 300px;
    max-height: 48vh;
  }

  .drawer-header {
    grid-template-columns: minmax(0, 1fr) 28px;
  }

  .status-strip {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .close-button {
    grid-column: 2;
    grid-row: 1;
  }
}
</style>
