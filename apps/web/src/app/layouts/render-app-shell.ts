import type { PlatformSkeleton } from '../types/platform';
import { renderNavigation } from './render-navigation';
import { renderOntologyModule } from '../../modules/ontology';
import { renderScenarioWorkspaceModule } from '../../modules/scenario-workspace';
import { renderSituationWorkbenchModule } from '../../modules/situation-workbench';
import { renderAiAssistantModule } from '../../modules/ai-assistant';
import { renderGovernanceModule } from '../../modules/governance';

export function renderAppShell(platform: PlatformSkeleton) {
  return `
    <main class="platform-shell">
      <aside class="platform-sidebar">
        <div>
          <p class="eyebrow">${platform.app}</p>
          <h1>智能蓝军平台</h1>
          <p class="lead">
            围绕 Ontology、Scenario Workspace、Situation Workbench、AI Assistant、Governance
            五根骨架构建第一版可运行平台。
          </p>
        </div>
        ${renderNavigation(platform.modules)}
      </aside>
      <section class="platform-content">
        <div class="module-grid">
          ${renderOntologyModule()}
          ${renderScenarioWorkspaceModule(platform.scenarioWorkspace)}
          ${renderSituationWorkbenchModule(platform.situationWorkbench)}
          ${renderAiAssistantModule(platform.ai)}
          ${renderGovernanceModule()}
        </div>
      </section>
    </main>
  `;
}
