# Word 导出系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将战术方案导出为专业格式的 Word 文档

**Architecture:**
1. 使用 `docx` 库生成 Word 文档
2. 在 AIAssistantPanel 添加导出按钮
3. Store 中添加导出方法

**Tech Stack:** docx (npm), TypeScript, Vue 3, Pinia

---

## 文件结构

**创建文件:**
- `apps/web/src/services/word-exporter.ts` - Word 文档生成逻辑

**修改文件:**
- `apps/web/src/stores/tactical-scenario.ts` - 添加导出方法
- `apps/web/src/components/ai-assistant/AIAssistantPanel.vue` - 添加导出按钮

---

### Task 1: 安装 docx 依赖

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: 安装 docx 库**

```bash
npm install docx --save
```

Expected: 输出显示 docx@版本号安装成功

- [ ] **Step 2: 验证安装**

```bash
grep -A2 '"docx"' package.json
```

Expected: 显示 `"docx": "版本号"`

- [ ] **Step 3: 提交依赖变更**

```bash
git add package.json package-lock.json
git commit -m "chore: add docx dependency for Word export"
```

---

### Task 2: 创建 Word 导出服务

**Files:**
- Create: `apps/web/src/services/word-exporter.ts`

- [ ] **Step 1: 创建 WordExporter 类**

```typescript
// apps/web/src/services/word-exporter.ts
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import type { TacticalScenario } from '../types/tactical-scenario';

/**
 * Word 文档导出服务
 */
export class WordExporter {
  /**
   * 导出战术方案为 Word 文档
   */
  async exportToWord(scenario: TacticalScenario, thinkingChain: string): Promise<void> {
    const children = [
      ...this.createTitle(),
      ...this.createOverview(scenario),
      ...this.createThinkingChain(thinkingChain),
      ...this.createForces(scenario),
      ...this.createPhases(scenario),
      ...this.createRoutes(scenario),
      ...this.createDetectionZones(scenario),
      ...this.createStrikeTasks(scenario),
      ...this.createMetadata(scenario),
    ];

    const doc = new Document({
      sections: [{
        properties: {},
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const fileName = `作战方案_${scenario.id}_${new Date().toISOString().slice(0, 10)}.docx`;
    saveAs(blob, fileName);
  }

  /**
   * 创建标题
   */
  private createTitle(): Paragraph[] {
    return [
      new Paragraph({
        text: '作战方案',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    ];
  }

  /**
   * 创建方案概述
   */
  private createOverview(scenario: TacticalScenario): Paragraph[] {
    return [
      new Paragraph({
        text: '方案概述',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: scenario.summary,
            size: 24,
          }),
        ],
        spacing: { after: 300 },
      }),
    ];
  }

  /**
   * 创建战术分析（思维链）
   */
  private createThinkingChain(thinkingChain: string): Paragraph[] {
    const analysisText = thinkingChain || '（无战术分析）';

    return [
      new Paragraph({
        text: '战术分析',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: analysisText,
            size: 24,
          }),
        ],
        spacing: { after: 300 },
      }),
    ];
  }

  /**
   * 创建兵力编成表格
   */
  private createForces(scenario: TacticalScenario): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: '兵力编成',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
    ];

    for (const force of scenario.forces) {
      const sideName = force.side === 'red' ? '红方（中国）' : '蓝方（日本）';

      paragraphs.push(
        new Paragraph({
          text: sideName,
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );

      // 创建表格
      const tableRows: TableRow[] = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('实体名称')] }),
            new TableCell({ children: [new Paragraph('类型')] }),
            new TableCell({ children: [new Paragraph('初始位置')] }),
            new TableCell({ children: [new Paragraph('状态')] }),
          ],
          tableHeader: true,
        }),
      ];

      for (const entity of force.entities) {
        const pos = `${entity.position.latitude.toFixed(2)}°N, ${entity.position.longitude.toFixed(2)}°E, ${entity.position.altitude}m`;

        tableRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(entity.name)] }),
              new TableCell({ children: [new Paragraph(entity.type)] }),
              new TableCell({ children: [new Paragraph(pos)] }),
              new TableCell({ children: [new Paragraph('planned')] }),
            ],
          })
        );
      }

      paragraphs.push(
        new Paragraph({
          children: [
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    paragraphs.push(new Paragraph({ text: '', spacing: { after: 300 } }));

    return paragraphs;
  }

  /**
   * 创建阶段划分
   */
  private createPhases(scenario: TacticalScenario): Paragraph[] {
    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: '阶段划分',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
    ];

    for (const phase of scenario.phases) {
      paragraphs.push(
        new Paragraph({
          text: `阶段 ${scenario.phases.indexOf(phase) + 1}: ${phase.name}`,
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: `时间: T+00:00 ~ T+${Math.floor(phase.duration)}秒`,
              bold: true,
            }),
          ],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `描述: ${phase.description}`, size: 24 })],
          spacing: { after: 200 },
        })
      );

      // 关键事件
      if (phase.events.length > 0) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: '关键事件:', bold: true, size: 24 })],
            spacing: { before: 100, after: 100 },
          })
        );

        for (const event of phase.events) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `- T+${event.timestamp}秒: ${event.detail}`,
                  size: 24,
                }),
              ],
              spacing: { after: 100 },
            })
          );
        }
      }

      paragraphs.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    }

    return paragraphs;
  }

  /**
   * 创建进攻路线
   */
  private createRoutes(scenario: TacticalScenario): Paragraph[] {
    if (scenario.routes.length === 0) {
      return [];
    }

    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: '进攻路线',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
    ];

    for (const route of scenario.routes) {
      const pointsStr = route.points
        .map(
          (p) =>
            `(${p.position.latitude.toFixed(2)}°N, ${p.position.longitude.toFixed(2)}°E, ${p.position.altitude}m)`
        )
        .join(' → ');

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${route.entityId}: ${pointsStr}`,
              size: 24,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    return paragraphs;
  }

  /**
   * 创建探测范围
   */
  private createDetectionZones(scenario: TacticalScenario): Paragraph[] {
    if (scenario.detectionZones.length === 0) {
      return [];
    }

    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: '探测范围',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
    ];

    for (const zone of scenario.detectionZones) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${zone.entityId}: 半径 ${(zone.radiusMeters / 1000).toFixed(0)}km`,
              size: 24,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    return paragraphs;
  }

  /**
   * 创建打击任务
   */
  private createStrikeTasks(scenario: TacticalScenario): Paragraph[] {
    if (scenario.strikeTasks.length === 0) {
      return [];
    }

    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: '打击任务',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
    ];

    for (const task of scenario.strikeTasks) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `- T+${task.timestamp}秒: ${task.attackerEntityId} 攻击 ${task.targetEntityId}`,
              size: 24,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    return paragraphs;
  }

  /**
   * 创建元数据
   */
  private createMetadata(scenario: TacticalScenario): Paragraph[] {
    return [
      new Paragraph({
        text: '元数据',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `生成时间: ${new Date(scenario.metadata.generatedAt).toLocaleString('zh-CN')}`,
            size: 24,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `模型: ${scenario.metadata.modelUsed}`,
            size: 24,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `置信度: ${(scenario.metadata.confidence * 100).toFixed(0)}%`,
            size: 24,
          }),
        ],
        spacing: { after: 200 },
      }),
    ];
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
git add apps/web/src/services/word-exporter.ts
git commit -m "feat: add WordExporter service

- Create WordExporter class with docx library
- Export tactical scenarios to formatted Word documents
- Include all sections: overview, forces, phases, routes, etc."
```

---

### Task 3: 安装 file-saver 依赖

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: 安装 file-saver**

```bash
npm install file-saver @types/file-saver --save
```

Expected: 输出显示安装成功

- [ ] **Step 2: 提交依赖**

```bash
git add package.json package-lock.json
git commit -m "chore: add file-saver dependency for file download"
```

---

### Task 4: 在 Store 中添加导出方法

**Files:**
- Modify: `apps/web/src/stores/tactical-scenario.ts`

- [ ] **Step 1: 导入 WordExporter**

在文件顶部添加导入：

```typescript
import { WordExporter } from '../services/word-exporter';
```

- [ ] **Step 2: 添加导出方法**

在 `return` 语句之前添加导出方法：

```typescript
  // --- 导出操作 ---

  let wordExporter: WordExporter | null = null;

  function ensureWordExporter() {
    if (!wordExporter) {
      wordExporter = new WordExporter();
    }
    return wordExporter;
  }

  async function exportToWord() {
    if (!currentScenario.value) {
      throw new Error('当前没有方案可导出');
    }

    try {
      const exporter = ensureWordExporter();
      await exporter.exportToWord(currentScenario.value, thinkingChain.value);
      addSystemMessage('方案已导出为 Word 文档');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导出失败';
      error.value = msg;
      addSystemMessage(`导出失败: ${msg}`);
    }
  }
```

- [ ] **Step 3: 在 return 中导出方法**

在 return 对象中添加：

```typescript
  return {
    // ... 现有导出
    exportToWord,
  };
```

- [ ] **Step 4: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/stores/tactical-scenario.ts
git commit -m "feat: add Word export method to store

- Import WordExporter
- Add exportToWord method
- Export method in store API"
```

---

### Task 5: 在 AIAssistantPanel 添加导出按钮

**Files:**
- Modify: `apps/web/src/components/ai-assistant/AIAssistantPanel.vue`

- [ ] **Step 1: 在操作按钮区域添加导出按钮**

在 `panel-actions-row` div 中（第246-254行之后）添加导出按钮：

```vue
      <div class="panel-actions-row">
        <button
          class="action-btn action-btn-primary"
          :disabled="!canDeploy"
          @click="store.deployToMap()"
        >
          📍 部署到地图
        </button>
        <button
          class="action-btn action-btn-secondary"
          :disabled="!canDeploy"
          @click="handleExport"
        >
          📄 导出 Word
        </button>
        <button
          class="action-btn action-btn-danger"
          :disabled="!store.currentScenario"
          @click="store.clearMap()"
        >
          🗑 清空地图
        </button>
      </div>
```

- [ ] **Step 2: 添加导出处理函数**

在 script setup 中添加：

```typescript
async function handleExport() {
  try {
    await store.exportToWord();
  } catch { /* error handled in store */ }
}
```

- [ ] **Step 3: 添加按钮样式**

在 style 中添加：

```css
.action-btn-secondary {
  background: rgba(107, 196, 255, 0.15);
  border-color: rgba(107, 196, 255, 0.4);
  color: #6bc4ff;
}
```

- [ ] **Step 4: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/components/ai-assistant/AIAssistantPanel.vue
git commit -m "feat: add Word export button to AI panel

- Add export button next to deploy button
- Add handleExport function
- Add secondary button style"
```

---

### Task 6: 验证导出功能

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

Expected: 服务器启动

- [ ] **Step 2: 测试导出功能**

1. 打开浏览器访问 http://localhost:5173
2. 在 AI 助手中生成一个方案
3. 点击 "📄 导出 Word" 按钮
4. 检查下载的 Word 文档

**检查清单:**
- [ ] 文档成功下载
- [ ] 文档名称格式正确（作战方案_id_日期.docx）
- [ ] 包含所有章节：概述、战术分析、兵力编成、阶段划分等
- [ ] 兵力编成表格正确显示
- [ ] 时间轴信息正确
- [ ] 元数据正确

- [ ] **Step 3: 提交验收结果**

```bash
git commit --allow-empty -m "test: verify Word export functionality

- Confirm document downloads with correct filename
- Confirm all sections present in document
- Confirm tables and formatting render correctly"
```

---

## 验收标准

- [ ] 导出按钮正确显示
- [ ] 点击按钮后 Word 文档下载
- [ ] 文档包含所有必需章节
- [ ] 格式正确、内容完整
- [ ] 所有类型检查通过

---

**下一步**: 创建 Word 导入系统实施计划
