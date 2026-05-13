// apps/web/src/stores/action-plan.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TacticalScenario, ExecutionStatus } from '../types/tactical-scenario';

export interface ActionPlan {
  id: string;
  scenario: TacticalScenario;
  createdAt: Date;
  name: string;
  executionState: {
    status: ExecutionStatus;
    currentTime: number;
    currentPhaseIndex: number;
    speed: number;
  };
}

export const useActionPlanStore = defineStore('actionPlan', () => {
  // 状态
  const plans = ref<ActionPlan[]>([]);
  const activePlanId = ref<string | null>(null);
  const scenarioDrafts = ref<Record<string, TacticalScenario>>({});

  // 计算属性
  const activePlan = computed(() => {
    if (!activePlanId.value) return null;
    const plan = plans.value.find(p => p.id === activePlanId.value);
    if (!plan) return null;
    const draftScenario = scenarioDrafts.value[plan.id];
    return draftScenario ? { ...plan, scenario: draftScenario } : plan;
  });

  // 创建新方案
  function createPlan(scenario: TacticalScenario, name: string) {
    const plan: ActionPlan = {
      id: `plan-${Date.now()}`,
      scenario,
      createdAt: new Date(),
      name: name || scenario.summary || '未命名方案',
      executionState: {
        status: 'idle',
        currentTime: 0,
        currentPhaseIndex: 0,
        speed: 1,
      },
    };

    plans.value.push(plan);
    activePlanId.value = plan.id;
    saveToStorage();

    return plan;
  }

  // 激活方案
  function activatePlan(planId: string) {
    const plan = plans.value.find(p => p.id === planId);
    if (plan) {
      activePlanId.value = planId;
    }
  }

  // 删除方案
  function deletePlan(planId: string) {
    const index = plans.value.findIndex(p => p.id === planId);
    if (index !== -1) {
      plans.value.splice(index, 1);
      clearScenarioDraft(planId);
      if (activePlanId.value === planId) {
        activePlanId.value = plans.value[0]?.id || null;
      }
      saveToStorage();
    }
  }

  // 更新执行状态
  function updateExecutionState(planId: string, updates: Partial<ActionPlan['executionState']>) {
    const plan = plans.value.find(p => p.id === planId);
    if (plan) {
      plan.executionState = { ...plan.executionState, ...updates };
      saveToStorage();
    }
  }

  function updatePlanScenario(planId: string, scenario: TacticalScenario) {
    const plan = plans.value.find(p => p.id === planId);
    if (plan) {
      plan.scenario = scenario;
      clearScenarioDraft(planId);
      saveToStorage();
    }
  }

  function updateActivePlanScenarioInMemory(scenario: TacticalScenario) {
    if (!activePlanId.value) return;
    scenarioDrafts.value = {
      ...scenarioDrafts.value,
      [activePlanId.value]: scenario,
    };
  }

  function clearScenarioDraft(planId: string) {
    if (!scenarioDrafts.value[planId]) return;
    const { [planId]: _removed, ...nextDrafts } = scenarioDrafts.value;
    scenarioDrafts.value = nextDrafts;
  }

  // 获取当前方案的执行状态
  function getExecutionState(planId: string) {
    const plan = plans.value.find(p => p.id === planId);
    return plan?.executionState || null;
  }

  // 持久化到 localStorage
  function saveToStorage() {
    try {
      const data = plans.value.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      }));
      localStorage.setItem('actionPlans', JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save action plans:', err);
    }
  }

  // 从 localStorage 加载
  function loadFromStorage() {
    try {
      const data = localStorage.getItem('actionPlans');
      if (data) {
        const parsed = JSON.parse(data);
        plans.value = parsed.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          executionState: {
            currentPhaseIndex: 0,
            ...p.executionState,
          },
        }));
        if (plans.value.length > 0) {
          activePlanId.value = plans.value[0].id;
        }
      }
    } catch (err) {
      console.error('Failed to load action plans:', err);
    }
  }

  // 初始化时加载
  loadFromStorage();

  return {
    // 状态
    plans,
    activePlanId,
    activePlan,
    // 方法
    createPlan,
    activatePlan,
    deletePlan,
    updatePlanScenario,
    updateActivePlanScenarioInMemory,
    updateExecutionState,
    getExecutionState,
  };
});
