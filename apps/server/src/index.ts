import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ModuleDescriptor } from '@ai-blue-simu-sys/shared';
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

const appName = 'AI Blue Simulation System';
const appVersion = '0.1.0';
const port = 3000;
const startedAt = new Date().toISOString();

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

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw) as T;
}

async function handleNodeRequest(request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/api/health') {
    writeJson(response, 200, {
      status: 'ok',
      service: 'ai-blue-simu-sys-server',
      startedAt,
      port,
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/platform-skeleton') {
    writeJson(response, 200, createPlatformSkeleton());
    return;
  }

  if (method === 'POST' && url.pathname === '/api/ai/deployment-draft') {
    const command = await readJsonBody<DeploymentIntentCommand>(request);
    writeJson(response, 200, createDeploymentDraftResponse(command));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/ai/deployment-confirm') {
    const command = await readJsonBody<DeploymentConfirmCommand>(request);
    writeJson(response, 200, confirmDeploymentDraft(command));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/scenario/confirm') {
    const command = await readJsonBody<DeploymentConfirmCommand>(request);
    writeJson(
      response,
      200,
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
    return;
  }

  writeJson(response, 404, { message: 'Not Found' });
}

const server = createServer((request, response) => {
  void handleNodeRequest(request, response).catch((error) => {
    writeJson(response, 500, {
      message: error instanceof Error ? error.message : 'Internal Server Error',
    });
  });
});

server.listen(port, () => {
  console.log(`AI Blue Simulation System server listening on http://localhost:${port}`);
});
