import type { WorkbenchDeploymentPoint } from '@ai-blue-simu-sys/situation';

export function renderSituationWorkbenchModule(points: WorkbenchDeploymentPoint[]) {
  return `
    <article class="module-card">
      <p class="module-kicker">Situation Workbench</p>
      <h2>态势工作台</h2>
      <p id="situation-workbench-summary" class="module-summary">当前已形成 ${points.length} 个部署点位草案</p>
      <ul id="situation-workbench-points">
        ${points
          .map(
            (point) => `
              <li>${point.name} · ${point.region} · ${point.state}</li>
            `,
          )
          .join('')}
      </ul>
    </article>
  `;
}
