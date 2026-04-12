export type DeploymentIntentCommand = {
  type: 'deployment.intent';
  scenarioId: string;
  targetRegion: string;
  forceType: string;
  objective?: string;
  regenerateFromDraftId?: string;
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
  id: string;
  scenarioId: string;
  summary: string;
  objective: string;
  reviewRequired: boolean;
  items: DeploymentDraftItem[];
};

export type DeploymentDraftResponse = {
  command: DeploymentIntentCommand;
  draft: DeploymentDraft;
};

export type DeploymentConfirmCommand = {
  scenarioId: string;
  items: DeploymentDraftItem[];
};

export type DeploymentRejectCommand = {
  scenarioId: string;
  draftId: string;
  reason: string;
};

export const AI_ASSISTANT_MODULE = 'ai-assistant';
