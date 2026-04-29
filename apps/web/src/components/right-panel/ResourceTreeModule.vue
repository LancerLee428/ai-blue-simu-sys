<script setup lang="ts">
import { ref } from 'vue';
import ResourceTreeNode from './ResourceTreeNode.vue';

interface TreeNode {
  id: string;
  name: string;
  type: 'force-unit' | 'platform';
  children?: TreeNode[];
}

const emit = defineEmits<{
  (e: 'dragResource', resource: TreeNode): void;
}>();

const treeData: TreeNode[] = [
  {
    id: 'cat-recon',
    name: '侦察类',
    type: 'force-unit',
    children: [
      { id: 'force-recon-001', name: '电子侦察平台-07', type: 'platform' },
      { id: 'force-recon-002', name: '无人侦察机-03', type: 'platform' },
      { id: 'force-recon-003', name: '预警机-01', type: 'platform' },
      { id: 'force-recon-004', name: '雷达侦察车-02', type: 'platform' },
      { id: 'force-recon-005', name: '卫星地面站-01', type: 'platform' },
    ],
  },
  {
    id: 'cat-strike',
    name: '打击类',
    type: 'force-unit',
    children: [
      { id: 'force-strike-001', name: '战斗机编队-01', type: 'platform' },
      { id: 'force-strike-002', name: '轰炸机-02', type: 'platform' },
      { id: 'force-strike-003', name: '导弹发射车-01', type: 'platform' },
      { id: 'force-strike-004', name: '驱逐舰-01', type: 'platform' },
      { id: 'force-strike-005', name: '攻击潜艇-01', type: 'platform' },
      { id: 'force-strike-006', name: '武装直升机-01', type: 'platform' },
    ],
  },
  {
    id: 'cat-support',
    name: '支援类',
    type: 'force-unit',
    children: [
      { id: 'force-support-001', name: '加油机-01', type: 'platform' },
      { id: 'force-support-002', name: '运输机-01', type: 'platform' },
      { id: 'force-support-003', name: '补给舰-01', type: 'platform' },
      { id: 'force-support-004', name: '工程车-01', type: 'platform' },
      { id: 'force-support-005', name: '医疗救护车-01', type: 'platform' },
    ],
  },
  {
    id: 'cat-ecm',
    name: '电子对抗类',
    type: 'force-unit',
    children: [
      { id: 'force-ecm-001', name: '电子干扰机-01', type: 'platform' },
      { id: 'force-ecm-002', name: '通信干扰车-01', type: 'platform' },
      { id: 'force-ecm-003', name: '雷达干扰站-01', type: 'platform' },
      { id: 'force-ecm-004', name: '网络战单元-01', type: 'platform' },
    ],
  },
  {
    id: 'cat-defense',
    name: '防空类',
    type: 'force-unit',
    children: [
      { id: 'force-defense-001', name: '防空导弹营-01', type: 'platform' },
      { id: 'force-defense-002', name: '高炮连-01', type: 'platform' },
      { id: 'force-defense-003', name: '预警雷达站-01', type: 'platform' },
    ],
  },
  {
    id: 'cat-ground',
    name: '地面作战类',
    type: 'force-unit',
    children: [
      { id: 'force-ground-001', name: '装甲突击营-01', type: 'platform' },
      { id: 'force-ground-002', name: '机械化步兵连-01', type: 'platform' },
      { id: 'force-ground-003', name: '特种作战分队-01', type: 'platform' },
      { id: 'force-ground-004', name: '炮兵营-01', type: 'platform' },
    ],
  },
];

function handleDragStart(child: TreeNode, e: DragEvent) {
  // 设置拖拽数据
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/json', JSON.stringify(child));
    e.dataTransfer.effectAllowed = 'copy';
  }
  emit('dragResource', child);
}

function handleDragEnd(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
}

const expandedNodes = ref<Set<string>>(new Set(['cat-recon', 'cat-strike', 'cat-support']));

function toggleNode(id: string) {
  if (expandedNodes.value.has(id)) {
    expandedNodes.value.delete(id);
  } else {
    expandedNodes.value.add(id);
  }
}
</script>

<template>
  <div class="resource-tree">
    <div class="tree-hint">
      <span>拖拽节点到地图部署</span>
    </div>
    <div v-for="cat in treeData" :key="cat.id" class="tree-category">
      <div class="tree-category__header" @click="toggleNode(cat.id)">
        <span class="tree-category__arrow">{{ expandedNodes.has(cat.id) ? '▼' : '▶' }}</span>
        <strong>{{ cat.name }}</strong>
        <span class="tree-category__count">{{ cat.children?.length ?? 0 }}</span>
      </div>
      <div v-if="expandedNodes.has(cat.id)" class="tree-category__children">
        <div
          v-for="child in cat.children"
          :key="child.id"
          @dragstart="(e: DragEvent) => handleDragStart(child, e)"
          @dragend="handleDragEnd"
        >
          <ResourceTreeNode :node="child" :depth="1" />
        </div>
        <p v-if="!cat.children?.length" class="tree-empty">暂无可用资源</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-tree {
  display: grid;
  gap: 4px;
}

.tree-hint {
  font-size: 11px;
  color: #4a5a78;
  padding: 0 4px 8px;
  border-bottom: 1px solid rgba(110, 196, 255, 0.08);
  margin-bottom: 4px;
}

.tree-category__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.tree-category__header:hover {
  background: rgba(107, 196, 255, 0.06);
}

.tree-category__arrow {
  font-size: 10px;
  color: #6bc4ff;
}

.tree-category__header strong {
  flex: 1;
  font-size: 13px;
  color: #e2ebfb;
}

.tree-category__count {
  font-size: 11px;
  color: #4a5a78;
}

.tree-category__children {
  margin: 2px 0;
}

.tree-empty {
  font-size: 12px;
  color: #4a5a78;
  padding: 8px 16px 8px 36px;
  margin: 0;
}
</style>
