# AI Workflow 驱动的资源编排与方案生成闭环设计

**日期**: 2026-05-01
**状态**: 设计确认
**范围**: 首期智能化建设方案

## 1. 背景与目标

当前系统已经具备 AI 战术方案生成、Cesium 可视化、行动计划管理、推演控制、Ontology 演示数据、想定工作空间和基础 AI Assistant 链路。但现有 AI 生成方案时，主要依赖模型自身对兵力、装备、战法和地域的理解，缺少对系统内真实资源属性、隶属关系、能力关系和作战链路的受控引用。

这会导致两个问题：

- AI 可能凭空添加不存在的单位、平台或能力。
- 方案虽能生成文本和地图对象，但难以解释“为什么选这些资源”和“这些链路是否真实成立”。

首期智能化建设的目标是打通一条可信闭环：

```text
用户需求
  ↓
Dify / AI Workflow 拆解任务
  ↓
查询本系统资源图谱
  ↓
AI 基于真实资源编排兵力和作战链路
  ↓
生成 TacticalScenario 草案
  ↓
系统校验
  ↓
人工确认
  ↓
写入 ActionPlan 并进入推演
```

首期方案命名为：

> AI Workflow 驱动的资源编排与方案生成闭环

它的核心不是让 AI 更自由地写方案，而是让 AI 在系统真实资源、真实关系、真实约束中做受控编排。

## 2. 总体原则

### 2.1 AI Workflow 是智能链路主体

这里的 workflow 指 AI Workflow，类似 Dify、Coze、LangGraph 等工具中的 Agent/节点编排流。它负责意图解析、需求规划、RAG 召回、工具调用、资源编排、方案生成和失败修正。

业务状态流只作为系统承接层，负责草案、待确认、已确认、写入行动计划、推演执行等状态门禁。

### 2.2 系统事实不交给大模型裁决

AI Workflow 可以推荐资源组合和行动方案，但不能直接成为事实源。以下能力必须由本系统提供确定性接口：

- 资源事实查询
- 关系图谱查询
- 资源编排校验
- TacticalScenario 结构转换
- 草案暂存与确认
- ActionPlan 创建和推演执行

### 2.3 资源图谱优先于 RAG

资源图谱承载单位、平台、装备、地域、任务和链路关系等确定性事实。RAG 承载条令、战法、案例、装备说明等文本知识。

首期应先把资源事实结构化，RAG 作为方案解释和战法增强层，不替代资源图谱。

## 3. 能力边界

### 3.1 资源图谱职责

资源图谱负责回答“系统里真实存在什么、它们之间有什么确定关系、它们具备什么能力”。

首期覆盖对象：

| 对象 | 首期字段重点 |
|---|---|
| ForceUnit | 编号、名称、阵营、隶属关系、可承担任务、常驻或可部署地域 |
| Platform | 类型、所属单位、能力参数、当前状态、可挂载装备 |
| Weapon | 打击类型、射程、适用目标、挂载平台 |
| Sensor | 探测类型、探测范围、覆盖限制、所属平台 |
| GeoZone | 作战方向、可部署类型、禁入和限制条件 |
| Mission | 任务类型、所需能力、所需链路、地域和时序约束 |

首期覆盖关系：

| 关系 | 用途 |
|---|---|
| belongs_to | 平台或下级单位隶属于上级单位 |
| can_command | 指挥链可达性 |
| can_communicate | 通信链可达性 |
| can_detect | 探测链覆盖关系 |
| can_strike | 打击链覆盖关系 |
| can_support | 支援链关系 |
| deployable_to | 资源可部署地域 |
| suitable_for | 资源适配任务 |

首期不强制引入 Neo4j 等图数据库。可以先用结构化关系表、JSON 数据或内存图模型承载，但对外接口应按“查询候选资源子图”的形式设计，避免上层依赖具体存储。

### 3.2 RAG 知识库职责

RAG 负责回答“这种任务通常怎么组织、有哪些条令或案例依据、某类装备或战法有什么说明”。

首期可进入 RAG 的内容：

- 条令规则说明
- 战法样例
- 历史案例摘要
- 装备说明文档
- 已导入的 Word/XML 方案说明
- 系统使用说明

RAG 召回应返回短摘要、来源 ID、可信度和引用片段标识，不应把大量原文直接塞入方案生成节点。

## 4. AI Workflow 节点设计

首期 AI Workflow 拆为 8 个节点，避免形成一个不可调试的大 Prompt。

```text
用户意图
  ↓
1. 意图解析节点
  ↓
2. 资源需求规划节点
  ↓
3. 图谱候选召回节点
  ↓
4. RAG 知识召回节点
  ↓
5. 资源编排节点
  ↓
6. 方案生成节点
  ↓
7. 校验修正节点
  ↓
8. 草案输出节点
```

### 4.1 意图解析节点

输入用户自然语言，输出结构化任务意图。首期建议放在 Dify 工作流的第一个 LLM 节点中完成。

示例输出：

```json
{
  "missionType": "侦察打击",
  "operationArea": "台湾东部海域",
  "side": "blue",
  "objectives": ["建立前出侦察", "压制对方海上目标"],
  "constraints": ["不进入禁入区", "优先使用现有可用平台"]
}
```

该节点可以后续沉淀为本系统接口 `/api/ai-workflow/intent/normalize`，但首期不是强制接口。

### 4.2 资源需求规划节点

根据任务意图推导能力需求，而不是直接选择具体资源。

示例输出：

```json
{
  "requiredCapabilities": [
    "air_recon",
    "ew_support",
    "long_range_strike",
    "command_link"
  ],
  "requiredChains": [
    "command",
    "communication",
    "detection",
    "strike"
  ],
  "preferredResourceTypes": [
    "air-recon",
    "air-jammer",
    "ship-destroyer",
    "uav-recon"
  ]
}
```

### 4.3 图谱候选召回节点

调用本系统资源图谱接口，根据任务意图和能力需求查询真实候选资源子图。

该节点是首期解决“AI 凭空生成资源”问题的核心。

### 4.4 RAG 知识召回节点

根据任务类型、地域、能力需求召回文本依据。首期可做最小版，用于增强方案理由和战法表达。

该节点是增强层，不是资源事实源。即使 RAG 召回某个平台说明，也必须通过资源图谱确认该平台在系统中存在且可用。

### 4.5 资源编排节点

AI 在候选资源子图内选择资源组合，并生成指挥、通信、探测、打击链路。

输出必须引用真实资源 ID、关系 ID 和知识来源 ID。

示例输出：

```json
{
  "selectedResources": [
    {
      "resourceId": "platform-002",
      "role": "前出侦察",
      "reason": "具备电子侦察能力，且与指挥节点存在通信关系",
      "evidence": ["rel-102", "doc-33"]
    }
  ],
  "chains": {
    "command": [],
    "communication": [],
    "detection": [],
    "strike": []
  }
}
```

### 4.6 方案生成节点

方案生成节点必须实现，但不应从零新建一套孤立能力。它应改造现有 `apps/web/src/services/ai-tactical.ts` 的方案生成逻辑。

旧链路：

```text
用户自然语言 → ai-tactical.ts → TacticalScenario
```

新链路：

```text
用户自然语言
+ 资源需求规划
+ 候选资源子图
+ 资源编排结果
+ RAG 摘要依据
→ 方案生成节点
→ TacticalScenarioDraft
```

该节点不再负责凭空选择兵力，只负责把已经选好的真实资源组合组织成可推演想定，包括：

- forces
- entities
- routes
- detectionZones
- strikeTasks
- phases
- environment
- interactions

当前 `routeIntents → routes`、`detectionIntents → detectionZones`、两阶段装备细节生成、`TacticalValidator` 等能力应尽量复用。

### 4.7 校验修正节点

系统校验优先，大模型只负责根据错误反馈修正。

校验项包括：

- 引用的资源 ID 是否存在
- 单位、平台、装备关系是否成立
- 能力是否满足任务需求
- 指挥链、通信链、探测链、打击链是否完整
- 地域约束是否满足
- 输出是否能转换为 `TacticalScenario`
- 是否可以创建 `ActionPlan`

失败后将错误反馈给 AI Workflow 修正节点，首期最多重试 1 到 2 次。

### 4.8 草案输出节点

输出两类结果：

- 面向人的解释：为什么选择这些资源、链路是否完整、有哪些风险。
- 面向系统的结构化草案：`ResourceOrchestrationDraft` 和 `TacticalScenarioDraft`。

草案必须进入待确认状态，不能直接开始推演。

## 5. 本系统需要暴露的工具接口

这些接口不是完整后端 API 清单，而是 AI Workflow 调用本系统能力所需的最小工具集。

### 5.1 `/api/ai-workflow/intent/normalize`（可选）

作用：把用户自然语言标准化为结构化任务意图。

它是可选接口，因为首期可以由 Dify 工作流第一个 LLM 节点完成。如果后续多个 workflow 需要复用同一套 schema、枚举、审计和解析逻辑，再沉淀成本系统接口。

推荐使用时机：

- 需要统一任务意图 schema。
- 需要记录用户原始意图到结构化意图的转换审计。
- 需要前端、后端、AI Workflow 对任务类型和约束枚举保持一致。
- 需要在未来替换 Dify 后复用本地意图解析能力。

### 5.2 `/api/resource-graph/query-candidates`（必须）

作用：根据任务意图、能力需求和地域约束，从本系统资源图谱中查询候选资源子图。

输入重点：

- missionType
- operationArea
- side
- requiredCapabilities
- requiredChains
- constraints

输出重点：

- candidateUnits
- candidatePlatforms
- candidateWeapons
- candidateSensors
- candidateGeoZones
- relationships
- unavailableResources
- warnings

### 5.3 `/api/resource-graph/validate-orchestration`（必须）

作用：校验 AI 选择的资源组合和作战链路是否真实成立。

校验重点：

- 资源 ID 是否存在。
- 资源是否可用。
- 平台是否属于对应单位。
- 传感器、武器、通信能力是否满足任务。
- 指挥链、通信链、探测链、打击链是否连通。
- 地域部署是否允许。
- 是否存在资源重复占用或阵营不一致。

该接口体现原则：AI 可以推荐，但系统必须裁决。

### 5.4 `/api/scenario/generate-from-orchestration`（必须）

作用：把资源编排结果转换成现有系统可消费的 `TacticalScenarioDraft`。

转换内容：

```text
selectedResources / chains
  ↓
forces
entities
routes
detectionZones
strikeTasks
phases
environment
interactions
```

该接口负责把 AI Workflow 的资源编排结果接入当前 `TacticalScenario` 模型。

### 5.5 `/api/scenario/validate-and-stage`（必须）

作用：最终校验并暂存想定草案，等待人工确认。

职责：

- 使用 `TacticalValidator` 做最终校验。
- 检查是否可以创建 `ActionPlan`。
- 保存草案版本。
- 记录 AI Workflow 的资源依据、关系依据、RAG 依据和校验结果。
- 返回待确认草案给前端。
- 人工确认后再写入当前想定和行动计划。

## 6. 当前代码落点

### 6.1 `packages/ontology`

扩展资源事实类型：

- ForceUnit
- Platform
- Weapon
- Sensor
- GeoZone
- Mission
- ResourceRelationship

首期可以先用静态演示数据或轻量 JSON 数据承载，后续再迁移到数据库。

### 6.2 `packages/ai-core`

定义 AI Workflow 节点输入输出 DTO：

- TaskIntent
- ResourceRequirementPlan
- CandidateResourceGraph
- ResourceOrchestrationDraft
- TacticalScenarioDraft
- WorkflowEvidence
- WorkflowValidationResult

这些类型应作为 Dify、本地 API、前端展示之间的稳定契约。

### 6.3 `packages/scenario`

增加草案和版本类型：

- ScenarioDraft
- ScenarioDraftStatus
- ScenarioVersion
- ScenarioStagingResult

草案状态至少包括：

```text
generated
validation_failed
staged
confirmed
rejected
```

### 6.4 `apps/server/src/modules`

新增或扩展模块：

- `resource-graph`: 候选资源子图查询、编排校验。
- `ai-workflow`: 对外提供 AI Workflow 工具 API。
- `ai-assistant`: 从演示草案生成升级为调用 AI Workflow 或接收 AI Workflow 输出。
- `scenario-workspace`: 增加草案暂存、确认、拒绝和版本推进。

### 6.5 `apps/web/src/services/ai-tactical.ts`

从纯自然语言方案生成改造为基于编排结果生成方案。

保留并复用：

- 两阶段生成思路。
- routeIntents 后处理。
- detectionIntents 后处理。
- 装备细节补全。
- JSON 容错解析。

### 6.6 `apps/web/src/stores/tactical-scenario.ts`

增加草案状态能力：

- stageDraft
- confirmDraft
- rejectDraft
- loadStagedDraft

只有确认后的 `TacticalScenario` 才允许进入地图渲染和推演执行。

### 6.7 `apps/web/src/stores/action-plan.ts`

行动计划只接受已确认的 `TacticalScenario` 创建，避免 AI 草案绕过人工确认直接进入推演。

## 7. Dify 与本系统的通信边界

Dify / AI Workflow 平台负责：

- Prompt 编排。
- Agent 节点编排。
- RAG 检索流程。
- 节点间变量传递。
- 失败重试策略。
- 面向用户的解释生成。

本系统负责：

- 资源事实源。
- 图谱关系。
- 规则校验。
- 类型转换。
- 草案状态。
- 推演执行。
- 审计记录。

该边界保证未来即使从 Dify 切换到 LangGraph、自研 workflow 或其他 Agent 平台，本系统的事实接口和草案承接层仍可复用。

## 8. 首期 MVP 范围

### 8.1 必须实现

1. 资源图谱最小模型，覆盖单位、平台、装备能力、任务、地域、指挥链、通信链、探测链、打击链。
2. Dify AI Workflow 节点，覆盖意图解析、资源需求规划、资源编排、方案生成、错误修正。
3. 本地工具 API，覆盖资源候选召回、编排校验、方案生成、方案校验暂存。
4. 方案生成改造，让 `ai-tactical.ts` 或后端方案生成能力基于真实资源子图和编排结果工作。
5. 推演门禁，AI 输出经系统校验和人工确认后，才允许创建 `ActionPlan`。
6. 最小 RAG 接口，先作为条令、战法、案例摘要增强层。

### 8.2 暂不实现

- 完整复盘评估系统。
- 大规模图数据库建设。
- 多 Agent 自主长期任务执行。
- 完整知识治理平台。
- 自动闭环执行到推演且不经人工确认。
- 高保真仿真裁决模型替代现有推演引擎。

## 9. 风险与约束

### 9.1 Dify 节点输出不稳定

所有进入本系统的 AI Workflow 输出必须经过 schema 校验。失败后返回明确错误，由 AI Workflow 修正节点处理。

### 9.2 资源图谱数据不足

如果资源属性或关系不完整，AI 编排质量仍会受限。首期应优先补齐少量高质量演示数据，而不是追求大规模覆盖。

### 9.3 RAG 与图谱边界混乱

RAG 不能替代资源事实。方案生成时，所有资源选择必须引用资源图谱对象 ID，RAG 只能作为解释和战法依据。

### 9.4 草案绕过确认

系统必须强制草案状态门禁。AI Workflow 输出不能直接创建行动计划或启动推演。

### 9.5 前后端类型漂移

AI Workflow DTO 应沉淀在 `packages/ai-core`，前端、后端、Dify 工具接口共同使用同一套契约。

## 10. 验证标准

首期完成后，应能验证以下场景：

1. 用户输入自然语言任务需求。
2. Dify 工作流解析出结构化任务意图和能力需求。
3. 本系统返回候选资源子图。
4. AI 只从候选子图中选择资源，并输出资源 ID 与关系依据。
5. 系统能发现不存在资源、关系不成立、能力不满足等问题。
6. 校验通过后生成 `TacticalScenarioDraft`。
7. 草案进入待确认状态。
8. 人工确认后创建 `ActionPlan`。
9. 推演引擎可以加载确认后的方案。

## 11. 后续阶段

复盘评估链路放在后续阶段建设。首期只保留必要的事件记录、版本记录、资源依据和校验记录，为后续自动评估、报告生成和知识回流做准备。

后续可扩展方向：

- 推演结果评估 Agent。
- 自动复盘报告生成。
- 经验规则回流到 RAG 知识库。
- 图数据库或图分析引擎。
- 多方案对比与资源冲突分析。
- 外部仿真引擎接入。
