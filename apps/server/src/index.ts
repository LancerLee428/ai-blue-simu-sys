import type { ModuleDescriptor, APP_NAME, APP_VERSION } from '@ai-blue-simu-sys/shared';
import type {
  DeploymentConfirmCommand,
  DeploymentDraftResponse,
  DeploymentIntentCommand,
} from '@ai-blue-simu-sys/ai-core';
import type { ScenarioWorkspaceState } from '@ai-blue-simu-sys/scenario';
import type { WorkbenchDeploymentPoint } from '@ai-blue-simu-sys/situation';
import { ontologyModule } from './modules/ontology';
import {
  confirmScenarioDeployment,
  getScenarioWorkspaceState,
  scenarioWorkspaceModule,
} from './modules/scenario-workspace';
import { getSituationWorkbenchState, situationWorkbenchModule } from './modules/situation-workbench';
import {
  aiAssistantModule,
  confirmDeploymentDraft,
  createDeploymentDraftResponse,
} from './modules/ai-assistant';
import { governanceModule } from './modules/governance';

type PlatformSkeleton = {
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

const appName: string = 'AI Blue Simulation System';
const appVersion: string = '0.1.0';

export function createPlatformSkeleton(): PlatformSkeleton {
  const scenarioWorkspace = getScenarioWorkspaceState();
  const situationWorkbench = getSituationWorkbenchState();
  const command: DeploymentIntentCommand = {
    type: 'deployment.intent',
    scenarioId: scenarioWorkspace.scenario.id,
    targetRegion: scenarioWorkspace.scenario.focusRegion,
    forceType: '对抗兵力',
    objective: '建立首版智能部署草案链路',
  };

  return {
    app: appName,
    version: appVersion,
    modules: [
      ontologyModule,
      scenarioWorkspaceModule,
      situationWorkbenchModule,
      aiAssistantModule,
      governanceModule,
    ],
    scenarioWorkspace,
    situationWorkbench,
    ai: {
      sampleCommand: '在台湾部署对抗兵力',
      draft: createDeploymentDraftResponse(command),
    },
  };
}

async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/api/platform-skeleton') {
    return Response.json(createPlatformSkeleton());
  }

  if (request.method === 'POST' && url.pathname === '/api/ai/deployment-draft') {
    const command = await readJsonBody<DeploymentIntentCommand>(request);
    const response: DeploymentDraftResponse = createDeploymentDraftResponse(command);
    return Response.json(response);
  }

  if (request.method === 'POST' && url.pathname === '/api/ai/deployment-confirm') {
    const command = await readJsonBody<DeploymentConfirmCommand>(request);
    return Response.json(confirmDeploymentDraft(command));
  }

  if (request.method === 'POST' && url.pathname === '/api/scenario/confirm') {
    const command = await readJsonBody<DeploymentConfirmCommand>(request);
    return Response.json(
      confirmScenarioDeployment(
        command.items.map((item) => ({
          sourceEntityId: item.sourceEntityId,
          name: item.name,
          category: item.category,
          location: item.suggestedLocation,
          status: 'deployed',
        })),
      ),
    );
  }

  return new Response('Not Found', { status: 404 });
}

const port = 3000;

console.log(
  JSON.stringify(
    {
      server: {
        port,
      },
      platform: createPlatformSkeleton(),
    },
    null,
    2,
  ),
);
