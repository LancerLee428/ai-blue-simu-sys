# 战术验证失败问题分析

> **日期**: 2026-04-17
> **状态**: 待修复
> **影响范围**: AI 方案生成 → 验证环节

## 错误列表

| # | 错误类型 | 错误信息 |
|---|---------|---------|
| 1 | 地域约束 | 蓝方实体 F-2 不能出现在中国陆地或台湾岛 |
| 2 | 地域约束 | 蓝方实体 E-767 不能出现在中国陆地或台湾岛 |
| 3 | 地域约束 | 蓝方实体 雷达站 不能出现在中国陆地或台湾岛 |
| 4 | 地域约束 | 蓝方实体 DDH-142 不能出现在中国陆地或台湾岛 |
| 5 | 攻防逻辑 | 实体 entity-001/002/003 进攻路线没有明确打击目标 |
| 6 | 攻防逻辑 | 实体 entity-005/006 探测范围没有覆盖任何潜在威胁 |

## 根因分析

问题出在**两个层面**：验证器的地域判定逻辑有严重的 bounding box 重叠 bug，以及 AI prompt 约束不够精确，导致 LLM 生成的坐标落入不合理区域。

---

### 问题 1：地域判定 bounding box 重叠（核心 Bug）

**文件**: [`tactical-validator.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/services/tactical-validator.ts#L127-L146)

```
isInMainlandChina: lon 73~135, lat 18~53   ← 巨大的矩形
isInJapan:         lon 129~145, lat 30~46   ← 日本本土
isInTaiwan:        lon 119~122, lat 21~25
```

**严重问题**: 中国大陆的 bounding box `lon 73~135, lat 18~53` 和日本的 `lon 129~145, lat 30~46` 在 **lon 129~135, lat 30~46** 区域严重重叠！

这意味着**九州岛、四国、本州西部**（大约 lon 129~135 之间）会同时被判定为"在中国大陆"和"在日本"。蓝方实体如果部署在这些日本区域，先触发 `isInMainlandChina` 返回 true → 验证报错"不能出现在中国陆地"。

```
         73                        129  135  145
          │       中国 bounding box  │ 重叠 │     │
          │◄────────────────────────►│◄────►│     │
          │                          │     │      │
     lat  │                          │日本 bbox   │
    30-46 │                          │◄──────────►│
```

**验证逻辑的执行顺序**（在 `validateEntityPosition` 中）：

```typescript
// 蓝方验证 (L100-L108)
const inChina = this.isInMainlandChina(longitude, latitude);  // ← 先查中国
const inTaiwan = this.isInTaiwan(longitude, latitude);
if (inChina || inTaiwan) {
  return error; // ← 直接报错，不管它是否也在日本
}
```

所以**即使坐标确实在日本本土，因为重叠区域导致** `isInMainlandChina()` 返回 true，蓝方实体一律报错。

---

### 问题 2：AI 生成的坐标不够精确

**文件**: [`ai-tactical.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/services/ai-tactical.ts#L24-L28)

Prompt 中的地域约束：

```
- 蓝方（日本）只能部署在日本本土（经度129-145，纬度30-46）、
  冲绳群岛（经度127-129，纬度25-27）及其领空
```

LLM（llama-3.3-70b-versatile）生成的日本蓝方实体坐标，很可能落在 lon 129~135 之间（九州、四国等地），这在现实中是正确的日本领土，但在验证器中却被判定为"中国大陆"。

---

### 问题 3：进攻路线终点没有接近敌方实体

**文件**: [`tactical-validator.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/services/tactical-validator.ts#L177-L217)

验证逻辑要求路线终点 50km 内必须有敌方实体。但 AI 生成的路线终点可能是：
- 路线终点是**攻击前的集结/阵位点**，不是目标本身
- AI 没有严格将路线终点设为目标实体的位置
- prompt 中虽然有约束 `进攻路线必须有明确的攻击目标`，但 LLM 不总是遵守

### 问题 4：探测范围未覆盖威胁

**文件**: [`tactical-validator.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/services/tactical-validator.ts#L223-L253)

验证要求探测范围（`radiusMeters`）内必须有至少一个敌方实体。但：
- AI 给出的探测半径可能不够大
- 或者敌方实体的位置太远
- **本质上这是一个 chicken-and-egg 问题**：AI 先生成实体位置，再生成探测范围，两者可能不协调

---

## 涉及文件

| 文件 | 角色 | 核心问题行 |
|------|------|-----------|
| [`tactical-validator.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/services/tactical-validator.ts) | 验证器 | L127-128 中国 bbox 范围过大，与日本重叠 |
| [`ai-tactical.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/services/ai-tactical.ts) | AI Prompt | L24-28 地域约束描述 |
| [`tactical-scenario.ts`](file:///Users/lancer/code/15s/ai-blue-simu-sys/apps/web/src/stores/tactical-scenario.ts) | Store | L119-123 验证失败直接 throw |

## 修复建议

### 修复 1：缩小中国大陆 bounding box，消除重叠

```diff
- return longitude >= 73 && longitude <= 135 && latitude >= 18 && latitude <= 53;
+ // 缩小东边界到 125，避免与日本九州 (lon 129+) 重叠
+ // 同时排除已单独定义的台湾区域
+ return longitude >= 73 && longitude <= 125 && latitude >= 18 && latitude <= 53;
```

或者改用**优先级判定**：先判断是否在日本，再判断中国，日本优先。

### 修复 2：在地域验证中增加"重叠区域日本优先"逻辑

```typescript
// 蓝方验证改为：先查日本，日本内直接通过，再查中国
const inJapan = this.isInJapan(longitude, latitude);
if (inJapan) return null; // 在日本 → 合法

const inChina = this.isInMainlandChina(longitude, latitude);
if (inChina || inTaiwan) return error;
```

### 修复 3：增强 AI prompt，要求路线终点精确对准目标

在 prompt 中补充：
```
- 每条进攻路线的最后一个 waypoint 必须在目标实体位置 30km 以内
- 探测范围半径必须覆盖至少一个敌方实体
```

### 修复 4：验证失败后自动重试 / 降级

在 `tactical-scenario.ts` store 中，验证失败后可调用 `refineScenario` 传入错误信息要求 AI 修正，而不是直接 throw。
