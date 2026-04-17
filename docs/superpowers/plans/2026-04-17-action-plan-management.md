# 行动计划管理与推演倍速系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建左侧行动计划管理面板，实现方案卡片管理、兵力状态总览、阶段时间线和倍速控制

**Architecture:**
1. 创建 ActionPlanStore 管理多个方案卡片
2. 创建左侧 ActionPlanPanel 组件
3. 修改 ExecutionEngine 支持倍速控制
4. 集成控制组件（播放/暂停/步进/倍速）

**Tech Stack:** Pinia, Vue 3, TypeScript, Cesium

---

## 文件结构

**创建文件:**
- `apps/web/src/stores/action-plan.ts` - 方案卡片状态管理
- `apps/web/src/components/action-plan/ActionPlanPanel.vue` - 左侧管理面板主组件
- `apps/web/src/components/action-plan/ActionPlanCard.vue` - 方案卡片组件
- `apps/web/src/components/action-plan/ForceStatusOverview.vue` - 兵力状态总览
- `apps/web/src/components/action-plan/PhaseTimeline.vue` - 阶段时间线（复用现有）
- `apps/web/src/components/action-plan/ExecutionControls.vue` - 播放控制组件
- `apps/web/src/components/action-plan/ActionLog.vue` - 行动日志组件

**修改文件:**
- `apps/web/src/services/execution-engine.ts` - 添加倍速和步进控制
- `apps/web/src/views/WorkbenchView.vue` - 集成左侧面板

---

### Task 1: 创建行动计划 Store

**Files:**
- Create: `apps/web/src/stores/action-plan.ts`

- [ ] **Step 1: 创建 ActionPlanStore**

```typescript
// apps/web/src/stores/action-plan.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TacticalScenario, ExecutionStatus } from '../types/tactical-scenario';

export interface ActionPlan {
  id: string;
  scenario: TacticalScenario;
  createdAt: Date;
  name: string;
  executionState: {
    status: ExecutionStatus;
    currentTime: number;
    speed: number;
  };
}

export const useActionPlanStore = defineStore('actionPlan', () => {
  // 状态
  const plans = ref<ActionPlan[]>([]);
  const activePlanId = ref<string | null>(null);

  // 计算属性
  const activePlan = computed(() => {
    if (!activePlanId.value) return null;
    return plans.value.find(p => p.id === activePlanId.value) || null;
  });

  // 创建新方案
  function createPlan(scenario: TacticalScenario, name: string) {
    const plan: ActionPlan = {
      id: `plan-${Date.now()}`,
      scenario,
      createdAt: new Date(),
      name: name || scenario.summary || '未命名方案',
      executionState: {
        status: 'idle',
        currentTime: 0,
        speed: 1,
      },
    };

    plans.value.push(plan);
    activePlanId.value = plan.id;
    saveToStorage();

    return plan;
  }

  // 激活方案
  function activatePlan(planId: string) {
    const plan = plans.value.find(p => p.id === planId);
    if (plan) {
      activePlanId.value = planId;
    }
  }

  // 删除方案
  function deletePlan(planId: string) {
    const index = plans.value.findIndex(p => p.id === planId);
    if (index !== -1) {
      plans.value.splice(index, 1);
      if (activePlanId.value === planId) {
        activePlanId.value = plans.value[0]?.id || null;
      }
      saveToStorage();
    }
  }

  // 更新执行状态
  function updateExecutionState(planId: string, updates: Partial<ActionPlan['executionState']>) {
    const plan = plans.value.find(p => p.id === planId);
    if (plan) {
      plan.executionState = { ...plan.executionState, ...updates };
      saveToStorage();
    }
  }

  // 获取当前方案的执行状态
  function getExecutionState(planId: string) {
    const plan = plans.value.find(p => p.id === planId);
    return plan?.executionState || null;
  }

  // 持久化到 localStorage
  function saveToStorage() {
    try {
      const data = plans.value.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      }));
      localStorage.setItem('actionPlans', JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save action plans:', err);
    }
  }

  // 从 localStorage 加载
  function loadFromStorage() {
    try {
      const data = localStorage.getItem('actionPlans');
      if (data) {
        const parsed = JSON.parse(data);
        plans.value = parsed.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
        }));
        if (plans.value.length > 0) {
          activePlanId.value = plans.value[0].id;
        }
      }
    } catch (err) {
      console.error('Failed to load action plans:', err);
    }
  }

  // 初始化时加载
  loadFromStorage();

  return {
    // 状态
    plans,
    activePlanId,
    activePlan,
    // 方法
    createPlan,
    activatePlan,
    deletePlan,
    updateExecutionState,
    getExecutionState,
  };
});
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/stores/action-plan.ts
git commit -m "feat: add ActionPlanStore

- Manage multiple action plan cards
- Track execution state for each plan
- Persist to localStorage
- Load from storage on init"
```

---

### Task 2: 增�� ExecutionEngine 支持倍速控制

**Files:**
- Modify: `apps/web/src/services/execution-engine.ts`

- [ ] **Step 1: 添加倍速和步进控制**

在 ExecutionEngine 类中添加以下属性和方法：

```typescript
export class ExecutionEngine {
  // ... 现有属性

  private speed: number = 1;
  private lastRealTime: number = 0;
  private paused: boolean = false;

  /**
   * 设置倍速
   */
  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(20, speed)); // 限制在 0.1x - 20x
  }

  /**
   * 获取当前倍速
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * 步进控制（前进或后退指定秒数）
   */
  step(deltaSeconds: number) {
    this.paused = true;
    this.currentTime = Math.max(0, this.currentTime + deltaSeconds);
    this.updateEntitiesToTime(this.currentTime);
    this.onEventTrigger?.({
      type: 'movement',
      timestamp: this.currentTime,
      sourceEntityId: '',
      detail: `步进到 T+${this.currentTime.toFixed(1)}秒`,
    });
  }

  /**
   * 更新实体到指定时间
   */
  private updateEntitiesToTime(time: number) {
    // 根据时间更新所有实体位置
    for (const entity of this.entities) {
      const route = this.routes.get(entity.id);
      if (!route || route.points.length === 0) continue;

      const totalTime = route.points[route.points.length - 1].timestamp || 0;
      const progress = Math.min(time / totalTime, 1);
      const pointIndex = Math.floor(progress * (route.points.length - 1));
      const nextPointIndex = Math.min(pointIndex + 1, route.points.length - 1);
      const segmentProgress = (progress * (route.points.length - 1)) - pointIndex;

      const p1 = route.points[pointIndex].position;
      const p2 = route.points[nextPointIndex].position;

      entity.position = {
        longitude: p1.longitude + (p2.longitude - p1.longitude) * segmentProgress,
        latitude: p1.latitude + (p2.latitude - p1.latitude) * segmentProgress,
        altitude: p1.altitude + (p2.altitude - p1.altitude) * segmentProgress,
      };

      // 更新地图
      this.renderer?.updateEntityPosition(entity.id, entity.position);
    }
  }

  /**
   * 暂停
   */
  pause() {
    this.paused = true;
    this.onStatusChange?.('paused');
  }

  /**
   * 播放
   */
  play() {
    this.paused = false;
    this.lastRealTime = performance.now();
    this.onStatusChange?.('running');
  }

  /**
   * 修改 update 方法使用倍速
   */
  private update = (time: number) => {
    if (this.paused || this.status !== 'running') return;

    const realDelta = (time - this.lastRealTime) / 1000; // 转为秒
    this.lastRealTime = time;

    const simDelta = realDelta * this.speed; // 应用倍速
    this.currentTime += simDelta;

    // 更新实体位置
    this.updateEntitiesToTime(this.currentTime);

    // 检查事件触发
    // ... 现有事件触发逻辑

    this.animationFrameId = requestAnimationFrame(this.update);
  };
}
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/execution-engine.ts
git commit -m "feat: add speed control and step to ExecutionEngine

- Add setSpeed/getSpeed methods (0.1x - 20x)
- Add step method for forward/backward
- Apply speed multiplier in update loop
- Add pause/play state management"
```

---

### Task 3: 创建播放控制组件

**Files:**
- Create: `apps/web/src/components/action-plan/ExecutionControls.vue`

- [ ] **Step 1: 创建组件**

```vue
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
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/action-plan/ExecutionControls.vue
git commit -m "feat: add ExecutionControls component

- Speed selector (0.5x - 20x)
- Playback controls (play/pause/step)
- Time display
- Phase navigation buttons"
```

---

### Task 4: 创建兵力状态总览组件

**Files:**
- Create: `apps/web/src/components/action-plan/ForceStatusOverview.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- apps/web/src/components/action-plan/ForceStatusOverview.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { TacticalScenario } from '../../types/tactical-scenario';
import { FORCE_COLORS } from '../../services/cesium-graphics';

const props = defineProps<{
  scenario: TacticalScenario | null;
}>();

const forcesOverview = computed(() => {
  if (!props.scenario) return [];

  return props.scenario.forces.map(force => ({
    side: force.side,
    name: force.side === 'red' ? '红方（中国）' : '蓝方（日本）',
    color: force.side === 'red' ? '#ff6b6b' : '#6bc4ff',
    entities: force.entities.map(entity => ({
      name: entity.name,
      type: entity.type,
      status: 'planned',
    })),
  }));
});
</script>

<template>
  <div class="force-status-overview">
    <div v-if="!scenario" class="empty-state">
      无方案数据
    </div>
    <div v-else class="forces-grid">
      <div
        v-for="force in forcesOverview"
        :key="force.side"
        class="force-column"
      >
        <div class="force-header" :style="{ color: force.color }">
          {{ force.name }}
        </div>
        <div class="entity-list">
          <div
            v-for="entity in force.entities"
            :key="entity.name"
            class="entity-item"
          >
            <span class="entity-icon">{{ getEntityIcon(entity.type) }}</span>
            <span class="entity-name">{{ entity.name }}</span>
            <span class="entity-status">{{ entity.status }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
function getEntityIcon(type: string): string {
  const iconMap: Record<string, string> = {
    'aircraft-fighter': '✈️',
    'aircraft-bomber': '🚀',
    'aircraft-recon': '🔭',
    'aircraft-helicopter': '🚁',
    'ship': '🚢',
    'ground-vehicle': '🚙',
    'missile': '💥',
    'drone': '🛸',
  };
  return iconMap[type] || '📍';
}
</script>

<style scoped>
.force-status-overview {
  padding: 12px;
  background: rgba(4, 11, 20, 0.95);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 8px;
  min-height: 200px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #4a5a6a;
  font-size: 13px;
}

.forces-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.force-column {
  border: 1px solid rgba(107, 196, 255, 0.15);
  border-radius: 6px;
  overflow: hidden;
}

.force-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(107, 196, 255, 0.08);
  text-align: center;
}

.entity-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.entity-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
  font-size: 11px;
}

.entity-icon {
  font-size: 14px;
}

.entity-name {
  flex: 1;
  color: #b0c4d8;
}

.entity-status {
  color: #4a5a6a;
  font-size: 10px;
}
</style>
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/action-plan/ForceStatusOverview.vue
git commit -m "feat: add ForceStatusOverview component

- Display red/blue forces side by side
- Show entity list with icons
- Show entity status"
```

---

### Task 5: 创建行动日志组件

**Files:**
- Create: `apps/web/src/components/action-plan/ActionLog.vue`

- [ ] **Step 1: 创建组件**

```vue
<!-- apps/web/src/components/action-plan/ActionLog.vue -->
<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

interface LogEntry {
  time: string;
  message: string;
}

const logs = ref<LogEntry[]>([]);

// 模拟日志（实际应从 ExecutionEngine 接收）
logs.value.push(
  { time: '00:00:00', message: '方案开始执行' },
  { time: '00:00:05', message: '红方 Su-30 编队起飞' },
  { time: '00:00:30', message: '蓝方雷达探测到目标' },
);
</script>

<template>
  <div class="action-log">
    <div class="log-header">行动日志</div>
    <div class="log-list">
      <div
        v-for="(log, index) in logs"
        :key="index"
        class="log-entry"
      >
        <span class="log-time">[{{ log.time }}]</span>
        <span class="log-message">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-log {
  padding: 12px;
  background: rgba(4, 11, 20, 0.95);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 8px;
}

.log-header {
  font-size: 11px;
  font-weight: 600;
  color: #6bc4ff;
  margin-bottom: 8px;
}

.log-list {
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-entry {
  font-size: 11px;
  color: #9ab;
  line-height: 1.4;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
}

.log-time {
  color: #4a5a6a;
  margin-right: 6px;
}

.log-message {
  color: #b0c4d8;
}
</style>
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/action-plan/ActionLog.vue
git commit -m "feat: add ActionLog component

- Display action log entries
- Show timestamped events
- Scrollable list"
```

---

### Task 6: 创建方案卡片组件

**Files:**
- Create: `apps/web/src/components/action-plan/ActionPlanCard.vue`

- [ ] **Step 1: 创建组件**

```vue
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
        @execute="$emit('play')"
        @pause="$emit('pause')"
        @next="$emit('nextPhase')"
        @prev="$emit('prevPhase')"
        @reset="$emit('reset')"
      />

      <ExecutionControls
        :status="plan.executionState.status"
        :speed="plan.executionState.speed"
        :current-time="plan.executionState.currentTime"
        @play="$emit('play')"
        @pause="$emit('pause')"
        @step-forward="$emit('stepForward')"
        @step-backward="$emit('stepBackward')"
        @set-speed="$emit('setSpeed', $event)"
        @prev-phase="$emit('prevPhase')"
        @next-phase="$emit('nextPhase')"
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
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/action-plan/ActionPlanCard.vue
git commit -m "feat: add ActionPlanCard component

- Collapsible card header
- Force status overview
- Phase timeline
- Execution controls
- Action log"
```

---

### Task 7: 创建主面板组件并集成到 WorkbenchView

**Files:**
- Create: `apps/web/src/components/action-plan/ActionPlanPanel.vue`
- Modify: `apps/web/src/views/WorkbenchView.vue`

- [ ] **Step 1: 创建主面板组件**

```vue
<!-- apps/web/src/components/action-plan/ActionPlanPanel.vue -->
<script setup lang="ts">
import { useActionPlanStore } from '../../stores/action-plan';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';
import ActionPlanCard from './ActionPlanCard.vue';
import type { ExecutionEngine } from '../../services/execution-engine';

const actionPlanStore = useActionPlanStore();
const scenarioStore = useTacticalScenarioStore();

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
```

- [ ] **Step 2: 在 WorkbenchView 中集成**

修改 `apps/web/src/views/WorkbenchView.vue`：

```vue
<script setup lang="ts">
// ... 现有导入

import ActionPlanPanel from '../components/action-plan/ActionPlanPanel.vue';
import { useActionPlanStore } from '../stores/action-plan';

const actionPlanStore = useActionPlanStore();

// 在 ExecutionEngine 初始化后注入到 ActionPlanPanel
const actionPlanPanelRef = ref<InstanceType<typeof ActionPlanPanel> | null>(null);

onMounted(() => {
  // ... 现有初始化代码

  // 注入 ExecutionEngine 到 ActionPlanPanel
  if (actionPlanPanelRef.value && executionEngine) {
    actionPlanPanelRef.value.initEngine(executionEngine);
  }
});

// 修改 scenarioStore.generateScenario 完成后创建 ActionPlan
const originalGenerateScenario = scenarioStore.generateScenario.bind(scenarioStore);
scenarioStore.generateScenario = async function(...args) {
  const scenario = await originalGenerateScenario(...args);
  if (scenario) {
    actionPlanStore.createPlan(scenario, scenario.summary);
  }
  return scenario;
};
</script>

<template>
  <div class="workbench">
    <!-- 左侧行动面板 -->
    <ActionPlanPanel ref="actionPlanPanelRef" />

    <!-- 地图区域 -->
    <CesiumMap ref="cesiumMapRef" />

    <!-- 右侧 AI 面板 -->
    <!-- ... 现有 AI 面板 ... -->
  </div>
</template>

<style scoped>
/* 调整地图区域，为左右面板留出空间 */
.workbench {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
```

- [ ] **Step 3: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/action-plan/ActionPlanPanel.vue apps/web/src/views/WorkbenchView.vue
git commit -m "feat: add ActionPlanPanel and integrate into WorkbenchView

- Create main panel component
- Integrate left side panel
- Auto-create ActionPlan on scenario generation
- Inject ExecutionEngine into panel"
```

---

### Task 8: 验证完整功能

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

Expected: 服务器启动

- [ ] **Step 2: 测试完整流程**

1. 打开浏览器
2. 在 AI 助手中生成方案
3. 检查左侧面板是否创建新卡片
4. 展开卡片，检查：
   - [ ] 兵力状态总览显示正确
   - [ ] 阶段时间线显示正确
   - [ ] 播放控制按钮工作正常
   - [ ] 倍速切换正常
   - [ ] 行动日志显示
5. 测试播放/暂停/步进
6. 测试倍速切换（0.5x, 1x, 2x, 5x, 10x, 20x）
7. 测试卡片切换和删除

- [ ] **Step 3: 提交验收结果**

```bash
git commit --allow-empty -m "test: verify action plan management system

- Confirm cards created on scenario generation
- Confirm force status displays correctly
- Confirm playback controls work
- Confirm speed control works
- Confirm card switching and deletion"
```

---

## 验收标准

- [ ] 每次生成方案创建新卡片
- [ ] 卡片展开显示完整信息（兵力、时间线、日志）
- [ ] 倍速控制正常工作（0.5x - 20x）
- [ ] 播放/暂停/步进功能正常
- [ ] 卡片切换和删除功能正常
- [ ] 所有类型检查通过
- [ ] 手动测试通过

---

**计划完成**: 所有5个实施计划已创建，准备开始执行
