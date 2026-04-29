<script setup lang="ts">
import { computed } from 'vue';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';

const scenarioStore = useTacticalScenarioStore();

const eventLogItems = computed(() => {
  const scenario = scenarioStore.currentScenario;
  if (!scenario) return [];

  const phaseEvents = scenario.phases.flatMap(phase =>
    phase.events.map(event => ({
      id: `${phase.id}-${event.timestamp}-${event.detail}`,
      time: `${phase.name} / ${event.timestamp}s`,
      title: getEventTypeLabel(event.type),
      detail: event.detail,
    })),
  );

  const environmentEvents = (scenario.environment?.events ?? []).map(event => ({
    id: event.id,
    time: `${event.startTime} ~ ${event.endTime}`,
    title: event.name,
    detail: getEventTypeLabel(event.type),
  }));

  return [...phaseEvents, ...environmentEvents];
});

function getEventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    movement: '机动',
    detection: '探测',
    attack: '打击',
    destruction: '毁伤',
    weather: '天气',
    space: '空间',
    electromagnetic: '电磁',
  };
  return labels[type] ?? type;
}
</script>

<template>
  <div class="event-log-panel">
    <div v-for="item in eventLogItems" :key="item.id" class="log-card">
      <div class="log-card__time">{{ item.time }}</div>
      <div class="log-card__title">{{ item.title }}</div>
      <div class="log-card__detail">{{ item.detail }}</div>
    </div>
    <div v-if="eventLogItems.length === 0" class="empty-state">
      暂无事件记录
    </div>
  </div>
</template>

<style scoped>
.event-log-panel {
  display: grid;
  gap: 10px;
}

.log-card {
  padding: 12px 14px;
  border: 1px solid rgba(73, 150, 255, 0.28);
  border-radius: 6px;
  background: rgba(7, 41, 96, 0.58);
  box-shadow: inset 0 0 18px rgba(41, 128, 255, 0.08);
}

.log-card__time {
  color: #7db9ff;
  font-size: 12px;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.log-card__title {
  margin-top: 6px;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
}

.log-card__detail {
  margin-top: 5px;
  color: #d6e8ff;
  font-size: 13px;
  line-height: 1.6;
}

.empty-state {
  display: grid;
  place-items: center;
  min-height: 160px;
  color: rgba(214, 232, 255, 0.68);
  border: 1px dashed rgba(125, 185, 255, 0.28);
  border-radius: 6px;
  background: rgba(7, 41, 96, 0.28);
}
</style>
