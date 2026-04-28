<script setup lang="ts">
import { usePanelState, type RightPanelTab } from '../../composables/usePanelState';
import ToolbarButton from './ToolbarButton.vue';

const {
  leftPanelOpen,
  rightPanelOpen,
  rightPanelActiveTab,
  toggleLeftPanel,
  toggleRightPanel,
  setRightPanelTab,
} = usePanelState();

interface Props {
  canUndo?: boolean;
  canRedo?: boolean;
}

withDefaults(defineProps<Props>(), {
  canUndo: false,
  canRedo: false,
});

const emit = defineEmits<{
  (e: 'undo'): void;
  (e: 'redo'): void;
}>();

function handleAIRightClick() {
  if (rightPanelOpen.value && rightPanelActiveTab.value === 'ai') {
    toggleRightPanel();
  } else {
    setRightPanelTab('ai' as RightPanelTab);
  }
}

function handleResourceRightClick() {
  if (rightPanelOpen.value && rightPanelActiveTab.value === 'resource') {
    toggleRightPanel();
  } else {
    setRightPanelTab('resource' as RightPanelTab);
  }
}
</script>

<template>
  <!-- Left toolbar -->
  <div class="toolbar toolbar--left">
    <ToolbarButton :active="leftPanelOpen" icon="☰" @click="toggleLeftPanel">
      对象
    </ToolbarButton>
  </div>

  <!-- Center toolbar - 撤销重做 -->
  <div class="toolbar toolbar--center">
    <ToolbarButton
      :disabled="!canUndo"
      icon="↩️"
      @click="$emit('undo')"
    >
      撤销
    </ToolbarButton>
    <ToolbarButton
      :disabled="!canRedo"
      icon="↪️"
      @click="$emit('redo')"
    >
      重做
    </ToolbarButton>
  </div>

  <!-- Right toolbar -->
  <div class="toolbar toolbar--right">
    <ToolbarButton
      :active="rightPanelOpen && rightPanelActiveTab === 'ai'"
      icon="◆"
      @click="handleAIRightClick"
    >
      AI 助手
    </ToolbarButton>
    <ToolbarButton
      :active="rightPanelOpen && rightPanelActiveTab === 'resource'"
      icon="⊞"
      @click="handleResourceRightClick"
    >
      资源树
    </ToolbarButton>
  </div>
</template>

<style scoped>
.toolbar {
  position: fixed;
  top: 16px;
  z-index: 100;
  display: flex;
  gap: 8px;
}

.toolbar--left {
  left: 16px;
}

.toolbar--center {
  left: 50%;
  transform: translateX(-50%);
}

.toolbar--right {
  right: 11%;
}
</style>
