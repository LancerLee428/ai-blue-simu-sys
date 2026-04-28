export const demoScenarioWorkspaceState = {
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
