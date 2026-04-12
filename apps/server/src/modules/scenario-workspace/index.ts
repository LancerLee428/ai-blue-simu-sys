import type { ScenarioProjectionInput, ScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';
import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

let scenarioWorkspaceState: ScenarioWorkspaceState = structuredClone(demoScenarioWorkspaceState);

export const scenarioWorkspaceModule = {
  key: 'scenario-workspace',
  title: 'Scenario Workspace',
  description: '想定创建、源对象投影、场景上下文与版本保存。',
};

export function getScenarioWorkspaceState() {
  return scenarioWorkspaceState;
}

export function confirmScenarioDeployment(items: ScenarioProjectionInput[]) {
  const nextProjections = items.map((item, index) => ({
    id: `projection-confirmed-${index + 1}`,
    sourceEntityId: item.sourceEntityId,
    name: item.name,
    category: item.category,
    location: item.location,
    status: 'deployed' as const,
  }));

  scenarioWorkspaceState = {
    scenario: {
      ...scenarioWorkspaceState.scenario,
      status: 'ready',
      versionLabel: 'v0.2',
      projectedForceCount: nextProjections.length,
    },
    projections: nextProjections,
  };

  return scenarioWorkspaceState;
}
