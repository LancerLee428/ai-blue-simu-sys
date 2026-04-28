import type {
  DeploymentConfirmCommand,
  DeploymentDraft,
  DeploymentDraftItem,
  DeploymentDraftResponse,
  DeploymentIntentCommand,
  DeploymentRejectCommand,
} from '@ai-blue-simu-sys/ai-core';
import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';
import {
  confirmScenarioDeployment,
  recordScenarioDraftRegenerated,
  rejectScenarioDraft,
} from '../scenario-workspace';

export const aiAssistantModule = {
  key: 'ai-assistant',
  title: 'AI Assistant',
  description: '上下文问答、结构化辅助与智能部署入口。',
};

function createDraftId(command: DeploymentIntentCommand) {
  return command.regenerateFromDraftId
    ? `${command.regenerateFromDraftId}-regen`
    : `draft-${command.scenarioId}-${command.targetRegion}`;
}

export function createDeploymentDraft(command: DeploymentIntentCommand): DeploymentDraft {
  const scenarioName =
    command.scenarioId === demoScenarioWorkspaceState.scenario.id
      ? demoScenarioWorkspaceState.scenario.name
      : '未知想定';
  const regenerated = Boolean(command.regenerateFromDraftId);

  if (regenerated) {
    recordScenarioDraftRegenerated();
  }

  return {
    type: 'deployment.draft',
    id: createDraftId(command),
    scenarioId: command.scenarioId,
    summary: regenerated
      ? `已基于上一版草案重新生成“${scenarioName}”面向 ${command.targetRegion} 的 ${command.forceType} 部署草案`
      : `已为“${scenarioName}”生成面向 ${command.targetRegion} 的 ${command.forceType} 部署草案`,
    objective: command.objective ?? '未指定任务目标',
    reviewRequired: true,
    items: [
      {
        sourceEntityId: 'force-source-101',
        name: regenerated ? '蓝军机动对抗分队（重生成）' : '蓝军机动对抗分队',
        category: 'force-unit',
        suggestedLocation: `${command.targetRegion}${regenerated ? '中部空域' : '北部空域'}`,
        rationale: regenerated
          ? '根据上一版草案反馈，调整机动对抗分队位置以改善覆盖范围。'
          : '优先建立前出机动对抗节点，形成首轮空间压制与态势存在。',
      },
      {
        sourceEntityId: 'platform-source-207',
        name: regenerated ? '电子侦察平台-07（重生成）' : '电子侦察平台-07',
        category: 'platform',
        suggestedLocation: `${command.targetRegion}${regenerated ? '南部海域' : '东部海域'}`,
        rationale: regenerated
          ? '根据重生成上下文，将支援平台调整至更利于侧向侦察的位置。'
          : '保障侦察与电子支援，提升对抗兵力部署后的态势感知能力。',
      },
    ],
  };
}

export function createDeploymentDraftResponse(
  command: DeploymentIntentCommand,
): DeploymentDraftResponse {
  return {
    command,
    draft: createDeploymentDraft(command),
  };
}

export function confirmDeploymentDraft(command: DeploymentConfirmCommand) {
  const workspace = confirmScenarioDeployment(
    command.items.map((item: DeploymentDraftItem) => ({
      sourceEntityId: item.sourceEntityId,
      name: item.name,
      category: item.category,
      location: item.suggestedLocation,
      status: 'deployed',
    })),
  );

  return {
    scenarioWorkspace: workspace,
  };
}

export function rejectDeploymentDraft(command: DeploymentRejectCommand) {
  return {
    scenarioWorkspace: rejectScenarioDraft(command.reason),
    rejectedDraftId: command.draftId,
  };
}
