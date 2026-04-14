export type WorkbenchDeploymentPoint = {
    id: string;
    name: string;
    region: string;
    category: 'force-unit' | 'platform';
    state: 'planned' | 'deployed';
};
export declare function createWorkbenchDeploymentPoints(projections: Array<{
    id: string;
    name: string;
    location: string;
    category: 'force-unit' | 'platform';
    status: 'planned' | 'deployed';
}>): WorkbenchDeploymentPoint[];
export declare const demoDeploymentPoints: WorkbenchDeploymentPoint[];
