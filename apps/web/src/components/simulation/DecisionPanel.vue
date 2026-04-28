<template>
  <div class="decision-panel">
    <div class="panel-header">
      <h3>🧠 AI 决策分析</h3>
      <button @click="togglePanel" class="toggle-btn">
        {{ collapsed ? '展开' : '收起' }}
      </button>
    </div>

    <div v-if="!collapsed" class="panel-content">
      <div v-if="!selectedRoute" class="empty-state">
        点击地图上的路线查看 AI 决策理由
      </div>

      <div v-else class="decision-details">
        <!-- 决策摘要 -->
        <div class="decision-summary">
          <div class="score-badge" :class="getScoreClass(decision.score)">
            {{ (decision.score * 100).toFixed(0) }}分
          </div>
          <p class="reasoning">{{ decision.reasoning }}</p>
        </div>

        <!-- 决策因素 -->
        <div class="factors-list">
          <h4>决策因素分析</h4>
          <div
            v-for="factor in decision.factors"
            :key="factor.name"
            class="factor-item"
          >
            <div class="factor-header">
              <span class="factor-name">{{ factor.name }}</span>
              <span class="factor-weight">权重 {{ (factor.weight * 100).toFixed(0) }}%</span>
            </div>
            <div class="factor-score-bar">
              <div
                class="score-fill"
                :style="{ width: `${factor.score * 100}%` }"
                :class="getScoreClass(factor.score)"
              ></div>
            </div>
            <p class="factor-description">{{ factor.description }}</p>
          </div>
        </div>

        <!-- 目标信息 -->
        <div v-if="decision.targetName" class="target-info">
          <h4>攻击目标</h4>
          <div class="target-card">
            <span class="target-icon">🎯</span>
            <span class="target-name">{{ decision.targetName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { RouteDecision } from '../../services/ai-decision-visualizer';

const props = defineProps<{
  selectedRouteId: string | null;
  decisions: Map<string, RouteDecision>;
}>();

const collapsed = ref(false);

const selectedRoute = computed(() => props.selectedRouteId);
const decision = computed(() => {
  if (!props.selectedRouteId) return null;
  return props.decisions.get(props.selectedRouteId) || null;
});

const togglePanel = () => {
  collapsed.value = !collapsed.value;
};

const getScoreClass = (score: number): string => {
  if (score >= 0.7) return 'score-high';
  if (score >= 0.4) return 'score-medium';
  return 'score-low';
};

// 当选择新路线时自动展开面板
watch(selectedRoute, (newVal) => {
  if (newVal && collapsed.value) {
    collapsed.value = false;
  }
});
</script>

<style scoped>
.decision-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 400px;
  background: rgba(30, 30, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  color: #fff;
  z-index: 1000;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.toggle-btn {
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.panel-content {
  padding: 16px;
  max-height: 500px;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

.decision-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: flex-start;
}

.score-badge {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
}

.score-high {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.score-medium {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.score-low {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.reasoning {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
}

.factors-list {
  margin-bottom: 20px;
}

.factors-list h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.factor-item {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.factor-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.factor-name {
  font-size: 13px;
  font-weight: 500;
}

.factor-weight {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.factor-score-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.score-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.factor-description {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.target-info h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
}

.target-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
}

.target-icon {
  font-size: 24px;
}

.target-name {
  font-size: 14px;
  font-weight: 500;
}

/* 滚动条样式 */
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
