<script setup lang="ts">
import { computed } from 'vue';
import { usePlatformStore } from '../../stores/platform';

const store = usePlatformStore();

const selected = computed(() => store.selectedPoint);
</script>

<template>
  <Transition name="popup">
    <div v-if="selected" class="entity-popup glass-panel">
      <div class="popup-header">
        <span class="popup-icon">◈</span>
        <strong class="popup-name">{{ selected.name }}</strong>
        <span class="popup-badge">{{ selected.category === 'force-unit' ? '兵力' : '平台' }}</span>
      </div>
      <div class="popup-body">
        <div class="popup-row">
          <span class="popup-label">区域</span>
          <span class="popup-value">{{ selected.region }}</span>
        </div>
        <div class="popup-row">
          <span class="popup-label">状态</span>
          <span class="popup-value popup-value--status" :class="`status--${selected.state}`">
            {{ selected.state === 'deployed' ? '已部署' : '待部署' }}
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.entity-popup {
  position: absolute;
  bottom: 80px;
  right: 24px;
  width: 260px;
  padding: 16px;
  z-index: 20;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.popup-icon {
  color: #6bc4ff;
  font-size: 16px;
}

.popup-name {
  font-size: 14px;
  color: #e2ebfb;
  flex: 1;
}

.popup-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(107, 196, 255, 0.15);
  border: 1px solid rgba(107, 196, 255, 0.3);
  border-radius: 6px;
  color: #6bc4ff;
  letter-spacing: 0.05em;
}

.popup-body {
  display: grid;
  gap: 8px;
}

.popup-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.popup-label {
  color: #8ea4c9;
}

.popup-value {
  color: #e2ebfb;
}

.popup-value--status.status--deployed {
  color: #17d8c4;
}

.popup-value--status.status--planned {
  color: #8ea4c9;
}

.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
