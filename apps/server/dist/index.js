import { APP_NAME, APP_VERSION } from '@ai-blue-simu-sys/shared';
import { ontologyModule } from './modules/ontology';
import { scenarioWorkspaceModule } from './modules/scenario-workspace';
import { situationWorkbenchModule } from './modules/situation-workbench';
import { aiAssistantModule, createDeploymentDraft } from './modules/ai-assistant';
import { governanceModule } from './modules/governance';
function startServer() {
    const deploymentDraft = createDeploymentDraft({
        type: 'deployment.intent',
        scenarioId: 'demo-scenario',
        targetRegion: '台湾',
        forceType: '对抗兵力',
        objective: '建立首版智能部署草案链路',
    });
    const platformSkeleton = {
        app: APP_NAME,
        version: APP_VERSION,
        modules: [
            ontologyModule,
            scenarioWorkspaceModule,
            situationWorkbenchModule,
            aiAssistantModule,
            governanceModule,
        ],
        ai: {
            sampleCommand: '在台湾部署对抗兵力',
            draft: deploymentDraft,
        },
    };
    console.log(JSON.stringify(platformSkeleton, null, 2));
}
startServer();
