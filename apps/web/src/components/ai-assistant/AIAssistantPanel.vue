<!-- apps/web/src/components/ai-assistant/AIAssistantPanel.vue -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';
import { XmlScenarioParser } from '../../services/xml-scenario-parser';
import { XmlScenarioExporter } from '../../services/xml-scenario-exporter';
import { createScenarioXmlCopyExport } from '../../services/scenario-copy-exporter';
import { normalizeTacticalScenario } from '../../services/tactical-scenario-normalizer';
import type { TacticalScenario } from '../../types/tactical-scenario';
import PhaseTimeline from './PhaseTimeline.vue';
import ScenarioPreview from './ScenarioPreview.vue';

const store = useTacticalScenarioStore();
const inputText = ref('');
const showScenarioPreview = ref(false);
const chatHistoryEl = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const xmlParser = new XmlScenarioParser();
const xmlExporter = new XmlScenarioExporter();

// 自动滚动到底部
watch(() => store.chatHistory.length, async () => {
  await nextTick();
  if (chatHistoryEl.value) {
    chatHistoryEl.value.scrollTop = chatHistoryEl.value.scrollHeight;
  }
});

async function handleSend() {
  const text = inputText.value.trim();
  if (!text || store.isGenerating) return;
  inputText.value = '';
  try {
    await store.generateScenario(text);
    showScenarioPreview.value = true;
  } catch { /* error handled in store */ }
}

async function handleRefine() {
  const text = inputText.value.trim();
  if (!text || store.isGenerating) return;
  inputText.value = '';
  try {
    await store.refineScenario(text);
  } catch { /* error handled in store */ }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !store.isGenerating) {
    e.preventDefault();
    store.currentScenario ? handleRefine() : handleSend();
  }
}

function getMsgClass(role: string) {
  return role === 'user' ? 'msg-user' : 'msg-assistant';
}

async function handleExport() {
  try {
    await store.exportToWord();
  } catch {
    /* error handled in store */
  }
}

function handleImportXml() {
  fileInput.value?.click();
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (event.target as HTMLInputElement).value = '';
  try {
    const content = await file.text();
    const trimmed = content.trim();
    const scenario = file.name.toLowerCase().endsWith('.json') || trimmed.startsWith('{')
      ? normalizeTacticalScenario(JSON.parse(trimmed) as TacticalScenario)
      : xmlParser.parse(content);
    store.loadScenario(scenario);
    showScenarioPreview.value = true;
  } catch (err) {
    store.error = `XML 导入失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function handleExportXml() {
  const scenario = store.currentScenario;
  if (!scenario) return;
  try {
    const copy = createScenarioXmlCopyExport(scenario, new Date(), xmlExporter);
    downloadTextFile(copy.content, copy.fileName, 'application/xml');
    store.markScenarioSaved(`XML 副本已保存：${copy.fileName}`);
  } catch (err) {
    store.error = `XML 副本保存失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// 导出原始 JSON 数据，用于调试 XML 导出问题
function handleExportJson() {
  const scenario = store.currentScenario;
  if (!scenario) return;
  try {
    const jsonContent = JSON.stringify(scenario, null, 2);
    const name = scenario.scenarioMetadata?.name ?? scenario.id;
    downloadTextFile(jsonContent, `${name}-${Date.now()}.json`, 'application/json');
  } catch (err) {
    store.error = `JSON 导出失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function downloadTextFile(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 过滤掉消息内容中的 JSON 部分，只展示战术分析文字
 */
function stripJsonFromContent(content: string): string {
  let text = content;

  // 剥离 qwen3 的 <think>...</think> 标签
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // 移除 ```json ... ``` 代码块
  text = text.replace(/```json[\s\S]*?```/g, '');
  // 移除 ``` ... ``` 代码块（可能包含 JSON）
  text = text.replace(/```[\s\S]*?```/g, '');

  // 移除【方案详情】及之后的所有内容
  const detailIndex = text.indexOf('【方案详情】');
  if (detailIndex !== -1) {
    text = text.substring(0, detailIndex);
  }

  // 移除独立的 JSON 对象（以 { 开头到匹配的 } 结束）
  text = text.replace(/^\s*\{[\s\S]*\}\s*$/gm, '');

  // 清理多余空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text || '正在分析中...';
}
</script>

<template>
  <div class="ai-panel">
    <div class="chat-history" ref="chatHistoryEl">
      <div
        v-for="msg in store.chatHistory"
        :key="msg.id"
        class="chat-msg"
        :class="getMsgClass(msg.role)"
      >
        <template v-if="msg.role === 'user'">
          <div class="msg-role">我</div>
          <div class="msg-content">{{ msg.content }}</div>
        </template>

        <template v-else>
          <!-- 思维链消息 -->
          <template v-if="!msg.scenario">
            <div class="msg-role">🤔 战术分析</div>
            <div class="thinking-content">{{ stripJsonFromContent(msg.content) }}</div>
          </template>

          <!-- 最终方案消息 -->
          <template v-else>
            <div class="msg-role">📋 战术方案</div>
            <div class="msg-content">{{ msg.content }}</div>

            <template v-if="msg === store.chatHistory[store.chatHistory.length - 1]">
              <button class="preview-toggle" @click="showScenarioPreview = !showScenarioPreview">
                {{ showScenarioPreview ? '隐藏' : '显示' }}方案详情
              </button>
              <ScenarioPreview v-if="showScenarioPreview" :scenario="msg.scenario" />
            </template>
          </template>
        </template>
      </div>

      <!-- 正在生成中的加载指示器 -->
      <div v-if="store.isGenerating && !store.thinkingChain" class="chat-msg msg-assistant">
        <div class="msg-role">AI</div>
        <div class="msg-content generating">
          <span>正在生成战术方案</span>
          <span class="dots">...</span>
        </div>
      </div>

      <div v-if="store.error" class="chat-error">{{ store.error }}</div>
    </div>

    <PhaseTimeline
      v-if="store.currentScenario"
      :phases="store.currentScenario.phases"
      :current-phase-index="store.currentPhaseIndex"
      :execution-status="store.executionStatus"
      @execute="store.play()"
      @pause="store.pause()"
      @next="store.nextPhase()"
      @prev="store.prevPhase()"
      @reset="store.reset()"
    />

    <div class="panel-actions-row">
      <button
        class="action-btn action-btn-primary"
        :disabled="!store.currentScenario"
        @click="store.deployToMap()"
      >
        📍 部署
      </button>
      <button
        class="action-btn action-btn-secondary"
        :disabled="!store.currentScenario"
        @click="handleExport"
      >
        📄 Word
      </button>
      <button
        class="action-btn action-btn-secondary"
        @click="handleImportXml"
      >
        📥 导入
      </button>
      <button
        class="action-btn"
        :class="store.hasUnsavedScenarioEdit ? 'action-btn-primary' : 'action-btn-secondary'"
        :disabled="!store.currentScenario"
        @click="handleExportXml"
      >
        {{ store.hasUnsavedScenarioEdit ? '💾 保存副本*' : '💾 保存副本' }}
      </button>
      <button
        class="action-btn action-btn-secondary"
        :disabled="!store.currentScenario"
        @click="handleExportJson"
      >
        📋 导出 JSON
      </button>
      <button
        class="action-btn action-btn-danger"
        :disabled="!store.currentScenario"
        @click="store.clearMap()"
      >
        🗑 清空
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".xml,.json,.txt"
      style="display: none"
      @change="onFileSelected"
    />

    <div class="input-area">
      <textarea
        v-model="inputText"
        class="input-field"
        :placeholder="store.currentScenario
          ? '补充或修改方案...'
          : '描述你的战术意图，如：在台湾北部部署蓝方防御力量，阻止红方从东侧突防...'"
        rows="3"
        @keydown="handleKeydown"
      />
      <div class="input-footer">
        <button
          class="send-btn"
          :disabled="!inputText.trim() || store.isGenerating"
          @click="store.currentScenario ? handleRefine() : handleSend()"
        >
          {{ store.currentScenario
            ? (store.isGenerating ? '生成中...' : '修正方案')
            : (store.isGenerating ? '生成中...' : '发送') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.chat-msg { display: flex; flex-direction: column; gap: 4px; }

.msg-role {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: #4a5a6a;
  letter-spacing: 0.05em;
}
.msg-user .msg-role { color: #6bc4ff; }
.msg-assistant .msg-role { color: #00d6c9; }

/* 思维链样式 */
.thinking-content {
  font-size: 12px;
  color: #9ab;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(107, 196, 255, 0.15);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  animation: fadeIn 0.3s ease;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 消息内容 */
.msg-content {
  font-size: 13px;
  color: #b0c4d8;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.msg-user .msg-content {
  background: rgba(107, 196, 255, 0.08);
  border-color: rgba(255, 68, 68, 0.15);
}
.msg-content.generating { color: #6bc4ff; }
.msg-content .dots { animation: blink 1s steps(3) infinite; }
@keyframes blink {
  0%, 100% { opacity: 1; }
  33% { opacity: 0.3; }
}
.preview-toggle {
  background: none;
  border: none;
  color: #6bc4ff;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  margin-top: 4px;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.chat-error {
  font-size: 12px;
  color: #ff6b6b;
  padding: 8px;
  background: rgba(255, 68, 68, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(255, 68, 68, 0.3);
}

.panel-actions-row {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  flex-shrink: 0;
  border-top: 1px solid rgba(107, 196, 255, 0.1);
  flex-wrap: wrap;
}
.action-btn {
  flex: 1;
  min-width: 0;
  padding: 7px 4px;
  border-radius: 6px;
  border: 1px solid rgba(107, 196, 255, 0.25);
  background: rgba(107, 196, 255, 0.08);
  color: #6bc4ff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.action-btn:hover:not(:disabled) { background: rgba(107, 196, 255, 0.18); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn-primary {
  background: rgba(0, 214, 201, 0.15);
  border-color: rgba(0, 214, 201, 0.4);
  color: #00d6c9;
}
.action-btn-secondary {
  background: rgba(107, 196, 255, 0.15);
  border-color: rgba(107, 196, 255, 0.4);
  color: #6bc4ff;
}
.action-btn-danger {
  background: rgba(255, 68, 68, 0.1);
  border-color: rgba(255, 68, 68, 0.25);
  color: #ff6b6b;
}

.input-area {
  padding: 12px;
  flex-shrink: 0;
  border-top: 1px solid rgba(107, 196, 255, 0.15);
}
.input-field {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(107, 196, 255, 0.2);
  border-radius: 8px;
  color: #e2ebfb;
  font-size: 13px;
  padding: 10px;
  resize: none;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.input-field:focus { border-color: rgba(107, 196, 255, 0.5); }
.input-field::placeholder { color: #3a4a5a; }
.input-footer { display: flex; justify-content: flex-end; margin-top: 8px; }
.send-btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  background: linear-gradient(135deg, #00d6c9, #00a8b3);
  color: #000;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.send-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
</style>
