# 战术约束引擎实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现地域约束、攻防逻辑约束和兵力分散规则，确保 AI 生成的方案符合战术规范

**Architecture:**
1. 创建验证服务类 `TacticalValidator`
2. 增强 AI 服务 Prompt 添加约束规则
3. 在方案生成后执行验证

**Tech Stack:** TypeScript, Vue 3, Groq API

---

## 文件结构

**创建文件:**
- `apps/web/src/services/tactical-validator.ts` - 战术约束验证逻辑

**修改文件:**
- `apps/web/src/services/ai-tactical.ts` - 增强 Prompt 添加约束规则
- `apps/web/src/stores/tactical-scenario.ts` - 在生成后调用验证

---

### Task 1: 创建战术验证服务

**Files:**
- Create: `apps/web/src/services/tactical-validator.ts`

- [ ] **Step 1: 创建 TacticalValidator 类**

```typescript
// apps/web/src/services/tactical-validator.ts
import type { TacticalScenario, EntitySpec, Route, DetectionZone, GeoPosition } from '../types/tactical-scenario';

/**
 * 战术约束验证错误
 */
export interface ValidationError {
  type: 'geography' | 'logic' | 'spacing' | 'completeness';
  message: string;
  details?: any;
}

/**
 * 战术约束验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 战术约束验证服务
 */
export class TacticalValidator {
  /**
   * 验证完整战术方案
   */
  validate(scenario: TacticalScenario): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. 地域验证
    errors.push(...this.validateGeography(scenario));

    // 2. 攻防逻辑验证
    errors.push(...this.validateLogic(scenario));

    // 3. 兵力分散验证
    errors.push(...this.validateSpacing(scenario));

    // 4. 完整性验证
    errors.push(...this.validateCompleteness(scenario));

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 地域约束验证
   */
  private validateGeography(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const force of scenario.forces) {
      for (const entity of force.entities) {
        const error = this.validateEntityPosition(entity, force.side);
        if (error) errors.push(error);
      }
    }

    return errors;
  }

  /**
   * 验证单个实体位置
   */
  private validateEntityPosition(entity: EntitySpec, side: 'red' | 'blue'): ValidationError | null {
    const { longitude, latitude } = entity.position;

    if (side === 'red') {
      // 红方允许区域：中国大陆、台湾岛
      const inChina = this.isInMainlandChina(longitude, latitude);
      const inTaiwan = this.isInTaiwan(longitude, latitude);
      const inInternational = this.isInInternationalSpace(longitude, latitude);

      // 禁止出现在日本陆地
      const inJapan = this.isInJapan(longitude, latitude);
      if (inJapan) {
        return {
          type: 'geography',
          message: `红方实体 ${entity.name} 不能出现在日本陆地`,
          details: { entityId: entity.id, position: entity.position },
        };
      }

      // 允许在中国、台湾、公海
      if (!inChina && !inTaiwan && !inInternational) {
        return {
          type: 'geography',
          message: `红方实体 ${entity.name} 位置不符合部署规则`,
          details: { entityId: entity.id, position: entity.position },
        };
      }
    } else {
      // 蓝方允许区域：日本本土、冲绳
      const inJapan = this.isInJapan(longitude, latitude);
      const inInternational = this.isInInternationalSpace(longitude, latitude);

      // 禁止出现在中国大陆或台湾岛
      const inChina = this.isInMainlandChina(longitude, latitude);
      const inTaiwan = this.isInTaiwan(longitude, latitude);
      if (inChina || inTaiwan) {
        return {
          type: 'geography',
          message: `蓝方实体 ${entity.name} 不能出现在中国陆地或台湾岛`,
          details: { entityId: entity.id, position: entity.position },
        };
      }

      // 允许在日本、公海
      if (!inJapan && !inInternational) {
        return {
          type: 'geography',
          message: `蓝方实体 ${entity.name} 位置不符合部署规则`,
          details: { entityId: entity.id, position: entity.position },
        };
      }
    }

    return null;
  }

  /**
   * 检查是否在中国大陆
   */
  private isInMainlandChina(longitude: number, latitude: number): boolean {
    return longitude >= 73 && longitude <= 135 && latitude >= 18 && latitude <= 53;
  }

  /**
   * 检查是否在台湾岛
   */
  private isInTaiwan(longitude: number, latitude: number): boolean {
    return longitude >= 119 && longitude <= 122 && latitude >= 21 && latitude <= 25;
  }

  /**
   * 检查是否在日本本土/冲绳
   */
  private isInJapan(longitude: number, latitude: number): boolean {
    // 日本本土
    const inMainland = longitude >= 129 && longitude <= 145 && latitude >= 30 && latitude <= 46;
    // 冲绳
    const inOkinawa = longitude >= 127 && longitude <= 129 && latitude >= 25 && latitude <= 27;
    return inMainland || inOkinawa;
  }

  /**
   * 检查是否在公海/国际领空
   */
  private isInInternationalSpace(longitude: number, latitude: number): boolean {
    // 简化判定：不在上述任何陆地区域内
    return !this.isInMainlandChina(longitude, latitude) &&
           !this.isInTaiwan(longitude, latitude) &&
           !this.isInJapan(longitude, latitude);
  }

  /**
   * 攻防逻辑验证
   */
  private validateLogic(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    // 验证进攻路线
    errors.push(...this.validateRoutes(scenario));

    // 验证探测范围
    errors.push(...this.validateDetectionZones(scenario));

    return errors;
  }

  /**
   * 验证进攻路线
   */
  private validateRoutes(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];
    const entityMap = new Map<string, EntitySpec>();

    scenario.forces.forEach(force => {
      force.entities.forEach(entity => {
        entityMap.set(entity.id, entity);
      });
    });

    for (const route of scenario.routes) {
      // 检查路线是否有明确目标（通过终点位置判断）
      if (route.points.length < 2) {
        errors.push({
          type: 'logic',
          message: `实体 ${route.entityId} 的路线点数量不足`,
          details: { route },
        });
        continue;
      }

      const endPoint = route.points[route.points.length - 1].position;

      // 检查路线终点是否接近潜在的敌方实体
      let hasValidTarget = false;
      for (const force of scenario.forces) {
        if (force.side === route.side) continue; // 跳过己方

        for (const entity of force.entities) {
          const distance = this.calculateDistance(endPoint, entity.position);
          if (distance <= 50000) { // 50km 内
            hasValidTarget = true;
            break;
          }
        }
        if (hasValidTarget) break;
      }

      if (!hasValidTarget) {
        errors.push({
          type: 'logic',
          message: `实体 ${route.entityId} 的进攻路线没有明确的打击目标（终点50km内无敌方实体）`,
          details: { route, endPoint },
        });
      }
    }

    return errors;
  }

  /**
   * 验证探测范围
   */
  private validateDetectionZones(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const zone of scenario.detectionZones) {
      // 检查探测范围是否覆盖潜在威胁方向
      // 简化判定：探测范围内应该有潜在威胁（红方探测蓝方，蓝方探测红方）

      let hasThreatCoverage = false;
      for (const force of scenario.forces) {
        if (force.side === zone.side) continue; // 跳过己方

        for (const entity of force.entities) {
          const distance = this.calculateDistance(zone.center, entity.position);
          if (distance <= zone.radiusMeters) {
            hasThreatCoverage = true;
            break;
          }
        }
        if (hasThreatCoverage) break;
      }

      if (!hasThreatCoverage) {
        errors.push({
          type: 'logic',
          message: `实体 ${zone.entityId} 的探测范围没有覆盖任何潜在威胁`,
          details: { zone },
        });
      }
    }

    return errors;
  }

  /**
   * 兵力分散验证
   */
  private validateSpacing(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];
    const MIN_SPACING_METERS = 10000; // 10km

    for (const force of scenario.forces) {
      const entities = force.entities;

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const distance = this.calculateDistance(entities[i].position, entities[j].position);

          if (distance < MIN_SPACING_METERS) {
            errors.push({
              type: 'spacing',
              message: `${force.side === 'red' ? '红方' : '蓝方'}实体 ${entities[i].name} 和 ${entities[j].name} 间距过近 (${(distance / 1000).toFixed(1)}km < 10km)`,
              details: {
                entity1: entities[i].id,
                entity2: entities[j].id,
                distance,
              },
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * 完整性验证
   */
  private validateCompleteness(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    // 检查必需字段
    if (!scenario.id) {
      errors.push({
        type: 'completeness',
        message: '方案缺少 id',
      });
    }

    if (!scenario.forces || scenario.forces.length === 0) {
      errors.push({
        type: 'completeness',
        message: '方案缺少兵力编成',
      });
    }

    if (!scenario.phases || scenario.phases.length === 0) {
      errors.push({
        type: 'completeness',
        message: '方案缺少阶段划分',
      });
    }

    return errors;
  }

  /**
   * 计算两点间距离（米）
   * 使用 Haversine 公式
   */
  private calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
    const R = 6371000; // 地球半径（米）
    const lat1Rad = (pos1.latitude * Math.PI) / 180;
    const lat2Rad = (pos2.latitude * Math.PI) / 180;
    const deltaLatRad = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/tactical-validator.ts
git commit -m "feat: add TacticalValidator service

- Validate geography constraints (red/blue zones)
- Validate attack/detection logic
- Validate entity spacing (min 10km)
- Validate data completeness"
```

---

### Task 2: 增强 AI 服务 Prompt

**Files:**
- Modify: `apps/web/src/services/ai-tactical.ts`

- [ ] **Step 1: 修改 SYSTEM_PROMPT 添加战术约束**

在 `SYSTEM_PROMPT` 中的"重要约束"部分之后添加新的约束规则：

```typescript
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
2. 蓝方防御��点：北部重点防空覆盖...
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
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/ai-tactical.ts
git commit -m "feat: enhance AI prompt with tactical constraints

- Add geography constraints (red/blue zones)
- Add attack/detection logic constraints
- Add entity spacing rules (min 10km)
- Add clear output format with tactical analysis"
```

---

### Task 3: 在 Store 中集成验证

**Files:**
- Modify: `apps/web/src/stores/tactical-scenario.ts`

- [ ] **Step 1: 导入验证器**

在文件顶部添加导入：

```typescript
import { TacticalValidator } from '../services/tactical-validator';
```

- [ ] **Step 2: 创建验证器实例**

在 `aiService` 声明之后添加：

```typescript
  // AI 服务（延迟初始化）
  let aiService: AiTacticalService | null = null;

  // 战术验证器
  const validator = new TacticalValidator();
```

- [ ] **Step 3: 在生成方案后调用验证**

修改 `generateScenario` 方法，在设置 `currentScenario` 之后添加验证：

```typescript
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

      // 使用流式生成，同时显示思维链
      let finalScenario: TacticalScenario | null = null;

      const streamGen = service.generateScenarioStream(userIntent, (text) => {
        thinkingChain.value += text;
        // 实时更新思维链消息内容
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

      // 执行战术验证
      const validationResult = validator.validate(finalScenario);
      if (!validationResult.valid) {
        const errorMsg = validationResult.errors.map(e => e.message).join('; ');
        throw new Error(`战术验证失败: ${errorMsg}`);
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
```

- [ ] **Step 4: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/stores/tactical-scenario.ts
git commit -m "feat: integrate tactical validation into scenario generation

- Import and instantiate TacticalValidator
- Validate scenario after generation
- Throw error if validation fails
- Display validation errors in chat"
```

---

### Task 4: 验证约束功能

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

Expected: 服务器启动

- [ ] **Step 2: 测试战术约束**

在 AI 助手中输入测试用例，验证约束：

**测试用例1 - 地域约束：**
输入: "红方战机部署在日本东京"
预期: 生成失败，提示"红方实体不能出现在日本陆地"

**测试用例2 - 兵力分散：**
输入: "在台湾北部部署10架红方战机"
预期: 生成的方案中所有红方实体间距≥10km

**测试用例3 - 攻防逻辑：**
输入: "红方从中国东部进攻蓝方冲绳基地"
预期: 进攻路线终点接近蓝方目标（50km内）

- [ ] **Step 3: 提交验收结果**

```bash
git commit --allow-empty -m "test: verify tactical constraints functionality

- Confirm red forces cannot deploy in Japan
- Confirm blue forces cannot deploy in China/Taiwan
- Confirm entity spacing meets 10km minimum
- Confirm attack routes have valid targets"
```

---

## 验收标准

- [ ] 红方不进入日本陆地
- [ ] 蓝方不进入中国大陆或台湾岛
- [ ] 进攻路线有明确目标（终点50km内）
- [ ] 兵力部署清晰分散（间距≥10km）
- [ ] 探测范围覆盖威胁方向
- [ ] 所有类型检查通过
- [ ] 手动测试通过

---

**下一步**: 创建 Word 导入系统实施计划
