// apps/web/src/services/ai-tactical.ts
import type { TacticalScenario } from '../types/tactical-scenario';

const GROQ_API_URL = '/api/groq/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `你是一个军事战术方案生成助手。用户描述战术意图后，先进行战术分析（思维链），然后生成包含以下要素的 JSON 方案：
- 红蓝双方兵力部署（每个实体的类型、名称、位置）
- 进攻路线（每个实体的移动路径点，每条路线至少3个中间点）
- 探测范围（每个感知平台的探测半径，单位米）
- 打击任务（攻击方 → 目标，时间节点，所属阶段）
- 行动阶段（至少2个阶段，每个阶段包含关键事件）

**重要约束**：
1. 所有地理坐标使用经纬度（longitude, latitude），altitude 单位为米
2. 探测范围半径 5000-150000 米
3. 路线至少包含起点、中间点、终点
4. 打击任务需指定属于哪个阶段（phaseId）和相对时间戳
5. 阶段时长由你根据战术复杂度估算
6. 每个兵力的部署位置必须给出【理由】：位置选择的地形优势、战术考量
7. 输出格式：先用【战术分析】说明你的思路，然后用【方案详情】呈现 JSON
8. JSON 是最终输出，不要在 JSON 中包含理由说明

**地域约束**：
- 红方（中国）只能部署在中国大陆（经度73-135，纬度18-53）、台湾岛（经度119-122，纬度21-25）及其领空
- 蓝方（日本）只能部署在日本本土（经度129-145，纬度30-46）、冲绳群岛（经度127-129，纬度25-27）及其领空
- 禁止任何一方出现在对方陆地上
- 双方可在公海、国际领空活动

**攻防逻辑约束**：
- 进攻路线必须有明确的攻击目标（路线终点必须接近目标实体50km范围内）
- 红方为主攻方，进攻路线方向应指向蓝方防御区域
- 蓝方为防守方，防御部署应覆盖本土防御方向
- 探测范围必须覆盖对方可能的威胁方向
- 每个探测范围内至少应该有一个潜在威胁目标

**兵力分散规则**：
- 同一方任意两个实体间距至少 10km
- 兵力部署要清晰展示数量，不能重叠
- 如果需要在同一区域部署多个实体，请拉开距离

**输出格式示例**：
【战术分析】
1. 红方主攻方向选择：从台湾岛东侧迂回...
2. 蓝方防御重点：北部重点防空覆盖...
3. 关键时间节点...

【方案详情】
{JSON内容}

**JSON Schema**（严格按照此格式输出，不要添加额外字段）：
{
  "id": "scenario-唯一ID",
  "version": 1,
  "summary": "方案一句话描述",
  "forces": [{
    "side": "red|blue",
    "name": "部队名称",
    "entities": [{
      "id": "entity-唯一ID",
      "name": "实体名称",
      "type": "aircraft-fighter|aircraft-bomber|aircraft-recon|aircraft-helicopter|ship|ground-vehicle|missile|drone",
      "side": "red|blue",
      "position": { "longitude": 0, "latitude": 0, "altitude": 0 }
    }]
  }],
  "routes": [{
    "entityId": "entity-唯一ID",
    "side": "red|blue",
    "points": [{ "position": { "longitude": 0, "latitude": 0, "altitude": 0 } }]
  }],
  "detectionZones": [{
    "entityId": "entity-唯一ID",
    "side": "red|blue",
    "center": { "longitude": 0, "latitude": 0, "altitude": 0 },
    "radiusMeters": 50000,
    "label": "探测范围"
  }],
  "strikeTasks": [{
    "id": "strike-唯一ID",
    "attackerEntityId": "entity-唯一ID",
    "targetEntityId": "entity-唯一ID",
    "phaseId": "phase-唯一ID",
    "timestamp": 30,
    "detail": "X战机在T+30秒发射导弹攻击Y目标"
  }],
  "phases": [{
    "id": "phase-唯一ID",
    "name": "阶段名称",
    "description": "阶段战术描述",
    "duration": 60,
    "events": [{
      "type": "movement|detection|attack|destruction",
      "timestamp": 0,
      "sourceEntityId": "entity-唯一ID",
      "targetEntityId": "entity-唯一ID（可选）",
      "detail": "事件描述"
    }],
    "entityStates": [{
      "entityId": "entity-唯一ID",
      "position": { "longitude": 0, "latitude": 0, "altitude": 0 },
      "status": "planned|deployed|engaged|destroyed",
      "detectionRange": 50000,
      "attackTarget": "entity-唯一ID（可选）"
    }]
  }],
  "metadata": {
    "generatedAt": "ISO时间戳",
    "modelUsed": "model-name",
    "confidence": 0.85
  }
}`;

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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 生成战术想定（流式版本）
   * @param userIntent 用户输入
   * @param onChunk 流式回调，返回思维链片段
   * @returns 最终解析的战术方案
   */
  async *generateScenarioStream(
    userIntent: string,
    onChunk: (text: string) => void,
  ): AsyncGenerator<StreamChunk, TacticalScenario, void> {
    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userIntent },
    ];

    const response = await fetch(GROQ_API_URL, {
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
      throw new Error(`Groq API 错误: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('Groq API 返回空响应体');
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
    // 返回完整内容用于解析
    return this.parseAndValidate(fullContent);
  }

  /**
   * 生成战术想定（非流式版本）
   */
  async generateScenario(userIntent: string): Promise<TacticalScenario> {
    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userIntent },
    ];

    const response = await fetch(GROQ_API_URL, {
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

    return this.parseAndValidate(content);
  }

  /**
   * 解析并校验 JSON 响应
   */
  private parseAndValidate(raw: string): TacticalScenario {
    // 提取 ```json ... ``` 包裹的内容
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/) ||
                       raw.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, raw];

    let jsonStr = jsonMatch[1] ?? raw;
    jsonStr = jsonStr.trim();

    try {
      const parsed = JSON.parse(jsonStr) as TacticalScenario;

      // 基础校验
      if (!parsed.forces || !Array.isArray(parsed.forces)) {
        throw new Error('missing forces array');
      }
      if (!parsed.phases || !Array.isArray(parsed.phases)) {
        throw new Error('missing phases array');
      }

      // 补充元数据
      if (!parsed.metadata) {
        parsed.metadata = { generatedAt: new Date().toISOString(), modelUsed: MODEL, confidence: 0.85 };
      }

      // 生成 ID（如果缺失）
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
`;

    const messages: GroqMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: contextPrompt },
    ];

    const response = await fetch(GROQ_API_URL, {
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

    const refined = this.parseAndValidate(content);
    refined.version = scenario.version + 1;
    return refined;
  }
}
