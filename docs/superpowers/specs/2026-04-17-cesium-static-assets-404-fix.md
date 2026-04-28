# Cesium 静态资源 404 问题修复

> **日期**: 2026-04-17
> **状态**: 已修复
> **影响范围**: `apps/web` 地图模块

## 问题现象

浏览器控制台报错:

```
Uncaught (in promise) SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON
```

具体表现为:
- `ApproximateTerrainHeights.initialize` 请求 JSON 失败
- `Iau2006XysData.computeXysRadians` 请求 XYS 数据失败
- `/cesium/Workers/createVerticesFromHeightmap.js` 返回 `text/html` MIME type
- `/cesium/Workers/transferTypedArrayTest.js` 返回 `text/html` MIME type
- Globe 渲染失败: `InvalidStateError: The source image could not be decoded`

## 根因分析

### 核心问题

`vite-plugin-cesium` 使用**相对路径**定位 Cesium 的 Build 产物，但在 monorepo 结构中路径不匹配。

### 路径链路

```
vite-plugin-cesium 默认配置:
  cesiumBuildRootPath = "node_modules/cesium/Build"

Vite dev server 工作目录:
  /Users/lancer/code/15s/ai-blue-simu-sys/apps/web/

插件实际查找路径 (不存在):
  apps/web/node_modules/cesium/Build/CesiumUnminified/
  ❌ apps/web/node_modules/cesium 不存在

cesium 实际安装位置 (根目录):
  node_modules/cesium/Build/CesiumUnminified/
  ✅ 存在
```

### 依赖安装位置

| 包 | 声明位置 | 实际安装位置 |
|---|---|---|
| `cesium` | 根 `package.json` (implicit, via `vite-plugin-cesium`) | `node_modules/cesium/` |
| `vite-plugin-cesium` | 根 `package.json` devDependencies | `node_modules/vite-plugin-cesium/` |

由于 `cesium` 和 `vite-plugin-cesium` 都在根 `package.json` 中声明，pnpm/npm workspace 将它们安装在 monorepo 根目录的 `node_modules/` 下，而不是 `apps/web/node_modules/` 下。

### Fallback 机制导致 HTML 返回

当 `vite-plugin-cesium` 的 `serve-static` middleware 找不到文件时，请求会穿透到 Vite 的 SPA fallback，返回 `index.html`。Cesium 拿到 HTML 后尝试 `JSON.parse()` 就会触发上述报错。

## 修复方案

在 `apps/web/vite.config.ts` 中显式指定相对于 `apps/web/` 的正确路径:

```diff
- plugins: [vue(), cesium()],
+ plugins: [
+   vue(),
+   cesium({
+     cesiumBuildRootPath: '../../node_modules/cesium/Build',
+     cesiumBuildPath: '../../node_modules/cesium/Build/Cesium/',
+   }),
+ ],
```

### 涉及文件

- `apps/web/vite.config.ts` — 修改 cesium 插件配置

## 经验总结

在 monorepo 项目中使用 `vite-plugin-cesium` 时，如果 `cesium` 包没有安装在 Vite 应用的直接 `node_modules` 下（而是被 hoist 到根目录），必须通过 `cesiumBuildRootPath` 和 `cesiumBuildPath` 显式指定路径。
