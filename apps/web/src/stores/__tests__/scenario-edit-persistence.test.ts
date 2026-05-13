import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';

import { useActionPlanStore } from '../action-plan';
import { useTacticalScenarioStore } from '../tactical-scenario';
import type { TacticalScenario } from '../../types/tactical-scenario';

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

function createScenario(longitude: number): TacticalScenario {
  return {
    id: 'drag-edit-persistence',
    version: 1,
    summary: '拖拽持久化测试',
    forces: [
      {
        side: 'red',
        name: '红方',
        entities: [
          {
            id: 'red-air-01',
            name: '红方飞机',
            type: 'air-fighter',
            side: 'red',
            position: { longitude, latitude: 25, altitude: 9000 },
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [],
    strikeTasks: [],
    phases: [],
    metadata: {
      generatedAt: '2026-05-12T00:00:00.000Z',
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

function getStoredScenario(): TacticalScenario {
  const raw = globalThis.localStorage.getItem('actionPlans');
  assert.ok(raw);
  return JSON.parse(raw)[0].scenario as TacticalScenario;
}

test('unsaved scenario edits should not overwrite persisted action plan storage', () => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  setActivePinia(createPinia());

  const actionPlanStore = useActionPlanStore();
  const tacticalStore = useTacticalScenarioStore();

  const original = createScenario(121);
  const edited = createScenario(122);
  actionPlanStore.createPlan(original, '原始方案');

  tacticalStore.applyScenarioEdit(edited, '拖拽修改位置');
  actionPlanStore.updateActivePlanScenarioInMemory(edited);

  assert.equal(tacticalStore.currentScenario?.forces[0].entities[0].position.longitude, 122);
  assert.equal(actionPlanStore.activePlan?.scenario.forces[0].entities[0].position.longitude, 122);
  assert.equal(getStoredScenario().forces[0].entities[0].position.longitude, 121);
});

test('execution state persistence should not flush unsaved scenario drafts to storage', () => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  setActivePinia(createPinia());

  const actionPlanStore = useActionPlanStore();

  const original = createScenario(121);
  const edited = createScenario(122);
  const plan = actionPlanStore.createPlan(original, '原始方案');

  actionPlanStore.updateActivePlanScenarioInMemory(edited);
  actionPlanStore.updateExecutionState(plan.id, { currentTime: 8, currentPhaseIndex: 1 });

  assert.equal(actionPlanStore.activePlan?.scenario.forces[0].entities[0].position.longitude, 122);
  assert.equal(getStoredScenario().forces[0].entities[0].position.longitude, 121);
  assert.equal(JSON.parse(globalThis.localStorage.getItem('actionPlans') ?? '[]')[0].executionState.currentTime, 8);
});

test('markScenarioSaved should persist the current edited scenario to action plan storage', () => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  setActivePinia(createPinia());

  const actionPlanStore = useActionPlanStore();
  const tacticalStore = useTacticalScenarioStore();

  const original = createScenario(121);
  const edited = createScenario(122);
  actionPlanStore.createPlan(original, '原始方案');
  tacticalStore.applyScenarioEdit(edited, '拖拽修改位置');
  actionPlanStore.updateActivePlanScenarioInMemory(edited);

  tacticalStore.markScenarioSaved('XML 副本已保存');

  assert.equal(getStoredScenario().forces[0].entities[0].position.longitude, 122);
  assert.equal(tacticalStore.hasUnsavedScenarioEdit, false);
});
