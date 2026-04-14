// apps/web/src/stores/tactical-scenario.ts
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type {
  TacticalScenario,
  ChatMessage,
  ExecutionStatus,
  Phase,
} from '../types/tactical-scenario';
import { AiTacticalService } from '../services/ai-tactical';
import type { MapRenderer } from '../services/map-renderer';
import type { ExecutionEngine } from '../services/execution-engine';

const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

export const useTacticalScenarioStore = defineStore('tacticalScenario', () => {
  // 状态
  const currentScenario = shallowRef<TacticalScenario | null>(null);
  const chatHistory = ref<ChatMessage[]>([]);
  const executionStatus = ref<ExecutionStatus>('idle');
  const currentPhaseIndex = ref(0);
  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  // AI 服务（延迟初始化）
  let aiService: AiTacticalService | null = null;

  // 引擎引用（由外部注入）
  let executionEngine: ExecutionEngine | null = null;
  let mapRenderer: MapRenderer | null = null;

  function initEngine(engine: ExecutionEngine, renderer: MapRenderer) {
    executionEngine = engine;
    mapRenderer = renderer;

    engine.setOnStatusChange((status) => {
      executionStatus.value = status;
    });

    engine.setOnPhaseComplete(() => {
      currentPhaseIndex.value++;
    });

    engine.setOnEventTrigger((event) => {
      addSystemMessage(`事件触发: ${event.detail}`);
    });
  }

  function ensureAiService() {
    if (!aiService) {
      if (!GROQ_KEY) {
        throw new Error('未配置 Groq API Key，请设置 VITE_GROQ_API_KEY 环境变量');
      }
      aiService = new AiTacticalService(GROQ_KEY);
    }
    return aiService;
  }

  // --- 对话操作 ---

  async function generateScenario(userIntent: string) {
    isGenerating.value = true;
    error.value = null;

    addUserMessage(userIntent);

    try {
      const service = ensureAiService();
      const scenario = await service.generateScenario(userIntent);

      currentScenario.value = scenario;
      addAssistantMessage('战术方案已生成！点击"部署到地图"查看。', scenario);

      if (executionEngine && mapRenderer) {
        executionEngine.load(scenario);
        mapRenderer.renderScenario(scenario);
      }

      return scenario;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      error.value = msg;
      addAssistantMessage(`生成失败: ${msg}`);
      throw err;
    } finally {
      isGenerating.value = false;
    }
  }

  async function refineScenario(feedback: string) {
    if (!currentScenario.value) {
      throw new Error('当前没有战术方案可供修正');
    }

    isGenerating.value = true;
    error.value = null;

    addUserMessage(feedback);

    try {
      const service = ensureAiService();
      const refined = await service.refineScenario(currentScenario.value, feedback);

      currentScenario.value = refined;
      addAssistantMessage('方案已更新！', refined);

      if (executionEngine && mapRenderer) {
        executionEngine.load(refined);
        mapRenderer.renderScenario(refined);
      }

      return refined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '修正失败';
      error.value = msg;
      addAssistantMessage(`修正失败: ${msg}`);
      throw err;
    } finally {
      isGenerating.value = false;
    }
  }

  // --- 地图操作 ---

  function deployToMap() {
    if (!currentScenario.value || !mapRenderer) return;
    mapRenderer.renderScenario(currentScenario.value);
    mapRenderer.flyToScenario(currentScenario.value);
    addSystemMessage('方案已部署到地图');
  }

  function clearMap() {
    if (!mapRenderer || !executionEngine) return;
    mapRenderer.clearTacticalLayers();
    executionEngine.reset();
    currentPhaseIndex.value = 0;
    currentScenario.value = null;
    addSystemMessage('地图已清空');
  }

  // --- 执行控制 ---

  function play() {
    executionEngine?.play();
  }

  function pause() {
    executionEngine?.pause();
  }

  function nextPhase() {
    executionEngine?.nextPhase();
  }

  function prevPhase() {
    executionEngine?.prevPhase();
  }

  function reset() {
    executionEngine?.reset();
    currentPhaseIndex.value = 0;
  }

  // --- 辅助 ---

  function addUserMessage(content: string) {
    chatHistory.value.push({
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    });
  }

  function addAssistantMessage(content: string, scenario?: TacticalScenario) {
    chatHistory.value.push({
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      scenario,
    });
  }

  function addSystemMessage(content: string) {
    chatHistory.value.push({
      id: `msg-${Date.now()}-${Math.random()}`,
      role: 'assistant',
      content: `[系统] ${content}`,
      timestamp: Date.now(),
    });
  }

  function clearHistory() {
    chatHistory.value = [];
  }

  return {
    // 状态
    currentScenario,
    chatHistory,
    executionStatus,
    currentPhaseIndex,
    isGenerating,
    error,
    // 方法
    initEngine,
    generateScenario,
    refineScenario,
    deployToMap,
    clearMap,
    play,
    pause,
    nextPhase,
    prevPhase,
    reset,
    clearHistory,
  };
});
