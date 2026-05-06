import { ref, computed } from 'vue';

export type RightPanelTab = 'ai' | 'resource' | 'graph';

// Module-level state so all components share the same panel state
const leftPanelOpen = ref(false);
const rightPanelOpen = ref(false);
const resourceGraphOpen = ref(false);
const rightPanelActiveTab = ref<RightPanelTab>('ai');

export function usePanelState() {
  function toggleLeftPanel() { leftPanelOpen.value = !leftPanelOpen.value; }
  function openLeftPanel() { leftPanelOpen.value = true; }
  function closeLeftPanel() { leftPanelOpen.value = false; }
  function toggleRightPanel() { rightPanelOpen.value = !rightPanelOpen.value; }
  function openRightPanel() { rightPanelOpen.value = true; }
  function closeRightPanel() { rightPanelOpen.value = false; }
  function openResourceGraph() { resourceGraphOpen.value = true; }
  function closeResourceGraph() { resourceGraphOpen.value = false; }
  function toggleResourceGraph() { resourceGraphOpen.value = !resourceGraphOpen.value; }
  function setRightPanelTab(tab: RightPanelTab) {
    rightPanelActiveTab.value = tab;
    if (!rightPanelOpen.value) rightPanelOpen.value = true;
  }

  return {
    leftPanelOpen: computed(() => leftPanelOpen.value),
    rightPanelOpen: computed(() => rightPanelOpen.value),
    resourceGraphOpen: computed(() => resourceGraphOpen.value),
    rightPanelActiveTab: computed(() => rightPanelActiveTab.value),
    toggleLeftPanel, openLeftPanel, closeLeftPanel,
    toggleRightPanel, openRightPanel, closeRightPanel,
    openResourceGraph, closeResourceGraph, toggleResourceGraph,
    setRightPanelTab,
  };
}
