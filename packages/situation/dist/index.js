export function createWorkbenchDeploymentPoints(projections) {
    return projections.map((projection) => ({
        id: projection.id,
        name: projection.name,
        region: projection.location,
        category: projection.category,
        state: projection.status,
    }));
}
export const demoDeploymentPoints = createWorkbenchDeploymentPoints([
    {
        id: 'projection-001',
        name: '蓝军机动对抗分队',
        location: '台湾北部空域',
        category: 'force-unit',
        status: 'planned',
    },
    {
        id: 'projection-002',
        name: '电子侦察平台-07',
        location: '台湾东部海域',
        category: 'platform',
        status: 'planned',
    },
]);
