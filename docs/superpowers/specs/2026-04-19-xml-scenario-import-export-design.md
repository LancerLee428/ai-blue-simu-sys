# XML 想定文件解析与导入导出系统设计

**日期**: 2026-04-19
**作者**: Claude Sonnet 4.6
**状态**: 设计完成,待实现

## 1. 概述

### 1.1 背景

当前系统使用 `TacticalScenario` 类型支持战术层面的红蓝对抗想定,包含实体部署、路线规划、探测范围和行动阶段。现需扩展系统以支持更复杂的军事仿真想定,包括:

- 航天装备(卫星轨道参数)
- 组件级配置(传感器、姿态控制、通信模块等)
- 环境模型(空间环境、大气、电磁效应)
- 任务配置(行为树、状态机、指令序列)
- 交互关系(编组、指控、通信、探测)

参考想定文件: `data-example/202603301010001-想定文件（公开）.txt`

### 1.2 设计目标

1. **渐进式扩展**: 在现有类型基础上扩展,保持向后兼容
2. **XML 双向转换**: 支持 XML 导入和导出,严格保持坐标精度
3. **多视图展示**: 通过 Tab 页切换展示不同维度的想定信息
4. **可视化增强**: 支持轨道、编组树、环境配置的渲染

### 1.3 核心原则

- **坐标严格性**: XML 中的所有经纬度坐标严格按照原文解析,不做任何修改
- **字段完整性**: 涵盖 XML 想定规范的所有字段
- **类型安全**: 所有新增字段都有明确的 TypeScript 类型定义
- **向后兼容**: 所有新增字段都是可选的,现有功能不受影响

---

## 2. 架构设计

### 2.1 数据流

```
用户上传 XML 文件
  ↓
XmlScenarioParser.parse() (XML → TacticalScenario)
  ↓
Extended TacticalScenario (内存对象)
  ↓
前端渲染 (Cesium + Vue)
  ↓
用户编辑 / AI 生成
  ↓
XmlScenarioParser.export() (TacticalScenario → XML)
  ↓
下载 XML 文件
```

### 2.2 模块划分

```
apps/web/src/
├── types/
│   └── tactical-scenario.ts          # 扩展类型定义
├── services/
│   ├── xml-scenario-parser.ts        # XML 解析器
│   ├── xml-scenario-exporter.ts      # XML 导出器
│   └── ... (现有服务)
├── components/
│   ├── ai-assistant/
│   │   └── AIAssistantPanel.vue      # 新增导入导出按钮
│   ├── scenario/
│   │   ├── TasksTreeView.vue         # 任务树视图
│   │   ├── EnvironmentView.vue       # 环境配置视图
│   │   └── InteractionsView.vue      # 交互关系视图
│   └── ... (现有组件)
└── stores/
    └── tactical-scenario.ts          # 新增 loadScenario 方法
```

---

## 3. 类型系统扩展

### 3.1 GeoPosition 扩展 (支持轨道参数)

```typescript
// apps/web/src/types/tactical-scenario.ts

// 开普勒轨道根数
export interface KeplerianOrbit {
  type: 'Keplerian';
  semiMajorAxis: number;      // 半长轴 (km)
  eccentricity: number;        // 偏心率
  inclination: number;         // 倾角 (deg)
  raan: number;                // 升交点赤经 (deg)
  argOfPerigee: number;        // 近地点幅角 (deg)
  trueAnomaly: number;         // 真近点角 (deg)
  epoch: string;               // 历元时间
}

// TLE 轨道
export interface TLEOrbit {
  type: 'TLE';
  line1: string;
  line2: string;
}

export type OrbitState = KeplerianOrbit | TLEOrbit;

// 扩展 GeoPosition
export interface GeoPosition {
  longitude: number;
  latitude: number;
  altitude: number;
  orbit?: OrbitState;  // 新增:轨道参数(可选)
}
```

### 3.2 组件配置类型

```typescript
// 组件参数
export interface ComponentParam {
  key: string;
  value: string | number;
  unit?: string;
}

// 组件配置
export interface Component {
  id: string;
  name: string;
  type: string;  // 如 'space_mover', 'sensor_optical', 'maneuver_adcs'
  performanceParams?: ComponentParam[];
  dynamicParams?: ComponentParam[];
  initialParams?: ComponentParam[];
  initialState?: {
    positionType?: 'Geodetic' | 'Keplerian';
    // 地面位置
    longitude?: number;
    latitude?: number;
    altitude?: number;
    // 轨道状态
    orbitType?: 'Keplerian';
    orbit?: Partial<KeplerianOrbit>;
  };
}
```

### 3.3 扩展 EntitySpec

```typescript
export interface EntitySpec {
  id: string;
  name: string;
  type: PlatformType;
  side: ForceSide;
  position: GeoPosition;
  loadout?: {
    weapons: string[];
    sensors: string[];
  };

  // === 新增字段 (XML 扩展) ===
  modelId?: string;                    // 模型 ID
  modelType?: 'homogeneous' | 'heterogeneous';  // 同构/异构
  interfaceProtocol?: string;          // 接口协议 (如 HLA-IEEE1516e)
  federateName?: string;               // 联邦名称
  components?: Component[];            // 组件列表
  taskRef?: string;                    // 关联任务 ID
}
```

### 3.4 任务配置类型

```typescript
// 行为树节点
export type BehaviorNodeType = 'Sequence' | 'Selector' | 'Parallel';

export interface ActionNode {
  nodeType: 'Action';
  name: string;
  component: string;
  params: ComponentParam[];
}

export interface ConditionNode {
  nodeType: 'Condition';
  name: string;
  params: ComponentParam[];
}

export interface CompositeNode {
  nodeType: BehaviorNodeType;
  name: string;
  children: BehaviorTreeNode[];
}

export type BehaviorTreeNode = ActionNode | ConditionNode | CompositeNode;

export interface BehaviorTreeConfig {
  root: CompositeNode;
}

// 状态机
export interface StateTransition {
  event: string;
  target: string;
}

export interface StateAction {
  component: string;
  params: ComponentParam[];
}

export interface State {
  name: string;
  entryAction?: StateAction;
  exitAction?: StateAction;
  transitions: StateTransition[];
}

export interface StateMachineConfig {
  initialState: string;
  states: State[];
}

// 指令序列
export interface Instruction {
  id: string;
  time: string;  // 如 "T+0h:10m:00s"
  type: string;
  component: string;
  params: ComponentParam[];
}

export interface InstructionSeqConfig {
  instructions: Instruction[];
}

// 统一任务配置
export interface TaskConfig {
  id: string;
  equipRef: string;
  name: string;
  type: 'BehaviorTree' | 'StateMachine' | 'InstructionSeq';
  config: BehaviorTreeConfig | StateMachineConfig | InstructionSeqConfig;
}
```

### 3.5 环境配置类型

```typescript
// 空间环境
export interface SpaceEnvironment {
  solarActivity: {
    fluxLevel: number;
    sunspotNumber: number;
  };
  geomagneticField: {
    kpIndex: number;
    apIndex: number;
  };
  ionosphere: {
    modelType: string;
    totalElectronContent: number;
  };
  dataResolution: {
    latitudeStep: number;
    longitudeStep: number;
    altitudeStep: number;
  };
  timeStep: number;
  modelServiceUrl: string;
  dataGenerationUrl: string;
}

// 大气环境
export interface AtmosphereModel {
  weather: string;
  rainLevel: string;
  windSpeed: number;
  windDirection: number;
  coverageArea: {
    lonMin: number;
    lonMax: number;
    latMin: number;
    latMax: number;
  };
  dataResolution: {
    latitudeStep: number;
    longitudeStep: number;
    altitudeStep: number;
  };
  timeStep: number;
  modelServiceUrl: string;
  dataGenerationUrl: string;
}

// 环境效应模型
export interface EffectModel {
  id: string;
  category: string;
  name: string;
  enabled: boolean;
  params: ComponentParam[];
}

// 环境事件
export interface EnvironmentEvent {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  type: string;
  level: number;
  affectedArea?: {
    lonMin: number;
    lonMax: number;
    latMin: number;
    latMax: number;
  };
  params: ComponentParam[];
}

// 统一环境配置
export interface EnvironmentConfig {
  generationModels: {
    spaceEnvironment?: SpaceEnvironment;
    atmosphereModel?: AtmosphereModel;
  };
  effectModels: EffectModel[];
  events: EnvironmentEvent[];
}
```

### 3.6 交互配置类型

```typescript
// 编组关系 (树状结构)
export interface GroupMember {
  equipRef: string;
  role?: string;
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
  children?: Group[];  // 支持嵌套编组
}

// 指控关系
export interface CommandControlLink {
  id: string;
  commander: string;
  subordinate: string;
  protocol: string;
  latency?: number;
}

// 通信关系
export interface CommunicationLink {
  id: string;
  sender: {
    equipRef: string;
    component?: string;
  };
  receiver: {
    equipRef: string;
    component?: string;
  };
  dataType: string;
  protocol: string;
  maxRange?: number;
  dataRate?: number;
}

// 探测关系
export interface DetectionLink {
  id: string;
  observer: {
    equipRef: string;
    component?: string;
  };
  target: string;
  sensorType: string;
}

// 统一交互配置
export interface InteractionConfig {
  groups: Group[];
  commandControl: CommandControlLink[];
  communications: CommunicationLink[];
  detectionLinks: DetectionLink[];
}
```

### 3.7 想定元数据类型

```typescript
export interface ScenarioMetadata {
  name: string;
  version: string;
  description: string;
  taskSource?: string;
  createUnit?: string;
  author?: string;
  createTime?: string;
  modifyTime?: string;
  category?: string;
  tags?: string[];
}
```

### 3.8 扩展 TacticalScenario

```typescript
export interface TacticalScenario {
  id: string;
  version: number;
  summary: string;

  // 现有字段
  forces: {
    side: ForceSide;
    name: string;
    entities: EntitySpec[];
  }[];
  routes: Route[];
  detectionZones: DetectionZone[];
  strikeTasks: StrikeTask[];
  phases: Phase[];
  metadata: {
    generatedAt: string;
    modelUsed: string;
    confidence: number;
    // 新增:仿真参数
    startTime?: string;
    endTime?: string;
  };

  // === 新增字段 (XML 扩展) ===
  scenarioMetadata?: ScenarioMetadata;   // XML 想定元数据
  tasks?: TaskConfig[];                  // 任务配置
  environment?: EnvironmentConfig;       // 环境配置
  interactions?: InteractionConfig;      // 交互关系
}
```

---

## 4. XML 解析器设计

### 4.1 解析器接口

```typescript
// apps/web/src/services/xml-scenario-parser.ts

export class XmlScenarioParser {
  /**
   * 解析 XML 文件为 TacticalScenario
   * 严格按照 XML 中的经纬度坐标,不做任何修改
   */
  parse(xmlContent: string): TacticalScenario;

  /**
   * 将 TacticalScenario 导出为 XML
   * 保持与原始 XML 格式一致
   */
  export(scenario: TacticalScenario): string;
}
```

### 4.2 关键解析逻辑

**解析 Equipment 为 EntitySpec**

```typescript
private parseEquipments(doc: Document, category: string): EntitySpec[] {
  const equipments: EntitySpec[] = [];
  const nodes = doc.querySelectorAll(`${category} > Equipment`);

  nodes.forEach(node => {
    const entity: EntitySpec = {
      id: node.getAttribute('id') || '',
      name: node.querySelector('Name')?.textContent || '',
      type: this.mapModelTypeToplatformType(node.querySelector('ModelId')?.textContent),
      side: category === 'Participating' ? 'red' : 'blue',
      position: this.parsePosition(node),
      modelId: node.querySelector('ModelId')?.textContent,
      modelType: node.querySelector('ModelType')?.textContent as any,
      interfaceProtocol: node.querySelector('InterfaceProtocol')?.textContent,
      federateName: node.querySelector('FederateName')?.textContent,
      components: this.parseComponents(node),
      taskRef: node.querySelector('TaskRef')?.getAttribute('taskId'),
    };
    equipments.push(entity);
  });

  return equipments;
}
```

**严格解析经纬度坐标**

```typescript
private parsePosition(equipmentNode: Element): GeoPosition {
  const moverComponent = equipmentNode.querySelector(
    'Component[type="space_mover"], Component[type="faclity_mover"]'
  );
  const initialState = moverComponent?.querySelector('InitialState');

  if (!initialState) {
    return { longitude: 0, latitude: 0, altitude: 0 };
  }

  const positionType = initialState.querySelector('PositionType')?.textContent;

  if (positionType === 'Geodetic') {
    // 地面位置:严格按照 XML 中的经纬高
    return {
      longitude: parseFloat(initialState.querySelector('Longitude')?.textContent || '0'),
      latitude: parseFloat(initialState.querySelector('Latitude')?.textContent || '0'),
      altitude: parseFloat(initialState.querySelector('Altitude')?.textContent || '0'),
    };
  } else if (positionType === 'Keplerian') {
    // 轨道位置:解析开普勒根数
    const orbit: KeplerianOrbit = {
      type: 'Keplerian',
      semiMajorAxis: parseFloat(initialState.querySelector('SemiMajorAxis')?.textContent || '0'),
      eccentricity: parseFloat(initialState.querySelector('Eccentricity')?.textContent || '0'),
      inclination: parseFloat(initialState.querySelector('Inclination')?.textContent || '0'),
      raan: parseFloat(initialState.querySelector('RAAN')?.textContent || '0'),
      argOfPerigee: parseFloat(initialState.querySelector('ArgOfPerigee')?.textContent || '0'),
      trueAnomaly: parseFloat(initialState.querySelector('TrueAnomaly')?.textContent || '0'),
      epoch: initialState.querySelector('Epoch')?.textContent || '',
    };

    return {
      longitude: 0,
      latitude: 0,
      altitude: 0,
      orbit,
    };
  }

  return { longitude: 0, latitude: 0, altitude: 0 };
}
```

### 4.3 XML 导出逻辑

```typescript
export(scenario: TacticalScenario): string {
  const doc = document.implementation.createDocument(null, 'Scenario', null);
  const root = doc.documentElement;

  // 导出 Metadata
  if (scenario.scenarioMetadata) {
    this.exportMetadata(doc, root, scenario.scenarioMetadata);
  }

  // 导出 SimulationParameters
  if (scenario.metadata.startTime && scenario.metadata.endTime) {
    this.exportSimulationParameters(doc, root, scenario.metadata);
  }

  // 导出 Equipments
  this.exportEquipments(doc, root, scenario.forces);

  // 导出 Environment
  if (scenario.environment) {
    this.exportEnvironment(doc, root, scenario.environment);
  }

  // 导出 Tasks
  if (scenario.tasks) {
    this.exportTasks(doc, root, scenario.tasks);
  }

  // 导出 Interactions
  if (scenario.interactions) {
    this.exportInteractions(doc, root, scenario.interactions);
  }

  // 序列化为 XML 字符串
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}
```

---

## 5. 前端集成

### 5.1 导入导出 UI

在 `AIAssistantPanel.vue` 中新增:

```vue
<template>
  <div class="ai-assistant-panel">
    <!-- 现有的 AI 对话界面 -->

    <!-- 新增:导入导出按钮组 -->
    <div class="import-export-actions">
      <button @click="handleImportXml" class="btn-import">
        导入 XML 想定
      </button>
      <button @click="handleExportXml" class="btn-export" :disabled="!hasScenario">
        导出 XML 想定
      </button>
      <input
        ref="fileInput"
        type="file"
        accept=".xml,.txt"
        @change="onFileSelected"
        style="display: none"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { XmlScenarioParser } from '@/services/xml-scenario-parser';
import { useTacticalScenarioStore } from '@/stores/tactical-scenario';

const parser = new XmlScenarioParser();
const scenarioStore = useTacticalScenarioStore();
const fileInput = ref<HTMLInputElement>();

const handleImportXml = () => {
  fileInput.value?.click();
};

const onFileSelected = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    const scenario = parser.parse(content);
    scenarioStore.loadScenario(scenario);
    alert(`成功导入想定: ${scenario.scenarioMetadata?.name || scenario.id}`);
  } catch (error) {
    console.error('XML 解析失败:', error);
    alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};

const handleExportXml = () => {
  const scenario = scenarioStore.currentScenario;
  if (!scenario) return;

  try {
    const xmlContent = parser.export(scenario);
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario.id}-${Date.now()}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('XML 导出失败:', error);
    alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};
</script>
```

### 5.2 Tab 页切换

在战术场景面板中新增 Tab 切换:

```vue
<template>
  <div class="tactical-scenario-panel">
    <!-- Tab 导航 -->
    <div class="tab-navigation">
      <button
        :class="{ active: activeTab === 'phases' }"
        @click="activeTab = 'phases'"
      >
        行动阶段 (Phases)
      </button>
      <button
        :class="{ active: activeTab === 'tasks' }"
        @click="activeTab = 'tasks'"
        :disabled="!hasTasks"
      >
        任务树 (Tasks)
      </button>
      <button
        :class="{ active: activeTab === 'environment' }"
        @click="activeTab = 'environment'"
        :disabled="!hasEnvironment"
      >
        环境配置
      </button>
      <button
        :class="{ active: activeTab === 'interactions' }"
        @click="activeTab = 'interactions'"
        :disabled="!hasInteractions"
      >
        交互关系
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="tab-content">
      <PhasesView v-if="activeTab === 'phases'" />
      <TasksTreeView v-else-if="activeTab === 'tasks'" />
      <EnvironmentView v-else-if="activeTab === 'environment'" />
      <InteractionsView v-else-if="activeTab === 'interactions'" />
    </div>
  </div>
</template>
```

### 5.3 新增视图组件

**TasksTreeView.vue** - 渲染行为树/状态机/指令序列

```vue
<template>
  <div class="tasks-tree-view">
    <div v-for="task in tasks" :key="task.id" class="task-item">
      <h3>{{ task.name }}</h3>
      <div v-if="task.type === 'BehaviorTree'">
        <BehaviorTreeRenderer :tree="task.config" />
      </div>
      <div v-else-if="task.type === 'StateMachine'">
        <StateMachineRenderer :stateMachine="task.config" />
      </div>
      <div v-else-if="task.type === 'InstructionSeq'">
        <InstructionSeqRenderer :instructions="task.config" />
      </div>
    </div>
  </div>
</template>
```

**EnvironmentView.vue** - 展示环境配置

**InteractionsView.vue** - 展示编组树、通信链路等

---

## 6. 实现路径

### 阶段 1: 类型定义与解析器 (优先级最高)

**任务**:
1. 扩展 `apps/web/src/types/tactical-scenario.ts` 类型定义
2. 实现 `apps/web/src/services/xml-scenario-parser.ts`
3. 编写单元测试,验证解析的准确性(特别是经纬度坐标)

**验收标准**:
- 所有 XML 字段都有对应的 TypeScript 类型
- 解析器能正确解析示例 XML 文件
- 经纬度坐标与 XML 原文完全一致

### 阶段 2: 前端导入导出 UI

**任务**:
1. 在 `AIAssistantPanel.vue` 中添加导入导出按钮
2. 实现文件上传和下载逻辑
3. 在 `useTacticalScenarioStore` 中添加 `loadScenario` 方法

**验收标准**:
- 用户可以上传 XML 文件并成功导入
- 用户可以导出当前想定为 XML 文件
- 导入导出的 XML 格式与原始文件一致

### 阶段 3: Tab 页切换与可视化

**任务**:
1. 创建 `TasksTreeView.vue` 组件
2. 创建 `EnvironmentView.vue` 组件
3. 创建 `InteractionsView.vue` 组件
4. 实现 Tab 切换逻辑

**验收标准**:
- 用户可以在不同 Tab 页之间切换
- 每个 Tab 页正确展示对应的数据
- 只有当想定包含对应数据时,Tab 页才可用

### 阶段 4: Cesium 渲染增强

**任务**:
1. 支持轨道可视化(卫星轨道线)
2. 支持编组树的层级展示
3. 优化实体图标(根据组件类型)

**验收标准**:
- 卫星轨道在 Cesium 中正确渲染
- 编组关系在地图上可视化
- 实体图标能反映其组件配置

---

## 7. 风险与缓解

### 7.1 风险

1. **XML 解析复杂度**: XML 结构复杂,解析逻辑容易出错
2. **坐标精度丢失**: 浮点数解析可能导致精度损失
3. **类型定义膨胀**: 新增大量类型可能影响代码可维护性
4. **前端性能**: 大型想定文件可能导致渲染性能问题

### 7.2 缓解措施

1. **单元测试**: 为解析器编写完整的单元测试
2. **精度验证**: 在测试中验证坐标精度
3. **模块化**: 将类型定义按功能模块拆分到多个文件
4. **虚拟滚动**: 对大型数据列表使用虚拟滚动

---

## 8. 未来扩展

1. **XML Schema 验证**: 支持 XSD 验证
2. **批量导入**: 支持一次导入多个想定文件
3. **版本管理**: 支持想定文件的版本控制
4. **协同编辑**: 支持多人协同编辑想定

---

## 9. 总结

本设计采用渐进式扩展策略,在保持现有功能不受影响的前提下,扩展系统以支持更复杂的军事仿真想定。通过 XML 双向转换、Tab 页切换和可视化增强,为用户提供完整的想定管理能力。

**关键设计决策**:
- 所有新增字段都是可选的,保持向后兼容
- 严格保持 XML 坐标精度,不做任何修改
- 任务配置与现有 phases 并存,通过 Tab 页切换
- 环境配置和交互关系作为场景级别的扩展字段

**下一步**: 进入实现阶段,按照阶段 1 → 阶段 2 → 阶段 3 → 阶段 4 的顺序逐步实现。
