import type { DeploymentDraft } from '@ai-blue-simu-sys/ai-core';
import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

const demoDraft: DeploymentDraft = {
  type: 'deployment.draft',
  scenarioId: demoScenarioWorkspaceState.scenario.id,
  summary: '已生成“在台湾部署对抗兵力”的首版智能部署草案',
  objective: '建立对抗前沿部署与侦察支撑节点',
  reviewRequired: true,
  items: [
    {
      sourceEntityId: 'force-source-101',
      name: '蓝军机动对抗分队',
      category: 'force-unit',
      suggestedLocation: '台湾北部空域',
      rationale: '形成前出机动对抗节点。',
    },
    {
      sourceEntityId: 'platform-source-207',
      name: '电子侦察平台-07',
      category: 'platform',
      suggestedLocation: '台湾东部海域',
      rationale: '保障态势感知与电子支援。',
    },
  ],
};

export function renderAiAssistantModule() {
  return `
    <article class="module-card module-card-accent">
      <p class="module-kicker">AI Assistant</p>
      <h2>智能问答与智能部署</h2>
      <div class="assistant-block">
        <p class="assistant-label">示例命令</p>
        <div class="assistant-command">在台湾部署对抗兵力</div>
      </div>
      <div class="assistant-block">
        <p class="assistant-label">草案摘要</p>
        <p class="assistant-summary">${demoDraft.summary}</p>
      </div>
      <ul>
        ${demoDraft.items
          .map(
            (item) => `
              <li>
                <strong>${item.name}</strong> → ${item.suggestedLocation}<br />
                <span>${item.rationale}</span>
              </li>
            `,
          )
          .join('')}
      </ul>
    </article>
  `;
}
