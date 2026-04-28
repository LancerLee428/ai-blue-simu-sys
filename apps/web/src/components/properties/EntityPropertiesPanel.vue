<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ScenarioEntity } from '../../services/cesium-graphics';
import type { ForceUnit, Platform } from '@ai-blue-simu-sys/ontology';

interface Props {
  entity?: ScenarioEntity | null;
  sourceEntity?: ForceUnit | Platform | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'updatePosition', position: { longitude: number; latitude: number; altitude: number }): void;
  (e: 'updateStatus', status: string): void;
  (e: 'openLoadoutEditor'): void;
  (e: 'openCommandRelationEditor'): void;
}>();

// 本地编辑状态
const editedPosition = ref({ longitude: 0, latitude: 0, altitude: 0 });
const editedStatus = ref<string>('planned');

// 监听选中实体变化
watch(() => props.entity, (newEntity) => {
  if (newEntity) {
    editedPosition.value = { ...newEntity.currentPosition };
    editedStatus.value = newEntity.currentStatus;
  }
}, { immediate: true });

/**
 * 源信息区（只读）
 */
const sourceInfo = computed(() => {
  if (!props.sourceEntity) return null;

  if ('unitName' in props.sourceEntity) {
    // ForceUnit
    const unit = props.sourceEntity as ForceUnit;
    return {
      type: 'force-unit',
      title: unit.unitName,
      subtitle: `${unit.unitType} / ${unit.forceSide}`,
      capabilities: [
        `最大速度: ${unit.maxSpeed} km/h`,
        `最大航程: ${unit.maxRange} km`,
        `探测范围: ${unit.sensorRange} km`,
        `打击距离: ${unit.strikeRange} km`,
      ],
    };
  } else {
    // Platform
    const platform = props.sourceEntity as Platform;
    return {
      type: 'platform',
      title: platform.platformName,
      subtitle: `${platform.platformType} / ${platform.sizeClass}`,
      capabilities: [
        `最大速度: ${platform.maxSpeed} km/h`,
        `最大航程: ${platform.maxRange} km`,
        `传感器: ${platform.sensorTypes.join(', ')}`,
        `推进: ${platform.propulsionType}`,
      ],
    };
  }
});

/**
 * 应用位置修改
 */
function applyPositionChange() {
  if (props.entity) {
    emit('updatePosition', editedPosition.value);
  }
}

/**
 * 应用状态修改
 */
function applyStatusChange() {
  if (props.entity) {
    emit('updateStatus', editedStatus.value);
  }
}
</script>

<template>
  <div v-if="entity" class="entity-properties-panel">
    <!-- 源信息区（只读） -->
    <div v-if="sourceInfo" class="panel-section panel-source-info">
      <div class="section-header">
        <h3>{{ sourceInfo.title }}</h3>
        <span class="badge">{{ sourceInfo.type }}</span>
      </div>
      <div class="section-content">
        <p class="subtitle">{{ sourceInfo.subtitle }}</p>
        <div class="capabilities-list">
          <div v-for="(capability, index) in sourceInfo.capabilities" :key="index" class="capability-item">
            {{ capability }}
          </div>
        </div>
      </div>
    </div>

    <!-- 场景属性区（可编辑） -->
    <div class="panel-section panel-scenario-info">
      <div class="section-header">
        <h3>场景属性</h3>
        <span class="badge">可编辑</span>
      </div>
      <div class="section-content">
        <div class="form-group">
          <label>经度</label>
          <input
            v-model.number="editedPosition.longitude"
            type="number"
            step="0.0001"
            @change="applyPositionChange"
          />
        </div>
        <div class="form-group">
          <label>纬度</label>
          <input
            v-model.number="editedPosition.latitude"
            type="number"
            step="0.0001"
            @change="applyPositionChange"
          />
        </div>
        <div class="form-group">
          <label>高度 (米)</label>
          <input
            v-model.number="editedPosition.altitude"
            type="number"
            step="100"
            @change="applyPositionChange"
          />
        </div>
        <div class="form-group">
          <label>状态</label>
          <select v-model="editedStatus" @change="applyStatusChange">
            <option value="planned">计划中</option>
            <option value="deployed">已部署</option>
            <option value="engaged">交战中</option>
            <option value="destroyed">已摧毁</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 受控属性区（专门入口） -->
    <div v-if="sourceInfo?.type === 'platform'" class="panel-section panel-controlled-info">
      <div class="section-header">
        <h3>受控属性</h3>
        <span class="badge">特殊操作</span>
      </div>
      <div class="section-content">
        <button @click="$emit('openLoadoutEditor')" class="action-button">
          调整挂载配置
        </button>
        <button @click="$emit('openCommandRelationEditor')" class="action-button">
          调整隶属关系
        </button>
      </div>
    </div>

    <!-- 实体元数据 -->
    <div class="panel-section panel-metadata">
      <div class="section-header">
        <h3>元数据</h3>
      </div>
      <div class="section-content">
        <div class="metadata-item">
          <span class="label">ID:</span>
          <span class="value">{{ entity.id }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">源ID:</span>
          <span class="value">{{ entity.sourceEntityId }}</span>
        </div>
        <div class="metadata-item">
          <span class="label">分类:</span>
          <span class="value">{{ entity.category }}</span>
        </div>
      </div>
    </div>
  </div>

  <!-- 未选中状态 -->
</template>

<style scoped>
.entity-properties-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  max-height: 100%;
  overflow-y: auto;
}

.panel-section {
  border: 1px solid rgba(142, 164, 201, 0.2);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(10px);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(142, 164, 201, 0.2);
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #8ea4c9;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(142, 164, 201, 0.1);
  color: #8ea4c9;
}

.section-content {
  padding: 16px;
}

.subtitle {
  color: #94a3b8;
  font-size: 14px;
  margin: 0 0 12px 0;
}

.capabilities-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.capability-item {
  font-size: 13px;
  color: #cbd5e1;
  padding: 4px 8px;
  background: rgba(142, 164, 201, 0.05);
  border-radius: 4px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: #8ea4c9;
  margin-bottom: 4px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(142, 164, 201, 0.3);
  border-radius: 4px;
  background: rgba(4, 11, 20, 0.5);
  color: #fff;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: rgba(142, 164, 201, 0.6);
}

.action-button {
  width: 100%;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid rgba(142, 164, 201, 0.3);
  border-radius: 4px;
  background: rgba(4, 11, 20, 0.5);
  color: #8ea4c9;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-button:hover {
  background: rgba(142, 164, 201, 0.1);
  border-color: rgba(142, 164, 201, 0.5);
}

.action-button:last-child {
  margin-bottom: 0;
}

.metadata-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
}

.metadata-item .label {
  color: #8ea4c9;
}

.metadata-item .value {
  color: #cbd5e1;
  font-family: monospace;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #8ea4c9;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}
</style>