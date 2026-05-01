import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PlatformSkeleton } from '../app/types/platform';
import {
  FALLBACK_PLATFORM,
  confirmStagedScenarioDraftRequest,
  loadPlatformState,
  loadStagedScenarioDraft,
  requestDeploymentDraft,
  rejectDeploymentDraftRequest,
  confirmDeploymentDraftRequest,
  rejectStagedScenarioDraftRequest,
  undoDeploymentConfirmationRequest,
} from '../app/state/platform-state';

export const usePlatformStore = defineStore('platform', () => {
  const platform = ref<PlatformSkeleton>(FALLBACK_PLATFORM);
  const selectedPointId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function bootstrap() {
    loading.value = true;
    error.value = null;
    try {
      const result = await loadPlatformState();
      platform.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load platform state';
    } finally {
      loading.value = false;
    }
  }

  function selectPoint(id: string | null) {
    selectedPointId.value = id;
  }

  async function generateDraft(command: PlatformSkeleton['ai']['draft']['command']) {
    loading.value = true;
    error.value = null;
    try {
      const draft = await requestDeploymentDraft(command);
      platform.value = {
        ...platform.value,
        ai: { ...platform.value.ai, draft },
      };
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to generate draft';
    } finally {
      loading.value = false;
    }
  }

  async function confirmDraft() {
    loading.value = true;
    error.value = null;
    try {
      const result = await confirmDeploymentDraftRequest(
        platform.value.ai.draft.draft.items
      );
      platform.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to confirm draft';
    } finally {
      loading.value = false;
    }
  }

  async function rejectDraft(reason: string) {
    loading.value = true;
    error.value = null;
    try {
      const result = await rejectDeploymentDraftRequest(
        platform.value.ai.draft.draft.id,
        reason
      );
      platform.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to reject draft';
    } finally {
      loading.value = false;
    }
  }

  async function undoConfirm() {
    loading.value = true;
    error.value = null;
    try {
      const result = await undoDeploymentConfirmationRequest();
      platform.value = result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to undo confirmation';
    } finally {
      loading.value = false;
    }
  }

  async function refreshStagedScenarioDraft() {
    loading.value = true;
    error.value = null;
    try {
      platform.value = await loadStagedScenarioDraft();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load staged scenario draft';
    } finally {
      loading.value = false;
    }
  }

  async function confirmStagedDraft() {
    loading.value = true;
    error.value = null;
    try {
      platform.value = await confirmStagedScenarioDraftRequest();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to confirm staged draft';
    } finally {
      loading.value = false;
    }
  }

  async function rejectStagedDraft(reason: string) {
    loading.value = true;
    error.value = null;
    try {
      platform.value = await rejectStagedScenarioDraftRequest(reason);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to reject staged draft';
    } finally {
      loading.value = false;
    }
  }

  return {
    platform,
    selectedPointId,
    loading,
    error,
    bootstrap,
    selectPoint,
    generateDraft,
    confirmDraft,
    rejectDraft,
    undoConfirm,
    refreshStagedScenarioDraft,
    confirmStagedDraft,
    rejectStagedDraft,
  };
});
