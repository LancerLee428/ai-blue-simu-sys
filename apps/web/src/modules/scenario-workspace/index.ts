import type { ScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

export function renderScenarioWorkspaceModule(state: ScenarioWorkspaceState) {
  return `
    <article class="module-card">
      <p class="module-kicker">Scenario Workspace</p>
      <h2>想定工作空间</h2>
      <p id="scenario-workspace-summary" class="module-summary">${state.scenario.name} · ${state.scenario.versionLabel}</p>
      <ul id="scenario-workspace-projections">
        ${state.projections
          .map(
            (projection) => `
              <li>${projection.name} · ${projection.location} · ${projection.status}</li>
            `,
          )
          .join('')}
      </ul>
      <div class="workspace-history-shell">
        <p class="assistant-label">版本历史</p>
        <ul id="scenario-workspace-history">
          ${state.versionHistory
            .map(
              (entry) => `
                <li>${entry.versionLabel} · ${entry.action} · ${entry.note}</li>
              `,
            )
            .join('')}
        </ul>
      </div>
    </article>
  `;
}
