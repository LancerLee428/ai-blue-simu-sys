import type { ModuleDescriptor } from '@ai-blue-simu-sys/shared';
import type { DeploymentDraftResponse } from '@ai-blue-simu-sys/ai-core';
import type { ScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';
import type { WorkbenchDeploymentPoint } from '@ai-blue-simu-sys/situation';

export type PlatformSkeleton = {
  app: string;
  version: string;
  modules: ModuleDescriptor[];
  scenarioWorkspace: ScenarioWorkspaceState;
  situationWorkbench: WorkbenchDeploymentPoint[];
  ai: {
    sampleCommand: string;
    draft: DeploymentDraftResponse;
  };
};
