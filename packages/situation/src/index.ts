export type WorkbenchDeploymentPoint = {
  id: string;
  name: string;
  region: string;
  category: 'force-unit' | 'platform';
  state: 'planned' | 'deployed';
};

export function createWorkbenchDeploymentPoints(
  projections: Array<{
    id: string;
    name: string;
    location: string;
    category: 'force-unit' | 'platform';
    status: 'planned' | 'deployed';
  }>,
): WorkbenchDeploymentPoint[] {
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
