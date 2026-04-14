import { demoScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';
let scenarioWorkspaceState = structuredClone(demoScenarioWorkspaceState);
let previousScenarioWorkspaceState = null;
export const scenarioWorkspaceModule = {
    key: 'scenario-workspace',
    title: 'Scenario Workspace',
    description: '想定创建、源对象投影、场景上下文与版本保存。',
};
function createHistoryEntry(action, projectionCount, note, versionLabel) {
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
export function confirmScenarioDeployment(items) {
    previousScenarioWorkspaceState = structuredClone(scenarioWorkspaceState);
    const nextProjections = items.map((item, index) => ({
        id: `projection-confirmed-${index + 1}`,
        sourceEntityId: item.sourceEntityId,
        name: item.name,
        category: item.category,
        location: item.location,
        status: 'deployed',
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
export function rejectScenarioDraft(reason) {
    scenarioWorkspaceState = {
        ...scenarioWorkspaceState,
        lastRejectedDraftReason: reason,
        versionHistory: [
            ...scenarioWorkspaceState.versionHistory,
            createHistoryEntry('draft_rejected', scenarioWorkspaceState.projections.length, `拒绝草案：${reason}`, scenarioWorkspaceState.scenario.versionLabel),
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
            createHistoryEntry('draft_regenerated', scenarioWorkspaceState.projections.length, '基于上一版草案重生成。', scenarioWorkspaceState.scenario.versionLabel),
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
            createHistoryEntry('confirm_undone', restored.projections.length, '撤销最近一次确认写回。', restored.scenario.versionLabel),
        ],
    };
    previousScenarioWorkspaceState = null;
    return scenarioWorkspaceState;
}
