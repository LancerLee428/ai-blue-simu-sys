# Dify Workflow 节点设计稿

> 日期：2026-05-04
> 目标：给 `ai-blue-simu-sys` 的首期资源编排闭环落一版可直接照着在 Dify 中配置的 workflow 节点草稿。

## 1. 设计边界

这版 workflow 的定位不是把业务事实搬进 Dify，而是让 Dify 负责：

- 用户意图解析
- 资源需求规划
- 编排草案生成
- 校验失败后的有限重试
- 人工确认前的草案编排

`ai-blue-simu-sys` 本地 server 继续负责：

- 资源候选子图查询
- 资源编排校验
- 想定草案生成
- 草案暂存
- 草案确认 / 拒绝

当前建议先走 `Chatflow / Workflow` 里的标准节点组合，不急着上复杂 Agent、多工具并发和外部插件市场。

## 2. 建议工作流类型

- 工作流类型：`Chatflow`
- 适用场景：用户在对话里描述任务，workflow 自动产出待确认的资源编排和想定草案
- 模型侧原则：
  - LLM 只做“结构化理解 + 候选内编排建议”
  - 资源真实性、关系真实性、可执行性校验全部交给本地接口

## 3. 建议节点总览

建议首版节点顺序：

1. `开始 Start`
2. `LLM - 意图解析`
3. `参数提取 / 结构化输出校验`
4. `LLM - 资源需求规划`
5. `HTTP - 查询候选资源子图`
6. `LLM - 生成资源编排草案`
7. `HTTP - 校验资源编排`
8. `条件分支 IF - 编排是否通过`
9. `LLM - 校验失败修正`
10. `HTTP - 再次校验资源编排`
11. `条件分支 IF - 二次校验是否通过`
12. `HTTP - 生成想定草案`
13. `HTTP - 校验并暂存草案`
14. `模板 / Answer - 输出待确认结果`
15. `Human Input - 人工确认`
16. `条件分支 IF - 是否确认`
17. `HTTP - 确认暂存草案`
18. `HTTP - 拒绝暂存草案`
19. `Answer - 返回最终结果`

说明：

- 第 9~11 步只建议保留 1 次修正重试，不要无限循环。
- 如果你希望首版更稳，可以先去掉第 15~18 步，把“人工确认”放在 `ai-blue-simu-sys` 前端里完成；Dify 只负责把草案生成并暂存。

## 4. 开始节点表单

节点名：`开始`

表单字段建议：

| 字段标签 | 变量名 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 任务类型 | `mission_type` | 单行文本 | 是 | `侦察打击` | 对应 `taskIntent.missionType` |
| 作战区域 | `operation_area` | 单行文本 | 是 | `台湾东部海域` | 对应 `taskIntent.operationArea` |
| 我方阵营 | `side` | 下拉框 | 是 | `blue` | 枚举：`blue` / `red` |
| 作战目标 | `objectives` | 段落文本 | 是 | `建立前出侦察\n压制海上目标` | 后续拆成数组 |
| 约束条件 | `constraints` | 段落文本 | 否 | `不进入禁入区` | 后续拆成数组 |
| 用户补充说明 | `user_notes` | 段落文本 | 否 | `优先使用空中平台` | 提供给 LLM 参考 |

建议在开始节点后统一约定：

- `objectives` 按换行拆分成数组
- `constraints` 按换行拆分成数组

## 5. 节点逐个配置

### 5.1 LLM - 意图解析

节点类型：`LLM`

节点名建议：`意图解析`

输入：

- `mission_type`
- `operation_area`
- `side`
- `objectives`
- `constraints`
- `user_notes`

输出要求：

- 必须输出 JSON
- 只做归一化，不新增虚构资源

建议输出结构：

```json
{
  "taskIntent": {
    "missionType": "侦察打击",
    "operationArea": "台湾东部海域",
    "side": "blue",
    "objectives": ["建立前出侦察", "压制海上目标"],
    "constraints": ["不进入禁入区"]
  }
}
```

提示词重点：

- 把用户自然语言整理成 `taskIntent`
- 不要生成资源编排
- 不要补造不存在的装备实体
- 保持 `side` 只能是 `blue` 或 `red`

### 5.2 参数提取 / 结构化输出校验

节点类型：`Parameter Extractor` 或 `Code/Template` 辅助节点

节点名建议：`意图结构校验`

作用：

- 确保上一个 LLM 节点真的输出了合法 JSON
- 没有就直接走失败提示，不要继续请求后端

如果首版不想增加复杂度，也可以跳过这个节点，直接在后续 HTTP 节点观察错误。

### 5.3 LLM - 资源需求规划

节点类型：`LLM`

节点名建议：`资源需求规划`

输入：

- `taskIntent`

输出结构必须对齐本地接口 `ResourceRequirementPlan`：

```json
{
  "requirementPlan": {
    "requiredCapabilities": ["air_recon", "ew_support", "long_range_strike"],
    "requiredChains": ["command", "communication", "detection", "strike"],
    "preferredResourceTypes": ["air-recon", "air-jammer", "air-multirole"]
  }
}
```

提示词重点：

- `requiredCapabilities` 只输出能力标签
- `requiredChains` 只输出：
  - `command`
  - `communication`
  - `detection`
  - `strike`
  - `support`
- `preferredResourceTypes` 只输出资源类型偏好，不输出具体资源 ID

### 5.4 HTTP - 查询候选资源子图

节点类型：`HTTP Request`

节点名建议：`查询候选资源子图`

配置建议：

- Method: `POST`
- URL: `http://host.docker.internal:3000/api/resource-graph/query-candidates`
- Headers:
  - `Content-Type: application/json`

Body：

```json
{
  "taskIntent": {{#意图解析.taskIntent#}},
  "requirementPlan": {{#资源需求规划.requirementPlan#}}
}
```

期望输出重点：

- `nodes`
- `relationships`
- `unavailableResources`
- `warnings`

这个节点的结果是后续资源编排的“可选池”，LLM 不能绕开它直接编资源。

### 5.5 LLM - 生成资源编排草案

节点类型：`LLM`

节点名建议：`生成资源编排草案`

输入：

- `taskIntent`
- `requirementPlan`
- 候选资源子图查询结果

输出结构必须对齐本地接口 `ResourceOrchestrationDraft`：

```json
{
  "id": "orchestration-draft-001",
  "taskIntent": {
    "missionType": "侦察打击",
    "operationArea": "台湾东部海域",
    "side": "blue",
    "objectives": ["建立前出侦察", "压制海上目标"],
    "constraints": ["不进入禁入区"]
  },
  "requirementPlan": {
    "requiredCapabilities": ["air_recon", "long_range_strike"],
    "requiredChains": ["command", "communication", "detection", "strike"],
    "preferredResourceTypes": ["air-recon", "air-multirole"]
  },
  "selectedResources": [
    {
      "resourceId": "platform-blue-recon-001",
      "role": "reconnaissance",
      "reason": "具备电子侦察能力",
      "evidenceIds": ["rel-recon-detects-zone"]
    }
  ],
  "chains": [
    {
      "chainType": "detection",
      "relationshipIds": ["rel-recon-detects-zone"],
      "explanation": "侦察平台覆盖目标区域"
    }
  ],
  "evidence": [
    {
      "id": "rel-recon-detects-zone",
      "type": "relationship",
      "label": "侦察覆盖关系",
      "source": "resource-graph"
    }
  ],
  "summary": "基于候选资源子图生成首版资源编排草案。"
}
```

提示词约束：

- `selectedResources.resourceId` 只能从候选 `nodes[].id` 里选
- `chains.relationshipIds` 只能从候选 `relationships[].id` 里选
- 不允许生成候选集合外的资源和关系
- `role` 只能使用：
  - `command`
  - `reconnaissance`
  - `electronic-warfare`
  - `strike`
  - `communication-relay`
  - `support`

### 5.6 HTTP - 校验资源编排

节点类型：`HTTP Request`

节点名建议：`校验资源编排`

配置建议：

- Method: `POST`
- URL: `http://host.docker.internal:3000/api/resource-graph/validate-orchestration`
- Headers:
  - `Content-Type: application/json`

Body：

```json
{{#生成资源编排草案.text#}}
```

说明：

- 如果 Dify 当前节点不能直接把 LLM 输出作为原始 JSON body，建议先加一个模板节点，把 LLM JSON 原样透传到变量 `orchestration_draft_json`
- 然后 body 写 `{{#orchestration_draft_json#}}`

期望响应结构：

```json
{
  "valid": true,
  "issues": []
}
```

### 5.7 IF - 编排是否通过

节点类型：`IF / ELSE`

节点名建议：`编排校验通过?`

条件：

- `{{#校验资源编排.body.valid#}} == true`

分支：

- `true` -> 进入“生成想定草案”
- `false` -> 进入“校验失败修正”

### 5.8 LLM - 校验失败修正

节点类型：`LLM`

节点名建议：`按校验结果修正编排`

输入：

- 上一次编排草案
- 校验结果 `issues`
- 候选资源子图

输出：

- 仍然输出完整 `ResourceOrchestrationDraft`

提示词重点：

- 只能修正被 `issues` 指出的部分
- 仍然不能越过候选资源范围
- 如果无法修正，也要明确给出一个保守草案，而不是留空

### 5.9 HTTP - 再次校验资源编排

节点类型：`HTTP Request`

节点名建议：`二次校验资源编排`

配置与第一次校验一致，只是 body 换成修正后的草案。

### 5.10 IF - 二次校验是否通过

节点类型：`IF / ELSE`

节点名建议：`二次校验通过?`

条件：

- `{{#二次校验资源编排.body.valid#}} == true`

分支：

- `true` -> 进入“生成想定草案”
- `false` -> 进入“失败输出”

失败输出建议：

- 直接把 `issues` 返回给用户
- 不再继续生成想定

### 5.11 HTTP - 生成想定草案

节点类型：`HTTP Request`

节点名建议：`生成想定草案`

配置建议：

- Method: `POST`
- URL: `http://host.docker.internal:3000/api/scenario/generate-from-orchestration`
- Headers:
  - `Content-Type: application/json`

Body：

- 如果一次校验通过，就传第一次编排草案
- 如果走过修正分支，就传修正后的编排草案

建议通过前一个 IF 分支统一落到变量 `final_orchestration_draft`

### 5.12 HTTP - 校验并暂存草案

节点类型：`HTTP Request`

节点名建议：`校验并暂存草案`

配置建议：

- Method: `POST`
- URL: `http://host.docker.internal:3000/api/scenario/validate-and-stage`
- Headers:
  - `Content-Type: application/json`

Body：

```json
{{#生成想定草案.body#}}
```

说明：

- 当草案包含 `validation.severity = error` 的问题时，这个接口会返回 `422`
- 所以这个节点要配置错误分支，不要默认让 workflow 整体异常中断后用户看不到原因

### 5.13 Answer - 输出待确认结果

节点类型：`Answer / Template`

节点名建议：`输出待确认草案`

建议输出内容：

- 任务意图摘要
- 需求规划摘要
- 选中的资源列表
- 关键链路摘要
- 暂存结果 ID
- 下一步待人工确认

建议模板示例：

```md
已生成待确认草案。

任务类型：{{#意图解析.taskIntent.missionType#}}
作战区域：{{#意图解析.taskIntent.operationArea#}}
阵营：{{#意图解析.taskIntent.side#}}

资源编排摘要：
{{#生成资源编排草案.summary#}}

暂存草案结果：
{{#校验并暂存草案.body.message#}}
```

### 5.14 Human Input - 人工确认

节点类型：`Human Input`

节点名建议：`人工确认草案`

用途：

- 在 Dify 中停住，要求人工给出确认结果

建议表单字段：

| 字段标签 | 变量名 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 是否确认该草案 | `approval` | 单选 | 是 | `confirm` | `confirm` / `reject` |
| 驳回原因 | `reject_reason` | 段落文本 | 否 | 空 | 当 `approval=reject` 时填写 |

建议展示内容：

- 任务意图
- 资源编排摘要
- 校验结果
- 当前暂存状态

### 5.15 IF - 是否确认

节点类型：`IF / ELSE`

节点名建议：`是否确认草案`

条件：

- `{{#人工确认草案.approval#}} == "confirm"`

分支：

- `true` -> `确认暂存草案`
- `false` -> `拒绝暂存草案`

### 5.16 HTTP - 确认暂存草案

节点类型：`HTTP Request`

节点名建议：`确认暂存草案`

配置建议：

- Method: `POST`
- URL: `http://host.docker.internal:3000/api/scenario/staged-draft-confirm`
- Headers:
  - `Content-Type: application/json`

Body：

```json
{}
```

说明：

- 当前接口不需要额外参数
- 它确认的是“当前已暂存草案”

### 5.17 HTTP - 拒绝暂存草案

节点类型：`HTTP Request`

节点名建议：`拒绝暂存草案`

配置建议：

- Method: `POST`
- URL: `http://host.docker.internal:3000/api/scenario/staged-draft-reject`
- Headers:
  - `Content-Type: application/json`

Body：

```json
{
  "reason": "{{#人工确认草案.reject_reason#}}"
}
```

### 5.18 Answer - 最终输出

节点类型：`Answer`

节点名建议：`输出最终结果`

确认分支返回建议：

```md
草案已确认。

系统已将当前想定草案从 staged 状态推进到 confirmed，可继续进入后续 ActionPlan 与推演执行链路。
```

驳回分支返回建议：

```md
草案已驳回。

驳回原因：{{#人工确认草案.reject_reason#}}

建议回到资源编排节点重新生成或调整需求规划。
```

## 6. 当前最值得先做成的“可跑版本”

如果你希望先求稳，建议先落这个缩减版：

1. `开始`
2. `意图解析`
3. `资源需求规划`
4. `查询候选资源子图`
5. `生成资源编排草案`
6. `校验资源编排`
7. `失败则修正一次`
8. `生成想定草案`
9. `校验并暂存草案`
10. `输出待确认结果`

也就是：

- 先不在 Dify 里做人审节点
- Dify 只负责把草案送进 `staged`
- 真正确认 / 拒绝先放在 `ai-blue-simu-sys` 前端里做

这样更适合首期联调。

## 7. Dify 环境与本地联调要点

当前这套本地环境里，Dify 节点访问本机 `ai-blue-simu-sys` server 时必须使用：

```text
http://host.docker.internal:3000
```

不能写：

```text
http://localhost:3000
```

原因是：

- Dify workflow 的 HTTP 请求是从容器里发起的
- 容器里的 `localhost` 指向容器自身，不是宿主机

## 8. 本地接口清单

当前首期闭环已可用接口：

- `GET /api/health`
- `POST /api/resource-graph/query-candidates`
- `POST /api/resource-graph/validate-orchestration`
- `POST /api/scenario/generate-from-orchestration`
- `POST /api/scenario/validate-and-stage`
- `GET /api/scenario/staged-draft`
- `POST /api/scenario/staged-draft-confirm`
- `POST /api/scenario/staged-draft-reject`

对应宿主机基地址：

```text
http://host.docker.internal:3000
```

## 9. 下一步建议

按优先级建议这样推进：

1. 先在 Dify 中落“缩减版 10 节点流程”
2. 跑通 `query-candidates -> validate-orchestration -> generate-from-orchestration -> validate-and-stage`
3. 再决定人工确认放在 Dify 还是继续留在 `ai-blue-simu-sys` 前端
4. 等这个主链稳定后，再接 RAG 文档知识增强

