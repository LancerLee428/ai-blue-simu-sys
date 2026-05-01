# AI Workflow 资源编排实施计划

> **给执行 Agent 的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。所有步骤使用复选框 `- [ ]` 跟踪执行状态。

**目标：** 打通首期 AI Workflow 资源编排闭环，让外部 Dify/AI Workflow 能查询真实资源候选、校验 AI 编排结果、生成待确认的 `TacticalScenario` 草案，并在人工确认后再进入 `ActionPlan` 和推演。

**架构：** Dify 或其他 AI Workflow 平台负责意图解析、节点编排和大模型生成；本系统负责资源事实、图谱关系、规则校验、想定转换、草案暂存和推演门禁。首期先用类型化的内存资源图谱和 Node 工具接口落地，不引入生产级图数据库。

**技术栈：** TypeScript workspace、Node HTTP server、Vue 3、Pinia、现有 `TacticalScenario` 类型、现有 `ActionPlan` store、现有 `TacticalValidator`、根目录 `npm run build` 构建门禁。

---

## 1. 范围说明

本计划实现设计文档 [2026-05-01-ai-workflow-resource-orchestration-design.md](/Users/lancer/code/15s/ai-blue-simu-sys/docs/superpowers/specs/2026-05-01-ai-workflow-resource-orchestration-design.md) 中的首期 MVP。

首期实现内容：

- 定义 AI Workflow 与本系统之间的 DTO 契约。
- 建立最小资源图谱演示数据。
- 暴露资源候选查询与资源编排校验接口。
- 暴露“资源编排结果 → 想定草案”的转换接口。
- 增加想定草案暂存、确认、拒绝生命周期。
- 在前端 AI Assistant 区域增加最小草案查看与确认入口。
- 补充 Dify/AI Workflow 工具接口说明。

首期不做：

- 生产级图数据库。
- 完整 Dify 工作流导出文件。
- 完整 RAG 入库、切片、向量检索。
- 推演后复盘评估。
- 绕过人工确认的自动推演执行。

## 2. 文件结构

计划涉及以下文件：

- 修改 `packages/ai-core/src/index.ts`
  - 定义 AI Workflow 节点输入输出 DTO，作为 server、web、外部工具接口的共享契约。
- 修改 `packages/ontology/src/index.ts`
  - 增加演示资源图谱节点和关系。
- 修改 `packages/scenario/src/index.ts`
  - 增加想定草案状态、草案记录、暂存结果类型。
- 新建 `apps/server/src/modules/resource-graph/index.ts`
  - 实现资源候选子图查询与资源编排校验。
- 新建 `apps/server/src/modules/ai-workflow/index.ts`
  - 实现资源编排结果到 `TacticalScenarioDraft` 的转换。
- 修改 `apps/server/src/modules/scenario-workspace/index.ts`
  - 增加内存态草案暂存、确认、拒绝、读取能力。
- 修改 `apps/server/src/index.ts`
  - 暴露 AI Workflow 工具 API。
- 修改 `apps/web/src/app/types/platform.ts`
  - 在平台骨架类型中增加暂存草案字段。
- 修改 `apps/web/src/app/state/platform-state.ts`
  - 增加暂存草案读取、确认、拒绝请求。
- 修改 `apps/web/src/stores/platform.ts`
  - 将暂存草案动作暴露给 Vue 组件。
- 修改 `apps/web/src/components/right-panel/AIAssistantModule.vue`
  - 在现有 AI Assistant 面板中增加最小草案确认入口。
- 新建 `docs/ai-workflow-tool-api.md`
  - 给 Dify/外部 AI Workflow 使用的工具接口文档。

## 3. 任务 1：定义 AI Workflow 共享 DTO

**文件：**

- 修改 `packages/ai-core/src/index.ts`

### 步骤

- [ ] **步骤 1：在现有部署类型后追加 AI Workflow DTO**

在 `packages/ai-core/src/index.ts` 的 `export const AI_ASSISTANT_MODULE = 'ai-assistant';` 后追加：

```ts
export type WorkflowEvidence = {
  id: string;
  type: 'relationship' | 'resource' | 'rag-document' | 'validation';
  label: string;
  source: string;
};

export type TaskIntent = {
  missionType: string;
  operationArea: string;
  side: 'red' | 'blue';
  objectives: string[];
  constraints: string[];
};

export type ResourceRequirementPlan = {
  requiredCapabilities: string[];
  requiredChains: Array<'command' | 'communication' | 'detection' | 'strike' | 'support'>;
  preferredResourceTypes: string[];
};

export type ResourceGraphNodeType =
  | 'force-unit'
  | 'platform'
  | 'weapon'
  | 'sensor'
  | 'geo-zone'
  | 'mission';

export type ResourceGraphNode = {
  id: string;
  type: ResourceGraphNodeType;
  name: string;
  side?: 'red' | 'blue' | 'neutral';
  capabilities: string[];
  status: 'available' | 'unavailable' | 'reserved';
  metadata: Record<string, string | number | boolean | string[]>;
};

export type ResourceRelationshipType =
  | 'belongs_to'
  | 'can_command'
  | 'can_communicate'
  | 'can_detect'
  | 'can_strike'
  | 'can_support'
  | 'deployable_to'
  | 'suitable_for';

export type ResourceGraphRelationship = {
  id: string;
  type: ResourceRelationshipType;
  from: string;
  to: string;
  label: string;
  metadata: Record<string, string | number | boolean>;
};

export type CandidateResourceGraphRequest = {
  taskIntent: TaskIntent;
  requirementPlan: ResourceRequirementPlan;
};

export type CandidateResourceGraph = {
  request: CandidateResourceGraphRequest;
  nodes: ResourceGraphNode[];
  relationships: ResourceGraphRelationship[];
  unavailableResources: ResourceGraphNode[];
  warnings: string[];
};

export type SelectedResourceRole =
  | 'command'
  | 'reconnaissance'
  | 'electronic-warfare'
  | 'strike'
  | 'communication-relay'
  | 'support';

export type SelectedResource = {
  resourceId: string;
  role: SelectedResourceRole;
  reason: string;
  evidenceIds: string[];
};

export type ResourceChainDraft = {
  chainType: 'command' | 'communication' | 'detection' | 'strike' | 'support';
  relationshipIds: string[];
  explanation: string;
};

export type ResourceOrchestrationDraft = {
  id: string;
  taskIntent: TaskIntent;
  requirementPlan: ResourceRequirementPlan;
  selectedResources: SelectedResource[];
  chains: ResourceChainDraft[];
  evidence: WorkflowEvidence[];
  summary: string;
};

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  targetId?: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  issues: WorkflowValidationIssue[];
};

export type TacticalScenarioDraft = {
  id: string;
  orchestrationDraftId: string;
  status: 'generated' | 'validation_failed' | 'staged' | 'confirmed' | 'rejected';
  summary: string;
  scenario: unknown;
  evidence: WorkflowEvidence[];
  validation: WorkflowValidationResult;
  createdAt: string;
};
```

- [ ] **步骤 2：执行类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/ai-core run typecheck
```

预期：命令退出码为 0。

- [ ] **步骤 3：提交**

运行：

```bash
git add packages/ai-core/src/index.ts
git commit -m "feat(ai): 定义AI Workflow资源编排契约"
```

## 4. 任务 2：增加资源图谱演示数据

**文件：**

- 修改 `packages/ontology/src/index.ts`

### 步骤

- [ ] **步骤 1：引入共享类型**

在 `packages/ontology/src/index.ts` 顶部增加：

```ts
import type {
  ResourceGraphNode,
  ResourceGraphRelationship,
} from '@ai-blue-simu-sys/ai-core';
```

- [ ] **步骤 2：追加资源图谱节点**

在文件末尾追加：

```ts
export const demoResourceGraphNodes: ResourceGraphNode[] = [
  {
    id: 'unit-blue-c2-001',
    type: 'force-unit',
    name: '蓝方联合指挥节点',
    side: 'blue',
    capabilities: ['command_link', 'communication_control'],
    status: 'available',
    metadata: {
      echelon: 'joint-command',
      homeRegion: '台湾东部海域',
    },
  },
  {
    id: 'platform-blue-recon-001',
    type: 'platform',
    name: '电子侦察平台-07',
    side: 'blue',
    capabilities: ['air_recon', 'ew_support', 'electronic_detection'],
    status: 'available',
    metadata: {
      platformType: 'air-recon',
      maxRangeKm: 1800,
      sensorRangeKm: 350,
      defaultLongitude: 123.8,
      defaultLatitude: 24.6,
      defaultAltitude: 9000,
    },
  },
  {
    id: 'platform-blue-jammer-001',
    type: 'platform',
    name: '电子压制平台-03',
    side: 'blue',
    capabilities: ['ew_support', 'communication_jamming'],
    status: 'available',
    metadata: {
      platformType: 'air-jammer',
      maxRangeKm: 1500,
      sensorRangeKm: 180,
      defaultLongitude: 124.2,
      defaultLatitude: 24.9,
      defaultAltitude: 8500,
    },
  },
  {
    id: 'platform-blue-strike-001',
    type: 'platform',
    name: '远程打击编队-11',
    side: 'blue',
    capabilities: ['long_range_strike', 'anti_surface_strike'],
    status: 'available',
    metadata: {
      platformType: 'air-multirole',
      maxRangeKm: 2200,
      strikeRangeKm: 450,
      defaultLongitude: 123.5,
      defaultLatitude: 24.1,
      defaultAltitude: 10000,
    },
  },
  {
    id: 'sensor-blue-electronic-001',
    type: 'sensor',
    name: '宽域电子侦察载荷',
    side: 'blue',
    capabilities: ['electronic_detection', 'signal_intercept'],
    status: 'available',
    metadata: {
      sensorType: 'ew',
      rangeKm: 350,
    },
  },
  {
    id: 'weapon-blue-stand-off-001',
    type: 'weapon',
    name: '防区外精确打击弹药',
    side: 'blue',
    capabilities: ['long_range_strike'],
    status: 'available',
    metadata: {
      weaponType: 'stand-off',
      rangeKm: 450,
    },
  },
  {
    id: 'geo-zone-east-taiwan-sea',
    type: 'geo-zone',
    name: '台湾东部海域',
    side: 'neutral',
    capabilities: ['air_operation_area', 'maritime_operation_area'],
    status: 'available',
    metadata: {
      lonMin: 122,
      lonMax: 126,
      latMin: 22,
      latMax: 26,
    },
  },
  {
    id: 'mission-recon-strike',
    type: 'mission',
    name: '侦察打击任务',
    side: 'neutral',
    capabilities: ['air_recon', 'ew_support', 'long_range_strike', 'command_link'],
    status: 'available',
    metadata: {
      missionType: '侦察打击',
    },
  },
];
```

- [ ] **步骤 3：追加资源图谱关系**

在 `demoResourceGraphNodes` 后追加：

```ts
export const demoResourceGraphRelationships: ResourceGraphRelationship[] = [
  {
    id: 'rel-blue-c2-command-recon',
    type: 'can_command',
    from: 'unit-blue-c2-001',
    to: 'platform-blue-recon-001',
    label: '指挥电子侦察平台',
    metadata: { latencyMs: 80 },
  },
  {
    id: 'rel-blue-c2-command-jammer',
    type: 'can_command',
    from: 'unit-blue-c2-001',
    to: 'platform-blue-jammer-001',
    label: '指挥电子压制平台',
    metadata: { latencyMs: 90 },
  },
  {
    id: 'rel-blue-c2-command-strike',
    type: 'can_command',
    from: 'unit-blue-c2-001',
    to: 'platform-blue-strike-001',
    label: '指挥远程打击编队',
    metadata: { latencyMs: 120 },
  },
  {
    id: 'rel-recon-carries-sensor',
    type: 'belongs_to',
    from: 'sensor-blue-electronic-001',
    to: 'platform-blue-recon-001',
    label: '侦察载荷挂载于电子侦察平台',
    metadata: {},
  },
  {
    id: 'rel-strike-carries-weapon',
    type: 'belongs_to',
    from: 'weapon-blue-stand-off-001',
    to: 'platform-blue-strike-001',
    label: '防区外弹药挂载于远程打击编队',
    metadata: {},
  },
  {
    id: 'rel-recon-detects-zone',
    type: 'can_detect',
    from: 'platform-blue-recon-001',
    to: 'geo-zone-east-taiwan-sea',
    label: '电子侦察平台覆盖台湾东部海域',
    metadata: { rangeKm: 350 },
  },
  {
    id: 'rel-strike-covers-zone',
    type: 'can_strike',
    from: 'platform-blue-strike-001',
    to: 'geo-zone-east-taiwan-sea',
    label: '远程打击编队覆盖台湾东部海域',
    metadata: { rangeKm: 450 },
  },
  {
    id: 'rel-recon-communicates-jammer',
    type: 'can_communicate',
    from: 'platform-blue-recon-001',
    to: 'platform-blue-jammer-001',
    label: '侦察平台向压制平台共享目标信号',
    metadata: { bandwidthMbps: 20 },
  },
  {
    id: 'rel-jammer-supports-strike',
    type: 'can_support',
    from: 'platform-blue-jammer-001',
    to: 'platform-blue-strike-001',
    label: '电子压制平台支援远程打击编队',
    metadata: {},
  },
  {
    id: 'rel-mission-suitable-recon',
    type: 'suitable_for',
    from: 'platform-blue-recon-001',
    to: 'mission-recon-strike',
    label: '电子侦察平台适合侦察打击任务',
    metadata: {},
  },
  {
    id: 'rel-mission-suitable-strike',
    type: 'suitable_for',
    from: 'platform-blue-strike-001',
    to: 'mission-recon-strike',
    label: '远程打击编队适合侦察打击任务',
    metadata: {},
  },
  {
    id: 'rel-platform-deployable-east-taiwan',
    type: 'deployable_to',
    from: 'platform-blue-recon-001',
    to: 'geo-zone-east-taiwan-sea',
    label: '电子侦察平台可部署至台湾东部海域',
    metadata: {},
  },
];
```

- [ ] **步骤 4：执行类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/ontology run typecheck
```

预期：命令退出码为 0。

- [ ] **步骤 5：提交**

运行：

```bash
git add packages/ontology/src/index.ts
git commit -m "feat(ontology): 增加资源图谱演示数据"
```

## 5. 任务 3：实现资源图谱服务模块

**文件：**

- 新建 `apps/server/src/modules/resource-graph/index.ts`
- 修改 `apps/server/src/index.ts`

### 步骤

- [ ] **步骤 1：新建资源图谱模块**

创建 `apps/server/src/modules/resource-graph/index.ts`：

```ts
import type {
  CandidateResourceGraph,
  CandidateResourceGraphRequest,
  ResourceGraphNode,
  ResourceOrchestrationDraft,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from '@ai-blue-simu-sys/ai-core';
import {
  demoResourceGraphNodes,
  demoResourceGraphRelationships,
} from '@ai-blue-simu-sys/ontology';

export const resourceGraphModule = {
  key: 'resource-graph',
  title: 'Resource Graph',
  description: '资源候选子图查询、资源编排校验与 AI Workflow 工具入口。',
};

function matchesSide(node: ResourceGraphNode, side: CandidateResourceGraphRequest['taskIntent']['side']) {
  return !node.side || node.side === 'neutral' || node.side === side;
}

function matchesCapability(node: ResourceGraphNode, capabilities: string[]) {
  if (capabilities.length === 0) return true;
  return capabilities.some((capability) => node.capabilities.includes(capability));
}

export function queryCandidateResourceGraph(
  request: CandidateResourceGraphRequest,
): CandidateResourceGraph {
  const capabilities = [
    ...request.requirementPlan.requiredCapabilities,
    ...request.requirementPlan.preferredResourceTypes,
  ];

  const nodes = demoResourceGraphNodes.filter((node) =>
    matchesSide(node, request.taskIntent.side) && matchesCapability(node, capabilities)
  );

  const zoneNodes = demoResourceGraphNodes.filter(
    (node) => node.type === 'geo-zone'
      && node.name.includes(request.taskIntent.operationArea.replace(/海域|空域|区域/g, '')),
  );

  const missionNodes = demoResourceGraphNodes.filter(
    (node) => node.type === 'mission'
      && String(node.metadata.missionType ?? '') === request.taskIntent.missionType,
  );

  const nodeMap = new Map<string, ResourceGraphNode>();
  [...nodes, ...zoneNodes, ...missionNodes].forEach((node) => nodeMap.set(node.id, node));

  let expanded = true;
  while (expanded) {
    expanded = false;
    demoResourceGraphRelationships.forEach((relationship) => {
      if (nodeMap.has(relationship.from) || nodeMap.has(relationship.to)) {
        const from = demoResourceGraphNodes.find((node) => node.id === relationship.from);
        const to = demoResourceGraphNodes.find((node) => node.id === relationship.to);
        if (from && matchesSide(from, request.taskIntent.side) && !nodeMap.has(from.id)) {
          nodeMap.set(from.id, from);
          expanded = true;
        }
        if (to && matchesSide(to, request.taskIntent.side) && !nodeMap.has(to.id)) {
          nodeMap.set(to.id, to);
          expanded = true;
        }
      }
    });
  }

  const resultNodes = Array.from(nodeMap.values());
  const nodeIds = new Set(resultNodes.map((node) => node.id));
  const relationships = demoResourceGraphRelationships.filter(
    (relationship) => nodeIds.has(relationship.from) && nodeIds.has(relationship.to),
  );

  return {
    request,
    nodes: resultNodes.filter((node) => node.status === 'available'),
    relationships,
    unavailableResources: resultNodes.filter((node) => node.status !== 'available'),
    warnings: relationships.length === 0 ? ['未查询到可用作战链路关系。'] : [],
  };
}

export function validateResourceOrchestration(
  draft: ResourceOrchestrationDraft,
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set(demoResourceGraphNodes.map((node) => node.id));
  const relationshipIds = new Set(demoResourceGraphRelationships.map((relationship) => relationship.id));

  draft.selectedResources.forEach((resource) => {
    if (!nodeIds.has(resource.resourceId)) {
      issues.push({
        code: 'RESOURCE_NOT_FOUND',
        severity: 'error',
        targetId: resource.resourceId,
        message: `资源 ${resource.resourceId} 不存在。`,
      });
    }
  });

  draft.chains.forEach((chain) => {
    if (chain.relationshipIds.length === 0) {
      issues.push({
        code: 'CHAIN_EMPTY',
        severity: 'warning',
        message: `${chain.chainType} 链路为空。`,
      });
    }

    chain.relationshipIds.forEach((relationshipId) => {
      if (!relationshipIds.has(relationshipId)) {
        issues.push({
          code: 'RELATIONSHIP_NOT_FOUND',
          severity: 'error',
          targetId: relationshipId,
          message: `关系 ${relationshipId} 不存在。`,
        });
      }
    });
  });

  const selectedIds = new Set(draft.selectedResources.map((resource) => resource.resourceId));
  const hasRecon = Array.from(selectedIds).some((id) => {
    const node = demoResourceGraphNodes.find((item) => item.id === id);
    return node?.capabilities.includes('air_recon') || node?.capabilities.includes('electronic_detection');
  });
  const hasStrike = Array.from(selectedIds).some((id) => {
    const node = demoResourceGraphNodes.find((item) => item.id === id);
    return node?.capabilities.includes('long_range_strike') || node?.capabilities.includes('anti_surface_strike');
  });

  if (draft.requirementPlan.requiredCapabilities.includes('air_recon') && !hasRecon) {
    issues.push({
      code: 'RECON_CAPABILITY_MISSING',
      severity: 'error',
      message: '资源编排缺少侦察能力资源。',
    });
  }

  if (draft.requirementPlan.requiredCapabilities.includes('long_range_strike') && !hasStrike) {
    issues.push({
      code: 'STRIKE_CAPABILITY_MISSING',
      severity: 'error',
      message: '资源编排缺少远程打击能力资源。',
    });
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}
```

- [ ] **步骤 2：在 server 入口增加 import**

在 `apps/server/src/index.ts` 增加：

```ts
import type {
  CandidateResourceGraphRequest,
  ResourceOrchestrationDraft,
} from '@ai-blue-simu-sys/ai-core';
import {
  queryCandidateResourceGraph,
  resourceGraphModule,
  validateResourceOrchestration,
} from './modules/resource-graph';
```

- [ ] **步骤 3：将资源图谱模块加入平台模块列表**

在 `createPlatformSkeleton()` 的 `modules` 数组中，将 `resourceGraphModule` 放在 `ontologyModule` 后面：

```ts
modules: [
  ontologyModule,
  resourceGraphModule,
  scenarioWorkspaceModule,
  situationWorkbenchModule,
  aiAssistantModule,
  governanceModule,
],
```

- [ ] **步骤 4：增加资源图谱接口路由**

在 `handleNodeRequest` 中，放到 `/api/ai/deployment-draft` 路由之前：

```ts
if (method === 'POST' && url.pathname === '/api/resource-graph/query-candidates') {
  const command = await readJsonBody<CandidateResourceGraphRequest>(request);
  writeJson(response, 200, queryCandidateResourceGraph(command));
  return;
}

if (method === 'POST' && url.pathname === '/api/resource-graph/validate-orchestration') {
  const command = await readJsonBody<ResourceOrchestrationDraft>(request);
  writeJson(response, 200, validateResourceOrchestration(command));
  return;
}
```

- [ ] **步骤 5：执行 server 类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/server run typecheck
```

预期：命令退出码为 0。

- [ ] **步骤 6：提交**

运行：

```bash
git add apps/server/src/index.ts apps/server/src/modules/resource-graph/index.ts
git commit -m "feat(server): 暴露资源图谱工具接口"
```

## 6. 任务 4：增加想定草案类型与暂存生命周期

**文件：**

- 修改 `packages/scenario/src/index.ts`
- 修改 `apps/server/src/modules/scenario-workspace/index.ts`

### 步骤

- [ ] **步骤 1：增加想定草案类型**

在 `packages/scenario/src/index.ts` 末尾追加：

```ts
export type ScenarioDraftStatus =
  | 'generated'
  | 'validation_failed'
  | 'staged'
  | 'confirmed'
  | 'rejected';

export type ScenarioDraftRecord = {
  id: string;
  orchestrationDraftId: string;
  status: ScenarioDraftStatus;
  summary: string;
  tacticalScenario: unknown;
  evidenceIds: string[];
  validationIssueCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScenarioStagingResult = {
  draft: ScenarioDraftRecord;
  scenarioWorkspace: ScenarioWorkspaceState;
};
```

- [ ] **步骤 2：在 scenario workspace 模块引入草案类型**

更新 `apps/server/src/modules/scenario-workspace/index.ts` 的 type import：

```ts
import type {
  ScenarioDraftRecord,
  ScenarioProjectionInput,
  ScenarioStagingResult,
  ScenarioVersionHistoryEntry,
  ScenarioWorkspaceState,
} from '@ai-blue-simu-sys/scenario';
```

- [ ] **步骤 3：增加暂存草案内存状态**

在 `previousScenarioWorkspaceState` 后增加：

```ts
let stagedScenarioDraft: ScenarioDraftRecord | null = null;
```

- [ ] **步骤 4：增加草案生命周期函数**

在 `apps/server/src/modules/scenario-workspace/index.ts` 末尾追加：

```ts
export function getStagedScenarioDraft() {
  return stagedScenarioDraft;
}

export function stageScenarioDraft(
  draft: Omit<ScenarioDraftRecord, 'status' | 'createdAt' | 'updatedAt'>,
): ScenarioStagingResult {
  const now = new Date().toISOString();
  stagedScenarioDraft = {
    ...draft,
    status: 'staged',
    createdAt: now,
    updatedAt: now,
  };

  scenarioWorkspaceState = {
    ...scenarioWorkspaceState,
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry(
        'draft_generated',
        scenarioWorkspaceState.projections.length,
        `AI Workflow 暂存草案：${draft.summary}`,
        scenarioWorkspaceState.scenario.versionLabel,
      ),
    ],
  };

  return {
    draft: stagedScenarioDraft,
    scenarioWorkspace: scenarioWorkspaceState,
  };
}

export function confirmStagedScenarioDraft() {
  if (!stagedScenarioDraft) {
    return {
      draft: null,
      scenarioWorkspace: scenarioWorkspaceState,
    };
  }

  stagedScenarioDraft = {
    ...stagedScenarioDraft,
    status: 'confirmed',
    updatedAt: new Date().toISOString(),
  };

  scenarioWorkspaceState = {
    ...scenarioWorkspaceState,
    scenario: {
      ...scenarioWorkspaceState.scenario,
      status: 'ready',
      versionLabel: 'v0.3',
    },
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry(
        'confirmed',
        scenarioWorkspaceState.projections.length,
        `确认 AI Workflow 草案：${stagedScenarioDraft.summary}`,
        'v0.3',
      ),
    ],
  };

  return {
    draft: stagedScenarioDraft,
    scenarioWorkspace: scenarioWorkspaceState,
  };
}

export function rejectStagedScenarioDraft(reason: string) {
  if (!stagedScenarioDraft) {
    return {
      draft: null,
      scenarioWorkspace: rejectScenarioDraft(reason),
    };
  }

  stagedScenarioDraft = {
    ...stagedScenarioDraft,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  };

  return {
    draft: stagedScenarioDraft,
    scenarioWorkspace: rejectScenarioDraft(reason),
  };
}
```

- [ ] **步骤 5：执行类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/scenario run typecheck
npm --workspace @ai-blue-simu-sys/server run typecheck
```

预期：两个命令退出码均为 0。

- [ ] **步骤 6：提交**

运行：

```bash
git add packages/scenario/src/index.ts apps/server/src/modules/scenario-workspace/index.ts
git commit -m "feat(scenario): 增加AI草案暂存生命周期"
```

## 7. 任务 5：增加 AI Workflow 想定草案接口

**文件：**

- 新建 `apps/server/src/modules/ai-workflow/index.ts`
- 修改 `apps/server/src/index.ts`

### 步骤

- [ ] **步骤 1：新建 AI Workflow 模块**

创建 `apps/server/src/modules/ai-workflow/index.ts`：

```ts
import type {
  ResourceGraphNode,
  ResourceOrchestrationDraft,
  TacticalScenarioDraft,
  WorkflowValidationResult,
} from '@ai-blue-simu-sys/ai-core';
import { demoResourceGraphNodes } from '@ai-blue-simu-sys/ontology';
import { validateResourceOrchestration } from '../resource-graph';

type TacticalScenarioEntity = {
  id: string;
  name: string;
  type: string;
  side: 'red' | 'blue';
  position: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
};

function getNumberMetadata(node: ResourceGraphNode, key: string, fallback: number) {
  const value = node.metadata[key];
  return typeof value === 'number' ? value : fallback;
}

function toEntity(node: ResourceGraphNode, side: 'red' | 'blue'): TacticalScenarioEntity {
  return {
    id: node.id,
    name: node.name,
    type: String(node.metadata.platformType ?? 'air-recon'),
    side,
    position: {
      longitude: getNumberMetadata(node, 'defaultLongitude', 123.8),
      latitude: getNumberMetadata(node, 'defaultLatitude', 24.6),
      altitude: getNumberMetadata(node, 'defaultAltitude', 8000),
    },
  };
}

function buildScenario(draft: ResourceOrchestrationDraft) {
  const selectedNodes = draft.selectedResources
    .map((resource) => demoResourceGraphNodes.find((node) => node.id === resource.resourceId))
    .filter((node): node is ResourceGraphNode => Boolean(node))
    .filter((node) => node.type === 'platform');

  const entities = selectedNodes.map((node) => toEntity(node, draft.taskIntent.side));
  const firstRecon = entities.find((entity) => entity.type.includes('recon')) ?? entities[0];
  const firstStrike = entities.find((entity) => entity.type.includes('multirole')) ?? entities[entities.length - 1];

  return {
    id: `scenario-${draft.id}`,
    version: 1,
    summary: draft.summary,
    metadata: {
      generatedAt: new Date().toISOString(),
      modelUsed: 'ai-workflow-orchestration',
      confidence: 0.85,
    },
    forces: [
      {
        side: draft.taskIntent.side,
        name: draft.taskIntent.side === 'blue' ? '蓝方 AI 编排兵力' : '红方 AI 编排兵力',
        entities,
      },
    ],
    routes: firstRecon && firstStrike ? [
      {
        entityId: firstStrike.id,
        side: draft.taskIntent.side,
        label: `${firstStrike.name} 进入 ${draft.taskIntent.operationArea}`,
        points: [
          { position: firstStrike.position, timestamp: 0 },
          { position: firstRecon.position, timestamp: 600 },
        ],
      },
    ] : [],
    detectionZones: firstRecon ? [
      {
        entityId: firstRecon.id,
        type: 'ew',
        radiusMeters: 350000,
        side: draft.taskIntent.side,
      },
    ] : [],
    strikeTasks: firstStrike ? [
      {
        id: `strike-${firstStrike.id}`,
        attackerId: firstStrike.id,
        targetId: 'target-placeholder',
        timestamp: 900,
        detail: `${firstStrike.name} 按 AI Workflow 编排执行远程打击。`,
      },
    ] : [],
    phases: [
      {
        id: 'phase-ai-workflow-1',
        name: '资源编排部署',
        startTime: 0,
        duration: 600,
        description: '根据资源图谱候选子图完成前出侦察、电子支援和打击编组部署。',
        events: [
          {
            timestamp: 0,
            type: 'deploy',
            detail: 'AI Workflow 草案进入部署阶段。',
          },
        ],
      },
    ],
  };
}

export function generateScenarioFromOrchestration(
  draft: ResourceOrchestrationDraft,
): TacticalScenarioDraft {
  const validation: WorkflowValidationResult = validateResourceOrchestration(draft);
  const scenario = buildScenario(draft);
  const status = validation.valid ? 'generated' : 'validation_failed';

  return {
    id: `scenario-draft-${draft.id}`,
    orchestrationDraftId: draft.id,
    status,
    summary: draft.summary,
    scenario,
    evidence: draft.evidence,
    validation,
    createdAt: new Date().toISOString(),
  };
}
```

- [ ] **步骤 2：在 server 入口增加 import**

在 `apps/server/src/index.ts` 增加：

```ts
import type { TacticalScenarioDraft } from '@ai-blue-simu-sys/ai-core';
import { generateScenarioFromOrchestration } from './modules/ai-workflow';
import {
  confirmStagedScenarioDraft,
  getStagedScenarioDraft,
  rejectStagedScenarioDraft,
  stageScenarioDraft,
} from './modules/scenario-workspace';
```

如果任务 3 已经引入了 `ResourceOrchestrationDraft`，合并为一个 type import：

```ts
import type {
  CandidateResourceGraphRequest,
  ResourceOrchestrationDraft,
  TacticalScenarioDraft,
} from '@ai-blue-simu-sys/ai-core';
```

- [ ] **步骤 3：增加想定生成与暂存路由**

在 `handleNodeRequest` 中，放到 `/api/scenario/confirm` 前：

```ts
if (method === 'POST' && url.pathname === '/api/scenario/generate-from-orchestration') {
  const command = await readJsonBody<ResourceOrchestrationDraft>(request);
  writeJson(response, 200, generateScenarioFromOrchestration(command));
  return;
}

if (method === 'POST' && url.pathname === '/api/scenario/validate-and-stage') {
  const command = await readJsonBody<TacticalScenarioDraft>(request);
  const blockingErrors = command.validation.issues.filter((issue) => issue.severity === 'error');

  if (blockingErrors.length > 0) {
    writeJson(response, 422, {
      message: 'AI Workflow 草案校验未通过，不能暂存。',
      validation: command.validation,
    });
    return;
  }

  writeJson(response, 200, stageScenarioDraft({
    id: command.id,
    orchestrationDraftId: command.orchestrationDraftId,
    summary: command.summary,
    tacticalScenario: command.scenario,
    evidenceIds: command.evidence.map((item) => item.id),
    validationIssueCount: command.validation.issues.length,
  }));
  return;
}

if (method === 'GET' && url.pathname === '/api/scenario/staged-draft') {
  writeJson(response, 200, { draft: getStagedScenarioDraft() });
  return;
}

if (method === 'POST' && url.pathname === '/api/scenario/staged-draft-confirm') {
  writeJson(response, 200, confirmStagedScenarioDraft());
  return;
}

if (method === 'POST' && url.pathname === '/api/scenario/staged-draft-reject') {
  const command = await readJsonBody<{ reason: string }>(request);
  writeJson(response, 200, rejectStagedScenarioDraft(command.reason));
  return;
}
```

- [ ] **步骤 4：执行 server 类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/server run typecheck
```

预期：命令退出码为 0。

- [ ] **步骤 5：提交**

运行：

```bash
git add apps/server/src/index.ts apps/server/src/modules/ai-workflow/index.ts
git commit -m "feat(server): 增加AI Workflow想定草案接口"
```

## 8. 任务 6：接入前端客户端与 Store

**文件：**

- 修改 `apps/web/src/app/types/platform.ts`
- 修改 `apps/web/src/app/state/platform-state.ts`
- 修改 `apps/web/src/stores/platform.ts`

### 步骤

- [ ] **步骤 1：增加平台暂存草案类型**

在 `apps/web/src/app/types/platform.ts` 引入：

```ts
import type { TacticalScenarioDraft } from '@ai-blue-simu-sys/ai-core';
```

在 `PlatformSkeleton` 类型中增加：

```ts
stagedScenarioDraft?: TacticalScenarioDraft | null;
```

- [ ] **步骤 2：给 fallback 平台状态增加暂存草案字段**

在 `apps/web/src/app/state/platform-state.ts` 的 `FALLBACK_PLATFORM` 内增加：

```ts
stagedScenarioDraft: null,
```

- [ ] **步骤 3：增加暂存草案请求函数**

在 `apps/web/src/app/state/platform-state.ts` 末尾追加：

```ts
export async function loadStagedScenarioDraft() {
  try {
    const response = await fetch(`${API_BASE_URL}/scenario/staged-draft`);
    if (!response.ok) {
      throw new Error('暂存草案拉取失败');
    }

    const result = (await response.json()) as {
      draft: PlatformSkeleton['stagedScenarioDraft'];
    };

    platformState = {
      ...platformState,
      stagedScenarioDraft: result.draft,
    };
    apiAvailable = true;
    return platformState;
  } catch {
    apiAvailable = false;
    return platformState;
  }
}

export async function confirmStagedScenarioDraftRequest() {
  try {
    const response = await fetch(`${API_BASE_URL}/scenario/staged-draft-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('暂存草案确认失败');
    }

    const result = (await response.json()) as {
      draft: PlatformSkeleton['stagedScenarioDraft'];
      scenarioWorkspace: PlatformSkeleton['scenarioWorkspace'];
    };

    platformState = {
      ...platformState,
      stagedScenarioDraft: result.draft,
      scenarioWorkspace: result.scenarioWorkspace,
    };
    apiAvailable = true;
    return platformState;
  } catch {
    apiAvailable = false;
    return platformState;
  }
}

export async function rejectStagedScenarioDraftRequest(reason: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/scenario/staged-draft-reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      throw new Error('暂存草案拒绝失败');
    }

    const result = (await response.json()) as {
      draft: PlatformSkeleton['stagedScenarioDraft'];
      scenarioWorkspace: PlatformSkeleton['scenarioWorkspace'];
    };

    platformState = {
      ...platformState,
      stagedScenarioDraft: result.draft,
      scenarioWorkspace: result.scenarioWorkspace,
    };
    apiAvailable = true;
    return platformState;
  } catch {
    apiAvailable = false;
    return platformState;
  }
}
```

- [ ] **步骤 4：在 store 中引入请求函数**

更新 `apps/web/src/stores/platform.ts` 的 import：

```ts
import {
  FALLBACK_PLATFORM,
  confirmStagedScenarioDraftRequest,
  loadPlatformState,
  loadStagedScenarioDraft,
  requestDeploymentDraft,
  rejectDeploymentDraftRequest,
  confirmDeploymentDraftRequest,
  rejectStagedScenarioDraftRequest,
  undoDeploymentConfirmationRequest,
} from '../app/state/platform-state';
```

- [ ] **步骤 5：增加 store action**

在 `usePlatformStore` 的 `return` 之前增加：

```ts
async function refreshStagedScenarioDraft() {
  loading.value = true;
  error.value = null;
  try {
    platform.value = await loadStagedScenarioDraft();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load staged scenario draft';
  } finally {
    loading.value = false;
  }
}

async function confirmStagedDraft() {
  loading.value = true;
  error.value = null;
  try {
    platform.value = await confirmStagedScenarioDraftRequest();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to confirm staged draft';
  } finally {
    loading.value = false;
  }
}

async function rejectStagedDraft(reason: string) {
  loading.value = true;
  error.value = null;
  try {
    platform.value = await rejectStagedScenarioDraftRequest(reason);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to reject staged draft';
  } finally {
    loading.value = false;
  }
}
```

在 `return` 对象中增加：

```ts
refreshStagedScenarioDraft,
confirmStagedDraft,
rejectStagedDraft,
```

- [ ] **步骤 6：执行 web 类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/web run typecheck
```

预期：命令退出码为 0。

- [ ] **步骤 7：提交**

运行：

```bash
git add apps/web/src/app/types/platform.ts apps/web/src/app/state/platform-state.ts apps/web/src/stores/platform.ts
git commit -m "feat(web): 接入AI暂存草案状态"
```

## 9. 任务 7：增加最小 AI Assistant 草案确认入口

**文件：**

- 修改 `apps/web/src/components/right-panel/AIAssistantModule.vue`

### 步骤

- [ ] **步骤 1：增加暂存草案计算属性和动作**

在现有 computed 后增加：

```ts
const stagedScenarioDraft = computed(() => store.platform.stagedScenarioDraft);

async function handleRefreshStagedDraft() {
  await store.refreshStagedScenarioDraft();
}

async function handleConfirmStagedDraft() {
  await store.confirmStagedDraft();
  chatMessages.value.push({
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: 'AI Workflow 草案已确认，可进入行动计划承接。',
  });
}

async function handleRejectStagedDraft() {
  await store.rejectStagedDraft('人工拒绝 AI Workflow 草案');
  chatMessages.value.push({
    id: `ai-${Date.now()}`,
    role: 'assistant',
    content: 'AI Workflow 草案已拒绝。',
  });
}
```

- [ ] **步骤 2：增加草案面板模板**

在 template 中，把下面内容放到 `AIChatHistory` 和 `AIDraftPanel` 之间：

```vue
<section v-if="stagedScenarioDraft" class="workflow-draft">
  <div class="workflow-draft__header">
    <span>AI Workflow 草案</span>
    <span class="workflow-draft__status">{{ stagedScenarioDraft.status }}</span>
  </div>
  <p class="workflow-draft__summary">{{ stagedScenarioDraft.summary }}</p>
  <div class="workflow-draft__meta">
    <span>依据 {{ stagedScenarioDraft.evidence.length }} 条</span>
    <span>校验问题 {{ stagedScenarioDraft.validation.issues.length }} 条</span>
  </div>
  <div class="workflow-draft__actions">
    <button type="button" @click="handleConfirmStagedDraft">确认草案</button>
    <button type="button" @click="handleRejectStagedDraft">拒绝草案</button>
  </div>
</section>
<button type="button" class="workflow-draft-refresh" @click="handleRefreshStagedDraft">
  刷新 AI Workflow 草案
</button>
```

- [ ] **步骤 3：增加样式**

在组件样式中增加：

```css
.workflow-draft {
  border: 1px solid rgba(0, 214, 201, 0.25);
  border-radius: 8px;
  padding: 12px;
  background: rgba(0, 214, 201, 0.06);
}

.workflow-draft__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #d7fffb;
  font-size: 13px;
  font-weight: 600;
}

.workflow-draft__status {
  color: #00d6c9;
}

.workflow-draft__summary {
  margin: 8px 0;
  color: #b0c4d8;
  font-size: 12px;
  line-height: 1.5;
}

.workflow-draft__meta {
  display: flex;
  gap: 12px;
  color: #8ea4c9;
  font-size: 12px;
}

.workflow-draft__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.workflow-draft__actions button,
.workflow-draft-refresh {
  border: 1px solid rgba(0, 214, 201, 0.35);
  border-radius: 6px;
  padding: 6px 10px;
  color: #d7fffb;
  background: rgba(0, 214, 201, 0.1);
  cursor: pointer;
}

.workflow-draft-refresh {
  width: 100%;
}
```

- [ ] **步骤 4：执行 web 类型检查**

运行：

```bash
npm --workspace @ai-blue-simu-sys/web run typecheck
```

预期：命令退出码为 0。

- [ ] **步骤 5：提交**

运行：

```bash
git add apps/web/src/components/right-panel/AIAssistantModule.vue
git commit -m "feat(web): 增加AI Workflow草案确认入口"
```

## 10. 任务 8：补充工具接口文档与冒烟验证

**文件：**

- 新建 `docs/ai-workflow-tool-api.md`

### 步骤

- [ ] **步骤 1：创建接口文档**

创建 `docs/ai-workflow-tool-api.md`：

````md
# AI Workflow 工具接口

本文档定义 Dify 或其他 AI Workflow 平台可调用的本地工具接口。

## 查询候选资源子图

`POST /api/resource-graph/query-candidates`

请求示例：

```json
{
  "taskIntent": {
    "missionType": "侦察打击",
    "operationArea": "台湾东部海域",
    "side": "blue",
    "objectives": ["建立前出侦察", "压制海上目标"],
    "constraints": ["不进入禁入区"]
  },
  "requirementPlan": {
    "requiredCapabilities": ["air_recon", "ew_support", "long_range_strike"],
    "requiredChains": ["command", "communication", "detection", "strike"],
    "preferredResourceTypes": ["air-recon", "air-jammer", "air-multirole"]
  }
}
```

## 校验资源编排

`POST /api/resource-graph/validate-orchestration`

请求示例：

```json
{
  "id": "orchestration-demo-001",
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
    },
    {
      "resourceId": "platform-blue-strike-001",
      "role": "strike",
      "reason": "具备远程打击能力",
      "evidenceIds": ["rel-strike-covers-zone"]
    }
  ],
  "chains": [
    {
      "chainType": "detection",
      "relationshipIds": ["rel-recon-detects-zone"],
      "explanation": "电子侦察平台覆盖目标海域"
    },
    {
      "chainType": "strike",
      "relationshipIds": ["rel-strike-covers-zone"],
      "explanation": "远程打击编队覆盖目标海域"
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
  "summary": "基于真实资源图谱生成侦察打击草案。"
}
```

## 生成想定草案

`POST /api/scenario/generate-from-orchestration`

请求体使用 `validate-orchestration` 的同一份资源编排草案。

## 校验并暂存想定草案

`POST /api/scenario/validate-and-stage`

请求体使用 `generate-from-orchestration` 返回的草案。
````

- [ ] **步骤 2：执行完整构建**

运行：

```bash
npm run build
```

预期：命令退出码为 0。

- [ ] **步骤 3：启动 server 做冒烟验证**

运行：

```bash
npm run dev:server
```

另开终端运行：

```bash
curl -s http://localhost:3000/api/health
```

预期响应包含：

```json
{"status":"ok"}
```

- [ ] **步骤 4：验证候选资源查询接口**

运行：

```bash
curl -s http://localhost:3000/api/resource-graph/query-candidates \
  -H 'Content-Type: application/json' \
  -d '{
    "taskIntent": {
      "missionType": "侦察打击",
      "operationArea": "台湾东部海域",
      "side": "blue",
      "objectives": ["建立前出侦察", "压制海上目标"],
      "constraints": ["不进入禁入区"]
    },
    "requirementPlan": {
      "requiredCapabilities": ["air_recon", "ew_support", "long_range_strike"],
      "requiredChains": ["command", "communication", "detection", "strike"],
      "preferredResourceTypes": ["air-recon", "air-jammer", "air-multirole"]
    }
  }'
```

预期响应包含 `platform-blue-recon-001`、`platform-blue-strike-001` 和 `relationships`。

- [ ] **步骤 5：停止开发 server**

在运行 `npm run dev:server` 的终端按 `Ctrl+C`。

- [ ] **步骤 6：提交**

运行：

```bash
git add docs/ai-workflow-tool-api.md
git commit -m "docs(ai): 补充AI Workflow工具接口说明"
```

## 11. 最终验证

- [ ] **步骤 1：执行根目录构建**

运行：

```bash
npm run build
```

预期：所有 workspace 构建成功。

- [ ] **步骤 2：检查 git 状态**

运行：

```bash
git status --short
```

预期：只允许保留与本任务无关的既有文件，例如 `.DS_Store`。不要把 `.DS_Store` 放进任何提交。

- [ ] **步骤 3：最终交付说明**

交付时说明：

- 新增了哪些接口。
- 新增了哪些 DTO。
- AI Workflow 输出如何在进入 `ActionPlan` 前被校验和人工确认。
- `npm run build` 的结果。

## 12. 自查记录

- 设计覆盖：
  - 资源图谱模型由任务 1 和任务 2 覆盖。
  - AI Workflow 工具 API 由任务 3 和任务 5 覆盖。
  - 想定草案暂存与人工确认由任务 4、任务 6、任务 7 覆盖。
  - Dify 工具接口说明由任务 8 覆盖。
  - 完整 RAG 入库和推演后评估明确排除在首期 MVP 外。
- 占位扫描：
  - 本计划没有待填充章节，没有 `TBD`，没有“后续再补”的执行步骤。
- 类型一致性：
  - 任务 1 定义的 DTO 名称在后续 server 和 web 任务中保持一致。
