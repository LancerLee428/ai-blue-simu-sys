<script setup lang="ts">
import { usePanelState, type RightPanelTab } from '../../composables/usePanelState';
import ToolbarButton from './ToolbarButton.vue';
import envIcon from '../../assets/tool-btn/env.png';
import groupIcon from '../../assets/tool-btn/group.png';
import simulateIcon from '../../assets/tool-btn/simulate.png';
import logIcon from '../../assets/tool-btn/log.png';

const {
  leftPanelOpen,
  rightPanelOpen,
  rightPanelActiveTab,
  rightPanelPrimaryTab,
  toggleRightPanel,
  setRightPanelTab,
} = usePanelState();

interface Props {
  canUndo?: boolean;
  canRedo?: boolean;
  simulationOpen?: boolean;
  environmentAvailable?: boolean;
}

withDefaults(defineProps<Props>(), {
  canUndo: false,
  canRedo: false,
  simulationOpen: false,
  environmentAvailable: false,
});

const emit = defineEmits<{
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'toggle-simulation'): void;
  (e: 'open-environment'): void;
}>();

function handlePanelToolClick(tab: RightPanelTab) {
  if (rightPanelOpen.value && rightPanelActiveTab.value === tab) {
    toggleRightPanel();
  } else {
    setRightPanelTab(tab);
  }
}
</script>

<template>
  <!-- Right toolbar -->
  <div class="toolbar toolbar--right">
    <ToolbarButton
      :active="false"
      :disabled="!environmentAvailable"
      :icon-src="envIcon"
      @click="emit('open-environment')"
    >
      环境配置
    </ToolbarButton>
    <ToolbarButton
      :active="rightPanelOpen && rightPanelActiveTab === 'resource'"
      :class="{ contextual: rightPanelOpen && rightPanelPrimaryTab === 'resource' }"
      :icon-src="groupIcon"
      @click="handlePanelToolClick('resource')"
    >
      资源编组
    </ToolbarButton>
    <ToolbarButton
      :active="simulationOpen"
      :icon-src="simulateIcon"
      @click="emit('toggle-simulation')"
    >
      仿真推演
    </ToolbarButton>
    <ToolbarButton
      :active="rightPanelOpen && rightPanelActiveTab === 'event-log'"
      :class="{ contextual: rightPanelOpen && rightPanelPrimaryTab === 'event-log' }"
      :icon-src="logIcon"
      @click="handlePanelToolClick('event-log')"
    >
      事件日志
    </ToolbarButton>
  </div>
</template>

<style scoped>
.toolbar {
  position: fixed;
  top: 16px;
  z-index: 1160;
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
  right: 16px;
}
</style>
