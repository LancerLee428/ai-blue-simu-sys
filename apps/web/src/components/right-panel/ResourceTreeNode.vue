<script setup lang="ts">
interface TreeNode {
  id: string;
  name: string;
  type: 'force-unit' | 'platform';
}

interface Props {
  node: TreeNode;
  depth?: number;
}

withDefaults(defineProps<Props>(), {
  depth: 0,
});

const emit = defineEmits<{
  (e: 'dragstart', node: TreeNode, event: DragEvent): void;
}>();

function onDragStart(e: DragEvent, node: TreeNode) {
  emit('dragstart', node, e);
}
</script>

<template>
  <div
    class="tree-node"
    :style="{ paddingLeft: `${depth * 16 + 12}px` }"
    draggable="true"
    @dragstart="onDragStart($event, node)"
  >
    <span class="tree-node__icon">{{ node.type === 'force-unit' ? '✦' : '◇' }}</span>
    <span class="tree-node__name">{{ node.name }}</span>
    <span class="tree-node__drag-hint">⋮⋮</span>
  </div>
</template>

<style scoped>
.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: grab;
  transition: background 0.15s;
  user-select: none;
}

.tree-node:hover {
  background: rgba(107, 196, 255, 0.08);
}

.tree-node:active {
  cursor: grabbing;
}

.tree-node__icon {
  font-size: 13px;
  color: #6bc4ff;
  flex-shrink: 0;
}

.tree-node__name {
  flex: 1;
  font-size: 13px;
  color: #e2ebfb;
}

.tree-node__drag-hint {
  font-size: 12px;
  color: #4a5a78;
  opacity: 0;
  transition: opacity 0.15s;
}

.tree-node:hover .tree-node__drag-hint {
  opacity: 1;
}
</style>
