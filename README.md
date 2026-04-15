# AI Blue Simulation System

军事仿真与 AI 战术助手系统

## 系统架构

### 前端 (apps/web)
- **框架**: Vue 3 + Vite
- **3D 渲染**: Cesium
- **构建工具**: Vite 8

### 后端 (apps/server)
- **运行时**: Node.js + tsx
- **端口**: 3000

### 核心包 (packages/)
- `ai-core`: AI 核心逻辑
- `governance`: 治理模块
- `ontology`: 本体定义
- `scenario`: 场景管理
- `situation`: 态势感知
- `shared`: 共享工具

## 快速开始

### 1. 安装依赖
```bash
pnpm install
```

### 2. 配置环境变量
创建 `apps/web/.env.local`:
```env
VITE_GROQ_API_KEY=your_groq_api_key_here
```

> 获取 Groq API Key: https://console.groq.com/keys

### 3. 启动开发服务器
```bash
pnpm dev
```

访问:
- 前端: http://localhost:5173
- 后端: http://localhost:3000

## AI 战术助手功能

### 特性
- 基于 Groq LLM 的智能战术建议生成
- Cesium 3D 地图可视化
- 多阶段执行引擎
- 实时态势分析

### 使用流程
1. 在工作台选择军事场景
2. AI 分析态势并生成战术建议
3. 在 3D 地图上查看可视化结果
4. 执行多阶段作战计划

## 开发命令

```bash
# 开发
pnpm dev                    # 启动所有服务
pnpm dev:web               # 仅启动前端
pnpm dev:server            # 仅启动后端

# 构建
pnpm build                 # 构建所有工作区
pnpm typecheck             # 类型检查
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3, Vite, Cesium, TypeScript |
| 后端 | Node.js, Hono, tsx |
| AI | Groq API |
| 包管理 | pnpm workspaces |

## 项目结构

```
ai-blue-simu-sys/
├── apps/
│   ├── web/              # Vue 3 前端应用
│   └── server/           # Node.js 后端服务
├── packages/
│   ├── ai-core/          # AI 核心逻辑
│   ├── governance/       # 治理模块
│   ├── ontology/         # 军事本体
│   ├── scenario/         # 场景管理
│   ├── situation/        # 态势感知
│   └── shared/           # 共享工具
├── docs/                 # 文档
└── plans/                # 开发计划
```

## 分支说明

- `main`: 主分支
- `feat/ai-assistant`: AI 战术助手功能
- `feature/workbench-redesign`: 工作台重设计

## 许可证

MIT

---

**开发团队**: AI Blue Simulation System Team
