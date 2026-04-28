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
export declare const demoScenarioWorkspaceState: ScenarioWorkspaceState;
