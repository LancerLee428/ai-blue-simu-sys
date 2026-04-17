<!-- apps/web/src/components/action-plan/ForceStatusOverview.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { TacticalScenario } from '../../types/tactical-scenario';

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
