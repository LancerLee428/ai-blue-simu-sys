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
const stagedScenarioDraft = computed(() => store.platform.stagedScenarioDraft);

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
  store.confirmDraft();
}

async function handleRegenerate() {
  const currentCommand = store.platform.ai.draft.command;
  await store.generateDraft({
    ...currentCommand,
    regenerateFromDraftId: store.platform.ai.draft.draft.id,
  });
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

async function handleRefreshStagedDraft() {
  await store.refreshStagedScenarioDraft();
}

async function handleConfirmStagedDraft() {
  await store.confirmStagedDraft();
  chatMessages.value.push({
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: 'AI Workflow 草案已确认，可进入行动计划承接。',
    timestamp: new Date().toISOString(),
  });
}

async function handleRejectStagedDraft() {
  await store.rejectStagedDraft('人工拒绝 AI Workflow 草案');
  chatMessages.value.push({
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: 'AI Workflow 草案已拒绝。',
    timestamp: new Date().toISOString(),
  });
}
</script>

<template>
  <div class="ai-assistant">
    <AIChatHistory :messages="chatMessages" />
    <section v-if="stagedScenarioDraft" class="workflow-draft">
      <div class="workflow-draft__header">
        <span>AI Workflow 草案</span>
        <span class="workflow-draft__status">{{ stagedScenarioDraft.status }}</span>
      </div>
      <p class="workflow-draft__summary">{{ stagedScenarioDraft.summary }}</p>
      <div class="workflow-draft__meta">
        <span>依据 {{ stagedScenarioDraft.evidence.length }} 条</span>
        <span>校验问题 {{ stagedScenarioDraft.validation.issues.length }} 条</span>
      </div>
      <div class="workflow-draft__actions">
        <button type="button" @click="handleConfirmStagedDraft">确认草案</button>
        <button type="button" @click="handleRejectStagedDraft">拒绝草案</button>
      </div>
    </section>
    <button type="button" class="workflow-draft-refresh" @click="handleRefreshStagedDraft">
      刷新 AI Workflow 草案
    </button>
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

.workflow-draft {
  border: 1px solid rgba(0, 214, 201, 0.25);
  border-radius: 8px;
  padding: 12px;
  background: rgba(0, 214, 201, 0.06);
}

.workflow-draft__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #d7fffb;
  font-size: 13px;
  font-weight: 600;
}

.workflow-draft__status {
  color: #00d6c9;
}

.workflow-draft__summary {
  margin: 8px 0;
  color: #b0c4d8;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-draft__meta {
  display: flex;
  gap: 12px;
  color: #8ea4c9;
  font-size: 12px;
}

.workflow-draft__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.workflow-draft__actions button,
.workflow-draft-refresh {
  border: 1px solid rgba(0, 214, 201, 0.35);
  border-radius: 6px;
  padding: 6px 10px;
  color: #d7fffb;
  background: rgba(0, 214, 201, 0.1);
  cursor: pointer;
}

.workflow-draft-refresh {
  width: 100%;
}
</style>
