import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

export function renderScenarioWorkspaceModule() {
  return `
    <article class="module-card">
      <p class="module-kicker">Scenario Workspace</p>
      <h2>想定工作空间</h2>
      <p id="scenario-workspace-summary" class="module-summary">${demoScenarioWorkspaceState.scenario.name} · ${demoScenarioWorkspaceState.scenario.versionLabel}</p>
      <ul id="scenario-workspace-projections">
        ${demoScenarioWorkspaceState.projections
          .map(
            (projection) => `
              <li>${projection.name} · ${projection.location} · ${projection.status}</li>
            `,
          )
          .join('')}
      </ul>
    </article>
  `;
}
