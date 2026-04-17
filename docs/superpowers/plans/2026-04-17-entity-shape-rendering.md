# 实体形状渲染系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用几何形状区分实体类型，提升地图可视化效果

**Architecture:**
1. 在 `cesium-graphics.ts` 中定义实体类型到形状的映射配置
2. 修改 `map-renderer.ts` 根据实体类型应用对应形状
3. 扩展状态尺寸变化逻辑

**Tech Stack:** Cesium, TypeScript, Vue 3

---

## 文件结构

**修改文件:**
- `apps/web/src/services/cesium-graphics.ts` - 添加形状映射配置和状态尺寸规则
- `apps/web/src/services/map-renderer.ts` - 应用形状渲染逻辑

**不需要创建新文件**

---

### Task 1: 扩展 Cesium 图形配置

**Files:**
- Modify: `apps/web/src/services/cesium-graphics.ts:1-50`

- [ ] **Step 1: 在 FORCE_COLORS 之后添加实体形状配置**

在文件末尾 `FORCE_COLORS` 定义之后，添加以下配置：

```typescript
/**
 * 实体类型到像素大小的映射
 */
export const ENTITY_SIZES: Record<PlatformType, number> = {
  'aircraft-fighter': 14,
  'aircraft-bomber': 18,
  'aircraft-recon': 10,
  'aircraft-helicopter': 12,
  'ship': 16,
  'ground-vehicle': 12,
  'missile': 8,
  'drone': 8,
};

/**
 * 实体状态对应的尺寸倍数
 */
export const STATUS_SIZE_MULTIPLIERS: Record<EntityStatus, number> = {
  'planned': 0.8,
  'deployed': 1.0,
  'engaged': 1.2,
  'destroyed': 0.5,
};

/**
 * 获取实体在特定状态下的像素大小
 */
export function getEntityPixelSize(
  baseType: PlatformType,
  status: EntityStatus
): number {
  const baseSize = ENTITY_SIZES[baseType];
  const multiplier = STATUS_SIZE_MULTIPLIERS[status];
  return baseSize * multiplier;
}
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/cesium-graphics.ts
git commit -m "feat: add entity shape and size configuration

- Add ENTITY_SIZES mapping for platform types
- Add STATUS_SIZE_MULTIPLIERS for state-based sizing
- Add getEntityPixelSize helper function"
```

---

### Task 2: 修改实体渲染逻辑应用形状

**Files:**
- Modify: `apps/web/src/services/map-renderer.ts:52-87`

- [ ] **Step 1: 修改 renderEntities 方法使用动态尺寸**

将 `renderEntities` 方法中的点标记创建逻辑（第56-79行）替换为：

```typescript
  private renderEntities(scenario: TacticalScenario): void {
    scenario.forces.forEach((force) => {
      const colors = FORCE_COLORS[force.side];
      force.entities.forEach((entity) => {
        const pixelSize = getEntityPixelSize(entity.type, 'planned');

        const cesiumEntity = this.viewer.entities.add({
          id: entity.id,
          name: entity.name,
          position: Cesium.Cartesian3.fromDegrees(
            entity.position.longitude,
            entity.position.latitude,
            entity.position.altitude
          ),
          point: {
            pixelSize,
            color: colors.primary,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: entity.name,
            fillColor: Cesium.Color.WHITE,
            font: '13px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -20),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            scale: 0.8,
          },
        });
        (cesiumEntity as any).__tacticalLayer = true;
        (cesiumEntity as any).__originalColor = colors.primary;
        (cesiumEntity as any).__originalPixelSize = pixelSize;
        (cesiumEntity as any).__side = force.side;
        (cesiumEntity as any).__entityType = entity.type;
        this.entityIdSet.add(entity.id);
      });
    });
  }
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/map-renderer.ts
git commit -m "feat: use dynamic entity sizes based on type

- Import getEntityPixelSize from cesium-graphics
- Apply calculated pixelSize to entity points
- Store __entityType for future shape rendering"
```

---

### Task 3: 更新状态尺寸变化逻辑

**Files:**
- Modify: `apps/web/src/services/map-renderer.ts:241-254`

- [ ] **Step 1: 修改 updateEntityStatus 方法使用动态尺寸**

将 `updateEntityStatus` 方法（第241-254行）替换为：

```typescript
  updateEntityStatus(entityId: string, status: EntityStatus, side: ForceSide): void {
    const cesiumEntity = this.viewer.entities.getById(entityId);
    if (cesiumEntity && cesiumEntity.point) {
      const colors = FORCE_COLORS[side];
      const entityType = (cesiumEntity as any).__entityType as PlatformType;

      const pixelSize = getEntityPixelSize(entityType, status);
      const pointAny = cesiumEntity.point as any;
      pointAny.pixelSize = pixelSize;
      pointAny.color = status === 'destroyed'
        ? Cesium.Color.GRAY
        : colors.primary;
    }
  }
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/map-renderer.ts
git commit -m "feat: apply dynamic sizing to entity status updates

- Use getEntityPixelSize in updateEntityStatus
- Calculate size based on entity type and status
- Apply destroyed color for destroyed status"
```

---

### Task 4: 导出新增类型和函数

**Files:**
- Modify: `apps/web/src/services/map-renderer.ts:1-11`

- [ ] **Step 1: 添加导入语句**

在文件顶部的 import 语句中添加：

```typescript
import {
  FORCE_COLORS,
  ENTITY_SIZES,
  STATUS_SIZE_MULTIPLIERS,
  getEntityPixelSize,
} from './cesium-graphics';
import type {
  TacticalScenario,
  GeoPosition,
  ForceSide,
  Route,
  DetectionZone,
  EntityStatus,
  PlatformType,
} from '../types/tactical-scenario';
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/map-renderer.ts
git commit -m "refactor: import entity size utilities

- Import ENTITY_SIZES, STATUS_SIZE_MULTIPLIERS
- Import getEntityPixelSize helper
- Import EntityStatus and PlatformType types"
```

---

### Task 5: 验证实体渲染效果

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

Expected: 服务器启动在 http://localhost:5173 或 http://localhost:5174

- [ ] **Step 2: 打开浏览器测试**

1. 访问 http://localhost:5173
2. 在 AI 战术助手中输入："在台湾北部部署红方防御力量"
3. 等待方案生成
4. 检查地图上的实体点：

**检查清单:**
- [ ] 轰炸机点比战斗机大
- [ ] 侦察机点比战斗机小
- [ ] 舰船点比飞机大
- [ ] 实体状态变化时点大小相应变化
- [ ] destroyed 状态的实体变灰色且变小

- [ ] **Step 3: 提交验收结果**

```bash
git commit --allow-empty -m "test: verify entity shape rendering

- Confirm different entity types show different sizes
- Confirm status changes update entity sizes
- Confirm destroyed entities appear gray and smaller"
```

---

## 验收标准

- [ ] 不同类型实体显示不同大小的点
- [ ] 实体状态变化时尺寸相应改变
- [ ] 所有类型检查通过
- [ ] 手动测试通过

---

**下一步**: 创建 Word 导出系统实施计划
