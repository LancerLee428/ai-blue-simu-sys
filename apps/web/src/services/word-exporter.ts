// apps/web/src/services/word-exporter.ts
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from 'docx';
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
      sections: [
        {
          properties: {},
          children,
        },
      ],
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
