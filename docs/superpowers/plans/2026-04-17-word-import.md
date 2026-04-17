# Word 导入系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解析系统导出的 Word 文档，提取方案数据并生成可视化推演

**Architecture:**
1. 使用 `mammoth.js` 提取 Word 文本内容
2. 用正则表达式解析章节结构
3. 构造 `TacticalScenario` 对象
4. 在 AIAssistantPanel 添加导入按钮

**Tech Stack:** mammoth (npm), TypeScript, Vue 3, Pinia

---

## 文件结构

**创建文件:**
- `apps/web/src/services/word-importer.ts` - Word 文档解析逻辑

**修改文件:**
- `apps/web/src/stores/tactical-scenario.ts` - 添加导入方法
- `apps/web/src/components/ai-assistant/AIAssistantPanel.vue` - 添加导入按钮和文件选择器

---

### Task 1: 安装 mammoth 依赖

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: 安装 mammoth 库**

```bash
npm install mammoth --save
```

Expected: 输出显示 mammoth@版本号安装成功

- [ ] **Step 2: 提交依赖**

```bash
git add package.json package-lock.json
git commit -m "chore: add mammoth dependency for Word import"
```

---

### Task 2: 创建 Word 导入服务

**Files:**
- Create: `apps/web/src/services/word-importer.ts`

- [ ] **Step 1: 创建 WordImporter 类**

```typescript
// apps/web/src/services/word-importer.ts
import mammoth from 'mammoth';
import type { TacticalScenario } from '../types/tactical-scenario';

/**
 * Word 文档导入错误
 */
export interface ImportError {
  type: 'format' | 'parsing' | 'validation';
  message: string;
  line?: number;
}

/**
 * Word 文档导入服务
 */
export class WordImporter {
  /**
   * 从 ArrayBuffer 导入 Word 文档
   */
  async importFromWord(arrayBuffer: ArrayBuffer): Promise<TacticalScenario> {
    // 1. 提取文本内容
    const rawText = await this.extractText(arrayBuffer);

    // 2. 解析章节结构
    const parsed = this.parseDocument(rawText);

    // 3. 构造 TacticalScenario
    return this.buildScenario(parsed);
  }

  /**
   * 提取 Word 文档文本
   */
  private async extractText(arrayBuffer: ArrayBuffer): Promise<string> {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  /**
   * 解析文档结构
   */
  private parseDocument(text: string): ParsedDocument {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsed: ParsedDocument = {
      overview: '',
      tacticalAnalysis: '',
      forces: [],
      phases: [],
      routes: [],
      detectionZones: [],
      strikeTasks: [],
      metadata: { generatedAt: '', modelUsed: '', confidence: 0 },
    };

    let currentSection: 'overview' | 'analysis' | 'forces' | 'phases' | 'routes' | 'detection' | 'strikes' | 'metadata' | null = null;
    let currentForce: ParsedForce | null = null;
    let currentPhase: ParsedPhase | null = null;

    for (const line of lines) {
      // 识别章节标题
      if (line === '方案概述') {
        currentSection = 'overview';
        continue;
      }
      if (line === '战术分析') {
        currentSection = 'analysis';
        continue;
      }
      if (line === '兵力编成') {
        currentSection = 'forces';
        continue;
      }
      if (line === '阶段划分') {
        currentSection = 'phases';
        continue;
      }
      if (line === '进攻路线') {
        currentSection = 'routes';
        continue;
      }
      if (line === '探测范围') {
        currentSection = 'detection';
        continue;
      }
      if (line === '打击任务') {
        currentSection = 'strikes';
        continue;
      }
      if (line === '元数据') {
        currentSection = 'metadata';
        continue;
      }

      // 识别子章节标题
      if (line.startsWith('红方（中国）') || line.startsWith('蓝方（日本）')) {
        currentForce = { side: line.includes('红方') ? 'red' : 'blue', name: line, entities: [] };
        parsed.forces.push(currentForce);
        continue;
      }

      if (line.startsWith('阶段') && line.includes(':')) {
        const phaseName = line.split(':')[1]?.trim() || '';
        currentPhase = {
          id: `phase-${parsed.phases.length + 1}`,
          name: phaseName,
          description: '',
          duration: 60,
          events: [],
          entityStates: [],
        };
        parsed.phases.push(currentPhase);
        continue;
      }

      // 解析内容
      switch (currentSection) {
        case 'overview':
          parsed.overview += line + '\n';
          break;

        case 'analysis':
          parsed.tacticalAnalysis += line + '\n';
          break;

        case 'forces':
          if (currentForce && !line.startsWith('-') && !line.includes('实体名称')) {
            // 实体行
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 4) {
              currentForce.entities.push({
                id: `entity-${Date.now()}-${Math.random()}`,
                name: parts[0],
                type: this.parseEntityType(parts[1]),
                side: currentForce.side,
                position: this.parsePosition(parts[2]),
              });
            }
          }
          break;

        case 'phases':
          if (currentPhase) {
            if (line.startsWith('时间:')) {
              const match = line.match(/T\+(\d+)秒/);
              if (match) currentPhase.duration = parseInt(match[1], 10);
            } else if (line.startsWith('描述:')) {
              currentPhase.description = line.replace('描述:', '').trim();
            } else if (line.startsWith('- T+') && line.includes('秒:')) {
              const match = line.match(/T\+(\d+)秒:\s*(.+)/);
              if (match) {
                currentPhase.events.push({
                  type: 'movement',
                  timestamp: parseInt(match[1], 10),
                  sourceEntityId: 'unknown',
                  detail: match[2],
                });
              }
            }
          }
          break;

        case 'routes':
          if (line.includes(':')) {
            const [entityId, pointsStr] = line.split(':').map(p => p.trim());
            parsed.routes.push({
              entityId,
              side: 'red',
              points: this.parseRoutePoints(pointsStr),
            });
          }
          break;

        case 'detection':
          if (line.includes(':')) {
            const [entityId, radiusStr] = line.split(':').map(p => p.trim());
            const match = radiusStr.match(/半径\s*(\d+)km/);
            if (match) {
              parsed.detectionZones.push({
                entityId,
                side: 'red',
                center: { longitude: 0, latitude: 0, altitude: 0 },
                radiusMeters: parseInt(match[1], 10) * 1000,
              });
            }
          }
          break;

        case 'strikes':
          if (line.startsWith('- T+') && line.includes('秒:')) {
            const match = line.match(/T\+(\d+)秒:\s*(.+)\s+攻击\s+(.+)/);
            if (match) {
              parsed.strikeTasks.push({
                id: `strike-${Date.now()}`,
                attackerEntityId: match[2].trim(),
                targetEntityId: match[3].trim(),
                phaseId: 'phase-1',
                timestamp: parseInt(match[1], 10),
                detail: `${match[2]} 攻击 ${match[3]}`,
              });
            }
          }
          break;

        case 'metadata':
          if (line.includes('生成时间:')) {
            parsed.metadata.generatedAt = line.replace('生成时间:', '').trim();
          } else if (line.includes('模型:')) {
            parsed.metadata.modelUsed = line.replace('模型:', '').trim();
          } else if (line.includes('置信度:')) {
            const match = line.match(/(\d+)%/);
            if (match) parsed.metadata.confidence = parseInt(match[1], 10) / 100;
          }
          break;
      }
    }

    return parsed;
  }

  /**
   * 解析实体类型
   */
  private parseEntityType(typeStr: string): any {
    const typeMap: Record<string, string> = {
      '战机': 'aircraft-fighter',
      '轰炸机': 'aircraft-bomber',
      '侦察机': 'aircraft-recon',
      '直升机': 'aircraft-helicopter',
      '舰船': 'ship',
      '车辆': 'ground-vehicle',
      '导弹': 'missile',
      '无人机': 'drone',
    };
    return typeMap[typeStr] || 'aircraft-fighter';
  }

  /**
   * 解析位置字符串
   */
  private parsePosition(posStr: string): { longitude: number; latitude: number; altitude: number } {
    const latMatch = posStr.match(/([\d.]+)°N/);
    const lonMatch = posStr.match(/([\d.]+)°E/);
    const altMatch = posStr.match(/(\d+)m/);

    return {
      latitude: latMatch ? parseFloat(latMatch[1]) : 0,
      longitude: lonMatch ? parseFloat(lonMatch[1]) : 0,
      altitude: altMatch ? parseInt(altMatch[1], 10) : 0,
    };
  }

  /**
   * 解析路线点
   */
  private parseRoutePoints(pointsStr: string): any[] {
    const points: any[] = [];
    const matches = pointsStr.matchAll(/\(([\d.]+)°N,\s*([\d.]+)°E,\s*(\d+)m\)/g);
    for (const match of matches) {
      points.push({
        position: {
          latitude: parseFloat(match[1]),
          longitude: parseFloat(match[2]),
          altitude: parseInt(match[3], 10),
        },
      });
    }
    return points;
  }

  /**
   * 构造 TacticalScenario
   */
  private buildScenario(parsed: ParsedDocument): TacticalScenario {
    return {
      id: `scenario-${Date.now()}`,
      version: 1,
      summary: parsed.overview.trim(),
      forces: parsed.forces.map(f => ({
        side: f.side,
        name: f.name,
        entities: f.entities,
      })),
      routes: parsed.routes,
      detectionZones: parsed.detectionZones,
      strikeTasks: parsed.strikeTasks,
      phases: parsed.phases,
      metadata: parsed.metadata,
    };
  }
}

/**
 * 解析后的文档结构
 */
interface ParsedDocument {
  overview: string;
  tacticalAnalysis: string;
  forces: ParsedForce[];
  phases: ParsedPhase[];
  routes: any[];
  detectionZones: any[];
  strikeTasks: any[];
  metadata: {
    generatedAt: string;
    modelUsed: string;
    confidence: number;
  };
}

interface ParsedForce {
  side: 'red' | 'blue';
  name: string;
  entities: any[];
}

interface ParsedPhase {
  id: string;
  name: string;
  description: string;
  duration: number;
  events: any[];
  entityStates: any[];
}
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/services/word-importer.ts
git commit -m "feat: add WordImporter service

- Extract text from Word documents using mammoth
- Parse document structure (forces, phases, routes, etc.)
- Build TacticalScenario from parsed content"
```

---

### Task 3: 在 Store 中添加导入方法

**Files:**
- Modify: `apps/web/src/stores/tactical-scenario.ts`

- [ ] **Step 1: 导入 WordImporter**

在文件顶部添加导入：

```typescript
import { WordImporter } from '../services/word-importer';
```

- [ ] **Step 2: 添加导入方法**

在 `ensureWordExporter` 之后添加导入方法：

```typescript
  // --- 导入操作 ---

  let wordImporter: WordImporter | null = null;

  function ensureWordImporter() {
    if (!wordImporter) {
      wordImporter = new WordImporter();
    }
    return wordImporter;
  }

  async function importFromWord(file: File) {
    isGenerating.value = true;
    error.value = null;

    try {
      const importer = ensureWordImporter();
      const arrayBuffer = await file.arrayBuffer();
      const scenario = await importer.importFromWord(arrayBuffer);

      currentScenario.value = scenario;
      addAssistantMessage(`已从 Word 文档导入方案: ${scenario.summary}`, scenario);

      // 渲染到地图并自动定位
      if (executionEngine && mapRenderer) {
        executionEngine.load(scenario);
        mapRenderer.renderScenario(scenario);
        mapRenderer.flyToScenario(scenario);
      }

      return scenario;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '导入失败';
      error.value = msg;
      addAssistantMessage(`导入失败: ${msg}`);
      throw err;
    } finally {
      isGenerating.value = false;
    }
  }
```

- [ ] **Step 3: 在 return 中导出方法**

在 return 对象中添加：

```typescript
  return {
    // ... 现有导出
    importFromWord,
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
git commit -m "feat: add Word import method to store

- Import WordImporter
- Add importFromWord method
- Load imported scenario into execution engine and map"
```

---

### Task 4: 在 AIAssistantPanel 添加导入功能

**Files:**
- Modify: `apps/web/src/components/ai-assistant/AIAssistantPanel.vue`

- [ ] **Step 1: 添加文件选择器和导入按钮**

在 `panel-actions-row` div 中的导出按钮之后添加：

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
          class="action-btn action-btn-secondary"
          @click="triggerFileInput"
        >
          📂 导入 Word
        </button>
        <button
          class="action-btn action-btn-danger"
          :disabled="!store.currentScenario"
          @click="store.clearMap()"
        >
          🗑 清空地图
        </button>
      </div>

      <!-- 隐藏的文件输入 -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".docx"
        style="display: none"
        @change="handleFileSelected"
      />
```

- [ ] **Step 2: 添加导入处理逻辑**

在 script setup 中添加：

```typescript
const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileInput() {
  fileInputRef.value?.click();
}

async function handleFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    await store.importFromWord(file);
  } catch { /* error handled in store */ }

  // 清空 input 以允许选择同一文件
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}
```

- [ ] **Step 3: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/ai-assistant/AIAssistantPanel.vue
git commit -m "feat: add Word import functionality to AI panel

- Add hidden file input for .docx files
- Add import button and handler
- Clear input after selection"
```

---

### Task 5: 验证导入功能

**Files:**
- None (manual testing)

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

Expected: 服务器启动

- [ ] **Step 2: 测试导入功能**

1. 先导出一个方案：在 AI 助手中生成方案，点击 "📄 导出 Word"
2. 下载 Word 文档
3. 点击 "📂 导入 Word" 按钮
4. 选择刚才下载的 Word 文档
5. 检查地图是否正确渲染

**检查清单:**
- [ ] 文件选择器打开
- [ ] 选择 .docx 文件后开始解析
- [ ] 导入的方案正确显示在地图上
- [ ] 实体、路线、探测区正确渲染
- [ ] 自动定位到战术区域

- [ ] **Step 3: 测试错误处理**

1. 创建一个不符合格式的 Word 文档
2. 尝试导入
3. 检查是否显示错误提示

- [ ] **Step 4: 提交验收结果**

```bash
git commit --allow-empty -m "test: verify Word import functionality

- Confirm can import exported Word documents
- Confirm imported scenario renders correctly on map
- Confirm error handling works for invalid formats"
```

---

## 验收标准

- [ ] 导入按钮正确显示
- [ ] 点击按钮可以选择 .docx 文件
- [ ] 能正确解析系统导出的 Word 文档
- [ ] 导入的方案正确渲染到地图
- [ ] 错误处理正常工作
- [ ] 所有类型检查通过

---

**下一步**: 创建行动计划管理系统实施计划
