<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlatformStore } from '../../stores/platform';
import AIChatHistory from './AIChatHistory.vue';
import AIDraftPanel from './AIDraftPanel.vue';
import AIInputBar from './AIInputBar.vue';

const store = usePlatformStore();

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const chatMessages = ref<ChatMessage[]>([]);

const draftItems = computed(() => store.platform.ai.draft.draft.items);
const loading = computed(() => store.loading);

async function handleSubmit(command: string) {
  chatMessages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    content: command,
    timestamp: new Date().toISOString(),
  });

  await store.generateDraft(command);

  const summary = store.platform.ai.draft.draft.summary;
  if (summary) {
    chatMessages.value.push({
      id: `ai-${Date.now()}`,
      role: 'assistant',
      content: summary,
      timestamp: new Date().toISOString(),
    });
  }
}

function handleConfirm() {
  store.confirmDraft(store.platform.ai.draft.draft.items);
}

function handleRegenerate() {
  store.regenerateDraft();
  chatMessages.value.push({
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: '正在重新生成草案...',
    timestamp: new Date().toISOString(),
  });
}

function handleReject() {
  const reason = '需要调整部署方案';
  store.rejectDraft(reason);
  chatMessages.value.push({
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: `草案已拒绝：${reason}`,
    timestamp: new Date().toISOString(),
  });
}
</script>

<template>
  <div class="ai-assistant">
    <AIChatHistory :messages="chatMessages" />
    <AIDraftPanel
      :draft="draftItems"
      :loading="loading"
      @confirm="handleConfirm"
      @reject="handleReject"
      @regenerate="handleRegenerate"
    />
    <AIInputBar @submit="handleSubmit" />
  </div>
</template>

<style scoped>
.ai-assistant {
  display: grid;
  gap: 12px;
  height: 100%;
}
</style>
