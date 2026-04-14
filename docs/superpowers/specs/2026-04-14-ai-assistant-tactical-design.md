# AI 助手战术想定系统设计

## 概述

用户通过自然语言对话，直接得到包含红蓝双方兵力部署、进攻路线、探测范围、打击任务的完整战术方案，并在 Cesium 地图上可视化渲染、手动阶段推进执行。

- **LLM 服务**：Groq Cloud API（Llama-3 等模型，无需本地部署）
- **接入方式**：纯前端 + Vite 代理转发（避免 CORS）
- **方案颗粒度**：中等 — 关键战术节点由 AI 生成，节点间平滑插值
- **必含要素**：进攻路线、探测范围、打击任务（每次生成必含）
- **执行控制**：手动阶段推进（阶段列表 + 执行/自动播放按钮）
- **对话形态**：侧边滑出对话面板，地图保持可见

---

## 一、系统架构

```
┌─────────────────────────────────────────────────────────┐
│  AI Assistant Panel（Vue 组件）                          │
│  ┌──────────────┐  ┌────────────────────────────────┐  │
│  │ 对话历史     │  │ 方案预览卡片（可展开）           │  │
│  │ （消息列表） │  │ 兵力摘要 / 路线摘要 / 探测范围   │  │
│  │              │  └────────────────────────────────┘  │
│  │              │  ┌────────────────────────────────┐  │
│  │              │  │ 阶段时间线（可点击执行）          │  │
│  │              │  └────────────────────────────────┘  │
│  └──────────────┘  [部署到地图]  [清空地图]              │
├─────────────────────────────────────────────────────────┤
│  AI Service（Composable）                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ buildTacticalPrompt(userIntent) → string         │   │
│  │ parseTacticalResponse(raw) → TacticalScenario   │   │
│  │ validateScenario(schema) → boolean              │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓ Groq REST API               │
├─────────────────────────────────────────────────────────┤
│  Tactical Scenario Engine（Composable）                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ ScenarioStore│  │ MapRenderer  │  │ ExecEngine  │  │
│  │ (Pinia)      │  │              │  │             │  │
│  └──────────────┘  └──────────────┘  └─────────────┘  │
│         ↓                 ↓               ↓            │
│  Cesium Viewer         Cesium         Cesium           │
│  EntityCollection      Graphics       Animation          │
└─────────────────────────────────────────────────────────┘
```

---

## 二、数据模型

### TacticalScenario（AI 生成结果）

```typescript
interface TacticalScenario {
  id: string;
  version: number;
  summary: string; // 一句话方案描述

  // 红蓝双方兵力
  forces: {
    side: 'red' | 'blue';
    name: string;          // 如"红方空中突击群"
    entities: EntitySpec[]; // 实体规格列表
  }[];

  // 行动阶段（中等颗粒度）
  phases: Phase[];

  // 元数据
  metadata: {
    generatedAt: string;
    modelUsed: string;
    confidence: number; // 0-1
  };
}

interface EntitySpec {
  id: string;
  name: string;            // 如"Su-30 战机1"
  type: PlatformType;       // 如 aircraft-fighter
  position: GeoPosition;    // 初始位置
  loadout?: LoadoutSpec;   // 选装
}

interface Phase {
  id: string;
  name: string;            // 如"第一阶段：压制防空"
  description: string;
  duration: number;         // 预计持续时间（秒）
  events: TacticalEvent[];  // 关键事件
  entityStates: EntityStateInPhase[]; // 阶段结束时实体应处于的状态
}

interface TacticalEvent {
  type: 'movement' | 'detection' | 'attack' | 'destruction';
  timestamp: number;       // 阶段内相对时间（秒）
  sourceEntityId: string;
  targetEntityId?: string;
  detail: string;          // 人类可读描述
}

interface EntityStateInPhase {
  entityId: string;
  position: GeoPosition;
  status: EntityStatus;
  detectionRange?: number;  // 探测半径（米）
  attackTarget?: string;    // 打击目标 entityId
}
```

### 与现有模型的关系

- `EntitySpec` → 映射为 `EntityConfig` → 创建 `ScenarioEntity`
- `GeoPosition` 与 `ScenarioEntity.currentPosition` 格式一致
- `Phase.entityStates` 用于 Cesium 实体插值动画的目标值

---

## 三、AI Service 设计

### API 调用

```typescript
// apps/web/src/services/ai-tactical.ts

interface AiTacticalService {
  generateScenario(intent: string, context?: ScenarioContext): Promise<TacticalScenario>;
  refineScenario(scenarioId: string, feedback: string): Promise<TacticalScenario>;
  streamGenerate?(intent: string): AsyncGenerator<string>; // 未来支持流式
}
```

- **模型**：Groq `llama-3.3-70b-versatile`（速度快，免费额度充足）
- **端点**：`https://api.groq.com/openai/v1/chat/completions`
- **代理配置**：Vite dev server 代理 `/api/groq` → `https://api.groq.com/openai/v1`（生产环境同理）

### Prompt 工程

系统提示词约束 AI 输出 JSON Schema：

```
你是一个军事战术方案生成助手。用户描述战术意图后，生成包含以下要素的 JSON 方案：
- 红蓝双方兵力部署（每个实体的类型、名称、位置）
- 进攻路线（每个实体的移动路径点）
- 探测范围（每个感知平台的探测半径）
- 打击任务（攻击方 → 目标，时间节点）
- 行动阶段（至少2个阶段，每个阶段包含关键事件）

输出格式：严格 JSON，遵循以下 Schema...
```

### 响应解析

1. 提取 ````json\n...\n```` 包裹的 JSON
2. Zod / JSONSchema 校验
3. 校验失败 → 返回错误消息，提示用户重述

---

## 四、地图渲染层

### Cesium 图形分层

| 层级 | 内容 | Cesium 类型 |
|------|------|------------|
| L1 | 地形/底图 | ImageryLayer |
| L2 | 实体（兵力图标） | Entity（billboard / model） |
| L3 | 路��（进攻路径） | Entity Polyline + 箭头 |
| L4 | 探测范围 | Entity Ellipsoid / Polygon |
| L5 | 打击效果 | Entity point + callback animation |
| L6 | 阶段覆盖物 | Primitive（动态更新） |

### 渲染流程

```
TacticalScenario
    ↓
MapRenderer.renderScenario(scenario)
    ↓
1. 清空 L2-L5（保留 L1）
2. 渲染 entities（用现有 cesium-graphics.ts）
3. 渲染 routes（polyline + 方向箭头）
4. 渲染 detection zones（半透明 ellipse）
5. 注册打击标记（暂不触发）
```

### 样式约定

- 红方：红色系（#ff4444 / rgba(255,68,68,0.3)）
- 蓝方：蓝色系（#4488ff / rgba(68,136,255,0.3)）
- 路线：虚线 + 箭头头部
- 探测范围：半透明填充 + 描边
- 打击点：爆炸图标 + 闪烁动画

---

## 五、执行引擎

### 状态机

```
IDLE → RUNNING → PAUSED → COMPLETED
         ↑_________|         |
         (resume)            ↓
                           (可重置到 IDLE)
```

### 阶段推进逻辑

```typescript
interface ExecutionEngine {
  load(scenario: TacticalScenario): void;
  play(): void;      // 执行当前阶段
  pause(): void;
  nextPhase(): void; // 手动进入下一阶段
  prevPhase(): void; // 回退上一阶段
  reset(): void;     // 回到初始状态
  getStatus(): ExecutionStatus;
}
```

- `play()` 时，启动定时器，每帧（约 60fps）更新实体插值
- 插值方式：线性 lerp（经纬度）+ 时间比例
- 当到达 `Phase.duration` 边界时，触发该阶段内的所有 `TacticalEvent`
- 打击事件：显示打击动画，标记目标实体状态变化

### 实体插值

```typescript
function interpolatePosition(
  from: GeoPosition,
  to: GeoPosition,
  progress: number // 0-1
): GeoPosition {
  return {
    longitude: lerp(from.longitude, to.longitude, progress),
    latitude: lerp(from.latitude, to.latitude, progress),
    altitude: lerp(from.altitude, to.altitude, progress),
  };
}
```

---

## 六、AI Assistant Panel 组件

### 布局

```
┌──────────────────────────────┐
│  AI 战术助手           [−]   │  ← 可折叠
├──────────────────────────────┤
│                              │
│  [AI] 好的，我来为你生成...   │  ← 对话历史（可滚动）
│  [USER] 在台湾北部部署...    │
│  [AI] 方案已生成！           │
│       ├─ 兵力摘要            │  ← 可折叠卡片
│       ├─ 路线概览            │
│       └─ 探测范围            │
│                              │
├──────────────────────────────┤
│  阶段时间线                  │
│  ○ 第一阶段：压制防空   [▶]  │
│  ○ 第二阶段：突防打击   [ ]  │
│  ○ 第三阶段：占领阵地   [ ]  │
├──────────────────────────────┤
│  [部署到地图]  [清空地图]    │
├──────────────────────────────┤
│  输入你的战术意图...    [发送]│
└──────────────────────────────┘
```

### 核心交互

1. **发送意图** → 显示 loading → 接收 JSON → 渲染预览卡片
2. **部署到地图** → 调用 `MapRenderer.renderScenario()` → Cesium 更新
3. **阶段执行** → 调用 `ExecutionEngine.play()` → Cesium 动画
4. **追问修改** → "把第二阶段的攻击群改到台北" → `refineScenario()` → 更新渲染

---

## 七、实现顺序

### Phase 1（优先）：对话 → 地图渲染

1. Vite 代理配置 Groq API
2. `ai-tactical.ts` 服务实现（prompt + 调用 + 解析）
3. `types/tactical-scenario.ts` 新类型定义
4. AI Assistant Panel Vue 组件（对话历史 + 预览）
5. `MapRenderer.renderScenario()` 扩展（路线 + 探测范围）

### Phase 2：执行引擎

6. `ExecutionEngine` 实现（阶段推进 + 插值动画）
7. 阶段时间线 UI（点击执行按钮）
8. 打击事件动画效果

### Phase 3（可选演进）

9. 流式输出（实时显示生成进度）
10. 多方案对比
11. 地图直接编辑 + 反馈给 AI 修正

---

## 八、技术债务与已知限制

1. **移动为插值，非物理仿真**：实体沿直线移动，不考虑地形遮蔽、速度曲线
2. **打击为规则驱动**：命中判定基于距离阈值（探测圈内即算），非概率模型
3. **无态势数据持久化**：生成的方案存储在 Pinia，刷新丢失
4. **LLM 输出不稳定**：需要 robust 的 JSON 解析容错机制

---

## 九、关键文件清单

| 文件 | 职责 |
|------|------|
| `apps/web/src/services/ai-tactical.ts` | AI 服务（新建） |
| `apps/web/src/types/tactical-scenario.ts` | 战术想定类型（新建） |
| `apps/web/src/services/map-renderer.ts` | Cesium 渲染引擎（新建，拆分自 cesium-graphics） |
| `apps/web/src/services/execution-engine.ts` | 阶段执行引擎（新建） |
| `apps/web/src/components/ai-assistant/AIAssistantPanel.vue` | AI 面板组件（新建） |
| `apps/web/src/stores/tactical-scenario.ts` | 想定状态 Store（新建） |
| `apps/web/vite.config.ts` | 添加 Groq 代理配置 |
| `packages/ai-core/src/index.d.ts` | 扩展 AI core 类型 |
