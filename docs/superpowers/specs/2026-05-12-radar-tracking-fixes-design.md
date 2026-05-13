# 雷达动态跟踪与视角修复设计

## 变更范围

### 1. 想定 XML（东海联合打击-2024-1777165955760.xml）

**雷达精简：**
- 只保留 `red-g01-radar-01` 和 `red-g03-radar-01` 两部雷达
- 删除其余 10 部红方雷达实体（red-g01-radar-02/03、red-g03-radar-02/03、red-g05-radar-01/02/03、red-g07-radar-01/02/03）
- 删除对应的所有 `DetectionZone` 条目
- 清理编组 `<Member>` 中对应的引用

**DetectionZone 半径：**
- 两部保留雷达的 `radiusMeters` 改为 350000（350km）

**导弹初始高度：**
- 蓝方 7 枚导弹（blue-g01-missile1-01、blue-g01-missile2-01/02、blue-g02-missile3-01/02/03/04）
- 初始高度 600m → 200m（降为 1/3）
- 弧顶高度随之从 ~1800m 降至 ~1400m（sm-6 为 sam-medium 类型，弧顶有 1200m 硬下限）

### 2. execution-engine.ts

**修复1 — createSensorEmitters() 提前 return：**
- 当前：遇到第一个有目标的雷达就 return，只有一个雷达产生追踪波束
- 修复：收集所有雷达的追踪波束，最后统一截取 maxScans 条返回

**修复2 — 干扰波束追踪目标类型：**
- 当前：selectElectronicWarfareTargets 追踪 enemy-radar，蓝方无雷达，干扰波束无目标
- 修复：createEWEmitters() 中将追踪目标类型覆盖为 enemy-aircraft 和 enemy-missile

### 3. map-renderer.ts

**修复3 — flyToScenario 视角高度上限：**
- 当前：range 无上限，红方雷达（87°E）与蓝方（104°E）跨度大，飞行高度超过 3000km
- 修复：range 加 Math.min(range, 2_500_000) 上限（2500km）
