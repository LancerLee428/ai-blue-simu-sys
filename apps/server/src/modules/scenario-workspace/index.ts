import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

export const scenarioWorkspaceModule = {
  key: 'scenario-workspace',
  title: 'Scenario Workspace',
  description: '想定创建、源对象投影、场景上下文与版本保存。',
};

export function getScenarioWorkspaceState() {
  return demoScenarioWorkspaceState;
}
