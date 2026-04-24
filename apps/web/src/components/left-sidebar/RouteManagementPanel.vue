<!-- apps/web/src/components/left-sidebar/RouteManagementPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Route, EntitySpec, RouteDecision } from '../../types/tactical-scenario';

const props = defineProps<{
  routes: Route[];
  entities: EntitySpec[];
  decisions: Map<string, RouteDecision>;
  selectedRouteId: string | null;
}>();

const emit = defineEmits<{
  selectRoute: [routeId: string];
}>();

// 路线列表(带实体信息)
const routesWithEntity = computed(() => {
  const routeCountMap = new Map<string, number>();

  return props.routes.map((route) => {
    const entity = props.entities.find(e => e.id === route.entityId);
    const idx = routeCountMap.get(route.entityId) ?? 0;
    routeCountMap.set(route.entityId, idx + 1);
    const routeId = `route-${route.entityId}-${idx}`;
    const decision = props.decisions.get(routeId);

    return {
      routeId,
      route,
      entity,
      decision,
    };
  });
});

function formatPosition(pos: any): string {
  return `${pos.longitude.toFixed(4)}°E, ${pos.latitude.toFixed(4)}°N, ${Math.round(pos.altitude)}m`;
}

function getScoreClass(score: number): string {
  if (score >= 0.7) return 'score-high';
  if (score >= 0.4) return 'score-medium';
  return 'score-low';
}
</script>

<template>
  <div class="route-management">
    <div v-if="routesWithEntity.length === 0" class="empty-hint">
      暂无行动路线
    </div>

    <div
      v-for="item in routesWithEntity"
      :key="item.routeId"
      class="route-card"
      :class="{ 'route-selected': item.routeId === selectedRouteId }"
      @click="emit('selectRoute', item.routeId)"
    >
      <!-- 路线头部 -->
      <div class="route-header">
        <span class="route-icon" :class="item.entity?.side">●</span>
        <span class="route-name">{{ item.entity?.name || '未知实体' }}</span>
        <span v-if="item.decision" class="route-score" :class="getScoreClass(item.decision.score)">
          {{ (item.decision.score * 100).toFixed(0) }}分
        </span>
      </div>

      <!-- 路线信息 -->
      <div class="route-info">
        <div class="info-row">
          <span class="info-label">航路点</span>
          <span class="info-value">{{ item.route.points.length }}个</span>
        </div>
        <div class="info-row">
          <span class="info-label">起点</span>
          <span class="info-value small">{{ formatPosition(item.route.points[0].position) }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">终点</span>
          <span class="info-value small">{{ formatPosition(item.route.points[item.route.points.length - 1].position) }}</span>
        </div>
      </div>

      <!-- AI 决策分析 -->
      <div v-if="item.decision" class="decision-summary">
        <div class="decision-label">AI 决策理由</div>
        <div class="decision-text">{{ item.decision.reasoning }}</div>

        <!-- 决策因素 -->
        <div class="factors-mini">
          <div
            v-for="factor in item.decision.factors"
            :key="factor.name"
            class="factor-mini"
          >
            <span class="factor-name">{{ factor.name }}</span>
            <div class="factor-bar">
              <div
                class="factor-fill"
                :style="{ width: `${factor.score * 100}%` }"
                :class="getScoreClass(factor.score)"
              ></div>
            </div>
          </div>
        </div>

        <!-- 目标信息 -->
        <div v-if="item.decision.targetName" class="target-mini">
          <span class="target-icon">🎯</span>
          <span class="target-name">{{ item.decision.targetName }}</span>
        </div>
      </div>

      <!-- 航路点列表 -->
      <details class="waypoints-details">
        <summary class="waypoints-summary">查看航路点详情</summary>
        <div class="waypoints-list">
          <div
            v-for="(point, idx) in item.route.points"
            :key="idx"
            class="waypoint-item"
          >
            <span class="waypoint-num">{{ idx + 1 }}</span>
            <div class="waypoint-info">
              <div class="waypoint-pos">{{ formatPosition(point.position) }}</div>
              <div v-if="point.timestamp" class="waypoint-time">T+{{ point.timestamp }}s</div>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.route-management {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-hint {
  font-size: 12px;
  color: #4a5a6a;
  text-align: center;
  padding: 16px 0;
}

.route-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(107, 196, 255, 0.15);
  border-radius: 6px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.route-card:hover {
  background: rgba(107, 196, 255, 0.05);
  border-color: rgba(107, 196, 255, 0.3);
}

.route-selected {
  background: rgba(0, 214, 201, 0.08);
  border-color: rgba(0, 214, 201, 0.4);
}

.route-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.route-icon {
  font-size: 10px;
  flex-shrink: 0;
}

.route-icon.red {
  color: #ff6b6b;
}

.route-icon.blue {
  color: #4dabf7;
}

.route-name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #e2ebfb;
}

.route-score {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.score-high {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.score-medium {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.score-low {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.route-info {
  margin-bottom: 8px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  font-size: 11px;
}

.info-label {
  color: #6bc4ff;
  font-weight: 500;
}

.info-value {
  color: #b0c4d8;
  text-align: right;
}

.info-value.small {
  font-size: 10px;
  font-family: monospace;
}

.decision-summary {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(107, 196, 255, 0.1);
}

.decision-label {
  font-size: 10px;
  color: #6bc4ff;
  font-weight: 600;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.decision-text {
  font-size: 11px;
  color: #b0c4d8;
  line-height: 1.5;
  margin-bottom: 6px;
}

.factors-mini {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}

.factor-mini {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.factor-name {
  font-size: 10px;
  color: #8ea4c9;
}

.factor-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.factor-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.target-mini {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  font-size: 11px;
}

.target-icon {
  font-size: 14px;
}

.target-name {
  color: #e2ebfb;
  font-weight: 500;
}

.waypoints-details {
  margin-top: 8px;
  border-top: 1px solid rgba(107, 196, 255, 0.1);
  padding-top: 6px;
}

.waypoints-summary {
  font-size: 11px;
  color: #6bc4ff;
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
}

.waypoints-summary:hover {
  color: #8dd4ff;
}

.waypoints-list {
  margin-top: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.waypoint-item {
  display: flex;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.waypoint-num {
  font-size: 10px;
  color: #6bc4ff;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
  background: rgba(107, 196, 255, 0.1);
  border-radius: 3px;
  padding: 2px 4px;
  flex-shrink: 0;
}

.waypoint-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.waypoint-pos {
  font-size: 10px;
  color: #b0c4d8;
  font-family: monospace;
}

.waypoint-time {
  font-size: 9px;
  color: #4a5a6a;
}

/* 滚动条样式 */
.waypoints-list::-webkit-scrollbar {
  width: 4px;
}

.waypoints-list::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 2px;
}

.waypoints-list::-webkit-scrollbar-thumb {
  background: rgba(107, 196, 255, 0.2);
  border-radius: 2px;
}

.waypoints-list::-webkit-scrollbar-thumb:hover {
  background: rgba(107, 196, 255, 0.3);
}
</style>
