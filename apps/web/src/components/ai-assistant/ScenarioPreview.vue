<!-- apps/web/src/components/ai-assistant/ScenarioPreview.vue -->
<script setup lang="ts">
import type { TacticalScenario } from '../../types/tactical-scenario';

const props = defineProps<{ scenario: TacticalScenario }>();

const redForce = props.scenario.forces.find(f => f.side === 'red');
const blueForce = props.scenario.forces.find(f => f.side === 'blue');

function formatCoord(pos: { longitude: number; latitude: number }) {
  return `${pos.longitude.toFixed(2)}°, ${pos.latitude.toFixed(2)}°`;
}
</script>

<template>
  <div class="scenario-preview">
    <div class="preview-summary">{{ scenario.summary }}</div>

    <div class="preview-forces">
      <div v-if="redForce" class="force-block force-red">
        <div class="force-header">
          <span class="force-badge">红</span>
          <span class="force-name">{{ redForce.name }}</span>
          <span class="force-count">{{ redForce.entities.length }}个实体</span>
        </div>
        <div class="entity-list">
          <div v-for="e in redForce.entities" :key="e.id" class="entity-row">
            <span class="entity-name">{{ e.name }}</span>
            <span class="entity-pos">{{ formatCoord(e.position) }}</span>
          </div>
        </div>
      </div>

      <div v-if="blueForce" class="force-block force-blue">
        <div class="force-header">
          <span class="force-badge">蓝</span>
          <span class="force-name">{{ blueForce.name }}</span>
          <span class="force-count">{{ blueForce.entities.length }}个实体</span>
        </div>
        <div class="entity-list">
          <div v-for="e in blueForce.entities" :key="e.id" class="entity-row">
            <span class="entity-name">{{ e.name }}</span>
            <span class="entity-pos">{{ formatCoord(e.position) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="preview-meta">
      <span>{{ scenario.routes.length }}条路线</span>
      <span>·</span>
      <span>{{ scenario.detectionZones.length }}个探测区</span>
      <span>·</span>
      <span>{{ scenario.strikeTasks.length }}个打击任务</span>
      <span>·</span>
      <span>{{ scenario.phases.length }}个阶段</span>
      <span class="confidence">
        置信度 {{ ((scenario.metadata.confidence || 0.85) * 100).toFixed(0) }}%
      </span>
    </div>
  </div>
</template>

<style scoped>
.scenario-preview { padding: 12px; }
.preview-summary {
  font-size: 13px;
  color: #e2ebfb;
  margin-bottom: 12px;
  padding: 8px;
  background: rgba(107, 196, 255, 0.06);
  border-radius: 6px;
  border-left: 3px solid #6bc4ff;
}
.preview-forces { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.force-block { border-radius: 6px; padding: 8px; }
.force-red {
  background: rgba(255, 68, 68, 0.06);
  border: 1px solid rgba(255, 68, 68, 0.2);
}
.force-blue {
  background: rgba(68, 136, 255, 0.06);
  border: 1px solid rgba(68, 136, 255, 0.2);
}
.force-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.force-badge {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
}
.force-red .force-badge { background: #ff4444; }
.force-blue .force-badge { background: #4488ff; }
.force-name { font-size: 13px; font-weight: 500; color: #e2ebfb; flex: 1; }
.force-count { font-size: 11px; color: #8ea4c9; }
.entity-list { display: flex; flex-direction: column; gap: 3px; }
.entity-row { display: flex; justify-content: space-between; font-size: 11px; }
.entity-name { color: #b0c4d8; }
.entity-pos { color: #4a5a6a; font-family: monospace; font-size: 10px; }
.preview-meta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: #4a5a6a;
  flex-wrap: wrap;
  align-items: center;
}
.confidence { margin-left: auto; color: #6bc4ff; font-family: monospace; }
</style>
