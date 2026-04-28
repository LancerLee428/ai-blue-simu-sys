import { ref, computed } from 'vue';

export type RightPanelTab = 'ai' | 'resource';

// Module-level state so all components share the same panel state
const leftPanelOpen = ref(false);
const rightPanelOpen = ref(false);
const rightPanelActiveTab = ref<RightPanelTab>('ai');

export function usePanelState() {
  function toggleLeftPanel() { leftPanelOpen.value = !leftPanelOpen.value; }
  function openLeftPanel() { leftPanelOpen.value = true; }
  function closeLeftPanel() { leftPanelOpen.value = false; }
  function toggleRightPanel() { rightPanelOpen.value = !rightPanelOpen.value; }
  function openRightPanel() { rightPanelOpen.value = true; }
  function closeRightPanel() { rightPanelOpen.value = false; }
  function setRightPanelTab(tab: RightPanelTab) {
    rightPanelActiveTab.value = tab;
    if (!rightPanelOpen.value) rightPanelOpen.value = true;
  }

  return {
    leftPanelOpen: computed(() => leftPanelOpen.value),
    rightPanelOpen: computed(() => rightPanelOpen.value),
    rightPanelActiveTab: computed(() => rightPanelActiveTab.value),
    toggleLeftPanel, openLeftPanel, closeLeftPanel,
    toggleRightPanel, openRightPanel, closeRightPanel,
    setRightPanelTab,
  };
}
