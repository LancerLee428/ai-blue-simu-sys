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
