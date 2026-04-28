export const aiAssistantModule = {
    key: 'ai-assistant',
    title: 'AI Assistant',
    description: '上下文问答、结构化辅助与智能部署入口。',
};
export function createDeploymentDraft(command) {
    return {
        type: 'deployment.draft',
        scenarioId: command.scenarioId,
        summary: `为区域 ${command.targetRegion} 生成 ${command.forceType} 的对抗部署草案`,
        objective: command.objective ?? '未指定任务目标',
        reviewRequired: true,
    };
}
