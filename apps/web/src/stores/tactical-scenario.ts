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
import { XmlScenarioParser } from '../services/xml-scenario-parser';
import type { MapRenderer } from '../services/map-renderer';
import type { ExecutionEngine } from '../services/execution-engine';
import { useActionPlanStore } from './action-plan';
import demoScenarioXml from '../../../../data-example/东海联合打击-2024-1777165955760.xml?raw';

const LLM_API_KEY = import.meta.env.VITE_LLM_API_KEY || '';
const DEMO_STREAM_DELAY_MS = 18;

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
  let xmlParser: XmlScenarioParser | null = null;

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

  function ensureXmlParser() {
    if (!xmlParser) {
      xmlParser = new XmlScenarioParser();
    }
    return xmlParser;
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

  async function generateScenarioDemo(userIntent: string) {
    isGenerating.value = true;
    error.value = null;
    thinkingChain.value = '';

    addUserMessage(userIntent);

    const thinkingMsgId = `msg-${Date.now()}-demo-thinking`;
    chatHistory.value.push({
      id: thinkingMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    try {
      const streamText = buildDemoAnalysis(userIntent);
      await streamAssistantText(thinkingMsgId, streamText);

      const scenario = ensureXmlParser().parse(demoScenarioXml);
      const validationResult = validator.validate(scenario);
      if (!validationResult.valid) {
        console.warn(
          `[离线演示] 方案存在约束提示:\n${validationResult.errors.map(e => e.message).join('\n')}`,
        );
      }

      applyGeneratedScenario(scenario);
      addAssistantMessage('战术方案已生成，已完成兵力编组、行动路线与关键打击任务部署。', scenario);

      return scenario;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败';
      error.value = msg;
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

  function buildDemoAnalysis(userIntent: string): string {
    const intent = userIntent.trim() || '东海方向联合打击任务';
    return [
      `收到任务需求：“${intent}”。正在抽取作战区域、交战双方、任务目标与约束条件。\n\n`,
      '已识别当前任务属于东海方向多域联合打击样式，重点围绕红方海空兵力协同突防、蓝方岛链防御体系压制、预警探测节点削弱展开。\n\n',
      '正在评估战场环境：海域范围覆盖东海至冲绳周边，气象条件整体稳定，能见度和海况满足舰机协同机动、远程探测与精确打击窗口要求。\n\n',
      '正在编组兵力：红方以航母编队、驱逐舰、潜艇、歼-16、歼-16D、无人机和地面防空火力构成联合突击体系；蓝方以出云号、摩耶级驱逐舰、F-15J、E-2C、爱国者与 AN/TPY-2 构成防御体系。\n\n',
      '正在推演关键链路：红方电子战平台优先压缩蓝方预警探测半径，歼-16 编队沿预设航路接近 E-2C 预警机，蓝方 F-15J 尝试反舰拦截山东舰编队。\n\n',
      '正在生成行动路线与打击任务：红方主攻路线由东海方向向蓝方预警节点推进，蓝方拦截路线指向红方航母编队，双方在 T+60s 形成首轮交战事件。\n\n',
      '方案校核完成：兵力部署、探测范围、行动路线、打击任务、阶段事件与环境配置已形成一致的推演输入。正在完成地图部署与行动计划生成。',
    ].join('');
  }

  async function streamAssistantText(messageId: string, text: string) {
    for (let index = 0; index < text.length; index += 2) {
      const chunk = text.slice(index, index + 2);
      thinkingChain.value += chunk;
      const msgIndex = chatHistory.value.findIndex(m => m.id === messageId);
      if (msgIndex !== -1) {
        chatHistory.value[msgIndex].content = thinkingChain.value;
      }
      await waitWithRaf(DEMO_STREAM_DELAY_MS);
    }
  }

  function waitWithRaf(durationMs: number) {
    return new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (now: number) => {
        if (now - start >= durationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  function clearHistory() {
    chatHistory.value = [];
  }

  function applyGeneratedScenario(scenario: TacticalScenario) {
    currentScenario.value = scenario;

    if (executionEngine && mapRenderer) {
      executionEngine.load(scenario);
      mapRenderer.renderScenario(scenario);
      mapRenderer.flyToScenario(scenario);
    }

    try {
      const actionPlanStore = useActionPlanStore();
      actionPlanStore.createPlan(scenario, scenario.scenarioMetadata?.name ?? scenario.summary);
    } catch (err) {
      console.error('Failed to create action plan:', err);
    }
  }

  // --- XML 导入 ---

  function loadScenario(scenario: TacticalScenario) {
    applyGeneratedScenario(scenario);

    addAssistantMessage(
      `XML 想定已导入：${scenario.scenarioMetadata?.name ?? scenario.id}`,
      scenario,
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
    generateScenarioDemo,
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
