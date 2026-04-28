<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { EntityConfig, OntologyEquipment, Squadron, Mission } from '../../types/deployment';

interface Props {
  visible: boolean;
  mode: 'create' | 'edit';
  sourceEntityId?: string;
  initialPosition?: { longitude: number; latitude: number; altitude: number };
  initialConfig?: Partial<EntityConfig>;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  mode: 'create',
  initialPosition: () => ({ longitude: 121.0, latitude: 23.8, altitude: 0 }),
});

const emit = defineEmits<{
  (e: 'confirm', config: EntityConfig): void;
  (e: 'cancel'): void;
}>();

// 表单数据
const formData = ref<EntityConfig>({
  sourceEntityId: props.sourceEntityId || '',
  name: '',
  position: { ...props.initialPosition },
  organization: {},
  loadout: {
    weapons: [],
    sensors: [],
    communication: []
  },
  missionConfig: {
    primaryMission: '',
    secondaryMissions: [],
    rulesOfEngagement: '',
    coordinationPoints: []
  }
});

// 当前激活的标签页
const activeTab = ref<'basic' | 'organization' | 'loadout' | 'mission' | 'metadata'>('basic');

// 示例数据（后续从 Ontology 加载）
const availableSquadrons = ref<Squadron[]>([
  { id: 'squadron-1', name: '第一侦察编队', type: 'mixed' },
  { id: 'squadron-2', name: '第二打击编队', type: 'air' },
  { id: 'squadron-3', name: '第三支援编队', type: 'naval' }
]);

const availableMissions = ref<Mission[]>([
  { id: 'mission-1', name: '区域侦察', type: 'reconnaissance', description: '对指定区域进行侦察', priority: 'high' },
  { id: 'mission-2', name: '火力打击', type: 'strike', description: '对目标进行精确打击', priority: 'medium' },
  { id: 'mission-3', name: '护航巡逻', type: 'patrol', description: '为友军提供护航', priority: 'low' }
]);

// 监听 props 变化
watch(() => props.initialPosition, (newPosition) => {
  if (newPosition) {
    formData.value.position = { ...newPosition };
  }
});

watch(() => props.initialConfig, (newConfig) => {
  if (newConfig) {
    Object.assign(formData.value, newConfig);
  }
}, { deep: true });

/**
 * 确认配置
 */
function handleConfirm() {
  // 验证必填字段
  if (!formData.value.name.trim()) {
    formData.value.name = `新部署实体 ${Date.now().toString().slice(-6)}`;
  }

  emit('confirm', formData.value);
}

/**
 * 取消配置
 */
function handleCancel() {
  emit('cancel');
}

/**
 * 添加武器挂载
 */
function addWeaponMount() {
  formData.value.loadout!.weapons.push({
    equipmentId: '',
    slotName: `武器挂点${formData.value.loadout!.weapons.length + 1}`,
    count: 1
  });
}

/**
 * 移除武器挂载
 */
function removeWeaponMount(index: number) {
  formData.value.loadout!.weapons.splice(index, 1);
}

/**
 * 添加传感器
 */
function addSensor() {
  formData.value.loadout!.sensors.push({
    equipmentId: '',
    slotName: `传感器${formData.value.loadout!.sensors.length + 1}`,
    mode: 'active'
  });
}

/**
 * 移除传感器
 */
function removeSensor(index: number) {
  formData.value.loadout!.sensors.splice(index, 1);
}
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="handleCancel">
    <div class="deployment-config-modal">
      <!-- 头部 -->
      <div class="modal-header">
        <h2>{{ mode === 'create' ? '部署新实体' : '编辑实体配置' }}</h2>
        <button class="close-btn" @click="handleCancel">✕</button>
      </div>

      <!-- 标签页导航 -->
      <div class="tab-navigation">
        <button
          v-for="tab in ['basic', 'organization', 'loadout', 'mission', 'metadata'] as const"
          :key="tab"
          :class="['tab-button', { active: activeTab === tab }]"
          @click="activeTab = tab"
        >
          {{ {
            basic: '基础信息',
            organization: '组织关系',
            loadout: '装备挂载',
            mission: '任务配置',
            metadata: '元数据'
          }[tab] }}
        </button>
      </div>

      <!-- 内容区域 -->
      <div class="modal-content">
        <!-- 基础信息 -->
        <div v-if="activeTab === 'basic'" class="tab-content">
          <div class="form-section">
            <h3>位置信息</h3>
            <div class="form-group">
              <label>经度</label>
              <input v-model.number="formData.position.longitude" type="number" step="0.0001" />
            </div>
            <div class="form-group">
              <label>纬度</label>
              <input v-model.number="formData.position.latitude" type="number" step="0.0001" />
            </div>
            <div class="form-group">
              <label>高度 (米)</label>
              <input v-model.number="formData.position.altitude" type="number" step="100" />
            </div>
          </div>

          <div class="form-section">
            <h3>实体信息</h3>
            <div class="form-group">
              <label>实体名称</label>
              <input v-model="formData.name" type="text" placeholder="自动生成或手动输入" />
            </div>
            <div class="form-group">
              <label>源实体ID</label>
              <input :value="formData.sourceEntityId" type="text" disabled />
            </div>
          </div>

          <div class="form-section">
            <h3>状态设置</h3>
            <div class="form-group">
              <label>初始状态</label>
              <select>
                <option value="planned">计划中</option>
                <option value="deployed">已部署</option>
                <option value="engaged">交战中</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 组织关系 -->
        <div v-if="activeTab === 'organization'" class="tab-content">
          <div class="form-section">
            <h3>指挥关系</h3>
            <div class="form-group">
              <label>上级单位</label>
              <select v-model="formData.organization!.parentId">
                <option value="">无上级单位</option>
                <option value="entity-001">实体001</option>
                <option value="entity-002">实体002</option>
              </select>
            </div>
          </div>

          <div class="form-section">
            <h3>编队配置</h3>
            <div class="form-group">
              <label>所属编队</label>
              <select v-model="formData.organization!.squadronId">
                <option value="">未分配编队</option>
                <option v-for="squadron in availableSquadrons" :key="squadron.id" :value="squadron.id">
                  {{ squadron.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="form-section">
            <h3>任务分配</h3>
            <div class="form-group">
              <label>当前任务</label>
              <select v-model="formData.organization!.missionId">
                <option value="">无任务</option>
                <option v-for="mission in availableMissions" :key="mission.id" :value="mission.id">
                  {{ mission.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- 可视化编组树 -->
          <div class="form-section">
            <h3>编组关系可视化</h3>
            <div class="organization-tree">
              <div class="tree-node">
                <span class="node-icon">🏢</span>
                <span class="node-name">第一侦察编队</span>
              </div>
              <div class="tree-children">
                <div class="tree-node leaf">
                  <span class="node-icon">✈️</span>
                  <span class="node-name">预警机-01</span>
                </div>
                <div class="tree-node leaf">
                  <span class="node-icon">🚁</span>
                  <span class="node-name">电子侦察平台-07</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 装备挂载 -->
        <div v-if="activeTab === 'loadout'" class="tab-content">
          <div class="form-section">
            <div class="section-header">
              <h3>武器挂载</h3>
              <button class="add-btn" @click="addWeaponMount">+ 添加武器</button>
            </div>
            <div v-for="(weapon, index) in formData.loadout!.weapons" :key="index" class="loadout-item">
              <div class="loadout-item-header">
                <span>{{ weapon.slotName }}</span>
                <button class="remove-btn" @click="removeWeaponMount(index)">✕</button>
              </div>
              <div class="form-group">
                <label>装备选择</label>
                <select v-model="weapon.equipmentId">
                  <option value="">选择武器装备</option>
                  <option value="weapon-missile-1">空空导弹</option>
                  <option value="weapon-bomb-1">精确制导炸弹</option>
                  <option value="weapon-gun-1">机炮</option>
                </select>
              </div>
              <div class="form-group">
                <label>数量</label>
                <input v-model.number="weapon.count" type="number" min="1" max="10" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="section-header">
              <h3>传感器配置</h3>
              <button class="add-btn" @click="addSensor">+ 添加传感器</button>
            </div>
            <div v-for="(sensor, index) in formData.loadout!.sensors" :key="index" class="loadout-item">
              <div class="loadout-item-header">
                <span>{{ sensor.slotName }}</span>
                <button class="remove-btn" @click="removeSensor(index)">✕</button>
              </div>
              <div class="form-group">
                <label>传感器选择</label>
                <select v-model="sensor.equipmentId">
                  <option value="">选择传感器</option>
                  <option value="sensor-radar-1">相控阵雷达</option>
                  <option value="sensor-esm-1">电子支援设备</option>
                  <option value="sensor-ir-1">红外传感器</option>
                </select>
              </div>
              <div class="form-group">
                <label>工作模式</label>
                <select v-model="sensor.mode">
                  <option value="active">主动模式</option>
                  <option value="passive">被动模式</option>
                </select>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h3>装备状态</h3>
            <div class="equipment-status">
              <div class="status-item">
                <span>整体完好率</span>
                <span class="status-value">100%</span>
              </div>
              <div class="status-item">
                <span>推进系统</span>
                <span class="status-value">100%</span>
              </div>
              <div class="status-item">
                <span>武器系统</span>
                <span class="status-value">100%</span>
              </div>
              <div class="status-item">
                <span>传感器</span>
                <span class="status-value">100%</span>
              </div>
              <div class="status-item">
                <span>通信设备</span>
                <span class="status-value">100%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 任务配置 -->
        <div v-if="activeTab === 'mission'" class="tab-content">
          <div class="form-section">
            <h3>任务设置</h3>
            <div class="form-group">
              <label>主要任务</label>
              <select v-model="formData.missionConfig!.primaryMission">
                <option value="">选择主要任务</option>
                <option v-for="mission in availableMissions" :key="mission.id" :value="mission.id">
                  {{ mission.name }} - {{ mission.description }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label>次要任务</label>
              <div class="checkbox-group">
                <label v-for="mission in availableMissions" :key="mission.id" class="checkbox-item">
                  <input
                    type="checkbox"
                    :value="mission.id"
                    v-model="formData.missionConfig!.secondaryMissions"
                  />
                  {{ mission.name }}
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>交战规则</label>
              <textarea v-model="formData.missionConfig!.rulesOfEngagement" rows="4" placeholder="输入交战规则说明..."></textarea>
            </div>
          </div>
        </div>

        <!-- 元数据 -->
        <div v-if="activeTab === 'metadata'" class="tab-content">
          <div class="form-section">
            <h3>标签和备注</h3>
            <div class="form-group">
              <label>标签</label>
              <input type="text" placeholder="输入标签，用逗号分隔" />
            </div>
            <div class="form-group">
              <label>备注</label>
              <textarea rows="6" placeholder="输入备注信息..."></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="modal-footer">
        <div class="footer-info">
          <span class="info-item">源实体: {{ formData.sourceEntityId }}</span>
          <span class="info-item">位置: {{ formData.position.longitude.toFixed(4) }}, {{ formData.position.latitude.toFixed(4) }}</span>
        </div>
        <div class="footer-actions">
          <button class="cancel-btn" @click="handleCancel">取消</button>
          <button class="confirm-btn" @click="handleConfirm">
            {{ mode === 'create' ? '确认部署' : '保存修改' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.deployment-config-modal {
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(142, 164, 201, 0.3);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(142, 164, 201, 0.2);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e2ebfb;
}

.close-btn {
  background: none;
  border: none;
  color: #8ea4c9;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e2ebfb;
}

.tab-navigation {
  display: flex;
  gap: 4px;
  padding: 16px 24px 0;
  background: rgba(4, 11, 20, 0.5);
}

.tab-button {
  flex: 1;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: #8ea4c9;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
}

.tab-button:hover {
  background: rgba(142, 164, 201, 0.1);
  color: #cbd5e1;
}

.tab-button.active {
  background: rgba(142, 164, 201, 0.15);
  color: #e2ebfb;
  border-bottom: 2px solid rgba(0, 214, 201, 0.5);
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-section {
  background: rgba(4, 11, 20, 0.5);
  border: 1px solid rgba(142, 164, 201, 0.15);
  border-radius: 12px;
  padding: 16px;
}

.form-section h3 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #7ecbff;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #8ea4c9;
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(142, 164, 201, 0.3);
  border-radius: 8px;
  background: rgba(4, 11, 20, 0.8);
  color: #e2ebfb;
  font-size: 14px;
  transition: all 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: rgba(0, 214, 201, 0.5);
  box-shadow: 0 0 0 3px rgba(0, 214, 201, 0.1);
}

.form-group input:disabled {
  background: rgba(4, 11, 20, 0.3);
  color: #6bc4ff;
  cursor: not-allowed;
}

.add-btn {
  padding: 6px 12px;
  border: 1px solid rgba(0, 214, 201, 0.3);
  border-radius: 6px;
  background: rgba(0, 214, 201, 0.1);
  color: #00d6c9;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: rgba(0, 214, 201, 0.2);
  border-color: rgba(0, 214, 201, 0.5);
}

.remove-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 107, 107, 0.1);
  color: #ff6b6b;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.remove-btn:hover {
  background: rgba(255, 107, 107, 0.2);
}

.loadout-item {
  background: rgba(4, 11, 20, 0.3);
  border: 1px solid rgba(142, 164, 201, 0.1);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.loadout-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}

.organization-tree {
  background: rgba(4, 11, 20, 0.3);
  border-radius: 8px;
  padding: 12px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 4px;
  background: rgba(142, 164, 201, 0.05);
}

.tree-node.leaf {
  margin-left: 24px;
}

.node-icon {
  font-size: 16px;
}

.node-name {
  font-size: 13px;
  color: #cbd5e1;
}

.equipment-status {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(4, 11, 20, 0.3);
  border-radius: 6px;
  font-size: 12px;
}

.status-item span:first-child {
  color: #8ea4c9;
}

.status-value {
  color: #00d6c9;
  font-weight: 600;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #cbd5e1;
  cursor: pointer;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-top: 1px solid rgba(142, 164, 201, 0.2);
  background: rgba(4, 11, 20, 0.5);
}

.footer-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #8ea4c9;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

.cancel-btn,
.confirm-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background: rgba(142, 164, 201, 0.1);
  color: #8ea4c9;
  border: 1px solid rgba(142, 164, 201, 0.3);
}

.cancel-btn:hover {
  background: rgba(142, 164, 201, 0.2);
  border-color: rgba(142, 164, 201, 0.5);
}

.confirm-btn {
  background: linear-gradient(135deg, #1f6fff, #00d6c9);
  color: #04111f;
}

.confirm-btn:hover {
  box-shadow: 0 4px 12px rgba(0, 214, 201, 0.3);
  transform: translateY(-1px);
}
</style>