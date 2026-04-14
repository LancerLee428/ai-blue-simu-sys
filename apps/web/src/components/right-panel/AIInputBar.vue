<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'submit', command: string): void;
}>();

const commandText = ref('');

function submit() {
  const text = commandText.value.trim();
  if (!text) return;
  emit('submit', text);
  commandText.value = '';
}
</script>

<template>
  <div class="ai-input-bar">
    <input
      v-model="commandText"
      class="ai-input"
      placeholder="输入部署指令，例如：在台湾部署侦察力量"
      @keydown.enter="submit"
    />
    <button class="ai-send-btn" :disabled="!commandText.trim()" @click="submit">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.ai-input-bar {
  display: flex;
  gap: 8px;
  padding: 12px 0 0;
  border-top: 1px solid rgba(110, 196, 255, 0.12);
}

.ai-input {
  flex: 1;
  background: rgba(10, 20, 35, 0.85);
  border: 1px solid rgba(118, 151, 210, 0.2);
  border-radius: 12px;
  color: #eef5ff;
  font-size: 13px;
  padding: 10px 14px;
  outline: none;
  transition: border-color 0.2s;
}

.ai-input::placeholder {
  color: #4a5a78;
}

.ai-input:focus {
  border-color: rgba(107, 196, 255, 0.4);
}

.ai-send-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #1f6fff, #15b5ff);
  color: #05111d;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.ai-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
