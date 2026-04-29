<script setup lang="ts">
import { ref, watch } from 'vue';
import type { EntityConfig } from '../../types/deployment';
import type { ForceSide, PlatformType } from '../../types/tactical-scenario';

interface Props {
  visible: boolean;
  mode: 'create' | 'edit';
  sourceEntityId?: string;
  sourceEntityName?: string;
  initialPosition?: { longitude: number; latitude: number; altitude: number };
  initialConfig?: Partial<EntityConfig>;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  mode: 'create',
  sourceEntityName: '',
  initialPosition: () => ({ longitude: 121.0, latitude: 23.8, altitude: 0 }),
});

const emit = defineEmits<{
  (e: 'confirm', config: EntityConfig): void;
  (e: 'cancel'): void;
}>();

const activeTab = ref<'basic' | 'physical' | 'behavior'>('basic');

const formData = ref<EntityConfig>({
  sourceEntityId: '',
  name: '',
  forceSide: 'red',
  platformType: 'facility-command',
  modelId: '',
  speed: 0,
  initialStatus: 'deployed',
  position: { longitude: 121.0, latitude: 23.8, altitude: 0 },
  organization: {},
  loadout: {
    weapons: [],
    sensors: [],
    communication: [],
  },
  missionConfig: {
    primaryMission: '',
    secondaryMissions: [],
    rulesOfEngagement: '',
    coordinationPoints: [],
  },
});

const maneuver = ref({
  semiMajorAxis: '01° 07′36.657″',
  eccentricity: '',
  inclination: '95.5°',
  raan: '',
  argOfPerigee: '23.9°',
  trueAnomaly: '',
});

const platformOptions: { label: string; value: PlatformType }[] = [
  { label: '遥感卫星', value: 'facility-command' },
  { label: '预警机', value: 'air-aew' },
  { label: '侦察机', value: 'air-recon' },
  { label: '无人侦察机', value: 'uav-recon' },
  { label: '战斗机', value: 'air-fighter' },
  { label: '驱逐舰', value: 'ship-destroyer' },
  { label: '雷达站', value: 'facility-radar' },
  { label: '防空导弹营', value: 'ground-sam' },
];

function resetForm() {
  const initial = props.initialConfig ?? {};
  const sourceName = props.sourceEntityName || props.sourceEntityId || '';

  formData.value = {
    sourceEntityId: props.sourceEntityId ?? '',
    name: initial.name ?? sourceName,
    forceSide: initial.forceSide ?? 'red',
    platformType: initial.platformType ?? 'facility-command',
    modelId: initial.modelId ?? 'JIANB-24',
    speed: initial.speed ?? 596.5,
    initialStatus: initial.initialStatus ?? 'deployed',
    position: {
      longitude: initial.position?.longitude ?? props.initialPosition.longitude,
      latitude: initial.position?.latitude ?? props.initialPosition.latitude,
      altitude: initial.position?.altitude ?? 7648.1,
    },
    organization: initial.organization ?? {},
    loadout: initial.loadout ?? {
      weapons: [],
      sensors: [],
      communication: [],
    },
    missionConfig: initial.missionConfig ?? {
      primaryMission: '',
      secondaryMissions: [],
      rulesOfEngagement: '',
      coordinationPoints: [],
    },
  };

  activeTab.value = 'basic';
}

watch(
  () => [
    props.visible,
    props.sourceEntityId,
    props.sourceEntityName,
    props.initialPosition.longitude,
    props.initialPosition.latitude,
    props.initialPosition.altitude,
  ],
  () => {
    if (props.visible) resetForm();
  },
);

function handleConfirm() {
  if (!formData.value.name.trim()) {
    formData.value.name = props.sourceEntityName || `新部署实体 ${Date.now().toString().slice(-6)}`;
  }
  emit('confirm', {
    ...formData.value,
    name: formData.value.name.trim(),
  });
}
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('cancel')">
    <div class="deployment-modal">
      <div class="modal-tabs">
        <button
          type="button"
          class="tab-button"
          :class="{ active: activeTab === 'basic' }"
          @click="activeTab = 'basic'"
        >
          基础属性
        </button>
        <button
          type="button"
          class="tab-button"
          :class="{ active: activeTab === 'physical' }"
          @click="activeTab = 'physical'"
        >
          物理组件
        </button>
        <button
          type="button"
          class="tab-button"
          :class="{ active: activeTab === 'behavior' }"
          @click="activeTab = 'behavior'"
        >
          行为组件
        </button>
        <button type="button" class="close-button" @click="emit('cancel')">×</button>
      </div>

      <div class="modal-body">
        <div v-if="activeTab === 'basic'" class="tab-panel">
          <section class="form-section">
            <div class="section-title section-title--info">基本信息</div>
            <label class="field-row field-row--full">
              <span>名称:</span>
              <input v-model="formData.name" />
            </label>
            <div class="field-grid">
              <label class="field-row">
                <span>类型:</span>
                <select v-model="formData.platformType">
                  <option v-for="item in platformOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label class="field-row">
                <span>型号:</span>
                <input v-model="formData.modelId" />
              </label>
            </div>
            <div class="side-row">
              <span>属方:</span>
              <label class="radio-option">
                <input v-model="formData.forceSide" type="radio" value="red" />
                <i></i>
                红方
              </label>
              <label class="radio-option">
                <input v-model="formData.forceSide" type="radio" value="blue" />
                <i></i>
                蓝方
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title section-title--state">初始状态</div>
            <div class="field-grid">
              <label class="field-row coordinate-row">
                <span>起始坐标:</span>
                <select aria-label="纬度方向">
                  <option>N</option>
                  <option>S</option>
                </select>
                <input v-model.number="formData.position.latitude" type="number" step="0.000001" />
              </label>
              <label class="field-row coordinate-row">
                <span class="sr-only">经度</span>
                <select aria-label="经度方向">
                  <option>E</option>
                  <option>W</option>
                </select>
                <input v-model.number="formData.position.longitude" type="number" step="0.000001" />
              </label>
              <label class="field-row">
                <span>海拔高度:</span>
                <div class="unit-input">
                  <input v-model.number="formData.position.altitude" type="number" step="0.1" />
                  <em>m</em>
                </div>
              </label>
              <label class="field-row">
                <span>速度:</span>
                <div class="unit-input">
                  <input v-model.number="formData.speed" type="number" step="0.1" />
                  <em>m/s</em>
                </div>
              </label>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title section-title--motion">机动参数</div>
            <div class="field-grid">
              <label class="field-row">
                <span>半长轴:</span>
                <input v-model="maneuver.semiMajorAxis" />
              </label>
              <label class="field-row">
                <span>偏心率:</span>
                <input v-model="maneuver.eccentricity" placeholder="请输入" />
              </label>
              <label class="field-row">
                <span>轨道倾角:</span>
                <input v-model="maneuver.inclination" />
              </label>
              <label class="field-row">
                <span>升交点赤经:</span>
                <input v-model="maneuver.raan" placeholder="请输入" />
              </label>
              <label class="field-row">
                <span>近地点幅角:</span>
                <input v-model="maneuver.argOfPerigee" />
              </label>
              <label class="field-row">
                <span>真近点角:</span>
                <input v-model="maneuver.trueAnomaly" placeholder="请输入" />
              </label>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'physical'" class="empty-panel">
          <section class="form-section">
            <div class="section-title section-title--info">物理组件</div>
            <label class="field-row field-row--full">
              <span>源实体:</span>
              <input v-model="formData.sourceEntityId" disabled />
            </label>
            <label class="field-row field-row--full">
              <span>组件描述:</span>
              <input placeholder="请输入物理组件配置" />
            </label>
          </section>
        </div>

        <div v-else class="empty-panel">
          <section class="form-section">
            <div class="section-title section-title--motion">行为组件</div>
            <label class="field-row field-row--full">
              <span>主要任务:</span>
              <input v-model="formData.missionConfig!.primaryMission" placeholder="请输入主要任务" />
            </label>
            <label class="field-row field-row--full">
              <span>交战规则:</span>
              <input v-model="formData.missionConfig!.rulesOfEngagement" placeholder="请输入交战规则" />
            </label>
          </section>
        </div>
      </div>

      <button type="button" class="save-button" @click="handleConfirm">
        <span class="save-icon"></span>
        保存
      </button>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  background: rgba(0, 7, 18, 0.34);
}

.deployment-modal {
  position: relative;
  width: min(820px, calc(100vw - 48px));
  max-height: min(92vh, 780px);
  overflow: hidden;
  color: #eef7ff;
  background:
    linear-gradient(180deg, rgba(9, 36, 68, 0.86), rgba(4, 22, 42, 0.92)),
    radial-gradient(circle at 50% 35%, rgba(66, 124, 172, 0.34), transparent 48%);
  border: 1px solid rgba(50, 129, 220, 0.42);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(10px);
}

.modal-tabs {
  height: 66px;
  display: flex;
  align-items: stretch;
  padding-right: 44px;
  background: linear-gradient(90deg, rgba(3, 44, 101, 0.8), rgba(2, 18, 42, 0.68));
  border-bottom: 1px solid rgba(37, 134, 229, 0.5);
}

.tab-button {
  min-width: 120px;
  padding: 0 30px;
  border: 0;
  color: #dceeff;
  background: transparent;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.tab-button.active {
  background: linear-gradient(180deg, rgba(59, 134, 245, 0.55), rgba(22, 75, 165, 0.42));
  box-shadow: inset 0 -3px 0 #9fd2ff;
}

.close-button {
  position: absolute;
  top: 16px;
  right: 18px;
  border: 0;
  color: #ffffff;
  background: transparent;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.modal-body {
  max-height: calc(min(92vh, 780px) - 94px);
  overflow-y: auto;
  padding: 26px 32px 78px;
}

.tab-panel,
.empty-panel {
  display: grid;
  gap: 22px;
}

.form-section {
  display: grid;
  gap: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #ffffff;
  font-size: 20px;
  font-weight: 800;
}

.section-title::before {
  content: "";
  width: 19px;
  height: 19px;
  background: currentColor;
  mask: linear-gradient(#000 0 0) center / 100% 100%;
}

.section-title--info {
  color: #1ed5ff;
}

.section-title--state {
  color: #00ffbd;
}

.section-title--motion {
  color: #ffd200;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 58px;
  row-gap: 10px;
}

.field-row {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  align-items: center;
  gap: 0;
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
}

.field-row--full {
  grid-template-columns: 104px minmax(0, 1fr);
}

.field-row span {
  white-space: nowrap;
}

input,
select {
  min-width: 0;
  height: 43px;
  box-sizing: border-box;
  border: 1px solid rgba(57, 127, 220, 0.74);
  border-radius: 4px;
  color: #eaf5ff;
  background: rgba(4, 29, 68, 0.86);
  font: inherit;
  font-weight: 500;
  padding: 0 18px;
  outline: none;
}

input::placeholder {
  color: rgba(234, 245, 255, 0.86);
}

input:focus,
select:focus {
  border-color: #4eb4ff;
  box-shadow: 0 0 0 2px rgba(78, 180, 255, 0.18);
}

input:disabled {
  color: rgba(234, 245, 255, 0.64);
  cursor: not-allowed;
}

.side-row {
  display: flex;
  align-items: center;
  gap: 18px;
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
}

.radio-option {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-weight: 500;
  cursor: pointer;
}

.radio-option input {
  position: absolute;
  opacity: 0;
}

.radio-option i {
  width: 22px;
  height: 22px;
  border: 2px solid #d8f0ff;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(79, 174, 255, 0.42);
}

.radio-option input:checked + i {
  background: radial-gradient(circle, #3ca4ff 0 45%, transparent 48%);
}

.coordinate-row {
  grid-template-columns: 104px 70px minmax(0, 1fr);
}

.coordinate-row select {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  padding: 0 12px;
}

.coordinate-row input {
  border-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.unit-input {
  position: relative;
}

.unit-input input {
  width: 100%;
  padding-right: 58px;
}

.unit-input em {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #ffffff;
  font-style: normal;
  font-weight: 500;
}

.save-button {
  position: absolute;
  right: 39px;
  bottom: 26px;
  height: 35px;
  min-width: 96px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(149, 205, 255, 0.85);
  color: #ffffff;
  background: linear-gradient(180deg, #5faeff, #236dcb);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.save-icon {
  width: 17px;
  height: 17px;
  border: 2px solid #ffffff;
  border-radius: 2px;
  box-sizing: border-box;
  position: relative;
}

.save-icon::after {
  content: "";
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: 2px;
  height: 5px;
  border-top: 2px solid #ffffff;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 760px) {
  .deployment-modal {
    width: calc(100vw - 24px);
  }

  .tab-button {
    min-width: auto;
    padding: 0 14px;
    font-size: 15px;
  }

  .modal-body {
    padding: 20px 18px 76px;
  }

  .field-grid {
    grid-template-columns: 1fr;
    row-gap: 12px;
  }

  .field-row,
  .field-row--full,
  .coordinate-row {
    grid-template-columns: 92px minmax(0, 1fr);
    font-size: 15px;
  }

  .coordinate-row select {
    display: none;
  }
}
</style>
