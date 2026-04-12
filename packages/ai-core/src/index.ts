export type DeploymentIntentCommand = {
  type: 'deployment.intent';
  scenarioId: string;
  targetRegion: string;
  forceType: string;
  objective?: string;
};

export type DeploymentDraftItem = {
  sourceEntityId: string;
  name: string;
  category: 'force-unit' | 'platform';
  suggestedLocation: string;
  rationale: string;
};

export type DeploymentDraft = {
  type: 'deployment.draft';
  scenarioId: string;
  summary: string;
  objective: string;
  reviewRequired: boolean;
  items: DeploymentDraftItem[];
};

export const AI_ASSISTANT_MODULE = 'ai-assistant';
