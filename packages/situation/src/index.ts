export type WorkbenchDeploymentPoint = {
  id: string;
  name: string;
  region: string;
  category: 'force-unit' | 'platform';
  state: 'planned' | 'deployed';
};

export const demoDeploymentPoints: WorkbenchDeploymentPoint[] = [
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
];
