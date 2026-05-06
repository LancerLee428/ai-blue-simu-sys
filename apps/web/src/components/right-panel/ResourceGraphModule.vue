<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  demoResourceGraphNodes,
  demoResourceGraphRelationships,
  type DemoResourceGraphNode,
  type DemoResourceGraphRelationship,
} from '@ai-blue-simu-sys/ontology';
import { usePlatformStore } from '../../stores/platform';
import { useTacticalScenarioStore } from '../../stores/tactical-scenario';

type GraphNodeType = DemoResourceGraphNode['type'];
type FilterType = GraphNodeType | 'all';
type ViewMode = 'all' | 'recommended';

type LooseEntity = { id?: unknown; name?: unknown };
type LooseScenario = { forces?: Array<{ entities?: LooseEntity[] }> };

const props = withDefaults(defineProps<{
  modal?: boolean;
}>(), {
  modal: false,
});

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const platformStore = usePlatformStore();
const tacticalStore = useTacticalScenarioStore();

const graphNodes = demoResourceGraphNodes;
const graphRelationships = demoResourceGraphRelationships;

const selectedNodeId = ref(graphNodes[0]?.id ?? '');
const activeType = ref<FilterType>('all');
const focusMode = ref<'all' | 'linked'>('all');
const viewMode = ref<ViewMode>('all');

const typeMeta: Record<GraphNodeType, { label: string; icon: string; color: string; ring: string }> = {
  'force-unit': { label: '指挥', icon: '⌂', color: '#6bc4ff', ring: 'rgba(107, 196, 255, 0.2)' },
  platform: { label: '平台', icon: '◇', color: '#00d6c9', ring: 'rgba(0, 214, 201, 0.2)' },
  weapon: { label: '武器', icon: '◆', color: '#ff7a7a', ring: 'rgba(255, 122, 122, 0.2)' },
  sensor: { label: '传感', icon: '◉', color: '#c79cff', ring: 'rgba(199, 156, 255, 0.22)' },
  'geo-zone': { label: '区域', icon: '▣', color: '#ffd166', ring: 'rgba(255, 209, 102, 0.2)' },
  mission: { label: '任务', icon: '✦', color: '#9cffac', ring: 'rgba(156, 255, 172, 0.18)' },
};

const relationshipMeta: Record<DemoResourceGraphRelationship['type'], { label: string; color: string }> = {
  belongs_to: { label: '挂载/归属', color: '#8ea4c9' },
  can_command: { label: '指挥', color: '#6bc4ff' },
  can_communicate: { label: '通信', color: '#00d6c9' },
  can_detect: { label: '侦察', color: '#c79cff' },
  can_strike: { label: '打击', color: '#ff7a7a' },
  can_support: { label: '支援', color: '#ffd166' },
  deployable_to: { label: '可部署', color: '#9cffac' },
  suitable_for: { label: '适配任务', color: '#ffb86b' },
};

const typeBands: Record<GraphNodeType, { y: number; xMin: number; xMax: number }> = {
  'force-unit': { y: 100, xMin: 150, xMax: 890 },
  platform: { y: 260, xMin: 95, xMax: 945 },
  sensor: { y: 430, xMin: 120, xMax: 460 },
  weapon: { y: 430, xMin: 580, xMax: 920 },
  'geo-zone': { y: 610, xMin: 140, xMax: 900 },
  mission: { y: 725, xMin: 260, xMax: 780 },
};

const nodeLayout = computed(() => {
  const positions = new Map<string, { x: number; y: number }>();
  (Object.keys(typeBands) as GraphNodeType[]).forEach((type) => {
    const nodesOfType = graphNodes.filter((node) => node.type === type);
    const band = typeBands[type];
    const step = nodesOfType.length > 1
      ? (band.xMax - band.xMin) / (nodesOfType.length - 1)
      : 0;

    nodesOfType.forEach((node, index) => {
      const stagger = index % 2 === 0 ? 0 : 28;
      positions.set(node.id, {
        x: nodesOfType.length === 1 ? (band.xMin + band.xMax) / 2 : band.xMin + index * step,
        y: band.y + stagger,
      });
    });
  });
  return positions;
});

const nodeById = computed(() => new Map(graphNodes.map((node) => [node.id, node])));

const stagedScenario = computed(() => {
  const scenario = platformStore.platform.stagedScenarioDraft?.scenario;
  return typeof scenario === 'object' && scenario !== null ? scenario as LooseScenario : null;
});

function normalizeName(value: string) {
  return value.replace(/（.*?）/g, '').replace(/[\s\-_/]/g, '').toLowerCase();
}

function collectScenarioEntityIds(scenario: LooseScenario | null | undefined) {
  const ids = new Set<string>();
  scenario?.forces?.forEach((force) => {
    force.entities?.forEach((entity) => {
      if (typeof entity.id === 'string' && nodeById.value.has(entity.id)) ids.add(entity.id);
    });
  });
  return ids;
}

const fallbackDraftRecommendedIds = computed(() => {
  const ids = new Set<string>();
  const candidates = [
    ...platformStore.platform.ai.draft.draft.items.map((item) => ({ id: item.sourceEntityId, name: item.name })),
    ...platformStore.platform.scenarioWorkspace.projections.map((item) => ({ id: item.sourceEntityId, name: item.name })),
  ];

  candidates.forEach((candidate) => {
    if (nodeById.value.has(candidate.id)) {
      ids.add(candidate.id);
      return;
    }

    const candidateName = normalizeName(candidate.name);
    const matchedNode = graphNodes.find((node) => {
      const nodeName = normalizeName(node.name);
      return nodeName.includes(candidateName) || candidateName.includes(nodeName);
    });
    if (matchedNode) ids.add(matchedNode.id);
  });

  return ids;
});

const recommendedNodeIds = computed(() => {
  const ids = collectScenarioEntityIds(stagedScenario.value);
  collectScenarioEntityIds(tacticalStore.currentScenario).forEach((id) => ids.add(id));
  fallbackDraftRecommendedIds.value.forEach((id) => ids.add(id));
  return ids;
});

const recommendedRelationships = computed(() => graphRelationships.filter((relationship) => (
  recommendedNodeIds.value.has(relationship.from) && recommendedNodeIds.value.has(relationship.to)
)));

const recommendedNeighborIds = computed(() => {
  const ids = new Set(recommendedNodeIds.value);
  graphRelationships.forEach((relationship) => {
    if (recommendedNodeIds.value.has(relationship.from)) ids.add(relationship.to);
    if (recommendedNodeIds.value.has(relationship.to)) ids.add(relationship.from);
  });
  return ids;
});

const filteredNodeIds = computed(() => {
  if (activeType.value === 'all') return new Set(graphNodes.map((node) => node.id));
  return new Set(graphNodes.filter((node) => node.type === activeType.value).map((node) => node.id));
});

const selectedNode = computed(() => nodeById.value.get(selectedNodeId.value) ?? graphNodes[0]);

const linkedNodeIds = computed(() => {
  const ids = new Set<string>([selectedNode.value?.id ?? '']);
  graphRelationships.forEach((relationship) => {
    if (relationship.from === selectedNode.value?.id) ids.add(relationship.to);
    if (relationship.to === selectedNode.value?.id) ids.add(relationship.from);
  });
  return ids;
});

const visibleNodes = computed(() => graphNodes.filter((node) => {
  if (!filteredNodeIds.value.has(node.id)) return false;
  if (viewMode.value === 'recommended' && !recommendedNeighborIds.value.has(node.id)) return false;
  if (focusMode.value === 'linked') return linkedNodeIds.value.has(node.id);
  return true;
}));

const visibleNodeIdSet = computed(() => new Set(visibleNodes.value.map((node) => node.id)));

const visibleRelationships = computed(() => graphRelationships.filter((relationship) => {
  const visible = visibleNodeIdSet.value.has(relationship.from) && visibleNodeIdSet.value.has(relationship.to);
  if (!visible) return false;
  if (viewMode.value === 'recommended') {
    return recommendedNodeIds.value.has(relationship.from) || recommendedNodeIds.value.has(relationship.to);
  }
  return true;
}));

const selectedRelationships = computed(() => graphRelationships.filter((relationship) => (
  relationship.from === selectedNode.value?.id || relationship.to === selectedNode.value?.id
)));

const nodeTypeStats = computed(() => {
  return (Object.keys(typeMeta) as GraphNodeType[]).map((type) => ({
    type,
    ...typeMeta[type],
    count: graphNodes.filter((node) => node.type === type).length,
  }));
});

const graphStats = computed(() => [
  { label: '图谱节点', value: String(graphNodes.length) },
  { label: '全量关系', value: String(graphRelationships.length) },
  { label: '推荐节点', value: String(recommendedNodeIds.value.size) },
  { label: '推荐关系', value: String(recommendedRelationships.value.length) },
]);



function selectNode(nodeId: string) {
  selectedNodeId.value = nodeId;
}

function isRecommendedRelationship(relationship: DemoResourceGraphRelationship) {
  return recommendedNodeIds.value.has(relationship.from) && recommendedNodeIds.value.has(relationship.to);
}

function isRelationshipHighlighted(relationship: DemoResourceGraphRelationship) {
  if (isRecommendedRelationship(relationship)) return true;
  return relationship.from === selectedNode.value?.id || relationship.to === selectedNode.value?.id;
}

function nodeClass(node: DemoResourceGraphNode) {
  return {
    selected: node.id === selectedNode.value?.id,
    linked: linkedNodeIds.value.has(node.id),
    recommended: recommendedNodeIds.value.has(node.id),
    dependency: viewMode.value === 'recommended' && !recommendedNodeIds.value.has(node.id),
    muted: viewMode.value === 'all'
      && selectedRelationships.value.length > 0
      && !linkedNodeIds.value.has(node.id)
      && !recommendedNodeIds.value.has(node.id),
  };
}

function getMetadataEntries(node: DemoResourceGraphNode) {
  return Object.entries(node.metadata).slice(0, props.modal ? 10 : 6);
}

function formatMetadataValue(value: string | number | boolean | string[]) {
  return Array.isArray(value) ? value.join('、') : String(value);
}

function getRelationshipTitle(relationship: DemoResourceGraphRelationship) {
  const fromNode = nodeById.value.get(relationship.from);
  const toNode = nodeById.value.get(relationship.to);
  return `${fromNode?.name ?? relationship.from} → ${toNode?.name ?? relationship.to}`;
}

function getNodePosition(nodeId: string) {
  return nodeLayout.value.get(nodeId) ?? { x: 520, y: 420 };
}

function getRelationshipMidpoint(relationship: DemoResourceGraphRelationship) {
  const from = getNodePosition(relationship.from);
  const to = getNodePosition(relationship.to);
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - 10,
  };
}
</script>

<template>
  <div class="resource-graph" :class="{ 'resource-graph--modal': modal }">
    <header class="graph-header">
      <div>
        <h3>资源知识图谱</h3>
        <p>按属性、能力、关联链路和本次推荐结果查看资源编排依据</p>
      </div>
      <div class="graph-header__actions">
        <div class="graph-pulse" aria-hidden="true"><span /></div>
        <button v-if="modal" class="close-btn" type="button" aria-label="关闭" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </header>

    <section class="graph-stats">
      <div v-for="stat in graphStats" :key="stat.label" class="stat-item">
        <strong>{{ stat.value }}</strong>
        <span>{{ stat.label }}</span>
      </div>
    </section>

    <section class="graph-controls">
      <div class="mode-toggle mode-toggle--view">
        <button :class="{ active: viewMode === 'all' }" @click="viewMode = 'all'">全量资源图谱</button>
        <button :class="{ active: viewMode === 'recommended' }" @click="viewMode = 'recommended'">本次推荐关系</button>
      </div>
      <div class="filter-strip">
        <button class="filter-chip" :class="{ active: activeType === 'all' }" @click="activeType = 'all'">
          全部
        </button>
        <button
          v-for="item in nodeTypeStats"
          :key="item.type"
          class="filter-chip"
          :class="{ active: activeType === item.type }"
          :style="{ '--chip-color': item.color }"
          @click="activeType = item.type"
        >
          <span>{{ item.icon }}</span>
          {{ item.label }}
          <small>{{ item.count }}</small>
        </button>
      </div>
      <div class="mode-toggle">
        <button :class="{ active: focusMode === 'all' }" @click="focusMode = 'all'">全图</button>
        <button :class="{ active: focusMode === 'linked' }" @click="focusMode = 'linked'">一跳</button>
      </div>
    </section>

    <div class="graph-layout">
      <section class="graph-canvas">
        <svg viewBox="0 0 1040 840" role="img" aria-label="资源知识图谱关系网络">
          <defs>
            <radialGradient id="graphGlow" cx="50%" cy="45%" r="62%">
              <stop offset="0%" stop-color="rgba(107, 196, 255, 0.2)" />
              <stop offset="48%" stop-color="rgba(0, 214, 201, 0.08)" />
              <stop offset="100%" stop-color="rgba(4, 11, 20, 0)" />
            </radialGradient>
            <filter id="nodeShadow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#6bc4ff" flood-opacity="0.32" />
            </filter>
            <marker id="arrowDefault" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#5c6f8f" />
            </marker>
          </defs>

          <rect class="graph-backdrop" width="1040" height="840" rx="28" />
          <circle class="graph-aura" cx="520" cy="405" r="365" fill="url(#graphGlow)" />
          <g class="grid-lines">
            <path v-for="offset in [110, 210, 310, 410, 510, 610, 710]" :key="`h-${offset}`" :d="`M70 ${offset} H970`" />
            <path v-for="offset in [120, 220, 320, 420, 520, 620, 720, 820, 920]" :key="`v-${offset}`" :d="`M${offset} 70 V770`" />
          </g>

          <g class="relationship-layer">
            <g
              v-for="relationship in visibleRelationships"
              :key="relationship.id"
              class="relationship"
              :class="{
                active: isRelationshipHighlighted(relationship),
                recommended: isRecommendedRelationship(relationship),
              }"
            >
              <title>{{ relationship.label }}</title>
              <line
                :x1="getNodePosition(relationship.from).x"
                :y1="getNodePosition(relationship.from).y"
                :x2="getNodePosition(relationship.to).x"
                :y2="getNodePosition(relationship.to).y"
                :stroke="relationshipMeta[relationship.type].color"
                marker-end="url(#arrowDefault)"
              />
              <line
                class="relationship-flow"
                :x1="getNodePosition(relationship.from).x"
                :y1="getNodePosition(relationship.from).y"
                :x2="getNodePosition(relationship.to).x"
                :y2="getNodePosition(relationship.to).y"
                :stroke="relationshipMeta[relationship.type].color"
              />
              <g
                class="relationship-label"
                :class="{ visible: isRelationshipHighlighted(relationship) }"
                :transform="`translate(${getRelationshipMidpoint(relationship).x} ${getRelationshipMidpoint(relationship).y})`"
              >
                <rect x="-34" y="-10" width="68" height="20" rx="5" />
                <text y="4">{{ relationshipMeta[relationship.type].label }}</text>
              </g>
            </g>
          </g>

          <g class="node-layer">
            <g
              v-for="(node, index) in visibleNodes"
              :key="node.id"
              :transform="`translate(${getNodePosition(node.id).x} ${getNodePosition(node.id).y})`"
            >
              <g
                class="graph-node"
                :class="nodeClass(node)"
                :style="{
                  '--node-color': typeMeta[node.type].color,
                  '--node-ring': typeMeta[node.type].ring,
                  '--node-delay': `${index * 46}ms`,
                }"
                @click="selectNode(node.id)"
              >
                <circle class="node-radar" r="48" />
                <circle class="node-core" r="32" />
                <circle v-if="recommendedNodeIds.has(node.id)" class="node-recommend-ring" r="41" />
                <text class="node-icon" y="7">{{ typeMeta[node.type].icon }}</text>
                <text class="node-label" y="62">{{ node.name }}</text>
                <text class="node-type" y="82">{{ typeMeta[node.type].label }}</text>
              </g>
            </g>
          </g>
        </svg>
      </section>

      <aside class="graph-side">


        <section v-if="selectedNode" class="detail-panel">
          <div class="detail-heading">
            <span
              class="detail-icon"
              :style="{ color: typeMeta[selectedNode.type].color, borderColor: typeMeta[selectedNode.type].color }"
            >
              {{ typeMeta[selectedNode.type].icon }}
            </span>
            <div>
              <h4>{{ selectedNode.name }}</h4>
              <p>{{ typeMeta[selectedNode.type].label }} · {{ selectedNode.status }}</p>
            </div>
          </div>

          <div class="capability-row">
            <span v-for="capability in selectedNode.capabilities" :key="capability">
              {{ capability }}
            </span>
          </div>

          <div class="detail-grid">
            <div v-for="[key, value] in getMetadataEntries(selectedNode)" :key="key" class="metadata-item">
              <span>{{ key }}</span>
              <strong>{{ formatMetadataValue(value) }}</strong>
            </div>
          </div>
        </section>

        <section class="relationship-list relationship-list--recommended">
          <div class="section-title">
            <span>本次推荐资源之间的关系</span>
            <strong>{{ recommendedRelationships.length }}</strong>
          </div>
          <button
            v-for="relationship in recommendedRelationships"
            :key="relationship.id"
            class="relationship-card"
            :style="{ '--relation-color': relationshipMeta[relationship.type].color }"
          >
            <span>{{ relationshipMeta[relationship.type].label }}</span>
            <strong>{{ relationship.label }}</strong>
            <small>{{ getRelationshipTitle(relationship) }}</small>
          </button>
          <p v-if="recommendedRelationships.length === 0" class="empty-text">
            当前推荐资源之间暂无可展示关系，可能是还没有 AI Workflow 暂存草案，或推荐资源未与图谱节点完成 ID 对齐。
          </p>
        </section>

        <section class="relationship-list">
          <div class="section-title">
            <span>选中节点关联链路</span>
            <strong>{{ selectedRelationships.length }}</strong>
          </div>
          <button
            v-for="relationship in selectedRelationships"
            :key="relationship.id"
            class="relationship-card"
            :style="{ '--relation-color': relationshipMeta[relationship.type].color }"
          >
            <span>{{ relationshipMeta[relationship.type].label }}</span>
            <strong>{{ relationship.label }}</strong>
            <small>{{ getRelationshipTitle(relationship) }}</small>
          </button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.resource-graph {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  color: #e2ebfb;
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(8, 15, 27, 0.98)),
    #0b1220;
}

.resource-graph--modal {
  padding: 18px;
  border-radius: 14px;
  overflow: hidden;
}

.graph-header,
.graph-header__actions,
.detail-heading,
.section-title {
  display: flex;
  align-items: center;
}

.graph-header {
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}

.graph-header__actions {
  gap: 10px;
  flex-shrink: 0;
}

.graph-header h3,
.detail-heading h4 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
  letter-spacing: 0;
}

.detail-heading h4 {
  font-size: 15px;
}

.graph-header p,
.detail-heading p {
  margin: 5px 0 0;
  color: #8ea4c9;
  font-size: 12px;
  line-height: 1.5;
}

.graph-pulse {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 214, 201, 0.1);
  border: 1px solid rgba(0, 214, 201, 0.28);
  flex-shrink: 0;
}

.graph-pulse span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #00d6c9;
  box-shadow: 0 0 18px rgba(0, 214, 201, 0.85);
  animation: pulse-dot 1.8s ease-in-out infinite;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 7px;
  border: 1px solid rgba(142, 164, 201, 0.24);
  color: #d8e7f8;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.18s ease;
}

.close-btn:hover {
  border-color: rgba(107, 196, 255, 0.45);
  background: rgba(107, 196, 255, 0.12);
}

.graph-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  flex-shrink: 0;
}

.stat-item,
.detail-panel,
.relationship-list {
  border: 1px solid rgba(142, 164, 201, 0.13);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
}

.stat-item {
  padding: 10px;
}

.stat-item strong {
  display: block;
  font-size: 20px;
  color: #00d6c9;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.stat-item span {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: #8ea4c9;
}

.graph-controls {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) minmax(260px, 2fr) minmax(150px, 0.8fr);
  gap: 8px;
  flex-shrink: 0;
}

.filter-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.filter-chip,
.mode-toggle button,
.relationship-card {
  border: 1px solid rgba(142, 164, 201, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #8ea4c9;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 6px 9px;
  border-radius: 7px;
  font-size: 11px;
  white-space: nowrap;
}

.filter-chip small {
  color: #4a5a78;
}

.filter-chip:hover,
.mode-toggle button:hover,
.relationship-card:hover {
  transform: translateY(-1px);
  border-color: rgba(142, 164, 201, 0.36);
  color: #e2ebfb;
}

.filter-chip.active {
  color: #e2ebfb;
  border-color: var(--chip-color, #6bc4ff);
  background: color-mix(in srgb, var(--chip-color, #6bc4ff) 18%, transparent);
}

.mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: rgba(4, 11, 20, 0.45);
}

.mode-toggle button {
  min-height: 30px;
  border-radius: 6px;
  font-size: 12px;
}

.mode-toggle button.active {
  color: #e2ebfb;
  border-color: rgba(0, 214, 201, 0.4);
  background: rgba(0, 214, 201, 0.13);
}

.graph-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  gap: 12px;
}

.graph-canvas {
  position: relative;
  min-height: 0;
  border: 1px solid rgba(142, 164, 201, 0.13);
  border-radius: 12px;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 12%, rgba(199, 156, 255, 0.1), transparent 28%),
    radial-gradient(circle at 88% 84%, rgba(255, 209, 102, 0.08), transparent 30%),
    rgba(4, 11, 20, 0.72);
}

.graph-canvas svg {
  width: 100%;
  height: 100%;
  min-height: 560px;
  display: block;
}

.graph-side {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.graph-backdrop {
  fill: rgba(4, 11, 20, 0.1);
}

.graph-aura {
  animation: aura-breathe 4.8s ease-in-out infinite;
}

.grid-lines path {
  stroke: rgba(142, 164, 201, 0.06);
  stroke-width: 1;
}

.relationship line {
  stroke-width: 1.5;
  stroke-opacity: 0.32;
  transition: stroke-opacity 0.18s ease, stroke-width 0.18s ease;
}

.relationship.active line:first-of-type {
  stroke-width: 2.4;
  stroke-opacity: 0.86;
}

.relationship.recommended line:first-of-type {
  stroke-width: 3;
  stroke-opacity: 0.95;
}

.relationship-flow {
  stroke-width: 2;
  stroke-linecap: round;
  stroke-dasharray: 10 18;
  stroke-opacity: 0;
  animation: flow-line 1.65s linear infinite;
}

.relationship.active .relationship-flow,
.relationship.recommended .relationship-flow {
  stroke-opacity: 0.85;
}

.relationship-label {
  opacity: 0;
  transition: opacity 0.18s ease;
  pointer-events: none;
}

.relationship-label.visible,
.relationship.recommended .relationship-label {
  opacity: 1;
}

.relationship-label rect {
  fill: rgba(8, 15, 27, 0.92);
  stroke: rgba(142, 164, 201, 0.24);
}

.relationship-label text {
  fill: #dbe6f6;
  font-size: 10px;
  font-weight: 600;
  text-anchor: middle;
}

.graph-node {
  cursor: pointer;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: node-rise 0.56s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  animation-delay: var(--node-delay);
  transition: opacity 0.18s ease, filter 0.18s ease;
}

.graph-node:hover,
.graph-node.selected,
.graph-node.recommended {
  filter: url(#nodeShadow);
}

.graph-node.muted,
.graph-node.dependency {
  opacity: 0.58;
}

.node-radar {
  fill: var(--node-ring);
  stroke: var(--node-color);
  stroke-width: 1;
  stroke-opacity: 0.3;
  animation: radar-ring 2.6s ease-out infinite;
}

.node-core {
  fill: rgba(10, 24, 39, 0.95);
  stroke: var(--node-color);
  stroke-width: 1.9;
}

.node-recommend-ring {
  fill: none;
  stroke: #ffe082;
  stroke-width: 2.4;
  stroke-dasharray: 8 7;
  animation: orbit-ring 4s linear infinite;
}

.graph-node.selected .node-core {
  stroke-width: 3;
}

.graph-node.linked .node-radar {
  stroke-opacity: 0.58;
}

.node-icon {
  fill: var(--node-color);
  font-size: 22px;
  text-anchor: middle;
  dominant-baseline: middle;
}

.node-label,
.node-type {
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgba(4, 11, 20, 0.92);
  stroke-width: 5px;
  stroke-linejoin: round;
}

.node-label {
  fill: #e2ebfb;
  font-size: 14px;
  font-weight: 600;
}

.node-type {
  fill: #8ea4c9;
  font-size: 11px;
}

.detail-panel,
.relationship-list {
  padding: 12px;
  flex-shrink: 0;
}

.detail-heading {
  gap: 10px;
}

.detail-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid;
  border-radius: 8px;
  background: rgba(4, 11, 20, 0.4);
  flex-shrink: 0;
}

.capability-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.capability-row span {
  padding: 4px 7px;
  border-radius: 6px;
  background: rgba(107, 196, 255, 0.09);
  color: #b9dcff;
  font-size: 10px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.metadata-item {
  min-width: 0;
}

.metadata-item span {
  display: block;
  color: #4a5a78;
  font-size: 10px;
  margin-bottom: 2px;
}

.metadata-item strong {
  display: block;
  color: #d8e7f8;
  font-size: 11px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.relationship-list {
  display: grid;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
}

.relationship-list--recommended {
  border-color: rgba(255, 209, 102, 0.22);
  background: rgba(255, 209, 102, 0.045);
}

.section-title {
  justify-content: space-between;
  color: #6bc4ff;
  font-size: 11px;
  font-weight: 600;
}

.section-title strong {
  color: #8ea4c9;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.relationship-card {
  text-align: left;
  padding: 9px 10px;
  border-radius: 8px;
  border-left: 2px solid var(--relation-color);
}

.relationship-card span {
  display: block;
  color: var(--relation-color);
  font-size: 10px;
  margin-bottom: 3px;
}

.relationship-card strong {
  display: block;
  color: #e2ebfb;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.relationship-card small,
.empty-text {
  display: block;
  color: #6f829f;
  font-size: 10px;
  line-height: 1.5;
  margin-top: 3px;
}

.empty-text {
  margin: 0;
}

@media (max-width: 1100px) {
  .graph-controls,
  .graph-layout {
    grid-template-columns: 1fr;
  }

  .graph-side {
    max-height: 320px;
  }
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(0.82); opacity: 0.72; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes aura-breathe {
  0%, 100% { opacity: 0.72; transform: scale(0.98); }
  50% { opacity: 1; transform: scale(1.04); }
}

@keyframes flow-line {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -56; }
}

@keyframes radar-ring {
  0% { transform: scale(0.74); opacity: 0.72; }
  100% { transform: scale(1.22); opacity: 0; }
}

@keyframes orbit-ring {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: -60; }
}

@keyframes node-rise {
  from { opacity: 0; transform: translateY(10px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
