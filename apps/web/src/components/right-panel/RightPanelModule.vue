<script setup lang="ts">
import { usePanelState, type RightPanelTab } from '../../composables/usePanelState';
import AIAssistantPanel from '../ai-assistant/AIAssistantPanel.vue';
import ResourceTreeModule from './ResourceTreeModule.vue';

const {
  rightPanelOpen,
  rightPanelActiveTab,
  closeRightPanel,
  setRightPanelTab,
} = usePanelState();

function switchTab(tab: RightPanelTab) {
  setRightPanelTab(tab);
}
</script>

<template>
  <Transition name="panel-right">
    <aside v-if="rightPanelOpen" class="right-panel glass-panel">
      <div class="panel-header">
        <div class="tab-strip">
          <div
            class="tab-item"
            :class="{ active: rightPanelActiveTab === 'ai' }"
            @click="switchTab('ai')"
          >
            AI 助手
          </div>
          <div
            class="tab-item"
            :class="{ active: rightPanelActiveTab === 'resource' }"
            @click="switchTab('resource')"
          >
            资源树
          </div>
        </div>
        <button class="close-btn" @click="closeRightPanel">✕</button>
      </div>

      <div class="panel-body">
        <AIAssistantPanel v-if="rightPanelActiveTab === 'ai'" />
        <ResourceTreeModule v-else />
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.right-panel {
  position: fixed;
  top: 70px;
  right: 16px;
  bottom: 16px;
  width: 420px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  resize: horizontal;
  min-width: 360px;
  max-width: 700px;
}

.panel-header {
  flex-shrink: 0;
  position: relative;
  padding: 0;
  border-bottom: 1px solid rgba(142, 164, 201, 0.15);
}

/* 面板主体：填满剩余空间，AI 面板内部自行管理滚动 */
.panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: rgba(4, 11, 20, 0.3);
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(142, 164, 201, 0.2);
  color: #8ea4c9;
  cursor: pointer;
  font-size: 14px;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.2s;
  z-index: 10;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(142, 164, 201, 0.4);
  color: #e2ebfb;
}
</style>
