<script setup lang="ts">
import { computed } from 'vue';
import { usePlatformStore } from '../../stores/platform';

const store = usePlatformStore();

const projections = computed(() => store.platform.scenarioWorkspace.projections);

function statusLabel(status: string) {
  return status === 'deployed' ? '已部署' : '待部署';
}
</script>

<template>
  <div class="entity-list">
    <div v-if="projections.length === 0" class="empty-state">
      <p>暂无投影对象</p>
      <p class="empty-hint">从右侧资源树拖拽部署</p>
    </div>
    <div
      v-for="item in projections"
      :key="item.id"
      class="list-item"
      :class="{ active: store.selectedPointId === item.id }"
      @click="store.selectPoint(item.id)"
    >
      <div class="list-item__icon">
        {{ item.category === 'force-unit' ? '✦' : '◇' }}
      </div>
      <div class="list-item__body">
        <strong class="list-item__name">{{ item.name }}</strong>
        <span class="list-item__meta">{{ item.location }}</span>
      </div>
      <span class="list-item__badge" :class="`badge--${item.status}`">
        {{ statusLabel(item.status) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.entity-list {
  display: grid;
  gap: 8px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(14, 24, 39, 0.72);
  border: 1px solid rgba(119, 150, 206, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.list-item:hover {
  border-color: rgba(107, 196, 255, 0.3);
  background: rgba(14, 24, 39, 0.9);
}

.list-item.active {
  border-color: rgba(107, 196, 255, 0.58);
  background: rgba(107, 196, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(107, 196, 255, 0.12);
}

.list-item__icon {
  font-size: 16px;
  color: #6bc4ff;
  flex-shrink: 0;
}

.list-item__body {
  flex: 1;
  min-width: 0;
}

.list-item__name {
  display: block;
  font-size: 13px;
  color: #e2ebfb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-item__meta {
  display: block;
  font-size: 11px;
  color: #8ea4c9;
  margin-top: 2px;
}

.list-item__badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  flex-shrink: 0;
}

.badge--deployed {
  background: rgba(23, 216, 196, 0.15);
  border: 1px solid rgba(23, 216, 196, 0.3);
  color: #17d8c4;
}

.badge--planned {
  background: rgba(142, 164, 201, 0.1);
  border: 1px solid rgba(142, 164, 201, 0.2);
  color: #8ea4c9;
}

.empty-state {
  text-align: center;
  padding: 32px 16px;
  color: #8ea4c9;
}

.empty-hint {
  font-size: 12px;
  margin-top: 8px;
  color: #4a5a78;
}
</style>
