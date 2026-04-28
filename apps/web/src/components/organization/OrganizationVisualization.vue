<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ScenarioEntity } from '../../types/deployment';

interface Props {
  entities: ScenarioEntity[];
  selectedEntityId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  entities: () => [],
  selectedEntityId: null,
});

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'showRelationships', id: string): void;
}>();

// 构建组织树
const organizationTree = computed(() => {
  const roots = props.entities.filter(e => !e.organization.parentId);

  function buildTree(entity: ScenarioEntity): TreeNode {
    const children = entity.organization.childrenIds
      .map(id => props.entities.find(e => e.id === id))
      .filter(Boolean) as ScenarioEntity[];

    return {
      entity,
      children: children.map(buildTree),
      isExpanded: ref(true)
    };
  }

  return roots.map(buildTree);
});

interface TreeNode {
  entity: ScenarioEntity;
  children: TreeNode[];
  isExpanded: Ref<boolean>;
}

function toggleNode(node: TreeNode) {
  node.isExpanded.value = !node.isExpanded.value;
}

function handleSelect(entity: ScenarioEntity) {
  emit('select', entity.id);
}

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
</script>

<template>
  <div class="organization-visualization">
    <div class="tree-container">
      <div
        v-for="node in organizationTree"
        :key="node.entity.id"
        class="tree-node"
        :class="{ 'is-selected': selectedEntityId === node.entity.id }"
      >
        <!-- 节点内容 -->
        <div class="node-content" @click="handleSelect(node.entity)">
          <span
            v-if="node.children.length > 0"
            class="expand-icon"
            @click.stop="toggleNode(node)"
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
            @select="handleSelect"
          />
        </div>
      </div>
    </div>

    <!-- 图例 -->
    <div class="legend">
      <div class="legend-item">
        <span class="legend-icon">📋</span>
        <span class="legend-text">计划中</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon">✅</span>
        <span class="legend-text">已部署</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon">⚔️</span>
        <span class="legend-text">交战中</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon">🏢</span>
        <span class="legend-text">兵力单元</span>
      </div>
      <div class="legend-item">
        <span class="legend-icon">✈️</span>
        <span class="legend-text">平台装备</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.organization-visualization {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  border: 1px solid rgba(142, 164, 201, 0.15);
  border-radius: 12px;
  background: rgba(4, 11, 20, 0.3);
  padding: 12px;
}

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

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
  background: rgba(4, 11, 20, 0.5);
  border-radius: 8px;
  border: 1px solid rgba(142, 164, 201, 0.15);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8ea4c9;
}

.legend-icon {
  font-size: 14px;
}

.legend-text {
  color: #cbd5e1;
}
</style>