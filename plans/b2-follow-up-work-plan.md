# B2 Follow-up Work Plan

## Goal
在当前“生成草案 → 确认写回”闭环基础上，补齐更接近真实业务的人机协同能力，包括重生成、拒绝、撤销确认与版本推进。

## Scope

### 1. 草案重生成
- [x] 在 `AI Assistant` 中增加“重生成草案”动作
- [x] 保留上一次草案摘要与对象列表，支持对比
- [x] 后端为草案生成增加请求上下文标识，避免前端误覆盖旧结果

### 2. 草案拒绝
- [x] 增加“拒绝草案”动作
- [x] 拒绝后将当前草案状态标记为 `rejected`
- [x] 前端展示拒绝原因输入框与拒绝后的状态提示

### 3. 撤销确认
- [x] 在 `Scenario Workspace` 中支持撤销最近一次确认写回
- [x] 撤销后恢复到确认前的想定版本与对象状态
- [x] `Situation Workbench` 同步回滚部署点位

### 4. 版本推进历史
- [x] 为想定工作空间增加版本历史记录
- [x] 至少记录：版本号、动作类型、时间、对象数量变化
- [x] 前端增加一个最小版本历史列表

## Delivered
- `AI Assistant` 已支持生成、重生成、拒绝、确认、撤销确认
- `server` 已支持草案拒绝接口与撤销确认接口
- `Scenario Workspace` 已维护内存态版本历史与最近拒绝原因
- `Situation Workbench` 已随确认/撤销同步更新

## Verification
- [x] `npm run build`
- [x] 本地联调可覆盖 AI Assistant 中 4 类动作的状态流转
- [x] `Scenario Workspace` 与 `Situation Workbench` 联动已在实现中打通

## Notes
- 当前阶段优先保持最小实现，不引入数据库
- 版本历史当前放在 server 内存态，后续再迁移到持久化存储
