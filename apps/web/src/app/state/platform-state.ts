import type { PlatformSkeleton } from '../types/platform';
import type {
  DeploymentDraftItem,
  DeploymentDraftResponse,
} from '@ai-blue-simu-sys/ai-core';

const API_BASE_URL = '/api';

const FALLBACK_PLATFORM: PlatformSkeleton = {
  app: 'AI Blue Simulation System',
  version: '0.1.0',
  modules: [],
  scenarioWorkspace: {
    scenario: {
      id: 'scenario-tw-001',
      name: '台湾方向对抗部署想定',
      status: 'draft',
      versionLabel: 'v0.1',
      focusRegion: '台湾',
      projectedForceCount: 2,
    },
    projections: [
      {
        id: 'projection-001',
        sourceEntityId: 'force-source-101',
        name: '蓝军机动对抗分队',
        category: 'force-unit',
        location: '台湾北部空域',
        status: 'planned',
      },
      {
        id: 'projection-002',
        sourceEntityId: 'platform-source-207',
        name: '电子侦察平台-07',
        category: 'platform',
        location: '台湾东部海域',
        status: 'planned',
      },
    ],
    versionHistory: [
      {
        versionLabel: 'v0.1',
        action: 'draft_generated',
        timestamp: '2026-04-12T00:00:00.000Z',
        projectionCount: 2,
        note: '初始化首版部署草案。',
      },
    ],
  },
  situationWorkbench: [
    {
      id: 'projection-001',
      name: '蓝军机动对抗分队',
      region: '台湾北部空域',
      category: 'force-unit',
      state: 'planned',
    },
    {
      id: 'projection-002',
      name: '电子侦察平台-07',
      region: '台湾东部海域',
      category: 'platform',
      state: 'planned',
    },
  ],
  ai: {
    sampleCommand: '在台湾部署对抗兵力',
    draft: {
      command: {
        type: 'deployment.intent',
        scenarioId: 'scenario-tw-001',
        targetRegion: '台湾',
        forceType: '对抗兵力',
        objective: '建立对抗前沿部署与侦察支撑节点',
      },
      draft: {
        type: 'deployment.draft',
        id: 'draft-scenario-tw-001-台湾',
        scenarioId: 'scenario-tw-001',
        summary: '已为 台湾 生成本地演示部署草案',
        objective: '建立对抗前沿部署与侦察支撑节点',
        reviewRequired: true,
        items: [
          {
            sourceEntityId: 'force-source-101',
            name: '蓝军机动对抗分队',
            category: 'force-unit',
            suggestedLocation: '台湾北部空域',
            rationale: '本地演示模式下生成的机动部署建议。',
          },
          {
            sourceEntityId: 'platform-source-207',
            name: '电子侦察平台-07',
            category: 'platform',
            suggestedLocation: '台湾东部海域',
            rationale: '本地演示模式下生成的支援部署建议。',
          },
        ],
      },
    },
  },
};

let platformState: PlatformSkeleton = FALLBACK_PLATFORM;
let apiAvailable = false;

export function getPlatformState() {
  return platformState;
}

export function isApiAvailable() {
  return apiAvailable;
}

export function setPlatformState(nextState: PlatformSkeleton) {
  platformState = nextState;
}

export async function loadPlatformState() {
  try {
    const response = await fetch(`${API_BASE_URL}/platform-skeleton`);

    if (!response.ok) {
      throw new Error('平台状态拉取失败');
    }

    const nextState = (await response.json()) as PlatformSkeleton;
    apiAvailable = true;
    setPlatformState(nextState);
    return nextState;
  } catch {
    apiAvailable = false;
    return platformState;
  }
}

export async function requestDeploymentDraft(command: PlatformSkeleton['ai']['draft']['command']) {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/deployment-draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error('部署草案生成失败');
    }

    apiAvailable = true;
    return (await response.json()) as DeploymentDraftResponse;
  } catch {
    apiAvailable = false;
    return FALLBACK_PLATFORM.ai.draft;
  }
}

export async function rejectDeploymentDraftRequest(draftId: string, reason: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/deployment-reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenarioId: platformState.scenarioWorkspace.scenario.id,
        draftId,
        reason,
      }),
    });

    if (!response.ok) {
      throw new Error('草案拒绝失败');
    }

    const result = (await response.json()) as {
      scenarioWorkspace: PlatformSkeleton['scenarioWorkspace'];
    };

    platformState = {
      ...platformState,
      scenarioWorkspace: result.scenarioWorkspace,
    };

    apiAvailable = true;
    return platformState;
  } catch {
    apiAvailable = false;
    platformState = {
      ...platformState,
      scenarioWorkspace: {
        ...platformState.scenarioWorkspace,
        lastRejectedDraftReason: reason,
        versionHistory: [
          ...platformState.scenarioWorkspace.versionHistory,
          {
            versionLabel: platformState.scenarioWorkspace.scenario.versionLabel,
            action: 'draft_rejected',
            timestamp: new Date().toISOString(),
            projectionCount: platformState.scenarioWorkspace.projections.length,
            note: `拒绝草案：${reason}`,
          },
        ],
      },
    };
    return platformState;
  }
}

export async function confirmDeploymentDraftRequest(items: DeploymentDraftItem[]) {
  const command = {
    scenarioId: platformState.scenarioWorkspace.scenario.id,
    items,
  };

  try {
    const response = await fetch(`${API_BASE_URL}/ai/deployment-confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error('部署确认失败');
    }

    const result = (await response.json()) as {
      scenarioWorkspace: PlatformSkeleton['scenarioWorkspace'];
    };

    platformState = {
      ...platformState,
      scenarioWorkspace: result.scenarioWorkspace,
      situationWorkbench: result.scenarioWorkspace.projections.map((projection) => ({
        id: projection.id,
        name: projection.name,
        region: projection.location,
        category: projection.category,
        state: projection.status,
      })),
    };

    apiAvailable = true;
    return platformState;
  } catch {
    apiAvailable = false;

    const fallbackWorkspace = {
      ...platformState.scenarioWorkspace,
      scenario: {
        ...platformState.scenarioWorkspace.scenario,
        status: 'ready' as const,
        versionLabel: 'v0.2',
        projectedForceCount: items.length,
      },
      projections: items.map((item, index) => ({
        id: `projection-confirmed-${index + 1}`,
        sourceEntityId: item.sourceEntityId,
        name: item.name,
        category: item.category,
        location: item.suggestedLocation,
        status: 'deployed' as const,
      })),
      versionHistory: [
        ...platformState.scenarioWorkspace.versionHistory,
        {
          versionLabel: 'v0.2',
          action: 'confirmed' as const,
          timestamp: new Date().toISOString(),
          projectionCount: items.length,
          note: '确认写回部署草案。',
        },
      ],
      lastRejectedDraftReason: undefined,
    };

    platformState = {
      ...platformState,
      scenarioWorkspace: fallbackWorkspace,
      situationWorkbench: fallbackWorkspace.projections.map((projection) => ({
        id: projection.id,
        name: projection.name,
        region: projection.location,
        category: projection.category,
        state: projection.status,
      })),
    };

    return platformState;
  }
}

export async function undoDeploymentConfirmationRequest() {
  try {
    const response = await fetch(`${API_BASE_URL}/scenario/undo-confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('撤销确认失败');
    }

    const result = (await response.json()) as {
      scenarioWorkspace: PlatformSkeleton['scenarioWorkspace'];
      situationWorkbench: PlatformSkeleton['situationWorkbench'];
    };

    platformState = {
      ...platformState,
      scenarioWorkspace: result.scenarioWorkspace,
      situationWorkbench: result.situationWorkbench,
    };

    apiAvailable = true;
    return platformState;
  } catch {
    apiAvailable = false;
    return platformState;
  }
}
