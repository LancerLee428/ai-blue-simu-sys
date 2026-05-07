// apps/web/src/services/ai-tactical.ts
import type { TacticalScenario } from '../types/tactical-scenario';
import { PLATFORM_META } from '../types/tactical-scenario';
import { RouteGenerator, type RouteIntent } from './route-generator';
import { DetectionResolver, type DetectionIntent } from './detection-resolver';
import stripJsonComments from 'strip-json-comments';

const API_URL = '/api/llm/chat/completions';
const MODEL = 'deepseek-v3-0324';

/** 阶段一：生成战术骨架（不含 components / tasks / environment / interactions） */
const SKELETON_PROMPT = `你是军事仿真想定生成助手。根据用户意图先输出【战术分析】，再输出【方案详情】JSON骨架。

**骨架JSON结构**（禁止在骨架中输出 components / tasks / environment / interactions，这些将单独生成）：
{
  "id": "scenario-xxx", "version": 1, "summary": "简述",
  "scenarioMetadata": {"name","version","description","author","createTime","category","tags":[]},
  "metadata": {"generatedAt","modelUsed":"deepseek-v3-0324","confidence":0.85,"startTime","endTime"},
  "forces": [{"side":"red|blue","name":"力量名","entities":[
    {"id":"唯一ID","name":"名称","type":"实体类型","side":"red|blue",
     "position":{"longitude":经度,"latitude":纬度,"altitude":高度},
     "loadout":{"weapons":["武器ID"],"sensors":["传感器ID"]},
     "modelId":"模型ID","modelType":"同构|外部异构"}
  ]}],
  "routeIntents": [{"entityId","targetEntityId","side","approach","label"}],
  "detectionIntents": [{"entityId","type","side"}],
  "strikeTasks": [{"id","attackerEntityId","targetEntityId","phaseId","timestamp","detail"}],
  "phases": [{"id","name","description","duration","events":[{"type":"attack","timestamp","sourceEntityId","targetEntityId","detail"}],"entityStates":[]}]
}

**卫星实体（satellite-*）无 position 字段**，其余所有实体必须有 position。

**实体类型与高度（单位：米）**：
- 空中: air-fighter(8000-12000) air-multirole air-bomber(6000-10000) air-jammer(8000-10000) air-aew(9000-12000) air-recon(10000-15000) helo-attack(500-2000) helo-transport(300-1500) uav-strike(3000-6000) uav-recon(4000-8000) uav-swarm(200-800)
- 海上: ship-carrier ship-destroyer ship-frigate ship-amphibious ship-usv(0) ship-submarine(0或-50~-300)
- 地面/设施: ground-tank ground-ifv ground-spg ground-mlrs ground-sam ground-radar ground-ew ground-hq facility-airbase facility-port facility-command facility-radar facility-target（以上全部 altitude=0）
- 航天: satellite-recon satellite-comm satellite-nav satellite-ew

**部署坐标（±0.3°微调）**：
蓝方: 那霸(127.68,26.21) 嘉手纳(127.77,26.36) 筑城(131.04,33.69) 新田原(131.45,32.08) 横须贺(139.67,35.29) 佐世保(129.72,33.17) 先岛(124.2,24.4) 与那国(123.0,24.5)
红方: 惠安(118.8,24.9) 龙田(119.62,25.47) 路桥(121.39,28.57) 衢州(118.87,28.97) 福州(119.3,26.1) 厦门(118.5,24.0) 温州(120.5,26.5) 东海舰队(122.0,27.5)
公海: 东海(124-128,26-30) 台东(123-126,22-25) 冲绳南(126-128,24-26)

**硬约束**：蓝方禁入 lon≤125(中国大陆) 和 lon119-122&lat21-25(台湾)；红方禁入 lon≥129&lat30-46(日本)

**兵力配平**：红蓝实体数量差异≤20%

**routeIntents**（进攻类实体必填）：approach 可选 direct / flanking-north / flanking-south / low-altitude；targetEntityId 必须是敌方实体ID

**detectionIntents**（感知/防御平台必填）：type 可选 radar / sonar / ew / optical

**武器挂载要求**：
- 参与攻击的实体必须提供 loadout.weapons
- 常用武器ID只允许使用已知库：aim-120d, aim-9x, aim-260, harpoon, yj-18, hq-9, sm-6, agm-88, agm-154, storm-shadow
- 感知平台尽量提供 loadout.sensors，例如 radar, sonar, ew-suite

**攻击事件要求**：
- 每个 strikeTask 必须对应某个 phase 内一条 type:"attack" 的 event
- 不要输出 weapon-launch 或 weapon-impact，这些由系统运行时自动派生

**输出格式**：先【战术分析】自然语言，再【方案详情】纯JSON（无注释，无尾随逗号）`;

/** 阶段二：基于骨架实体列表生成装备详细配置 */
const DETAIL_PROMPT = `你是军事仿真装备配置助手。给定战术骨架的实体列表，为关键装备生成详细配置。

**严格输出纯JSON**，格式如下：
{
  "components": [
    {"entityId":"实体ID","items":[
      {"id":"comp_xxx","name":"组件名","type":"组件类型",
       "initialState":{...},
       "performanceParams":[{"key":"","value":"","unit":""}]}
    ]}
  ],
  "tasks": [{"id","equipRef","name","type":"BehaviorTree|StateMachine|InstructionSeq","config":{...}}],
  "environment": {"generationModels":{...},"effectModels":[...],"events":[]},
  "interactions": {"groups":[...],"commandControl":[...],"communications":[...],"detectionLinks":[]}
}

**组件类型**：
- 机动: space_mover(Keplerian: semiMajorAxis/eccentricity/inclination/raan/argOfPerigee/trueAnomaly/epoch) | facility_mover(Geodetic: longitude/latitude/altitude) | ship_mover | air_mover
- 传感器: sensor_optical(maxDetectRange/groundResolution/swathWidth) | sensor_radar(maxDetectRange/azimuthResolution) | sensor_sar | sensor_infrared
- 通信: comm_ka(frequency/downlinkRate) | comm_x | comm_uhf
- 控制/支持: maneuver_adcs(pointingAccuracy/stabilityRate) | support_eps(solarPanelArea/batteryCapacity) | support_thermal

**生成原则（控制输出体积）**：
- 卫星实体：必须生成完整组件（space_mover + 传感器 + 通信 + 控制 + 支持）
- 普通作战平台（战斗机/舰艇）：只生成机动组件（air_mover/ship_mover）+ 1个核心传感器，其余省略
- tasks：只为卫星、无人机、地面站生成，普通战术实体省略
- environment：有卫星则生成 spaceEnvironment，否则生成简单 atmosphereModel，effectModels 最多3条
- interactions.communications：只列主要链路，不超过5条

**输出必须是合法JSON：无注释，无尾随逗号**`;

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqRequest {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  response_format?: { type: string };
}

interface GroqResponse {
  choices: {
    message: { content: string };
    finish_reason: string;
  }[];
  error?: {
    message: string;
    type: string;
  };
}

// 流式事件类型
export interface StreamChunk {
  content: string;
  done: boolean;
}

export class AiTacticalService {
  private apiKey: string;
  private routeGenerator = new RouteGenerator();
  private detectionResolver = new DetectionResolver();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * 生成战术想定（流式版本）
   * 阶段一：流式生成骨架（forces + routeIntents + detectionIntents）
   * 阶段二：非流式补充 components / tasks / environment / interactions
   */
  async *generateScenarioStream(
    userIntent: string,
    onChunk: (text: string) => void,
  ): AsyncGenerator<StreamChunk, TacticalScenario, void> {
    // —— Phase 1: stream skeleton ——
    let skeletonRaw = '';
    const phaseOneGen = this.streamPhase(SKELETON_PROMPT, userIntent, onChunk);
    let next = await phaseOneGen.next();
    while (!next.done) {
      yield next.value as StreamChunk;
      next = await phaseOneGen.next();
    }
    skeletonRaw = next.value as string;

    const scenario = this.parseAndPostProcess(skeletonRaw);

    // —— Phase 2: enrich details (non-streaming) ——
    const detailMsg = '\n\n---\n[正在生成装备详细配置...]\n';
    onChunk(detailMsg);
    yield { content: detailMsg, done: false };
    try {
      await this.enrichWithDetails(scenario);
    } catch (e) {
      console.warn('[Phase2] 详细配置生成失败，使用骨架数据:', e);
    }

    yield { content: '', done: true };
    return scenario;
  }

  /**
   * 生成战术想定（非流式版本）
   * 同样分两阶段，适合后台批量生成
   */
  async generateScenario(userIntent: string): Promise<TacticalScenario> {
    // Phase 1
    const skeletonRaw = await this.callApi(
      SKELETON_PROMPT,
      [{ role: 'user', content: userIntent }],
      { stream: false, max_tokens: 16000 },
    );
    const scenario = this.parseAndPostProcess(skeletonRaw);

    // Phase 2
    try {
      await this.enrichWithDetails(scenario);
    } catch (e) {
      console.warn('[Phase2] 详细配置生成失败，使用骨架数据:', e);
    }
    return scenario;
  }

  /**
   * 解析 AI 输出并进行后处理（路线插值、探测范围分配）
   */
  private parseAndPostProcess(raw: string): TacticalScenario {
    const parsed = this.parseRawJson(raw);

    // 验证实体position字段完整性
    this.validateEntityPositions(parsed);

    // 后处理 1：将声明式 routeIntents 转换为实际路线
    if ((parsed as any).routeIntents) {
      const intents: RouteIntent[] = (parsed as any).routeIntents;
      const routes = intents
        .map(intent => {
          try {
            return this.routeGenerator.generateFromIntent(intent, parsed);
          } catch (err) {
            console.error(`[路线生成失败] intent:`, intent, err);
            return null;
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      parsed.routes = routes;
      delete (parsed as any).routeIntents;
    }

    // 后处理 1b：如果 AI 给了旧格式 routes，修补终点
    if (parsed.routes && !(parsed as any).routeIntents) {
      parsed.routes = parsed.routes.map(route => {
        try {
          return this.routeGenerator.fixRouteEndpoint(route, parsed);
        } catch (err) {
          console.error(`[路线修补失败] route:`, route, err);
          return route;
        }
      });
    }

    // 后处理 2：将声明式 detectionIntents 转换为实际探测范围
    if ((parsed as any).detectionIntents) {
      const intents: DetectionIntent[] = (parsed as any).detectionIntents;
      const zones = intents
        .map(intent => this.detectionResolver.resolveFromIntent(intent, parsed))
        .filter((z): z is NonNullable<typeof z> => z !== null);
      parsed.detectionZones = zones;
      delete (parsed as any).detectionIntents;
    }

    // 后处理 2b：如果 AI 给了旧格式 detectionZones，修补半径
    if (parsed.detectionZones && !(parsed as any).detectionIntents) {
      parsed.detectionZones = parsed.detectionZones.map(zone =>
        this.detectionResolver.fixDetectionZone(zone, parsed)
      );
    }

    // 后处理 3：为缺少探测范围的感知平台自动添加
    const autoZones = this.detectionResolver.autoAssignDetectionZones(parsed);
    if (autoZones.length > 0) {
      parsed.detectionZones = [...(parsed.detectionZones || []), ...autoZones];
    }

    // 确保 routes 和 detectionZones 始终存在
    if (!parsed.routes) parsed.routes = [];
    if (!parsed.detectionZones) parsed.detectionZones = [];
    if (!parsed.strikeTasks) parsed.strikeTasks = [];

    // 后处理 4：自动补全高度（AI 可能仍然全设 0）
    this.fixAltitudes(parsed);

    return parsed;
  }

  /**
   * 验证实体position字段完整性
   */
  private validateEntityPositions(scenario: TacticalScenario): void {
    const errors: string[] = [];

    scenario.forces.forEach((force, forceIdx) => {
      force.entities.forEach((entity, entityIdx) => {
        // 卫星使用轨道根数（Keplerian）描述位置，存放在 components[].initialState 中
        // 不存在 position 字段，跳过校验
        if (entity.type?.startsWith('satellite')) return;

        if (!entity.position) {
          errors.push(`forces[${forceIdx}].entities[${entityIdx}] (${entity.id || 'unknown'}) 缺少 position 字段`);
        } else {
          if (entity.position.latitude === undefined || entity.position.latitude === null) {
            errors.push(`实体 ${entity.id || 'unknown'} 的 position.latitude 未定义`);
          }
          if (entity.position.longitude === undefined || entity.position.longitude === null) {
            errors.push(`实体 ${entity.id || 'unknown'} 的 position.longitude 未定义`);
          }
          if (entity.position.altitude === undefined || entity.position.altitude === null) {
            errors.push(`实体 ${entity.id || 'unknown'} 的 position.altitude 未定义`);
          }
        }
      });
    });

    if (errors.length > 0) {
      throw new Error(`AI返回的实体位置数据不完整:\n${errors.join('\n')}`);
    }
  }

  /**
   * 根据平台类型自动补全缺失或为 0 的高度
   * 数据来源：PLATFORM_META.defaultAltitude（统一维护，无需在此处重复）
   */
  private fixAltitudes(scenario: TacticalScenario): void {
    scenario.forces.forEach(force => {
      force.entities.forEach(entity => {
        // 卫星无 position 字段，跳过高度补全
        if (!entity.position) return;

        const meta = PLATFORM_META[entity.type];
        if (!meta) return;

        const defaultAlt = meta.defaultAltitude;

        // 只对"高度为 0 但实际应当在空中"的实体补全
        // （海面/地面实体 defaultAltitude 本身就是 0，不会误改）
        if ((entity.position.altitude === 0 || entity.position.altitude === undefined) && defaultAlt !== 0) {
          entity.position.altitude = defaultAlt;
        }
      });
    });
  }

  /**
   * 解析原始 JSON 响应
   */
  private parseRawJson(raw: string): TacticalScenario {
    // 剥离 qwen3 的 <think>...</think> 思考标签
    let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 提取 ```json ... ``` 包裹的内容
    const jsonMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/) ||
                       cleaned.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, cleaned];

    let jsonStr = jsonMatch[1] ?? cleaned;

    // 如果有 【方案详情】 标记，只取标记后面的 JSON 部分
    const detailIndex = jsonStr.indexOf('【方案详情】');
    if (detailIndex !== -1) {
      jsonStr = jsonStr.substring(detailIndex + '【方案详情】'.length);
    }

    jsonStr = jsonStr.trim();

    // 尝试提取 JSON 对象
    const jsonStartIndex = jsonStr.indexOf('{');
    const jsonEndIndex = jsonStr.lastIndexOf('}');
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      jsonStr = jsonStr.substring(jsonStartIndex, jsonEndIndex + 1);
    }

    // 使用 strip-json-comments 库移除注释（兜底方案）
    // 这个库能安全地移除注释，不会误删字符串内的 // 或 /* */
    jsonStr = stripJsonComments(jsonStr);

    // 修复 AI 常见的尾随逗号问题（数组/对象末尾多余逗号）
    jsonStr = jsonStr
      .replace(/,\s*([}\]])/g, '$1')  // 移除 ] 或 } 前的尾随逗号
      .replace(/([{[,])\s*,/g, '$1'); // 移除连续逗号

    try {
      const parsed = JSON.parse(jsonStr) as TacticalScenario;

      if (!parsed.forces || !Array.isArray(parsed.forces)) {
        throw new Error('missing forces array');
      }
      // phases 为可选字段，AI 新格式下可能不生成，自动兜底为空数组
      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        parsed.phases = [];
      }

      if (!parsed.metadata) {
        parsed.metadata = { generatedAt: new Date().toISOString(), modelUsed: MODEL, confidence: 0.85 };
      }
      if (!parsed.id) {
        parsed.id = `scenario-${Date.now()}`;
      }

      return parsed;
    } catch (err) {
      // 打印出错位置附近的上下文，便于排查是截断还是格式问题
      if (err instanceof SyntaxError) {
        const posMatch = err.message.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1], 10);
          const start = Math.max(0, pos - 80);
          const end = Math.min(jsonStr.length, pos + 80);
          console.error(
            `[JSON解析] 出错位置 ${pos}/${jsonStr.length} 总长度，附近内容:\n` +
            JSON.stringify(jsonStr.substring(start, end))
          );
          if (pos >= jsonStr.length - 50) {
            throw new Error(`战术方案 JSON 被截断（位置 ${pos}，总长 ${jsonStr.length}）。请尝试减少实体数量或使用更简洁的想定描述。`);
          }
        }
      }
      throw new Error(`战术方案 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * 低级 API 调用（非流式）
   */
  private async callApi(
    systemPrompt: string,
    messages: GroqMessage[],
    opts: { stream?: boolean; max_tokens?: number },
  ): Promise<string> {
    const fullMessages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        temperature: 0.3,
        max_tokens: opts.max_tokens ?? 16000,
        stream: false,
      } satisfies GroqRequest),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API 错误: ${response.status} - ${err}`);
    }
    const data: GroqResponse = await response.json();
    if (data.error) throw new Error(`API 错误: ${data.error.type} - ${data.error.message}`);
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('API 返回空内容');
    return content;
  }

  /**
   * 流式调用，collect 全文后返回
   */
  private async *streamPhase(
    systemPrompt: string,
    userContent: string,
    onChunk: (text: string) => void,
  ): AsyncGenerator<StreamChunk, string, void> {
    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 16000,
        stream: true,
      } satisfies GroqRequest),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API 错误: ${response.status} - ${err}`);
    }
    if (!response.body) throw new Error('API 返回空响应体');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onChunk(delta);
              yield { content: delta, done: false };
            }
          } catch { /* ignore SSE parse errors */ }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return fullContent;
  }

  /**
   * 阶段二：补充 components / tasks / environment / interactions
   */
  private async enrichWithDetails(scenario: TacticalScenario): Promise<void> {
    // 提取实体摘要（不含 components，减少输入 token）
    const entitySummary = scenario.forces.flatMap(f =>
      f.entities.map(e => ({ id: e.id, name: e.name, type: e.type, side: e.side }))
    );
    const userMsg = `实体列表：\n${JSON.stringify(entitySummary, null, 2)}\n\n请生成装备详细配置。`;
    const raw = await this.callApi(
      DETAIL_PROMPT,
      [{ role: 'user', content: userMsg }],
      { max_tokens: 12000 },
    );
    this.mergeDetailPatch(scenario, raw);
  }

  /**
   * 将阶段二返回的 JSON patch 合并进 scenario
   */
  private mergeDetailPatch(scenario: TacticalScenario, raw: string): void {
    let patch: any;
    try {
      const jsonStr = this.extractJsonString(raw);
      patch = JSON.parse(jsonStr);
    } catch {
      console.warn('[Phase2] 详细配置 JSON 解析失败，跳过合并');
      return;
    }
    // Merge components
    if (Array.isArray(patch.components)) {
      for (const { entityId, items } of patch.components) {
        if (!Array.isArray(items)) continue;
        for (const force of scenario.forces) {
          const entity = force.entities.find(e => e.id === entityId);
          if (entity) (entity as any).components = items;
        }
      }
    }
    if (Array.isArray(patch.tasks)) (scenario as any).tasks = patch.tasks;
    if (patch.environment) (scenario as any).environment = patch.environment;
    if (patch.interactions) (scenario as any).interactions = patch.interactions;
  }

  /**
   * 从任意文本中提取第一个完整 JSON 对象字符串
   */
  private extractJsonString(raw: string): string {
    let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    // strip markdown fences
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) s = fence[1];
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1) s = s.substring(start, end + 1);
    return s;
  }

  /**
   * 修正方案（追加反馈）
   */
  async refineScenario(
    scenario: TacticalScenario,
    feedback: string
  ): Promise<TacticalScenario> {
    // 只把骨架字段（不含 components/tasks/environment）放进 context，避免超 token
    const skeleton = {
      id: scenario.id,
      version: scenario.version,
      forces: scenario.forces.map(f => ({
        ...f,
        entities: f.entities.map(({ id, name, type, side, position }: any) => ({ id, name, type, side, position })),
      })),
      phases: scenario.phases,
      strikeTasks: scenario.strikeTasks,
    };
    const contextPrompt =
      `当前骨架方案：\n${JSON.stringify(skeleton, null, 2)}\n\n用户反馈：${feedback}\n` +
      `请修改骨架方案，可用 routeIntents / detectionIntents 声明式格式，系统自动处理。`;

    const raw = await this.callApi(
      SKELETON_PROMPT,
      [{ role: 'user', content: contextPrompt }],
      { max_tokens: 16000 },
    );
    const refined = this.parseAndPostProcess(raw);
    refined.version = scenario.version + 1;
    // re-enrich details
    try { await this.enrichWithDetails(refined); } catch { /* best-effort */ }
    return refined;
  }
}
