import { demoDeploymentPoints } from '@ai-blue-simu-sys/situation';

export function renderSituationWorkbenchModule() {
  return `
    <article class="module-card">
      <p class="module-kicker">Situation Workbench</p>
      <h2>态势工作台</h2>
      <p class="module-summary">当前已形成 ${demoDeploymentPoints.length} 个部署点位草案</p>
      <ul>
        ${demoDeploymentPoints
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
