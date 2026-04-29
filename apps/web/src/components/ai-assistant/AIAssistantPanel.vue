<!-- apps/web/src/components/ai-assistant/AIAssistantPanel.vue -->
<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useTacticalScenarioStore } from "../../stores/tactical-scenario";
import { XmlScenarioParser } from "../../services/xml-scenario-parser";
import { XmlScenarioExporter } from "../../services/xml-scenario-exporter";
import { normalizeTacticalScenario } from "../../services/tactical-scenario-normalizer";
import type { TacticalScenario } from "../../types/tactical-scenario";
import ScenarioPreview from "./ScenarioPreview.vue";
import uploadIcon from "../../assets/right-panel/upload.png";
import downloadIcon from "../../assets/right-panel/download.png";
import sendIcon from "../../assets/right-panel/send.png";
import clearIcon from "../../assets/right-panel/other.png";
import sendBgIcon from "../../assets/right-panel/send-bgc.png";

const store = useTacticalScenarioStore();
const inputText = ref("");
const showScenarioPreview = ref(false);
const chatHistoryEl = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const xmlParser = new XmlScenarioParser();
const xmlExporter = new XmlScenarioExporter();

// 自动滚动到底部
watch(
  () => store.chatHistory.length,
  async () => {
    await nextTick();
    if (chatHistoryEl.value) {
      chatHistoryEl.value.scrollTop = chatHistoryEl.value.scrollHeight;
    }
  },
);

async function handleSend() {
  const text = inputText.value.trim();
  if (!text || store.isGenerating) return;
  inputText.value = "";
  try {
    await store.generateScenarioDemo(text);
    showScenarioPreview.value = true;
  } catch {
    /* error handled in store */
  }
}

async function handleRefine() {
  const text = inputText.value.trim();
  if (!text || store.isGenerating) return;
  inputText.value = "";
  try {
    await store.generateScenarioDemo(text);
    showScenarioPreview.value = true;
  } catch {
    /* error handled in store */
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !store.isGenerating) {
    e.preventDefault();
    store.currentScenario ? handleRefine() : handleSend();
  }
}

function getMsgClass(role: string) {
  return role === "user" ? "msg-user" : "msg-assistant";
}

// 导入
function handleImport() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (event.target as HTMLInputElement).value = "";
  try {
    const content = await file.text();
    const trimmed = content.trim();
    const scenario =
      file.name.toLowerCase().endsWith(".json") || trimmed.startsWith("{")
        ? normalizeTacticalScenario(JSON.parse(trimmed) as TacticalScenario)
        : xmlParser.parse(content);
    store.loadScenario(scenario);
    showScenarioPreview.value = true;
  } catch (err) {
    store.error = `导入失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// 导出 XML
function handleExport() {
  const scenario = store.currentScenario;
  if (!scenario) return;
  try {
    const xmlContent = xmlExporter.export(scenario);
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = scenario.scenarioMetadata?.name ?? scenario.id;
    a.download = `${name}-${Date.now()}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    store.error = `导出失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// 过滤 JSON 只展示分析文字
function stripJsonFromContent(content: string): string {
  let text = content;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/```json[\s\S]*?```/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  const detailIndex = text.indexOf("【方案详情】");
  if (detailIndex !== -1) text = text.substring(0, detailIndex);
  text = text.replace(/^\s*\{[\s\S]*\}\s*$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text || "正在分析中...";
}
</script>

<template>
  <div class="ai-panel">
    <!-- 聊天历史 -->
    <div class="chat-history" ref="chatHistoryEl">
      <div
        v-for="msg in store.chatHistory"
        :key="msg.id"
        class="chat-msg"
        :class="getMsgClass(msg.role)"
      >
        <template v-if="msg.role === 'user'">
          <div class="msg-content msg-user-content">{{ msg.content }}</div>
        </template>

        <template v-else>
          <!-- 思维链消息 -->
          <template v-if="!msg.scenario">
            <div class="analysis-label">战术分析</div>
            <div class="thinking-content">
              {{ stripJsonFromContent(msg.content) }}
            </div>
          </template>

          <!-- 最终方案消息 -->
          <template v-else>
            <div class="msg-content msg-ai-content">{{ msg.content }}</div>
            <template
              v-if="msg === store.chatHistory[store.chatHistory.length - 1]"
            >
              <button
                class="preview-toggle"
                @click="showScenarioPreview = !showScenarioPreview"
              >
                {{ showScenarioPreview ? "隐藏" : "显示" }}方案详情
              </button>
              <ScenarioPreview
                v-if="showScenarioPreview"
                :scenario="msg.scenario"
              />
            </template>
          </template>
        </template>
      </div>

      <!-- 生成中指示器 -->
      <div
        v-if="store.isGenerating && !store.thinkingChain"
        class="chat-msg msg-assistant"
      >
        <div class="msg-content msg-ai-content generating">
          <span>正在生成战术方案</span>
          <span class="dots">...</span>
        </div>
      </div>

      <div v-if="store.error" class="chat-error">{{ store.error }}</div>
    </div>

    <!-- 底部操作区 -->
    <div class="bottom-action-area">
      <!-- 导入 / 导出 / 清空 -->
      <div class="toolbar-row">
        <div class="action-group">
          <button class="icon-action-btn" @click="handleImport" title="导入">
            <img :src="uploadIcon" class="btn-icon" alt="导入" />
            <span>导入</span>
          </button>
          <button
            class="icon-action-btn"
            :disabled="!store.currentScenario"
            @click="handleExport"
            title="导出"
          >
            <img :src="downloadIcon" class="btn-icon" alt="导出" />
            <span>导出</span>
          </button>
        </div>
        <button
          class="icon-action-btn clear-btn"
          :disabled="!store.currentScenario"
          @click="store.clearMap()"
          title="清空"
        >
          <span class="clear-icon">⟠</span>
          <span>清空</span>
        </button>
      </div>

      <!-- 输入框和发送按钮的容器 -->
      <div class="input-container">
        <textarea
          v-model="inputText"
          class="input-field"
          placeholder="请输入资源筛选条件"
          rows="3"
          @keydown="handleKeydown"
        />
        <button
          class="send-btn"
          :style="{ backgroundImage: `url(${sendBgIcon})` }"
          :disabled="!inputText.trim() || store.isGenerating"
          @click="handleSend"
        >
          <img :src="sendIcon" class="send-icon" alt="" />
          <span>{{ store.isGenerating ? "生成中..." : "发送" }}</span>
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".xml,.json,.txt"
      style="display: none"
      @change="onFileSelected"
    />
  </div>
</template>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── 聊天历史 ── */
.chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 16px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
.chat-history::-webkit-scrollbar {
  width: 4px;
}
.chat-history::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(107, 196, 255, 0.2);
}

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.analysis-label {
  color: #7db9ff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.msg-content {
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 8px;
  word-break: break-word;
}

.msg-user-content {
  background: rgba(28, 80, 160, 0.28);
  border: 1px solid rgba(73, 137, 255, 0.28);
  color: #e2ebfb;
  align-self: flex-end;
  max-width: 88%;
}

.msg-ai-content {
  background: rgba(6, 20, 46, 0.55);
  border: 1px solid rgba(73, 137, 255, 0.16);
  color: #b0c4d8;
}

.thinking-content {
  font-size: 12px;
  color: #6a7a9a;
  line-height: 1.6;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  white-space: pre-wrap;
  font-family: "SF Mono", Monaco, Consolas, monospace;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.generating {
  color: #6bc4ff;
}
.dots {
  animation: blink 1s steps(3) infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  33% {
    opacity: 0.3;
  }
}

.preview-toggle {
  background: none;
  border: none;
  color: #6bc4ff;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.chat-error {
  font-size: 12px;
  color: #ff6b6b;
  padding: 8px 10px;
  background: rgba(255, 68, 68, 0.08);
  border: 1px solid rgba(255, 68, 68, 0.25);
  border-radius: 6px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: flex-end;
  padding-bottom: 4px;
}
.empty-hint {
  font-size: 13px;
  color: #3a4a5a;
}

/* ── 底部操作区 ── */
.bottom-action-area {
  padding: 0 16px 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.action-group {
  display: flex;
  gap: 20px;
}

.icon-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #8ea4c9;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  transition: color 0.15s;
}
.icon-action-btn:hover:not(:disabled) {
  color: #e2ebfb;
}
.icon-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-icon {
  width: 16px;
  height: 16px;
  opacity: 0.85;
  object-fit: contain;
}
.icon-action-btn:hover:not(:disabled) .btn-icon {
  opacity: 1;
}

.clear-btn {
  color: #8ea4c9;
}
.clear-icon {
  font-size: 14px;
  margin-right: 2px;
  opacity: 0.85;
}

/* ── 输入区 ── */
.input-container {
  position: relative;
  background: rgba(15, 30, 60, 0.4);
  border: 1px solid rgba(73, 137, 255, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}

.input-field {
  width: 100%;
  background: transparent;
  border: none;
  color: #e2ebfb;
  font-size: 14px;
  padding: 12px 14px;
  min-height: 100px;
  resize: none;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  line-height: 1.5;
}
.input-field::placeholder {
  color: #5a6a8a;
}

.send-btn {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 70px;
  height: 25px;
  padding: 0;
  border: none;
  background-color: transparent;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s;
}
.send-btn:hover:not(:disabled) {
  opacity: 0.9;
}
.send-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.send-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
}

.send-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
</style>
