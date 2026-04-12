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

export type ScenarioWorkspaceState = {
  scenario: ScenarioSummary;
  projections: ScenarioProjection[];
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
};
