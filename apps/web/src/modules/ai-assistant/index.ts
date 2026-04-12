import type { PlatformSkeleton } from '../../app/types/platform';
import type {
  DeploymentDraftItem,
  DeploymentDraftResponse,
} from '@ai-blue-simu-sys/ai-core';
import {
  confirmDeploymentDraftRequest,
  getPlatformState,
  requestDeploymentDraft,
  setPlatformState,
} from '../../app/state/platform-state';

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
    <div class="assistant-action-row">
      <button id="regenerate-draft" class="assistant-button assistant-button-secondary">重生成草案</button>
      <button id="confirm-draft" class="assistant-button assistant-button-secondary">确认写回想定</button>
    </div>
  `;
}

function renderConfirmedWorkspace(platform: PlatformSkeleton) {
  return `
    <div class="assistant-block">
      <p class="assistant-label">确认结果</p>
      <p class="assistant-summary">已写回 ${platform.scenarioWorkspace.scenario.name}，当前版本 ${platform.scenarioWorkspace.scenario.versionLabel}。</p>
    </div>
    <ul>
      ${platform.scenarioWorkspace.projections
        .map(
          (projection) => `
            <li>
              <strong>${projection.name}</strong> · ${projection.location} · ${projection.status}
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

export function renderAiAssistantModule(ai: PlatformSkeleton['ai']) {
  return `
    <article class="module-card module-card-accent">
      <p class="module-kicker">AI Assistant</p>
      <h2>智能问答与智能部署</h2>
      <p class="module-summary">输入自然语言部署意图，生成受控部署草案，并确认写回想定。</p>
      <div class="assistant-interactive-shell">
        <label class="assistant-label" for="deployment-command">部署命令</label>
        <input id="deployment-command" class="assistant-input" value="${ai.sampleCommand}" />
        <button id="generate-draft" class="assistant-button">生成部署草案</button>
        <div id="assistant-result">${renderDraft(ai.draft)}</div>
      </div>
    </article>
  `;
}

function updateWorkspacePanels(platform: PlatformSkeleton) {
  const workspaceSummary = document.getElementById('scenario-workspace-summary');
  const workspaceList = document.getElementById('scenario-workspace-projections');
  const workbenchSummary = document.getElementById('situation-workbench-summary');
  const workbenchList = document.getElementById('situation-workbench-points');

  if (workspaceSummary) {
    workspaceSummary.textContent = `${platform.scenarioWorkspace.scenario.name} · ${platform.scenarioWorkspace.scenario.versionLabel}`;
  }

  if (workspaceList) {
    workspaceList.innerHTML = platform.scenarioWorkspace.projections
      .map(
        (projection) => `
          <li>${projection.name} · ${projection.location} · ${projection.status}</li>
        `,
      )
      .join('');
  }

  if (workbenchSummary) {
    workbenchSummary.textContent = `当前已形成 ${platform.situationWorkbench.length} 个部署点位草案`;
  }

  if (workbenchList) {
    workbenchList.innerHTML = platform.situationWorkbench
      .map(
        (projection) => `
          <li>${projection.name} · ${projection.region} · ${projection.state}</li>
        `,
      )
      .join('');
  }
}

export function setupAiAssistantInteraction() {
  const input = document.getElementById('deployment-command') as HTMLInputElement | null;
  const button = document.getElementById('generate-draft') as HTMLButtonElement | null;
  const result = document.getElementById('assistant-result');

  if (!input || !button || !result) {
    return;
  }

  const bindDraftActions = (response: DeploymentDraftResponse) => {
    const confirmButton = document.getElementById('confirm-draft') as HTMLButtonElement | null;
    const regenerateButton = document.getElementById('regenerate-draft') as HTMLButtonElement | null;

    if (regenerateButton) {
      regenerateButton.addEventListener('click', async () => {
        regenerateButton.disabled = true;
        regenerateButton.textContent = '重生成中...';

        try {
          const platform = getPlatformState();
          const regenerated = await requestDeploymentDraft({
            ...response.command,
            scenarioId: platform.scenarioWorkspace.scenario.id,
            regenerateFromDraftId: response.draft.id,
          });

          const nextPlatform = {
            ...platform,
            ai: {
              ...platform.ai,
              draft: regenerated,
            },
          };

          setPlatformState(nextPlatform);
          result.innerHTML = renderDraft(regenerated);
          bindDraftActions(regenerated);
        } catch (error) {
          result.innerHTML = renderError(error instanceof Error ? error.message : '未知错误');
        }
      });
    }

    if (confirmButton) {
      confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;
        confirmButton.textContent = '写回中...';

        try {
          const platform = await confirmDeploymentDraftRequest(response.draft.items);
          setPlatformState(platform);
          updateWorkspacePanels(platform);
          result.innerHTML = renderConfirmedWorkspace(platform);
        } catch (error) {
          result.innerHTML = renderError(error instanceof Error ? error.message : '未知错误');
        }
      });
    }
  };

  bindDraftActions(getPlatformState().ai.draft);

  button.addEventListener('click', async () => {
    const platform = getPlatformState();
    const targetRegion = input.value.includes('台湾')
      ? '台湾'
      : input.value.trim() || platform.scenarioWorkspace.scenario.focusRegion;

    button.disabled = true;
    button.textContent = '生成中...';
    result.innerHTML = '<p class="assistant-summary">正在生成部署草案...</p>';

    try {
      const response = await requestDeploymentDraft({
        ...platform.ai.draft.command,
        scenarioId: platform.scenarioWorkspace.scenario.id,
        targetRegion,
      });

      const nextPlatform = {
        ...platform,
        ai: {
          ...platform.ai,
          draft: response,
        },
      };

      setPlatformState(nextPlatform);
      result.innerHTML = renderDraft(response);
      bindDraftActions(response);
    } catch (error) {
      result.innerHTML = renderError(error instanceof Error ? error.message : '未知错误');
    } finally {
      button.disabled = false;
      button.textContent = '生成部署草案';
    }
  });
}
