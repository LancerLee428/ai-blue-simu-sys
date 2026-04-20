// apps/web/src/services/ai-tactical.ts
import type { TacticalScenario } from '../types/tactical-scenario';
import { PLATFORM_META } from '../types/tactical-scenario';
import { RouteGenerator, type RouteIntent } from './route-generator';
import { DetectionResolver, type DetectionIntent } from './detection-resolver';

const API_URL = '/api/llm/chat/completions';
const MODEL = 'deepseek-v3-0324';

const SYSTEM_PROMPT = `你是军事战术方案生成助手。用户描述战术意图后，先简要分析，然后生成JSON方案。

你只负责战术决策（部署位置、攻防关系、进近方式），路线航路点和探测半径由系统自动计算。

**部署坐标（从中选择，允许±0.3°微调）**：
蓝方陆地基地: 那霸(127.68,26.21) 嘉手纳(127.77,26.36) 筑城(131.04,33.69) 新田原(131.45,32.08) 横须贺港(139.67,35.29) 佐世保港(129.72,33.17)
蓝方前沿岛链: 先岛群岛(124.2,24.4) 与那国岛(123.0,24.5)
红方陆地基地: 惠安(118.8,24.9) 龙田(119.62,25.47) 路桥(121.39,28.57) 衢州(118.87,28.97) 水门(116.6,23.4) 福州(119.3,26.1)
红方海域: 厦门海域(118.5,24.0) 温州海域(120.5,26.5) 东海舰队(122.0,27.5)
公海机动区: 东海(124-128,26-30) 台东海域(123-126,22-25) 冲绳南(126-128,24-26)

**硬约束**：蓝方禁入lon≤125&lat18-53(中国)和lon119-122&lat21-25(台湾)；红方禁入lon≥129&lat30-46(日本)

**实体类型及高度规则（altitude单位：米）**：

[空中力量] — 作战时必须在空中，altitude 必须 > 0：
  air-fighter    战斗机       altitude: 8000-12000（巡航），500-1000（停机坪）
  air-multirole  多用途战斗机  altitude: 8000-12000（巡航）
  air-bomber     轰炸机       altitude: 6000-10000（巡航）
  air-jammer     电子战机     altitude: 8000-10000（巡航）
  air-aew        预警机       altitude: 9000-12000（巡航）
  air-recon      侦察机       altitude: 10000-15000（巡航）
  helo-attack    武装直升机   altitude: 500-2000（低空飞行）
  helo-transport 运输直升机   altitude: 300-1500（低空飞行）
  uav-strike     察打无人机   altitude: 3000-6000（巡航）
  uav-recon      侦察无人机   altitude: 4000-8000（巡航）
  uav-swarm      无人机蜂群   altitude: 200-800（低空飞行）

[海上力量] — 部署在海面（altitude必须为0），潜艇可为负值：
  ship-carrier    航空母舰  altitude: 0
  ship-destroyer  驱逐舰    altitude: 0
  ship-frigate    护卫舰    altitude: 0
  ship-submarine  潜艇      altitude: 0（水面）或 -50 至 -300（水下巡逻）
  ship-amphibious 两栖舰    altitude: 0
  ship-usv        无人艇    altitude: 0

[地面力量] — 部署在陆地（altitude必须为0）：
  ground-tank    坦克      altitude: 0
  ground-ifv     步兵战车   altitude: 0
  ground-spg      自行火炮   altitude: 0
  ground-mlrs     多管火箭炮 altitude: 0
  ground-sam      防空导弹   altitude: 0（导弹升空是事件，静态 SAM 系统 altitude=0）
  ground-radar   雷达站    altitude: 0
  ground-ew      电子战车   altitude: 0
  ground-hq      指挥所    altitude: 0

[设施] — 固定在陆地（altitude必须为0）：
  facility-airbase  机场/基地  altitude: 0
  facility-port     港口        altitude: 0
  facility-command  指挥中心    altitude: 0
  facility-radar    固定雷达站  altitude: 0
  facility-target   打击目标    altitude: 0

**严禁行为**：
- 地面/设施类型 altitude > 500（雷达站不能飞在天上）
- 海面舰艇（非潜艇）altitude ≠ 0
- 在禁区内部署对应阵营实体

**兵力配平原则**（重要）：
- 红蓝双方实体总数必须大致对等，差异不超过 ±20%
- 例如红方 15 个实体，蓝方应有 12~18 个实体，不能只有 3 个
- 若用户要求补充某方兵力，必须补充到与对方相当的数量
- 各作战域（空/海/地）的力量分配应符合想定场景，不能只补充单一类型

**进攻路线生成规则**（重要）：
- 进攻/打击类实体（air-fighter、air-bomber、uav-strike、ship-destroyer 等）必须生成路线
- 每条进攻路线必须有明确的目标（targetEntityId = 敌方实体ID）
- 同一目标可以用不同路线类型（direct、flanking-north、flanking-south、low-altitude）多路进攻
- 支援/感知类实体（air-aew、air-recon、ground-radar、ground-sam 等）可选生成路线
- 路线数量建议：进攻方主力应至少 3-5 条路线，体现多方向协同
- 路线必须经过路线生成器自动插值，不需要给出中间点坐标

**输出**：先【战术分析】再【方案详情】JSON。

JSON格式:
{"id":"scenario-xxx","version":1,"summary":"描述",
"forces":[{"side":"red|blue","name":"部队名","entities":[{"id":"entity-xxx","name":"名称","type":"air-fighter|air-multirole|air-bomber|air-jammer|air-aew|air-recon|helo-attack|helo-transport|uav-strike|uav-recon|uav-swarm|ship-carrier|ship-destroyer|ship-frigate|ship-submarine|ship-amphibious|ship-usv|ground-tank|ground-ifv|ground-spg|ground-mlrs|ground-sam|ground-radar|ground-ew|ground-hq|facility-airbase|facility-port|facility-command|facility-radar|facility-target","side":"red|blue","position":{"longitude":0,"latitude":0,"altitude":0}}]}],
"routeIntents":[{"entityId":"谁移动","targetEntityId":"打谁","side":"red|blue","approach":"direct|flanking-north|flanking-south|low-altitude","label":"描述"}],
"detectionIntents":[{"entityId":"谁探测","type":"radar|sonar|ew|optical","side":"red|blue"}],
"strikeTasks":[{"id":"strike-xxx","attackerEntityId":"xxx","targetEntityId":"xxx","phaseId":"phase-xxx","timestamp":30,"detail":"描述"}],
"phases":[{"id":"phase-xxx","name":"阶段名","description":"描述","duration":60,"events":[{"type":"movement|detection|attack|destruction","timestamp":0,"sourceEntityId":"xxx","targetEntityId":"xxx","detail":"描述"}],"entityStates":[{"entityId":"xxx","position":{"longitude":0,"latitude":0,"altitude":0},"status":"planned|deployed|engaged|destroyed"}]}],
"metadata":{"generatedAt":"ISO时间","modelUsed":"model","confidence":0.85}}

routeIntents的targetEntityId必须是敌方实体ID。坐标必须从参考坐标选择。altitude必须按高度规则设置，不要全设0。所有ID唯一一致。不要输出思考过程标签。`;

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

  /**
   * 生成战术想定（流式版本）
   */
  async *generateScenarioStream(
    userIntent: string,
    onChunk: (text: string) => void,
  ): AsyncGenerator<StreamChunk, TacticalScenario, void> {
    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userIntent },
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
        max_tokens: 4096,
        stream: true,
      } satisfies GroqRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 错误: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('API 返回空响应体');
    }

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
          if (line.startsWith('data: ')) {
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
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { content: '', done: true };
    return this.parseAndPostProcess(fullContent);
  }

  /**
   * 生成战术想定（非流式版本）
   */
  async generateScenario(userIntent: string): Promise<TacticalScenario> {
    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userIntent },
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
        max_tokens: 4096,
        stream: false,
      } satisfies GroqRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API 错误: ${response.status} - ${error}`);
    }

    const data: GroqResponse = await response.json();
    if (data.error) {
      throw new Error(`Groq API 错误: ${data.error.type} - ${data.error.message}`);
    }
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Groq API 返回空内容');
    }

    return this.parseAndPostProcess(content);
  }

  /**
   * 解析 AI 输出并进行后处理（路线插值、探测范围分配）
   */
  private parseAndPostProcess(raw: string): TacticalScenario {
    const parsed = this.parseRawJson(raw);

    // 后处理 1：将声明式 routeIntents 转换为实际路线
    if ((parsed as any).routeIntents) {
      const intents: RouteIntent[] = (parsed as any).routeIntents;
      const routes = intents
        .map(intent => this.routeGenerator.generateFromIntent(intent, parsed))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      parsed.routes = routes;
      delete (parsed as any).routeIntents;
    }

    // 后处理 1b：如果 AI 给了旧格式 routes，修补终点
    if (parsed.routes && !(parsed as any).routeIntents) {
      parsed.routes = parsed.routes.map(route =>
        this.routeGenerator.fixRouteEndpoint(route, parsed)
      );
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
   * 根据平台类型自动补全缺失或为 0 的高度
   * 数据来源：PLATFORM_META.defaultAltitude（统一维护，无需在此处重复）
   */
  private fixAltitudes(scenario: TacticalScenario): void {
    scenario.forces.forEach(force => {
      force.entities.forEach(entity => {
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

    try {
      const parsed = JSON.parse(jsonStr) as TacticalScenario;

      if (!parsed.forces || !Array.isArray(parsed.forces)) {
        throw new Error('missing forces array');
      }
      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        throw new Error('missing phases array');
      }

      if (!parsed.metadata) {
        parsed.metadata = { generatedAt: new Date().toISOString(), modelUsed: MODEL, confidence: 0.85 };
      }
      if (!parsed.id) {
        parsed.id = `scenario-${Date.now()}`;
      }

      return parsed;
    } catch (err) {
      throw new Error(`战术方案 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 修正方案（追加反馈）
   */
  async refineScenario(
    scenario: TacticalScenario,
    feedback: string
  ): Promise<TacticalScenario> {
    const contextPrompt = `
当前战术方案：
${JSON.stringify({
  id: scenario.id,
  version: scenario.version,
  forces: scenario.forces,
  phases: scenario.phases,
  routes: scenario.routes,
  strikeTasks: scenario.strikeTasks,
  detectionZones: scenario.detectionZones,
}, null, 2)}

用户反馈：${feedback}
请根据反馈修改方案，保留所有 ID 和结构不变，只调整对应字段。
可以使用 routeIntents 和 detectionIntents 声明式格式，系统会自动处理。
`;

    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextPrompt },
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
        max_tokens: 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API 错误: ${response.status} - ${error}`);
    }

    const data: GroqResponse = await response.json();
    if (data.error) {
      throw new Error(`Groq API 错误: ${data.error.type} - ${data.error.message}`);
    }
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Groq API 返回空内容');

    const refined = this.parseAndPostProcess(content);
    refined.version = scenario.version + 1;
    return refined;
  }
}
