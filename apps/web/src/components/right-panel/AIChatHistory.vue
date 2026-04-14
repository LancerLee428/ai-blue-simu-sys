<script setup lang="ts">
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

defineProps<{
  messages: ChatMessage[];
}>();
</script>

<template>
  <div class="chat-history panel-scroll">
    <div v-if="messages.length === 0" class="chat-empty">
      <span class="chat-empty__icon">◆</span>
      <p>发送指令，AI 将生成部署草案</p>
      <p class="chat-empty__hint">例如："在台湾北部部署侦察力量"</p>
    </div>
    <div
      v-for="msg in messages"
      :key="msg.id"
      class="chat-msg"
      :class="`chat-msg--${msg.role}`"
    >
      <div class="chat-msg__bubble">
        <p>{{ msg.content }}</p>
      </div>
      <time class="chat-msg__time">{{ new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</time>
    </div>
  </div>
</template>

<style scoped>
.chat-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 8px;
}

.chat-empty {
  text-align: center;
  padding: 24px 16px;
  color: #8ea4c9;
}

.chat-empty__icon {
  font-size: 28px;
  color: #6bc4ff;
  display: block;
  margin-bottom: 12px;
}

.chat-empty__hint {
  font-size: 12px;
  color: #4a5a78;
  margin-top: 6px;
}

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-msg--user {
  align-items: flex-end;
}

.chat-msg--assistant {
  align-items: flex-start;
}

.chat-msg__bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.6;
}

.chat-msg--user .chat-msg__bubble {
  background: linear-gradient(135deg, #1f6fff, #15b5ff);
  color: #05111d;
  border-bottom-right-radius: 4px;
}

.chat-msg--assistant .chat-msg__bubble {
  background: rgba(14, 24, 39, 0.9);
  border: 1px solid rgba(110, 196, 255, 0.15);
  color: #e2ebfb;
  border-bottom-left-radius: 4px;
}

.chat-msg__time {
  font-size: 10px;
  color: #4a5a78;
  padding: 0 4px;
}
</style>
