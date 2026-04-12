import type { DeploymentDraftResponse, DeploymentIntentCommand } from '@ai-blue-simu-sys/ai-core';

const DEMO_COMMAND: DeploymentIntentCommand = {
  type: 'deployment.intent',
  scenarioId: 'scenario-tw-001',
  targetRegion: '台湾',
  forceType: '对抗兵力',
  objective: '建立对抗前沿部署与侦察支撑节点',
};

function createFallbackDraft(command: DeploymentIntentCommand): DeploymentDraftResponse {
  return {
    command,
    draft: {
      type: 'deployment.draft',
      scenarioId: command.scenarioId,
      summary: `已为 ${command.targetRegion} 生成本地演示部署草案`,
      objective: command.objective ?? '未指定任务目标',
      reviewRequired: true,
      items: [
        {
          sourceEntityId: 'force-source-101',
          name: '蓝军机动对抗分队',
          category: 'force-unit',
          suggestedLocation: `${command.targetRegion}北部空域`,
          rationale: '本地演示模式下生成的机动部署建议。',
        },
        {
          sourceEntityId: 'platform-source-207',
          name: '电子侦察平台-07',
          category: 'platform',
          suggestedLocation: `${command.targetRegion}东部海域`,
          rationale: '本地演示模式下生成的支援部署建议。',
        },
      ],
    },
  };
}

async function createDeploymentDraft(
  command: DeploymentIntentCommand,
): Promise<DeploymentDraftResponse> {
  try {
    const response = await fetch('http://localhost:3000/api/ai/deployment-draft', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error('部署草案生成失败');
    }

    return (await response.json()) as DeploymentDraftResponse;
  } catch {
    return createFallbackDraft(command);
  }
}

function renderDraft(response: DeploymentDraftResponse) {
  return `
    <div class="assistant-block">
      <p class="assistant-label">示例命令</p>
      <div class="assistant-command">在${response.command.targetRegion}部署${response.command.forceType}</div>
    </div>
    <div class="assistant-block">
      <p class="assistant-label">草案摘要</p>
      <p class="assistant-summary">${response.draft.summary}</p>
    </div>
    <ul>
      ${response.draft.items
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
  `;
}

function renderError(message: string) {
  return `
    <div class="assistant-block">
      <p class="assistant-label">交互状态</p>
      <p class="assistant-summary assistant-error">${message}</p>
    </div>
  `;
}

export function renderAiAssistantModule() {
  return `
    <article class="module-card module-card-accent">
      <p class="module-kicker">AI Assistant</p>
      <h2>智能问答与智能部署</h2>
      <p class="module-summary">输入自然语言部署意图，生成受控部署草案。</p>
      <div class="assistant-interactive-shell">
        <label class="assistant-label" for="deployment-command">部署命令</label>
        <input id="deployment-command" class="assistant-input" value="在台湾部署对抗兵力" />
        <button id="generate-draft" class="assistant-button">生成部署草案</button>
        <div id="assistant-result">${renderDraft(createFallbackDraft(DEMO_COMMAND))}</div>
      </div>
    </article>
  `;
}

export function setupAiAssistantInteraction() {
  const input = document.getElementById('deployment-command') as HTMLInputElement | null;
  const button = document.getElementById('generate-draft') as HTMLButtonElement | null;
  const result = document.getElementById('assistant-result');

  if (!input || !button || !result) {
    return;
  }

  button.addEventListener('click', async () => {
    const targetRegion = input.value.includes('台湾') ? '台湾' : input.value.trim() || '台湾';

    button.disabled = true;
    button.textContent = '生成中...';
    result.innerHTML = '<p class="assistant-summary">正在生成部署草案...</p>';

    try {
      const response = await createDeploymentDraft({
        ...DEMO_COMMAND,
        targetRegion,
      });
      result.innerHTML = renderDraft(response);
    } catch (error) {
      result.innerHTML = renderError(error instanceof Error ? error.message : '未知错误');
    } finally {
      button.disabled = false;
      button.textContent = '生成部署草案';
    }
  });
}
