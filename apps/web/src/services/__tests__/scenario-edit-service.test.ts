import test from 'node:test';
import assert from 'node:assert/strict';
import { js2xml, type Element as XmlElement } from 'xml-js';

import { XmlScenarioExporter } from '../xml-scenario-exporter';
import { moveScenarioEntityWithLinkedGeometry } from '../scenario-edit-service';
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

function createScenario(): TacticalScenario {
  return {
    id: 'edit-service-test',
    version: 1,
    summary: '拖拽联动测试',
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
            position: { longitude: 121, latitude: 25, altitude: 9000 },
          },
        ],
      },
      {
        side: 'blue',
        name: '蓝方',
        entities: [
          {
            id: 'blue-radar',
            name: '蓝方雷达',
            type: 'facility-radar',
            side: 'blue',
            position: { longitude: 124, latitude: 26, altitude: 0 },
          },
        ],
      },
    ],
    routes: [
      {
        entityId: 'red-fighter',
        side: 'red',
        label: '攻击航线',
        points: [
          { timestamp: 0, position: { longitude: 121, latitude: 25, altitude: 9000 } },
          { timestamp: 10, position: { longitude: 122, latitude: 25.5, altitude: 10000 } },
        ],
      },
    ],
    detectionZones: [
      {
        entityId: 'blue-radar',
        side: 'blue',
        center: { longitude: 124, latitude: 26, altitude: 0 },
        radiusMeters: 200000,
      },
    ],
    strikeTasks: [
      {
        id: 'strike-red-fighter-blue-radar',
        attackerEntityId: 'red-fighter',
        targetEntityId: 'blue-radar',
        phaseId: 'phase-1',
        timestamp: 10,
        detail: '红方战机攻击蓝方雷达',
        weaponTrajectory: {
          mode: 'manual',
          interpolation: 'catmull-rom',
          points: [
            { role: 'launch', progress: 0, position: { longitude: 122, latitude: 25.5, altitude: 10000 } },
            { role: 'boost', progress: 0.3, position: { longitude: 122.6, latitude: 25.7, altitude: 13000 } },
            { role: 'terminal', progress: 0.8, position: { longitude: 123.7, latitude: 25.95, altitude: 4000 } },
            { role: 'impact', progress: 1, position: { longitude: 124, latitude: 26, altitude: 0 } },
          ],
        },
      },
    ],
    phases: [
      {
        id: 'phase-1',
        name: '打击阶段',
        description: '测试阶段',
        duration: 60,
        events: [],
        entityStates: [
          { entityId: 'red-fighter', status: 'deployed', position: { longitude: 122, latitude: 25.5, altitude: 10000 } },
          { entityId: 'blue-radar', status: 'deployed', position: { longitude: 124, latitude: 26, altitude: 0 } },
        ],
      },
    ],
    metadata: {
      generatedAt: '2026-05-11T00:00:00.000Z',
      modelUsed: 'test',
      confidence: 1,
    },
  };
}

test('moveScenarioEntityWithLinkedGeometry should shift attacker position route trajectory and phase state', () => {
  const scenario = createScenario();
  const moved = moveScenarioEntityWithLinkedGeometry(
    scenario,
    'red-fighter',
    { longitude: 121.5, latitude: 25.25, altitude: 9500 },
  );

  const fighter = moved.forces[0].entities[0];
  const route = moved.routes[0];
  const trajectory = moved.strikeTasks[0].weaponTrajectory?.points ?? [];
  const fighterState = moved.phases[0].entityStates.find(state => state.entityId === 'red-fighter');

  assert.deepEqual(fighter.position, { longitude: 121.5, latitude: 25.25, altitude: 9500 });
  assert.deepEqual(route.points[0].position, { longitude: 121.5, latitude: 25.25, altitude: 9500 });
  assert.deepEqual(route.points[1].position, { longitude: 122.5, latitude: 25.75, altitude: 10500 });
  assert.deepEqual(trajectory[0].position, { longitude: 122.5, latitude: 25.75, altitude: 10500 });
  assert.deepEqual(trajectory[3].position, { longitude: 124.5, latitude: 26.25, altitude: 500 });
  assert.deepEqual(fighterState?.position, { longitude: 122.5, latitude: 25.75, altitude: 10500 });

  assert.notEqual(moved, scenario);
  assert.deepEqual(scenario.forces[0].entities[0].position, { longitude: 121, latitude: 25, altitude: 9000 });
});

test('moveScenarioEntityWithLinkedGeometry should move target impact without moving launch point', () => {
  const scenario = createScenario();
  const moved = moveScenarioEntityWithLinkedGeometry(
    scenario,
    'blue-radar',
    { longitude: 124.2, latitude: 26.1, altitude: 100 },
  );

  const target = moved.forces[1].entities[0];
  const zone = moved.detectionZones[0];
  const trajectory = moved.strikeTasks[0].weaponTrajectory?.points ?? [];

  assert.deepEqual(target.position, { longitude: 124.2, latitude: 26.1, altitude: 100 });
  assert.deepEqual(zone.center, { longitude: 124.2, latitude: 26.1, altitude: 100 });
  assert.deepEqual(trajectory[0].position, { longitude: 122, latitude: 25.5, altitude: 10000 });
  assert.deepEqual(trajectory[2].position, { longitude: 123.9, latitude: 26.05, altitude: 4100 });
  assert.deepEqual(trajectory[3].position, { longitude: 124.2, latitude: 26.1, altitude: 100 });
});

test('edited scenario should export linked route and weapon trajectory XML', () => {
  const moved = moveScenarioEntityWithLinkedGeometry(
    createScenario(),
    'blue-radar',
    { longitude: 124.2, latitude: 26.1, altitude: 100 },
  );

  const xml = new XmlScenarioExporter().export(moved);

  assert.match(xml, /<Point longitude="121" latitude="25" altitude="9000" timestamp="0"\/>/);
  assert.match(xml, /<TrajectoryPoint index="3" role="impact" progress="1" longitude="124.2" latitude="26.1" altitude="100"\/>/);
  assert.match(xml, /<DetectionZone entityId="blue-radar" side="blue" radiusMeters="200000"/);
  assert.match(xml, /<Center longitude="124.2" latitude="26.1" altitude="100"\/>/);
});
