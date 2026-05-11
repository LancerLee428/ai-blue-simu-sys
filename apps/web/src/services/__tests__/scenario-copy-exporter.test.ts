import test from 'node:test';
import assert from 'node:assert/strict';
import { js2xml, type Element as XmlElement } from 'xml-js';

import { createScenarioXmlCopyExport } from '../scenario-copy-exporter';
import type { TacticalScenario } from '../../types/tactical-scenario';

class TestTextNode {
  public readonly type = 'text';

  constructor(public text: string) {}

  get textContent(): string {
    return this.text;
  }
}

class TestElement {
  public readonly type = 'element';
  public elements: Array<TestElement | TestTextNode> = [];
  public attributes: Record<string, string> = {};

  constructor(public name: string) {}

  appendChild(child: TestElement | TestTextNode): TestElement | TestTextNode {
    this.elements.push(child);
    return child;
  }

  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }

  toXmlElement(): XmlElement {
    return {
      type: 'element',
      name: this.name,
      ...(Object.keys(this.attributes).length > 0 ? { attributes: this.attributes } : {}),
      ...(this.elements.length > 0
        ? {
            elements: this.elements.map(child => child instanceof TestElement
              ? child.toXmlElement()
              : { type: 'text', text: child.text }),
          }
        : {}),
    };
  }
}

class TestDocument {
  public implementation = {
    createDocument: (_namespace: null, tag: string) => new TestDocument(new TestElement(tag)),
  };

  constructor(public documentElement: TestElement = new TestElement('Document')) {}

  createElement(tag: string): TestElement {
    return new TestElement(tag);
  }
}

class TestXMLSerializer {
  serializeToString(doc: TestDocument): string {
    return js2xml({
      elements: [doc.documentElement.toXmlElement()],
    }, { compact: false });
  }
}

globalThis.XMLSerializer = TestXMLSerializer as any;
globalThis.document = {
  implementation: new TestDocument().implementation,
} as unknown as Document;

function createEditedScenario(): TacticalScenario {
  return {
    id: 'scenario-save-copy',
    version: 1,
    summary: '保存副本测试',
    scenarioMetadata: {
      name: '东海联合打击',
      version: '2024',
      description: '保存副本测试想定',
      category: '演示',
    },
    forces: [
      {
        side: 'red',
        name: '红方',
        entities: [
          {
            id: 'red-fighter',
            name: '红方战机',
            type: 'air-fighter',
            side: 'red',
            position: { longitude: 121.5, latitude: 25.25, altitude: 9500 },
          },
        ],
      },
    ],
    routes: [
      {
        entityId: 'red-fighter',
        side: 'red',
        label: '编辑后攻击航线',
        points: [
          { timestamp: 0, position: { longitude: 121.5, latitude: 25.25, altitude: 9500 } },
          { timestamp: 10, position: { longitude: 122.5, latitude: 25.75, altitude: 10500 } },
        ],
      },
    ],
    detectionZones: [],
    strikeTasks: [],
    phases: [],
    metadata: {
      generatedAt: '2026-05-11T00:00:00.000Z',
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

test('createScenarioXmlCopyExport should create an edited-copy filename and current XML content', () => {
  const result = createScenarioXmlCopyExport(createEditedScenario(), new Date(2026, 4, 11, 12, 13, 14));

  assert.equal(result.fileName, '东海联合打击-edited-copy-20260511-121314.xml');
  assert.match(result.content, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(result.content, /<Point longitude="121.5" latitude="25.25" altitude="9500" timestamp="0"\/>/);
  assert.match(result.content, /<Point longitude="122.5" latitude="25.75" altitude="10500" timestamp="10"\/>/);
});
