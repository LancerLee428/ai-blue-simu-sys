// apps/web/src/stores/tactical-scenario.ts
import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type {
  TacticalScenario,
  ChatMessage,
  ExecutionStatus,
  Phase,
  EnvironmentConfig,
} from '../types/tactical-scenario';
import { AiTacticalService } from '../services/ai-tactical';
import { TacticalValidator } from '../services/tactical-validator';
import { WordExporter } from '../services/word-exporter';
import type { MapRenderer } from '../services/map-renderer';
import type { ExecutionEngine } from '../services/execution-engine';
import { normalizeTacticalScenario } from '../services/tactical-scenario-normalizer';
import { useActionPlanStore } from './action-plan';

const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY || '';

export const useTacticalScenarioStore = defineStore('tacticalScenario', () => {
  // 状态
  const currentScenario = shallowRef<TacticalScenario | null>(null);
  const chatHistory = ref<ChatMessage[]>([]);
  const executionStatus = ref<ExecutionStatus>('idle');
  const currentPhaseIndex = ref(0);
  const isGenerating = ref(false);
  const thinkingChain = ref<string>(''); // 思维链内容
  const error = ref<string | null>(null);

  // AI 服务（延迟初始化）
  let aiService: AiTacticalService | null = null;
  let wordExporter: WordExporter | null = null;

  // 战术验证器
  const validator = new TacticalValidator();

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
      if (!LLM_API_KEY) {
        throw new Error('未配置 LLM API Key，请设置 VITE_LLM_API_KEY 环境变量');
      }
      aiService = new AiTacticalService(LLM_API_KEY);
    }
    return aiService;
  }

  function ensureWordExporter() {
    if (!wordExporter) {
      wordExporter = new WordExporter();
    }
    return wordExporter;
  }

  // --- 对话操作 ---

  async function generateScenario(userIntent: string) {
    isGenerating.value = true;
    error.value = null;
    thinkingChain.value = '';

    addUserMessage(userIntent);

    // 添加一个空的思维链消息
    const thinkingMsgId = `msg-${Date.now()}-thinking`;
    chatHistory.value.push({
      id: thinkingMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    try {
      const service = ensureAiService();

      // 流式生成（单次，验证警告不阻断）
      let finalScenario: TacticalScenario | null = null;

      const streamGen = service.generateScenarioStream(userIntent, (text) => {
        thinkingChain.value += text;
        const msgIndex = chatHistory.value.findIndex(m => m.id === thinkingMsgId);
        if (msgIndex !== -1) {
          chatHistory.value[msgIndex].content = thinkingChain.value;
        }
      });

      // 消费流并获取最终结果
      let result = await streamGen.next();
      while (!result.done) {
        result = await streamGen.next();
      }
      finalScenario = result.value;

      if (!finalScenario) {
        throw new Error('方案生成失败');
      }

      // 执行战术验证（仅展示警告，不阻断方案）
      const validationResult = validator.validate(finalScenario);
      if (!validationResult.valid) {
        const warnings = validationResult.errors.map(e => e.message).join('\n');
        console.warn(`[战术验证] 方案存在约束问题:\n${warnings}`);
        addSystemMessage(`⚠️ 方案存在部分约束问题（可继续使用）:\n${warnings}`);
      }

      if (!finalScenario) {
        throw new Error('方案生成失败');
      }

      currentScenario.value = finalScenario;

      // 更新思维链消息
      const msgIndex = chatHistory.value.findIndex(m => m.id === thinkingMsgId);
      if (msgIndex !== -1) {
        chatHistory.value[msgIndex].scenario = finalScenario;
      }

      // 渲染到地图并自动定位
      if (executionEngine && mapRenderer) {
        executionEngine.load(finalScenario);
        mapRenderer.renderScenario(finalScenario);
        mapRenderer.flyToScenario(finalScenario);
      }

      // 自动创建 ActionPlan
      try {
        const actionPlanStore = useActionPlanStore();
        actionPlanStore.createPlan(finalScenario, finalScenario.summary);
      } catch (err) {
        console.error('Failed to create action plan:', err);
      }

      addAssistantMessage('战术方案已生成并部署到地图！', finalScenario);

      return finalScenario;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      error.value = msg;
      // 更新思维链消息为错误信息
      const msgIndex = chatHistory.value.findIndex(m => m.id === thinkingMsgId);
      if (msgIndex !== -1) {
        chatHistory.value[msgIndex].content = `生成失败: ${msg}`;
      }
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
    thinkingChain.value = '';

    addUserMessage(feedback);

    try {
      const service = ensureAiService();
      const refined = await service.refineScenario(currentScenario.value, feedback);

      currentScenario.value = refined;
      addAssistantMessage('方案已更新！', refined);

      // 渲染到地图并自动定位
      if (executionEngine && mapRenderer) {
        executionEngine.load(refined);
        mapRenderer.renderScenario(refined);
        mapRenderer.flyToScenario(refined);
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
    if (!mapRenderer) return;
    try {
      mapRenderer.clearTacticalLayers();
    } catch (err) {
      console.warn('Failed to clear tactical layers:', err);
    }
    try {
      executionEngine?.reset();
    } catch (err) {
      console.warn('Failed to reset execution engine:', err);
    }
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

  // --- XML 导入 ---

  function loadScenario(scenario: TacticalScenario) {
    const normalizedScenario = normalizeTacticalScenario(scenario);
    currentScenario.value = normalizedScenario;

    if (executionEngine && mapRenderer) {
      executionEngine.load(normalizedScenario);
      mapRenderer.renderScenario(normalizedScenario);
      mapRenderer.flyToScenario(normalizedScenario);
    }

    try {
      const actionPlanStore = useActionPlanStore();
      actionPlanStore.createPlan(
        normalizedScenario,
        normalizedScenario.scenarioMetadata?.name ?? normalizedScenario.summary,
      );
    } catch (err) {
      console.error('Failed to create action plan:', err);
    }

    addAssistantMessage(
      `XML 想定已导入：${normalizedScenario.scenarioMetadata?.name ?? normalizedScenario.id}`,
      normalizedScenario,
    );
  }

  function updateEnvironment(environment: EnvironmentConfig) {
    if (!currentScenario.value) return;
    currentScenario.value = {
      ...currentScenario.value,
      environment,
    };
    addSystemMessage('环境配置已更新');
  }

  // --- 导出操作 ---

  async function exportToWord() {
    if (!currentScenario.value) {
      throw new Error('当前没有方案可导出');
    }

    try {
      const exporter = ensureWordExporter();
      await exporter.exportToWord(currentScenario.value, thinkingChain.value);
      addSystemMessage('方案已导出为 Word 文档');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败';
      error.value = msg;
      addSystemMessage(`导出失败: ${msg}`);
    }
  }

  return {
    // 状态
    currentScenario,
    chatHistory,
    executionStatus,
    currentPhaseIndex,
    isGenerating,
    thinkingChain,
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
    exportToWord,
    loadScenario,
    updateEnvironment,
  };
});
