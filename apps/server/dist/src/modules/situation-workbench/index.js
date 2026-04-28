import { createWorkbenchDeploymentPoints } from '@ai-blue-simu-sys/situation';
import { getScenarioWorkspaceState } from '../scenario-workspace';
export const situationWorkbenchModule = {
    key: 'situation-workbench',
    title: 'Situation Workbench',
    description: '地球引擎态势、空间部署与态势读取接口。',
};
export function getSituationWorkbenchState() {
    return createWorkbenchDeploymentPoints(getScenarioWorkspaceState().projections);
}
