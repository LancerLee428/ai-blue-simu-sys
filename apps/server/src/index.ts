import type {
  DeploymentConfirmCommand,
  DeploymentDraftResponse,
  DeploymentIntentCommand,
} from '@ai-blue-simu-sys/ai-core';
import { APP_NAME, APP_VERSION } from '@ai-blue-simu-sys/shared';
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

function createPlatformSkeleton() {
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
    app: APP_NAME,
    version: APP_VERSION,
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

async function handleRequest(request: Request): Promise<Response> {
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

const serverApi = {
  port,
  fetch: handleRequest,
};

console.log(
  JSON.stringify(
    {
      server: serverApi,
      platform: createPlatformSkeleton(),
    },
    null,
    2,
  ),
);
