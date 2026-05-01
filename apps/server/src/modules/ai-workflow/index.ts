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
