# Claude Code 项目规范

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
- 立即同步：用户操作（播放/暂停/倍速）
- 节流同步：高频更新（时间、进度、位置）

## 数据流规范

### 单向数据流
- 保持清晰的单向数据流：数据源 → 桥接层 → 状态管理 → UI
- 避免双向绑定导致的状态混乱
- 状态变化必须有明确的触发源和传播路径

### 状态同步模式
```
用户操作 → ExecutionEngine → WorkbenchView (桥接) → ActionPlanStore → UI 组件
```

- 引擎状态变化通过回调机制同步到 Store
- 立即同步：状态变化（play/pause/stop）、用户操作（倍速切换）
- 节流同步：高频更新（currentTime、progress）

## 项目架构

### 核心服务
- **ExecutionEngine** (`execution-engine.ts`): 推演引擎，负责动画循环、状态管理、实体位置更新
- **MapRenderer** (`map-renderer.ts`): 地图渲染器，负责 Cesium 可视化
- **ActionPlanStore** (`action-plan.ts`): 行动方案状态管理
- **TacticalScenarioStore** (`tactical-scenario.ts`): 战术场景状态管理

### 关键设计模式
1. **回调机制**: ExecutionEngine 通过回调通知状态变化
   - `setOnStatusChange`: 状态变化（idle/running/paused/completed）
   - `setOnProgressUpdate`: 进度更新（节流 100ms）
   - `setOnPhaseComplete`: 阶段完成
   - `setOnEventTrigger`: 事件触发

2. **桥接模式**: WorkbenchView 作为桥接层连接 Engine 和 Store
   - 监听 Engine 回调
   - 同步状态到 Store
   - 保持单向数据流

3. **RAF 动画循环**: 所有动画在 `runAnimationLoop()` 中统一处理
   - 计算虚拟时间：`virtualElapsedMs += realDeltaMs * speed`
   - 更新实体位置
   - 节流触发进度回调

## 技术栈
- Vue 3 + TypeScript
- Cesium (3D 地图引擎)
- Pinia (状态管理)
- Vite (构建工具)

## 开发约束
- 不创建不必要的文件（如 README、文档）
- 优先编辑现有文件而非创建新文件
- 不添加未要求的功能或"改进"
- 不为假设的未来需求设计抽象
- 三行相似代码优于过早抽象
