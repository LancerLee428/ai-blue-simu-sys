export type DeploymentIntentCommand = {
    type: 'deployment.intent';
    scenarioId: string;
    targetRegion: string;
    forceType: string;
    objective?: string;
};
export declare const AI_ASSISTANT_MODULE = "ai-assistant";
