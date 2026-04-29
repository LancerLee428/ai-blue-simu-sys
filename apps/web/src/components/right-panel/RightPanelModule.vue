<script setup lang="ts">
import { computed } from "vue";
import {
  usePanelState,
  type RightPanelTab,
} from "../../composables/usePanelState";
import AIAssistantPanel from "../ai-assistant/AIAssistantPanel.vue";
import EventLogPanel from "./EventLogPanel.vue";
import ResourceTreeModule from "./ResourceTreeModule.vue";

const {
  rightPanelOpen,
  rightPanelActiveTab,
  rightPanelPrimaryTab,
  closeRightPanel,
  setRightPanelTab,
} = usePanelState();

function switchTab(tab: RightPanelTab) {
  setRightPanelTab(tab);
}

const primaryTab = computed<Exclude<RightPanelTab, "ai">>(() => {
  return rightPanelPrimaryTab.value;
});

const primaryTabLabel = computed(() => {
  return primaryTab.value === "event-log" ? "事件日志" : "资源列表";
});
</script>

<template>
  <Transition name="panel-right">
    <aside v-if="rightPanelOpen" class="right-panel glass-panel">
      <div class="panel-header">
        <div class="tab-strip">
          <div
            class="tab-item"
            :class="{ active: rightPanelActiveTab === primaryTab }"
            @click="switchTab(primaryTab)"
          >
            {{ primaryTabLabel }}
          </div>
          <div
            class="tab-item"
            :class="{ active: rightPanelActiveTab === 'ai' }"
            @click="switchTab('ai')"
          >
            AI助手
          </div>
        </div>
        <button class="close-btn" @click="closeRightPanel">✕</button>
      </div>

      <div
        class="panel-body"
        :class="{ 'panel-body--ai': rightPanelActiveTab === 'ai' }"
      >
        <AIAssistantPanel v-if="rightPanelActiveTab === 'ai'" />
        <EventLogPanel v-else-if="rightPanelActiveTab === 'event-log'" />
        <ResourceTreeModule v-else />
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.right-panel {
  position: fixed;
  top: 66px;
  right: 16px;
  bottom: 16px;
  width: 424px;
  z-index: 1080;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  resize: horizontal;
  border-radius: 0;
  border-color: rgba(46, 119, 255, 0.34);
  background:
    linear-gradient(180deg, rgba(3, 21, 58, 0.74), rgba(3, 27, 64, 0.64)),
    url("../../assets/chat/chat- background.png") center / cover no-repeat;
  box-shadow:
    inset 0 0 0 1px rgba(120, 180, 255, 0.08),
    0 12px 34px rgba(0, 0, 0, 0.36);
}

.panel-header {
  flex-shrink: 0;
  position: relative;
  padding: 0;
  border-bottom: 1px solid rgba(63, 137, 255, 0.4);
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: rgba(2, 14, 42, 0.2);
}

.panel-body--ai {
  padding: 22px 18px 16px;
  overflow: hidden;
}

.tab-strip {
  gap: 0;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: rgba(3, 24, 62, 0.48);
}

.tab-item {
  flex: 0 0 124px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-right: 1px solid rgba(63, 137, 255, 0.24);
  border-radius: 0;
  color: #d6e8ff;
  font-size: 14px;
}

.tab-item.active {
  color: #ffffff;
  background: url("../../assets/left-panel/tab-active.png") center / 100% 100%
    no-repeat;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.7);
}

.close-btn {
  position: absolute;
  top: 6px;
  right: 10px;
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

@media (max-width: 760px) {
  .right-panel {
    left: 8px;
    right: 8px;
    width: auto;
    min-width: 0;
  }

  .panel-body {
    padding: 18px 14px;
  }
}
</style>
