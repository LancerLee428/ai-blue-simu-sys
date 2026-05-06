import { createServer } from 'node:http';
import { ontologyModule } from './modules/ontology';
import { generateScenarioFromOrchestration } from './modules/ai-workflow';
import { queryCandidateResourceGraph, resourceGraphModule, validateResourceOrchestration, } from './modules/resource-graph';
import { confirmStagedScenarioDraft, confirmScenarioDeployment, getStagedScenarioDraft, getScenarioWorkspaceState, rejectStagedScenarioDraft, scenarioWorkspaceModule, stageScenarioDraft, undoScenarioConfirmation, } from './modules/scenario-workspace';
import { getSituationWorkbenchState, situationWorkbenchModule } from './modules/situation-workbench';
import { aiAssistantModule, confirmDeploymentDraft, createDeploymentDraftResponse, rejectDeploymentDraft, } from './modules/ai-assistant';
import { governanceModule } from './modules/governance';
const appName = 'AI Blue Simulation System';
const appVersion = '0.1.0';
const port = 3000;
const startedAt = new Date().toISOString();
export function createPlatformSkeleton() {
    const scenarioWorkspace = getScenarioWorkspaceState();
    const situationWorkbench = getSituationWorkbenchState();
    const command = {
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
            resourceGraphModule,
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
function writeJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end(JSON.stringify(payload));
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    return JSON.parse(raw);
}
async function handleNodeRequest(request, response) {
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
    if (method === 'POST' && url.pathname === '/api/resource-graph/query-candidates') {
        const command = await readJsonBody(request);
        writeJson(response, 200, queryCandidateResourceGraph(command));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/resource-graph/validate-orchestration') {
        const command = await readJsonBody(request);
        writeJson(response, 200, validateResourceOrchestration(command));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/ai/deployment-draft') {
        const command = await readJsonBody(request);
        writeJson(response, 200, createDeploymentDraftResponse(command));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/ai/deployment-confirm') {
        const command = await readJsonBody(request);
        writeJson(response, 200, confirmDeploymentDraft(command));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/ai/deployment-reject') {
        const command = await readJsonBody(request);
        writeJson(response, 200, rejectDeploymentDraft(command));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/scenario/confirm') {
        const command = await readJsonBody(request);
        writeJson(response, 200, confirmScenarioDeployment(command.items.map((item) => ({
            sourceEntityId: item.sourceEntityId,
            name: item.name,
            category: item.category,
            location: item.suggestedLocation,
            status: 'deployed',
        }))));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/scenario/generate-from-orchestration') {
        const command = await readJsonBody(request);
        writeJson(response, 200, generateScenarioFromOrchestration(command));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/scenario/validate-and-stage') {
        const command = await readJsonBody(request);
        const blockingErrors = command.validation.issues.filter((issue) => issue.severity === 'error');
        if (blockingErrors.length > 0) {
            writeJson(response, 422, {
                message: 'AI Workflow 草案校验未通过，不能暂存。',
                validation: command.validation,
            });
            return;
        }
        writeJson(response, 200, stageScenarioDraft({
            id: command.id,
            orchestrationDraftId: command.orchestrationDraftId,
            summary: command.summary,
            tacticalScenario: command.scenario,
            evidenceIds: command.evidence.map((item) => item.id),
            validationIssueCount: command.validation.issues.length,
        }));
        return;
    }
    if (method === 'GET' && url.pathname === '/api/scenario/staged-draft') {
        writeJson(response, 200, { draft: getStagedScenarioDraft() });
        return;
    }
    if (method === 'POST' && url.pathname === '/api/scenario/staged-draft-confirm') {
        writeJson(response, 200, confirmStagedScenarioDraft());
        return;
    }
    if (method === 'POST' && url.pathname === '/api/scenario/staged-draft-reject') {
        const command = await readJsonBody(request);
        writeJson(response, 200, rejectStagedScenarioDraft(command.reason));
        return;
    }
    if (method === 'POST' && url.pathname === '/api/scenario/undo-confirm') {
        writeJson(response, 200, {
            scenarioWorkspace: undoScenarioConfirmation(),
            situationWorkbench: getSituationWorkbenchState(),
        });
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
