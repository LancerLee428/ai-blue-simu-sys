export type AppRoute = {
  path: string;
  label: string;
  description: string;
};

export const appRoutes: AppRoute[] = [
  {
    path: '/ontology',
    label: 'Ontology',
    description: '统一对象模型、对象源与关系建模入口。',
  },
  {
    path: '/scenario-workspace',
    label: 'Scenario Workspace',
    description: '想定工作空间、对象投影与版本上下文。',
  },
  {
    path: '/situation-workbench',
    label: 'Situation Workbench',
    description: '态势工作台、地球引擎与空间部署工作面。',
  },
  {
    path: '/ai-assistant',
    label: 'AI Assistant',
    description: '上下文问答、结构化辅助与智能部署入口。',
  },
  {
    path: '/governance',
    label: 'Governance',
    description: '权限、审计、版本与可信治理能力。',
  },
];
