<script setup lang="ts">
import type { ScenarioEntity } from '../../types/deployment';

interface TreeNode {
  entity: ScenarioEntity;
  children: TreeNode[];
  isExpanded: Ref<boolean>;
}

interface Props {
  node: TreeNode;
  selectedEntityId?: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
}>();

function getStatusIcon(status: string): string {
  const icons = {
    planned: '📋',
    deployed: '✅',
    engaged: '⚔️',
    destroyed: '💀'
  };
  return icons[status] || '❓';
}

function getCategoryIcon(category: string): string {
  return category === 'force-unit' ? '🏢' : '✈️';
}

function toggleNode() {
  props.node.isExpanded.value = !props.node.isExpanded.value;
}

function handleSelect() {
  emit('select', props.node.entity.id);
}
</script>

<template>
  <div
    class="tree-node"
    :class="{ 'is-selected': selectedEntityId === node.entity.id }"
  >
    <!-- 节点内容 -->
    <div class="node-content" @click="handleSelect">
      <span
        v-if="node.children.length > 0"
        class="expand-icon"
        @click.stop="toggleNode"
      >
        {{ node.isExpanded ? '▼' : '▶' }}
      </span>
      <span v-else class="expand-icon-placeholder"></span>

      <span class="status-icon">{{ getStatusIcon(node.entity.currentStatus) }}</span>
      <span class="category-icon">{{ getCategoryIcon(node.entity.category) }}</span>
      <span class="node-name">{{ node.entity.name }}</span>
      <span class="node-id">{{ node.entity.id.slice(-6) }}</span>
    </div>

    <!-- 子节点 -->
    <div v-if="node.isExpanded && node.children.length > 0" class="tree-children">
      <OrganizationTreeNode
        v-for="child in node.children"
        :key="child.entity.id"
        :node="child"
        :selected-entity-id="selectedEntityId"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.tree-node {
  margin-bottom: 4px;
}

.node-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
}

.node-content:hover {
  background: rgba(107, 196, 255, 0.08);
}

.tree-node.is-selected > .node-content {
  background: rgba(0, 214, 201, 0.15);
  border: 1px solid rgba(0, 214, 201, 0.3);
}

.expand-icon {
  font-size: 10px;
  color: #6bc4ff;
  cursor: pointer;
  width: 12px;
  text-align: center;
}

.expand-icon-placeholder {
  width: 12px;
}

.status-icon {
  font-size: 14px;
}

.category-icon {
  font-size: 14px;
}

.node-name {
  flex: 1;
  font-size: 13px;
  color: #e2ebfb;
  font-weight: 500;
}

.node-id {
  font-size: 11px;
  color: #6bc4ff;
  font-family: monospace;
}

.tree-children {
  margin-left: 24px;
  border-left: 1px solid rgba(142, 164, 201, 0.2);
  padding-left: 8px;
}
</style>