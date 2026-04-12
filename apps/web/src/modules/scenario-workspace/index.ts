import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

export function renderScenarioWorkspaceModule() {
  return `
    <article class="module-card">
      <p class="module-kicker">Scenario Workspace</p>
      <h2>想定工作空间</h2>
      <p class="module-summary">${demoScenarioWorkspaceState.scenario.name} · ${demoScenarioWorkspaceState.scenario.versionLabel}</p>
      <ul>
        <li>焦点区域：${demoScenarioWorkspaceState.scenario.focusRegion}</li>
        <li>投影对象数量：${demoScenarioWorkspaceState.scenario.projectedForceCount}</li>
        <li>状态：${demoScenarioWorkspaceState.scenario.status}</li>
      </ul>
    </article>
  `;
}
