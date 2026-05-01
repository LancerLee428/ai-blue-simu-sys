export type ScenarioSummary = {
  id: string;
  name: string;
  status: 'draft' | 'ready';
  versionLabel: string;
  focusRegion: string;
  projectedForceCount: number;
};

export type ScenarioProjection = {
  id: string;
  sourceEntityId: string;
  name: string;
  category: 'force-unit' | 'platform';
  location: string;
  status: 'planned' | 'deployed';
};

export type ScenarioProjectionInput = {
  sourceEntityId: string;
  name: string;
  category: 'force-unit' | 'platform';
  location: string;
  status: 'planned' | 'deployed';
};

export type ScenarioVersionHistoryEntry = {
  versionLabel: string;
  action: 'draft_generated' | 'draft_regenerated' | 'draft_rejected' | 'confirmed' | 'confirm_undone';
  timestamp: string;
  projectionCount: number;
  note: string;
};

export type ScenarioWorkspaceState = {
  scenario: ScenarioSummary;
  projections: ScenarioProjection[];
  versionHistory: ScenarioVersionHistoryEntry[];
  lastRejectedDraftReason?: string;
};

export const demoScenarioWorkspaceState: ScenarioWorkspaceState = {
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
};

export type ScenarioDraftStatus =
  | 'generated'
  | 'validation_failed'
  | 'staged'
  | 'confirmed'
  | 'rejected';

export type ScenarioDraftRecord = {
  id: string;
  orchestrationDraftId: string;
  status: ScenarioDraftStatus;
  summary: string;
  tacticalScenario: unknown;
  evidenceIds: string[];
  validationIssueCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScenarioStagingResult = {
  draft: ScenarioDraftRecord;
  scenarioWorkspace: ScenarioWorkspaceState;
};
