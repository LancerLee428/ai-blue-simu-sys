<script setup lang="ts">
import type { DeploymentDraftItem } from '@ai-blue-simu-sys/ai-core';

defineProps<{
  draft: DeploymentDraftItem[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'reject'): void;
  (e: 'regenerate'): void;
}>();
</script>

<template>
  <div class="draft-panel">
    <div v-if="loading" class="draft-loading">
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <div class="loading-dot"></div>
      <span>AI 思考中...</span>
    </div>

    <div v-else-if="draft.length === 0" class="draft-empty">
      <p>暂无草案</p>
      <p class="draft-empty__hint">输入指令生成部署草案</p>
    </div>

    <template v-else>
      <div class="draft-items">
        <div v-for="(item, index) in draft" :key="`${item.sourceEntityId}-${index}`" class="draft-card">
          <div class="draft-card__header">
            <span class="draft-card__icon">{{ item.category === 'force-unit' ? '✦' : '◇' }}</span>
            <strong class="draft-card__name">{{ item.name }}</strong>
          </div>
          <p class="draft-card__location">{{ item.suggestedLocation }}</p>
          <p class="draft-card__rationale">{{ item.rationale }}</p>
        </div>
      </div>

      <div class="draft-actions">
        <button class="draft-btn draft-btn--confirm" @click="emit('confirm')">确认部署</button>
        <button class="draft-btn draft-btn--regen" @click="emit('regenerate')">重生成</button>
        <button class="draft-btn draft-btn--reject" @click="emit('reject')">拒绝</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.draft-panel {
  display: grid;
  gap: 12px;
}

.draft-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: #8ea4c9;
  font-size: 13px;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6bc4ff;
  animation: dot-bounce 1.2s ease-in-out infinite;
}

.loading-dot:nth-child(2) { animation-delay: 0.2s; }
.loading-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(1); opacity: 0.4; }
  40% { transform: scale(1.4); opacity: 1; }
}

.draft-empty {
  text-align: center;
  padding: 20px;
  color: #8ea4c9;
  font-size: 13px;
}

.draft-empty__hint {
  font-size: 12px;
  color: #4a5a78;
  margin-top: 6px;
}

.draft-items {
  display: grid;
  gap: 10px;
}

.draft-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(14, 24, 39, 0.8);
  border: 1px solid rgba(110, 196, 255, 0.12);
}

.draft-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.draft-card__icon {
  color: #17d8c4;
  font-size: 14px;
}

.draft-card__name {
  font-size: 13px;
  color: #e2ebfb;
}

.draft-card__location {
  font-size: 12px;
  color: #6bc4ff;
  margin: 0 0 4px 22px;
}

.draft-card__rationale {
  font-size: 12px;
  color: #8ea4c9;
  margin: 0 0 0 22px;
  line-height: 1.5;
}

.draft-actions {
  display: flex;
  gap: 8px;
}

.draft-btn {
  flex: 1;
  padding: 10px 8px;
  border-radius: 10px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.draft-btn--confirm {
  background: linear-gradient(135deg, #1f6fff, #15b5ff);
  color: #05111d;
}

.draft-btn--regen {
  background: rgba(23, 216, 196, 0.15);
  border: 1px solid rgba(23, 216, 196, 0.3);
  color: #17d8c4;
}

.draft-btn--reject {
  background: rgba(255, 143, 147, 0.12);
  border: 1px solid rgba(255, 143, 147, 0.25);
  color: #ff8f93;
}
</style>
