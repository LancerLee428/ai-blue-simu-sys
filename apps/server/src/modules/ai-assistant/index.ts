import type { DeploymentDraft, DeploymentIntentCommand } from '@ai-blue-simu-sys/ai-core';
import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

export const aiAssistantModule = {
  key: 'ai-assistant',
  title: 'AI Assistant',
  description: '上下文问答、结构化辅助与智能部署入口。',
};

export function createDeploymentDraft(command: DeploymentIntentCommand): DeploymentDraft {
  const scenarioName =
    command.scenarioId === demoScenarioWorkspaceState.scenario.id
      ? demoScenarioWorkspaceState.scenario.name
      : '未知想定';

  return {
    type: 'deployment.draft',
    scenarioId: command.scenarioId,
    summary: `已为“${scenarioName}”生成面向 ${command.targetRegion} 的 ${command.forceType} 部署草案`,
    objective: command.objective ?? '未指定任务目标',
    reviewRequired: true,
    items: [
      {
        sourceEntityId: 'force-source-101',
        name: '蓝军机动对抗分队',
        category: 'force-unit',
        suggestedLocation: `${command.targetRegion}北部空域`,
        rationale: '优先建立前出机动对抗节点，形成首轮空间压制与态势存在。',
      },
      {
        sourceEntityId: 'platform-source-207',
        name: '电子侦察平台-07',
        category: 'platform',
        suggestedLocation: `${command.targetRegion}东部海域`,
        rationale: '保障侦察与电子支援，提升对抗兵力部署后的态势感知能力。',
      },
    ],
  };
}
