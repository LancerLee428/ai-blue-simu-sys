<!-- apps/web/src/components/action-plan/ActionLog.vue -->
<script setup lang="ts">
import { ref } from 'vue';

interface LogEntry {
  time: string;
  message: string;
}

const logs = ref<LogEntry[]>([
  { time: '00:00:00', message: '方案开始执行' },
  { time: '00:00:05', message: '红方 Su-30 编队起飞' },
  { time: '00:00:30', message: '蓝方雷达探测到目标' },
]);
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
