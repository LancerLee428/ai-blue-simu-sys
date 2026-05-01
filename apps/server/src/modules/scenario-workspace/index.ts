import type {
  ScenarioDraftRecord,
  ScenarioProjectionInput,
  ScenarioStagingResult,
  ScenarioVersionHistoryEntry,
  ScenarioWorkspaceState,
} from '@ai-blue-simu-sys/scenario';
import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';

let scenarioWorkspaceState: ScenarioWorkspaceState = structuredClone(demoScenarioWorkspaceState);
let previousScenarioWorkspaceState: ScenarioWorkspaceState | null = null;
let stagedScenarioDraft: ScenarioDraftRecord | null = null;

export const scenarioWorkspaceModule = {
  key: 'scenario-workspace',
  title: 'Scenario Workspace',
  description: '想定创建、源对象投影、场景上下文与版本保存。',
};

function createHistoryEntry(
  action: ScenarioVersionHistoryEntry['action'],
  projectionCount: number,
  note: string,
  versionLabel: string,
): ScenarioVersionHistoryEntry {
  return {
    versionLabel,
    action,
    timestamp: new Date().toISOString(),
    projectionCount,
    note,
  };
}

export function getScenarioWorkspaceState() {
  return scenarioWorkspaceState;
}

export function confirmScenarioDeployment(items: ScenarioProjectionInput[]) {
  previousScenarioWorkspaceState = structuredClone(scenarioWorkspaceState);

  const nextProjections = items.map((item, index) => ({
    id: `projection-confirmed-${index + 1}`,
    sourceEntityId: item.sourceEntityId,
    name: item.name,
    category: item.category,
    location: item.location,
    status: 'deployed' as const,
  }));

  scenarioWorkspaceState = {
    scenario: {
      ...scenarioWorkspaceState.scenario,
      status: 'ready',
      versionLabel: 'v0.2',
      projectedForceCount: nextProjections.length,
    },
    projections: nextProjections,
    lastRejectedDraftReason: undefined,
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry('confirmed', nextProjections.length, '确认写回部署草案。', 'v0.2'),
    ],
  };

  return scenarioWorkspaceState;
}

export function rejectScenarioDraft(reason: string) {
  scenarioWorkspaceState = {
    ...scenarioWorkspaceState,
    lastRejectedDraftReason: reason,
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry(
        'draft_rejected',
        scenarioWorkspaceState.projections.length,
        `拒绝草案：${reason}`,
        scenarioWorkspaceState.scenario.versionLabel,
      ),
    ],
  };

  return scenarioWorkspaceState;
}

export function recordScenarioDraftRegenerated() {
  scenarioWorkspaceState = {
    ...scenarioWorkspaceState,
    lastRejectedDraftReason: undefined,
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry(
        'draft_regenerated',
        scenarioWorkspaceState.projections.length,
        '基于上一版草案重生成。',
        scenarioWorkspaceState.scenario.versionLabel,
      ),
    ],
  };

  return scenarioWorkspaceState;
}

export function undoScenarioConfirmation() {
  if (!previousScenarioWorkspaceState) {
    return scenarioWorkspaceState;
  }

  const restored = structuredClone(previousScenarioWorkspaceState);
  scenarioWorkspaceState = {
    ...restored,
    versionHistory: [
      ...restored.versionHistory,
      createHistoryEntry(
        'confirm_undone',
        restored.projections.length,
        '撤销最近一次确认写回。',
        restored.scenario.versionLabel,
      ),
    ],
  };
  previousScenarioWorkspaceState = null;

  return scenarioWorkspaceState;
}

export function getStagedScenarioDraft() {
  return stagedScenarioDraft;
}

export function stageScenarioDraft(
  draft: Omit<ScenarioDraftRecord, 'status' | 'createdAt' | 'updatedAt'>,
): ScenarioStagingResult {
  const now = new Date().toISOString();
  stagedScenarioDraft = {
    ...draft,
    status: 'staged',
    createdAt: now,
    updatedAt: now,
  };

  scenarioWorkspaceState = {
    ...scenarioWorkspaceState,
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry(
        'draft_generated',
        scenarioWorkspaceState.projections.length,
        `AI Workflow 暂存草案：${draft.summary}`,
        scenarioWorkspaceState.scenario.versionLabel,
      ),
    ],
  };

  return {
    draft: stagedScenarioDraft,
    scenarioWorkspace: scenarioWorkspaceState,
  };
}

export function confirmStagedScenarioDraft() {
  if (!stagedScenarioDraft) {
    return {
      draft: null,
      scenarioWorkspace: scenarioWorkspaceState,
    };
  }

  stagedScenarioDraft = {
    ...stagedScenarioDraft,
    status: 'confirmed',
    updatedAt: new Date().toISOString(),
  };

  scenarioWorkspaceState = {
    ...scenarioWorkspaceState,
    scenario: {
      ...scenarioWorkspaceState.scenario,
      status: 'ready',
      versionLabel: 'v0.3',
    },
    versionHistory: [
      ...scenarioWorkspaceState.versionHistory,
      createHistoryEntry(
        'confirmed',
        scenarioWorkspaceState.projections.length,
        `确认 AI Workflow 草案：${stagedScenarioDraft.summary}`,
        'v0.3',
      ),
    ],
  };

  return {
    draft: stagedScenarioDraft,
    scenarioWorkspace: scenarioWorkspaceState,
  };
}

export function rejectStagedScenarioDraft(reason: string) {
  if (!stagedScenarioDraft) {
    return {
      draft: null,
      scenarioWorkspace: rejectScenarioDraft(reason),
    };
  }

  stagedScenarioDraft = {
    ...stagedScenarioDraft,
    status: 'rejected',
    updatedAt: new Date().toISOString(),
  };

  return {
    draft: stagedScenarioDraft,
    scenarioWorkspace: rejectScenarioDraft(reason),
  };
}
