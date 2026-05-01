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
  type: 'deployment.confirm';
  scenarioId: string;
  items: DeploymentDraftItem[];
};

export type DeploymentRejectCommand = {
  type: 'deployment.reject';
  scenarioId: string;
  draftId: string;
  reason: string;
};

export const AI_ASSISTANT_MODULE = 'ai-assistant';

export type WorkflowEvidence = {
  id: string;
  type: 'relationship' | 'resource' | 'rag-document' | 'validation';
  label: string;
  source: string;
};

export type TaskIntent = {
  missionType: string;
  operationArea: string;
  side: 'red' | 'blue';
  objectives: string[];
  constraints: string[];
};

export type ResourceRequirementPlan = {
  requiredCapabilities: string[];
  requiredChains: Array<'command' | 'communication' | 'detection' | 'strike' | 'support'>;
  preferredResourceTypes: string[];
};

export type ResourceGraphNodeType =
  | 'force-unit'
  | 'platform'
  | 'weapon'
  | 'sensor'
  | 'geo-zone'
  | 'mission';

export type ResourceGraphNode = {
  id: string;
  type: ResourceGraphNodeType;
  name: string;
  side?: 'red' | 'blue' | 'neutral';
  capabilities: string[];
  status: 'available' | 'unavailable' | 'reserved';
  metadata: Record<string, string | number | boolean | string[]>;
};

export type ResourceRelationshipType =
  | 'belongs_to'
  | 'can_command'
  | 'can_communicate'
  | 'can_detect'
  | 'can_strike'
  | 'can_support'
  | 'deployable_to'
  | 'suitable_for';

export type ResourceGraphRelationship = {
  id: string;
  type: ResourceRelationshipType;
  from: string;
  to: string;
  label: string;
  metadata: Record<string, string | number | boolean>;
};

export type CandidateResourceGraphRequest = {
  taskIntent: TaskIntent;
  requirementPlan: ResourceRequirementPlan;
};

export type CandidateResourceGraph = {
  request: CandidateResourceGraphRequest;
  nodes: ResourceGraphNode[];
  relationships: ResourceGraphRelationship[];
  unavailableResources: ResourceGraphNode[];
  warnings: string[];
};

export type SelectedResourceRole =
  | 'command'
  | 'reconnaissance'
  | 'electronic-warfare'
  | 'strike'
  | 'communication-relay'
  | 'support';

export type SelectedResource = {
  resourceId: string;
  role: SelectedResourceRole;
  reason: string;
  evidenceIds: string[];
};

export type ResourceChainDraft = {
  chainType: 'command' | 'communication' | 'detection' | 'strike' | 'support';
  relationshipIds: string[];
  explanation: string;
};

export type ResourceOrchestrationDraft = {
  id: string;
  taskIntent: TaskIntent;
  requirementPlan: ResourceRequirementPlan;
  selectedResources: SelectedResource[];
  chains: ResourceChainDraft[];
  evidence: WorkflowEvidence[];
  summary: string;
};

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  targetId?: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  issues: WorkflowValidationIssue[];
};

export type TacticalScenarioDraft = {
  id: string;
  orchestrationDraftId: string;
  status: 'generated' | 'validation_failed' | 'staged' | 'confirmed' | 'rejected';
  summary: string;
  scenario: unknown;
  evidence: WorkflowEvidence[];
  validation: WorkflowValidationResult;
  createdAt: string;
};
