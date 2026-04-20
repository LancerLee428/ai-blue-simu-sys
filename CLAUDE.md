# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AI Blue Simulation System - 军事仿真与 AI 战术助手系统。基于 pnpm workspaces 的 monorepo 架构,包含 Vue 3 前端、Node.js 后端和多个共享包。

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev                    # 同时启动前端和后端
pnpm dev:web               # 仅启动前端 (http://localhost:5173)
pnpm dev:server            # 仅启动后端 (http://localhost:3000)

# 构建和类型检查
pnpm build                 # 构建所有工作区
pnpm typecheck             # 类型检查所有工作区
```

### 单独运行工作区

```bash
# 前端 (apps/web)
cd apps/web
npm run dev                # 开发服务器
npm run build              # 生产构建
npm run typecheck          # TypeScript 类型检查

# 后端 (apps/server)
cd apps/server
npm run dev                # 使用 tsx watch 启动
npm run build              # TypeScript 编译
npm run typecheck          # 类型检查
```

## 架构说明

### Monorepo 结构

- **apps/web**: Vue 3 + Vite 前端应用
  - 使用 Cesium 进行 3D 地图渲染
  - Pinia 状态管理
  - Vue Router 路由
  - 端口: 5173

- **apps/server**: Node.js 后端服务
  - 原生 HTTP 服务器 (无框架)
  - 端口: 3000
  - 提供平台骨架、AI 助手和场景管理 API

- **packages/**: 共享包
  - `ai-core`: AI 核心类型定义 (DeploymentIntent, DeploymentDraft 等)
  - `scenario`: 场景工作区状态管理
  - `situation`: 态势感知和工作台部署点
  - `ontology`: 军事本体定义
  - `governance`: 治理模块
  - `shared`: 共享工具和类型

### 前端架构

**核心服务** (apps/web/src/services/):
- `ai-tactical.ts`: AI 战术方案生成服务,使用 Groq API (deepseek-v3-0324 模型)
- `route-generator.ts`: 路线生成器,根据 RouteIntent 生成实际航路点
- `detection-resolver.ts`: 探测范围解析器,自动分配雷达/声呐探测半径
- `execution-engine.ts`: 多阶段执行引擎
- `cesium-graphics.ts`: Cesium 图形渲染封装
- `map-renderer.ts`: 地图渲染器,整合实体、路线、探测范围、轨道线可视化
- `tactical-validator.ts`: 战术方案验证器
- `xml-scenario-parser.ts`: XML 想定文件解析器
- `xml-scenario-exporter.ts`: XML 想定文件导出器
- `orbit-calculator.ts`: 卫星轨道计算器 (Keplerian → Geodetic 转换)

**状态管理** (apps/web/src/stores/):
- `platform.ts`: 平台骨架状态 (模块、场景、AI 草案)
- `tactical-scenario.ts`: 战术想定状态 (forces, phases, routes, detectionZones)
- `action-plan.ts`: 行动计划状态

**API 代理配置** (vite.config.ts):
- `/api/llm/*` → `https://api.apimart.ai/v1` (Groq API 代理)
- `/api/*` → `http://localhost:3000` (后端 API)

### 后端架构

**模块系统** (apps/server/src/modules/):
- `ontology.ts`: 本体模块
- `scenario-workspace.ts`: 场景工作区管理
- `situation-workbench.ts`: 态势工作台
- `ai-assistant.ts`: AI 助手 (部署草案生成、确认、拒绝)
- `governance.ts`: 治理模块

**API 端点**:
- `GET /api/health`: 健康检查
- `GET /api/platform-skeleton`: 获取平台骨架
- `POST /api/ai/deployment-draft`: 生成部署草案
- `POST /api/ai/deployment-confirm`: 确认部署草案
- `POST /api/ai/deployment-reject`: 拒绝部署草案
- `POST /api/scenario/confirm`: 确认场景部署
- `POST /api/scenario/undo-confirm`: 撤销场景确认

### AI 战术助手工作流

1. 用户输入战术意图 → `AiTacticalService.generateScenario()`
2. AI 返回包含 `routeIntents` 和 `detectionIntents` 的声明式方案
3. 后处理:
   - `RouteGenerator` 将 routeIntents 转换为实际路线 (插值航路点)
   - `DetectionResolver` 将 detectionIntents 转换为探测范围 (分配半径)
   - 自动补全高度 (根据 PLATFORM_META.defaultAltitude)
4. 前端渲染到 Cesium 地图

### XML 想定导入/导出

系统支持标准 XML 想定文件的导入和导出:

**导入流程**:
1. AI 助手面板点击"📥 导入 XML"上传 .xml/.txt 文件
2. `XmlScenarioParser` 解析 7 大模块:
   - Metadata: 想定元数据 (名称、版本、作者等)
   - SimulationParameters: 仿真参数 (开始/结束时间)
   - Participating/Supporting: 被试/陪试装备 (含组件配置、初始状态)
   - Tasks: 任务树 (BehaviorTree/StateMachine/InstructionSeq)
   - Environment: 环境模型 (空间环境、大气模型、效应模型、事件)
   - Interactions: 交互关系 (编组、指挥控制、通信、探测链路)
3. 自动渲染到地图,生成行动计划

**导出流程**:
1. 点击"📤 导出 XML"将当前想定导出为标准 XML 格式
2. `XmlScenarioExporter` 按原始结构重建 7 大模块
3. 保留所有组件配置、任务树、环境和交互关系

**轨道计算**:
- `orbit-calculator.ts` 实现 Keplerian 轨道根数 → 地理坐标转换
- 支持卫星等空间装备的轨道位置计算和轨道线渲染
- 使用 IAU 1982 GMST 公式进行 ECI → ECEF 坐标转换
- 自动生成 180 点轨道线用于 Cesium 可视化

## 环境变量

创建 `apps/web/.env.local`:
```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

获取 API Key: https://console.groq.com/keys

## 技术栈

- **前端**: Vue 3, Vite 8, Cesium, Pinia, Vue Router, TypeScript 6
- **后端**: Node.js, tsx, TypeScript 6
- **AI**: Groq API (deepseek-v3-0324)
- **包管理**: pnpm workspaces

## 开发注意事项

- 使用 pnpm 而非 npm/yarn
- 所有包使用 TypeScript 6
- 前端使用 `vite-plugin-cesium` 处理 Cesium 静态资源
- 后端使用 `tsx watch` 实现热重载
- AI 服务通过 Vite 代理访问,避免 CORS 问题
