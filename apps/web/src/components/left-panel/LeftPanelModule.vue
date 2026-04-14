<script setup lang="ts">
import { ref } from 'vue';
import { usePanelState } from '../../composables/usePanelState';
import EntityListTab from './EntityListTab.vue';
import OntologyBrowserTab from './OntologyBrowserTab.vue';

const { leftPanelOpen, closeLeftPanel } = usePanelState();

const activeTab = ref<'projection' | 'ontology'>('projection');
</script>

<template>
  <Transition name="panel">
    <aside v-if="leftPanelOpen" class="left-panel glass-panel">
      <div class="panel-header">
        <div class="tab-strip">
          <div
            class="tab-item"
            :class="{ active: activeTab === 'projection' }"
            @click="activeTab = 'projection'"
          >
            想定投影
          </div>
          <div
            class="tab-item"
            :class="{ active: activeTab === 'ontology' }"
            @click="activeTab = 'ontology'"
          >
            Ontology
          </div>
        </div>
        <button class="close-btn" @click="closeLeftPanel">✕</button>
      </div>

      <div class="panel-scroll">
        <EntityListTab v-if="activeTab === 'projection'" />
        <OntologyBrowserTab v-else />
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.left-panel {
  position: fixed;
  top: 70px;
  left: 16px;
  bottom: 16px;
  width: 360px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  resize: horizontal;
  min-width: 300px;
  max-width: 600px;
}

.panel-header {
  flex-shrink: 0;
  position: relative;
  padding: 0;
  border-bottom: 1px solid rgba(142, 164, 201, 0.15);
}

.panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 0;
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
