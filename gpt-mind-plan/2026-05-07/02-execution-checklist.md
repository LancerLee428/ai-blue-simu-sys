# 执行清单：统一视觉推演第一阶段

## A. 必修正问题

- [ ] 雷达扫描从平面 polygon 改为立体锥式/扇形体。
- [ ] 干扰效果和雷达探测使用同一套 `EmitterVolume` 抽象。
- [ ] 探测判定距离起点从 `DetectionZone.center` 改为运行时探测平台位置。
- [ ] 干扰判定和干扰视觉使用同一个运行时 jammer 状态。
- [ ] 雷达、干扰、爆炸动画全部使用 `ExecutionEngine` 虚拟时间。
- [ ] 爆炸触发使用 `WeaponImpactEvent.hitPosition`，不再反查 `strike-*` 标记。
- [ ] 示例 XML 或演示配置确保命中发生在阶段内。
- [ ] `ExecutionEngine` 回调机制避免单 setter 覆盖。

## B. 文件影响范围

优先修改：

- `apps/web/src/services/execution-engine.ts`
- `apps/web/src/services/map-renderer.ts`
- `apps/web/src/services/radar-beam-model.ts`
- `apps/web/src/services/electronic-warfare.ts`
- `apps/web/src/services/detection-interaction.ts`
- `apps/web/src/services/explosion-renderer.ts`
- `apps/web/src/services/weapon-system.ts`
- `apps/web/src/types/tactical-scenario.ts`

可能修改：

- `apps/web/src/services/tactical-scenario-normalizer.ts`
- `apps/web/src/services/xml-scenario-parser.ts`
- `apps/web/src/services/xml-scenario-exporter.ts`
- `data-example/东海联合打击-2024-1777165955760.xml`
- `apps/web/src/views/WorkbenchView.vue`
- `apps/web/src/stores/tactical-scenario.ts`

## C. 建议新增测试

- `apps/web/src/services/__tests__/emitter-volume.test.ts`
- `apps/web/src/services/__tests__/detection-interaction.test.ts`
- `apps/web/src/services/__tests__/explosion-renderer.test.ts`
- `apps/web/src/services/__tests__/weapon-system.test.ts`

## D. 验收命令

每次阶段性修改后必须执行：

```bash
npm run build
```

涉及 XML 示例时补充：

```bash
xmllint --noout data-example/东海联合打击-2024-1777165955760.xml
```

涉及专项服务时补充对应测试：

```bash
npx tsx --test apps/web/src/services/__tests__/<test-file>.test.ts
```

## E. 人工验收场景

- 导入示例 XML，点击推演播放。
- 雷达波束应为立体覆盖/扫描，不是地面平面扇形。
- 电子战机应出现和雷达一致语义的立体干扰覆盖或指向干扰。
- 暂停推演后，雷达扫描、干扰脉冲、爆炸动画都停止推进。
- 调整倍速后，视觉效果随推演虚拟时间加速或减速。
- 至少一次武器命中在阶段内发生，并能看到爆炸。
- 爆炸位置应在命中点，不应依赖打击任务标记位置。

