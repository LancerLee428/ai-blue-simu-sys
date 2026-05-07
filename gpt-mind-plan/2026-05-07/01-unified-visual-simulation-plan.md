# 统一推演视觉方案：雷达、干扰、爆炸与虚拟时间

## 1. 背景与结论

本轮核对的核心结论是：当前问题不是单纯缺少特效，而是传感器、电子战、爆炸效果没有统一到推演引擎的虚拟时间和运行时空间状态里。

已确认的主要问题：

- 雷达探测当前主要是静态圆形/半球范围加平面扫描扇形，不符合立体探测波束语义。
- `radar-beam-model.ts` 已有锥形波束能力，但没有接入当前 `MapRenderer.renderDetectionZones()` 主链路。
- 探测判定仍使用静态 `DetectionZone.center` 计算距离，移动平台的探测中心不会跟随实体实时位置。
- 干扰视觉是硬编码圆形脉冲，没有复用电子战逻辑，也没有和雷达一样表达立体波束或覆盖体。
- 雷达扫描、干扰波纹、爆炸动画分别使用 `performance.now()` / `Date.now()`，没有使用统一虚拟推演时间。
- 示例 XML 中 240 秒阶段无法触发当前三次武器命中，导致爆炸效果实际不可见。
- 爆炸触发位置通过 `strike-*` 标记反查，而不是直接使用 `WeaponImpactEvent.hitPosition`。
- 当前爆炸半径主要表现为 billboard 像素尺寸，不是地理空间中的米级冲击波范围。
- `ExecutionEngine` 的单回调接口会被后续调用覆盖，不利于多个 UI/渲染模块同时订阅状态和事件。

因此，第一阶段不应继续堆叠视觉特效，而应先建立统一数据流：

```text
ExecutionEngine 虚拟时间
  -> runtime snapshot
  -> Sensor/EW/Weapon/Explosion runtime state
  -> MapRenderer 消费 snapshot 渲染
  -> UI Store 节流同步
```

## 2. 目标边界

### 2.1 第一阶段目标

第一阶段只做三个闭环：

- 统一视觉时间源：所有推演视觉效果使用 `ExecutionEngine` 的虚拟时间，不再由渲染器自行使用真实墙钟时间驱动。
- 立体传感器/干扰波束：雷达探测和电子干扰使用同一类运行时发射体模型，支持立体锥形/扇形覆盖和运动平台跟随。
- 爆炸可见且语义正确：命中事件在虚拟时间内稳定触发，爆炸位置来自命中事件，爆炸效果包含地理空间冲击波和可见火球。

### 2.2 暂不纳入第一阶段

- 不做完整制导物理、比例导引、脱靶/拦截复杂分支。
- 不做复杂雷达方程、RCS、信噪比、地形遮蔽。
- 不做完整粒子系统池化和高级后处理。
- 不扩展大规模 UI 设置面板，只保留配置开关和性能上限。

## 3. 统一运行时模型

### 3.1 SimulationSnapshot

新增或等价实现一个运行时快照模型，由 `ExecutionEngine` 每帧生成或维护。

```ts
interface SimulationSnapshot {
  virtualTimeMs: number;
  phaseIndex: number;
  status: ExecutionStatus;
  entities: Map<string, RuntimeEntityState>;
  weapons: Weapon[];
  sensorEmitters: EmitterVolume[];
  ewEmitters: EmitterVolume[];
  explosions: ExplosionRuntimeState[];
}

interface RuntimeEntityState {
  id: string;
  side: ForceSide;
  type: PlatformType;
  position: GeoPosition;
  status: EntityStatus;
  health?: number;
}
```

渲染层只能消费 `SimulationSnapshot` 或由它拆出的明确参数，不应再从静态 XML `DetectionZone.center` 推导动态位置。

### 3.2 EmitterVolume

雷达和干扰都统一抽象为发射体覆盖模型。

```ts
type EmitterKind = 'radar' | 'electronic-jamming';
type EmitterMode = 'omni' | 'sector-search' | 'track';

interface EmitterVolume {
  id: string;
  sourceEntityId: string;
  kind: EmitterKind;
  mode: EmitterMode;
  side: ForceSide;
  position: GeoPosition;
  headingDeg: number;
  rangeMeters: number;
  azimuthCenterDeg: number;
  azimuthWidthDeg: number;
  elevationMinDeg: number;
  elevationMaxDeg: number;
  pulseCycleMs: number;
  active: boolean;
}
```

原则：

- 雷达和干扰的视觉结构一致，都是立体覆盖体，只是颜色、透明度、脉冲材质和业务含义不同。
- `position` 来自运行时实体位置，而不是导入时的 `DetectionZone.center`。
- `headingDeg` 来自运行时实体航向，固定地面站可默认使用 0 或配置朝向。
- `mode='track'` 用于窄束跟踪，`mode='sector-search'` 用于扇区搜索，`mode='omni'` 用于全向覆盖。

## 4. 雷达探测波束设计

### 4.1 正确表现

雷达不应表现为平面扫描扇形。第一阶段的正确最小闭环是：

- 静态覆盖边界：显示最大探测体边界，使用半透明/线框立体锥体或半球。
- 动态扫描束：显示一个立体窄锥或扇形锥，在覆盖体内按照虚拟时间旋转。
- 跟踪探测：对重点目标可显示更窄的指向性锥束，从雷达平台指向目标。

### 4.2 需要纠正的实现点

- `MapRenderer.renderDetectionZones()` 不再直接画平面 polygon 扫描束。
- 接入并改造 `RadarBeamRenderer`，使其支持运行时 `EmitterVolume`。
- 雷达波束中心使用 `RuntimeEntityState.position`。
- 探测判定距离使用运行时探测方位置，而不是 `zone.center`。
- `DetectionZone` 继续作为静态配置/默认能力来源，但不作为推演运行时位置真相。

### 4.3 判定口径

第一阶段判定仍可保留简化距离判定：

```text
目标进入 effectiveRange -> 触发 detection event
```

但距离起点必须是运行时发射体位置。若当前波束是 `sector-search` 或 `track`，可以先只让视觉表达方向性，判定仍用半径；第二阶段再加入方位角/俯仰角是否落入波束的计算。

## 5. 电子干扰波束设计

### 5.1 正确表现

干扰波束和雷达探测应共享立体发射体模型：

- 全向压制：显示立体球/半球覆盖体，加脉冲扩散材质。
- 扇区干扰：显示立体扇形锥，颜色使用橙/红系。
- 指向干扰：显示从干扰机指向被压制雷达的窄锥束。

### 5.2 需要纠正的实现点

- `MapRenderer.renderElectronicWarfareEffects()` 不再硬编码 `air-jammer=150km`、`ground-ew=80km`。
- 电子战可视化使用 `ElectronicWarfareManager` 或统一 `EmitterVolume` 输出。
- 推演时 `ExecutionEngine` 已同步 jammer 位置，但视觉层也必须消费同一个运行时位置。
- 干扰强度、有效半径、可视化半径必须来自同一份运行时数据。

### 5.3 判定口径

第一阶段保留当前压制模型：

```text
敌方雷达平台处于 jammer coverage 内
  -> 雷达 effectiveRange 按距离和 power 衰减
```

但干扰源位置必须使用运行时位置，且视觉覆盖必须和判定覆盖一致。

## 6. 爆炸效果设计

### 6.1 正确触发

爆炸必须由 `WeaponImpactEvent` 触发，而不是通过 `strike-*` 标记反查。

```text
WeaponSystem emits WeaponImpactEvent
  -> ExecutionEngine records ExplosionRuntimeState
  -> MapRenderer.renderExplosions(snapshot.explosions)
```

`ExplosionRuntimeState.position` 应直接使用 `WeaponImpactEvent.hitPosition`。

### 6.2 时间线修正

当前示例 XML 的三次攻击在 240 秒阶段内无法命中。修正方式二选一：

- 调整示例演示场景的距离、速度或阶段时长，使命中发生在阶段内。
- 在武器系统中将演示模式和真实速度模式分开，演示模式可以使用压缩命中时间。

推荐第一阶段采用“演示时间压缩配置”，避免为了看爆炸把真实武器速度改得不可信。

```ts
interface WeaponRuntimeConfig {
  timeScaleForDemo?: number;
  forceImpactWithinPhase?: boolean;
}
```

### 6.3 视觉层修正

爆炸效果分两层：

- 地理空间层：冲击波圆/半球使用米级半径，跟地理位置绑定。
- 屏幕可见层：火球 billboard 保证可见，但不代表实际杀伤半径。

`ExplosionRenderer` 应接收虚拟时间：

```ts
renderExplosions(explosions: ExplosionRuntimeState[], virtualTimeMs: number): void
```

不再内部使用 `Date.now()` 计算生命周期。

## 7. 虚拟时间统一

### 7.1 保留与禁止

允许：

- `ExecutionEngine` 使用 `performance.now()` 计算真实帧间隔。
- UI 消息 ID、日志创建时间继续用 `Date.now()`。

禁止：

- `MapRenderer`、`ExplosionRenderer`、雷达/干扰/武器尾迹渲染器使用 `Date.now()` 或 `performance.now()` 作为推演视觉时间。
- 视觉效果自行启动独立动画时间线。

### 7.2 统一接口

`ExecutionEngine.runAnimationLoop()` 每帧推进后调用：

```ts
this.renderer.renderRuntimeSnapshot(this.createSnapshot());
```

或分阶段调用：

```ts
this.renderer.updateRuntimeVisuals({
  virtualTimeMs: this.virtualElapsedMs,
  entities: this.entityPositions,
  weapons: weaponEvaluation.weapons,
  sensorEmitters,
  ewEmitters,
  explosions,
});
```

所有扫描进度、脉冲透明度、爆炸生命周期都由 `virtualTimeMs - startTimeMs` 计算。

## 8. 回调与数据流修正

当前 `ExecutionEngine` 使用单回调 setter，后设置会覆盖先设置。建议第一阶段改为多订阅：

```ts
onStatusChange(callback): () => void
onProgressUpdate(callback): () => void
onEventTrigger(callback): () => void
```

过渡期也可以由 `WorkbenchView` 作为唯一桥接层：

```text
ExecutionEngine -> WorkbenchView bridge -> tacticalStore / actionPlanStore / renderer
```

推荐使用多订阅，减少后续模块接入时的隐性覆盖风险。

## 9. 推荐实施顺序

### 阶段 1：建立运行时快照和虚拟时间渲染入口

目标：

- `ExecutionEngine` 输出统一 runtime visual update。
- `MapRenderer` 增加 `updateRuntimeVisuals()`。
- 移除传感器/干扰/爆炸对墙钟时间的依赖。

验收：

- 暂停后扫描、干扰、爆炸视觉停止推进。
- 倍速变化后视觉进度随虚拟时间变化。
- `npm run build` 通过。

### 阶段 2：修正雷达立体波束

目标：

- 让雷达使用运行时实体位置和航向。
- 渲染立体覆盖体和立体扫描束。
- 不再使用平面 polygon 作为主扫描表现。

验收：

- 空中预警机显示 360 度立体搜索覆盖。
- 战斗机显示前向扇区/锥式探测。
- 移动实体时波束跟随实体移动。
- 关闭 `SensorEffects` 后雷达动态扫描消失，但基础覆盖仍可保留。

### 阶段 3：修正电子干扰立体波束

目标：

- 干扰视觉复用 `EmitterVolume`。
- 干扰范围来自 EW 运行时数据。
- 判定和视觉使用同一位置、半径、active 状态。

验收：

- 电子战机显示立体干扰覆盖或指向性干扰束。
- 移动干扰机时干扰覆盖跟随移动。
- 关闭 `ElectronicWarfareEffects` 后干扰动态效果消失。

### 阶段 4：修正爆炸触发和可见性

目标：

- 命中事件在演示时间线内可触发。
- 爆炸位置来自 `WeaponImpactEvent.hitPosition`。
- 爆炸生命周期由虚拟时间驱动。
- 增加地理空间冲击波和屏幕可见火球。

验收：

- 示例 XML 推演中能看到至少一次命中爆炸。
- 暂停时爆炸动画暂停。
- 倍速时爆炸动画按虚拟时间加速/减速。
- 爆炸结束后实体/primitive 被清理。

### 阶段 5：验证与回归

必须执行：

```bash
npm run build
```

建议新增测试：

- 雷达/干扰 emitter 生成测试：运行时位置覆盖静态 `zone.center`。
- 爆炸 descriptor 测试：虚拟时间驱动生命周期。
- 武器命中时间测试：演示配置下命中必须落在阶段内。
- 回调订阅测试：多个订阅者不会互相覆盖。

## 10. 风险与约束

- Cesium 实体动态属性较多时可能有性能风险，第一阶段需要保留 `maxActiveScans`、`maxActivePulses`、`maxActiveExplosions`。
- 立体锥体如果使用 `EllipsoidGraphics` 的 clock/cone 参数，需要验证朝向和 Cesium 坐标系是否符合预期。
- 爆炸地理空间冲击波在高空目标和地面目标的表现不同，需要区分空爆和地爆。
- 示例场景必须服务于验收，不能再出现“配置了爆炸但时间线触发不到”的情况。

