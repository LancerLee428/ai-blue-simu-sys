# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发命令

### 构建与类型检查
```bash
npm run build          # 构建所有工作区（包含类型检查）
npm run typecheck      # 仅执行类型检查
```

### 开发服务器
```bash
npm run dev            # 启动前端和后端（并行）
npm run dev:web        # 仅启动前端 (http://localhost:5173)
npm run dev:server     # 仅启动后端 (http://localhost:3000)
```

### 前端开发
```bash
cd apps/web
npm run dev            # 启动 Vite 开发服务器
npm run build          # 构建前端（包含类型检查）
npm run typecheck      # 类型检查
```

### 后端开发
```bash
cd apps/server
npm run dev            # 使用 tsx watch 启动后端
npm run build          # 构建后端
```

## 代码交付规范

### 构建验证（强制要求）
- **所有代码变更必须先执行 `npm run build` 验证无误后再交付**
- 构建失败时必须修复所有错误后才能交付
- 不允许交付包含构建错误、类型错误、语法错误的代码
- 交付前必须确保代码可以立即运行，无需用户手动修复

### 代码质量
- 修复所有语法错误、类型错误、重复声明等问题
- 避免引入安全漏洞（命令注入、XSS、SQL 注入等）
- 只修改必要的代码，不添加未要求的功能或重构
- 不添加不必要的注释、文档字符串或类型注解

## 项目架构

### Monorepo 结构
- **包管理器**: pnpm workspaces
- **构建工具**: Vite 8 (前端), tsx (后端)
- **类型系统**: TypeScript 6.0.2

### 工作区
```
apps/
├── web/              # Vue 3 前端应用
│   ├── src/
│   │   ├── services/        # 核心服务层
│   │   ├── stores/          # Pinia 状态管理
│   │   ├── components/      # Vue 组件
│   │   └── views/           # 页面视图
│   └── vite.config.ts
└── server/           # Node.js 后端服务

packages/
├── ai-core/          # AI 核心逻辑
├── governance/       # 治理模块
├── ontology/         # 军事本体定义
├── scenario/         # 场景管理
├── situation/        # 态势感知
└── shared/           # 共享工具
```

### 核心服务层

#### ExecutionEngine (`apps/web/src/services/execution-engine.ts`)
推演引擎，负责战术场景的时间推进和实体状态更新。

**核心职责**:
- 使用 `requestAnimationFrame` 驱动动画循环
- 管理虚拟时间和倍速控制
- 计算实体位置插值（基于 Phase 和 Route）
- 触发战术事件和阶段完成回调

**关键方法**:
- `load(scenario)`: 加载战术场景
- `play()` / `pause()` / `stop()`: 控制推演状态
- `setSpeed(speed)`: 设置倍速（0.1-20x）
- `runAnimationLoop()`: RAF 动画循环主函数

**回调机制**:
- `setOnStatusChange`: 状态变化（idle/running/paused/completed）
- `setOnProgressUpdate`: 进度更新（节流 100ms）
- `setOnPhaseComplete`: 阶段完成
- `setOnEventTrigger`: 事件触发

#### MapRenderer (`apps/web/src/services/map-renderer.ts`)
Cesium 地图渲染引擎，负责将战术场景可视化。

**核心职责**:
- 渲染实体（使用自定义图标或 3D 模型）
- 渲染路线（虚线 + 箭头）
- 渲染探测区域（半透明圆形）
- AI 决策可视化（路线风险分析）
- 运行态特效：武器飞行轨迹、雷达扫描波束、电子干扰波束、爆炸粒子效果

**关键方法**:
- `renderScenario(scenario)`: 渲染完整场景
- `updateEntityPosition(entityId, position)`: 更新实体位置
- `updateRuntimeVisuals(update)`: 更新运行态视觉（武器、爆炸、雷达等）
- `setRuntimeVisualDebugOptions(options)`: 设置调试可见性开关
- `setOnRouteClick(callback)`: 设置路线点击回调

#### WeaponSystem (`apps/web/src/services/weapon-system.ts`)
武器系统，负责计算武器发射、飞行和命中事件。

**关键设计**:
- `estimateImpactTimeMs()` 使用实体**初始位置**计算命中时间，确保 `impactTimeMs` 是固定值，不随实体移动而变化。若改为当前位置，`impactTimeMs` 每帧变化速度会超过 `currentTimeMs` 增长速度，导致命中条件 `previousTimeMs < impactTimeMs` 永远不成立，爆炸无法触发。
- `evaluatePhase()` 里武器飞行轨迹插值仍使用当前位置（动态），与命中时间计算分离。

#### ExplosionRenderer (`apps/web/src/services/explosion-renderer.ts`)
爆炸粒子效果渲染器，使用 Cesium `ParticleSystem`。

**关键依赖**:
- Cesium `ParticleSystem` 依赖 `viewer.clock` tick 来推进粒子时间。时钟不 tick，粒子不发射。
- 必须在 `useCesium.ts` 里设置 `clock.shouldAnimate = true`、`clock.canAnimate = true`、`clock.clockRange = UNBOUNDED`，并在 `scene.preRender` 里强制保持时钟运行（防止 Cesium 内部逻辑停止时钟）。

#### 状态管理 (Pinia Stores)

**ActionPlanStore** (`apps/web/src/stores/action-plan.ts`):
- 管理行动方案列表
- 存储执行状态（status, currentTime, speed, currentPhaseIndex）
- 提供方案 CRUD 操作

**TacticalScenarioStore** (`apps/web/src/stores/tactical-scenario.ts`):
- 管理战术场景数据
- 处理场景导入/导出（XML 格式）

**PlatformStore** (`apps/web/src/stores/platform.ts`):
- 管理平台级状态

### 数据流架构

#### 单向数据流
```
用户操作 → ExecutionEngine → WorkbenchView (桥接) → ActionPlanStore → UI 组件
```

**桥接模式** (`apps/web/src/views/WorkbenchView.vue`):
- WorkbenchView 作为桥接层连接 ExecutionEngine 和 Store
- 监听 Engine 回调，同步状态到 Store
- 保持单向数据流，避免状态混乱

**同步策略**:
- **立即同步**: 状态变化（play/pause/stop）、用户操作（倍速切换）
- **节流同步**: 高频更新（currentTime、progress、实体位置）

## 性能优化规范

### 动画和定时任务（强制要求）
- **禁止使用 `setTimeout`、`setInterval` 等定时器**
- **所有动画变更统一使用 `requestAnimationFrame` (RAF)**
- 需要节流的操作在 RAF 循环中实现节流逻辑（如每 100ms 更新一次）
- 避免在动画循环中执行高开销操作

### 状态更新优化
- 避免高频率的状态更新（如每帧更新 Store）
- 使用节流机制降低更新频率（推荐 100ms）
- 批量更新状态，避免多次触发响应式更新

### RAF 动画循环实现
```typescript
// ExecutionEngine.runAnimationLoop()
const now = performance.now();
const realDeltaMs = now - this.lastRealTime;
this.lastRealTime = now;

// 计算虚拟时间
this.virtualElapsedMs += realDeltaMs * this.speed;

// 更新实体位置
this.updateEntityPositions();

// 节流触发进度回调（每 100ms）
if (now - this.lastProgressUpdateTime >= this.PROGRESS_UPDATE_INTERVAL) {
  this.notifyProgressUpdate();
  this.lastProgressUpdateTime = now;
}
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Vue 3.5.32 + TypeScript 6.0.2 |
| 3D 渲染 | Cesium 1.140.0 |
| 状态管理 | Pinia 3.0.4 |
| 路由 | Vue Router 5.0.4 |
| 构建工具 | Vite 8.0.8 |
| 后端运行时 | Node.js + tsx 4.21.0 |
| AI 服务 | Groq API (通过 apimart.ai 代理) |

## 环境配置

### 前端环境变量 (`apps/web/.env.local`)
```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

### API 代理配置
- `/api/llm` → `https://api.apimart.ai/v1` (Groq API 代理)
- `/api` → `http://localhost:3000` (本地后端)

## 开发约束
- 不创建不必要的文件（如 README、文档）
- 优先编辑现有文件而非创建新文件
- 不添加未要求的功能或"改进"
- 不为假设的未来需求设计抽象
- 三行相似代码优于过早抽象
