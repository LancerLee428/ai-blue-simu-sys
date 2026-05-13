import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { xml2js, type Element as XmlElement } from 'xml-js';

import { ExecutionEngine } from '../execution-engine';
import { XmlScenarioParser } from '../xml-scenario-parser';
import { normalizeTacticalScenario } from '../tactical-scenario-normalizer';
import type {
  EmitterVolume,
  RuntimeVisualUpdate,
  TacticalScenario,
  Weapon,
} from '../../types/tactical-scenario';
import { WEAPON_DATABASE } from '../weapon-database';

type XmlNode = XmlElement & { parentNode?: TestElement };

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
  public parentNode?: TestElement;

  constructor(public name: string) {}

  get tagName(): string {
    return this.name;
  }

  get children(): TestElement[] {
    return this.elements.filter((child): child is TestElement => child instanceof TestElement);
  }

  get textContent(): string {
    return this.elements.map(child => child.textContent).join('');
  }

  appendChild(child: TestElement | TestTextNode): TestElement | TestTextNode {
    if (child instanceof TestElement) child.parentNode = this;
    this.elements.push(child);
    return child;
  }

  getAttribute(key: string): string | null {
    return this.attributes[key] ?? null;
  }

  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    const groups = selector.split(',').map(part => part.trim()).filter(Boolean);
    const results: TestElement[] = [];
    for (const group of groups) {
      results.push(...this.querySelectorGroup(group));
    }
    return Array.from(new Set(results));
  }

  private querySelectorGroup(selector: string): TestElement[] {
    const scopedDirect = selector.startsWith(':scope >');
    const cleanedSelector = selector.replace(/^:scope\s*>\s*/, '');
    const parts = cleanedSelector.split('>').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) return [];
    let current = scopedDirect
      ? this.children.filter(candidate => matchesSelector(candidate, parts[0]))
      : this.descendants().filter(candidate => matchesSelector(candidate, parts[0]));

    for (const part of parts.slice(1)) {
      current = current.flatMap(candidate => candidate.children.filter(child => matchesSelector(child, part)));
    }
    return current;
  }

  private descendants(): TestElement[] {
    return this.children.flatMap(child => [child, ...child.descendants()]);
  }
}

class TestDocument {
  constructor(public documentElement: TestElement = new TestElement('Document')) {}

  querySelector(selector: string): TestElement | null {
    return this.documentElement.querySelector(selector);
  }
}

class TestDOMParser {
  parseFromString(xml: string): TestDocument {
    const parsed = xml2js(xml, { compact: false, trim: true }) as { elements?: XmlNode[] };
    const root = parsed.elements?.find(element => element.type === 'element');
    if (!root) return new TestDocument(new TestElement('parsererror'));
    return new TestDocument(fromXmlElement(root));
  }
}

function fromXmlElement(node: XmlNode): TestElement {
  const element = new TestElement(node.name ?? '');
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    if (value !== undefined) element.setAttribute(key, String(value));
  }
  for (const child of node.elements ?? []) {
    if (child.type === 'element') {
      element.appendChild(fromXmlElement(child as XmlNode));
    } else if (child.type === 'text' && child.text !== undefined) {
      element.appendChild(new TestTextNode(String(child.text)));
    }
  }
  return element;
}

function matchesSelector(element: TestElement, selector: string): boolean {
  if (selector === '*') return true;
  const attrMatch = selector.match(/^([A-Za-z0-9_-]+)\[([^=\]]+)\*="([^"]+)"\]$/);
  if (attrMatch) {
    return element.tagName === attrMatch[1]
      && (element.getAttribute(attrMatch[2]) ?? '').includes(attrMatch[3]);
  }
  return element.tagName === selector;
}

class CaptureRenderer {
  public lastUpdate: RuntimeVisualUpdate | null = null;

  updateRuntimeVisuals(update: RuntimeVisualUpdate): void {
    this.lastUpdate = update;
  }

  updateEntityPosition(): void {}

  updateEntityStatus(): void {}
}

function createBaseScenario(): TacticalScenario {
  return {
    id: 'runtime-emitter-test',
    version: 1,
    summary: '运行时波束测试',
    forces: [
      {
        side: 'red',
        name: '红方',
        entities: [
          {
            id: 'red-radar-a',
            name: '红方雷达A',
            type: 'ground-radar',
            side: 'red',
            position: { longitude: 100, latitude: 35, altitude: 0 },
            loadout: { weapons: [], sensors: ['radar'] },
          },
          {
            id: 'red-radar-b',
            name: '红方雷达B',
            type: 'ground-radar',
            side: 'red',
            position: { longitude: 100.05, latitude: 35, altitude: 0 },
            loadout: { weapons: [], sensors: ['radar'] },
          },
          {
            id: 'red-ew-a',
            name: '红方电子战车A',
            type: 'ground-ew',
            side: 'red',
            position: { longitude: 100, latitude: 35, altitude: 0 },
          },
          {
            id: 'red-ew-b',
            name: '红方电子战车B',
            type: 'ground-ew',
            side: 'red',
            position: { longitude: 100.05, latitude: 35, altitude: 0 },
          },
        ],
      },
      {
        side: 'blue',
        name: '蓝方',
        entities: [
          {
            id: 'blue-air-1',
            name: '蓝方飞机1',
            type: 'air-fighter',
            side: 'blue',
            position: { longitude: 100.2, latitude: 35.02, altitude: 9_000 },
          },
          {
            id: 'blue-air-2',
            name: '蓝方飞机2',
            type: 'air-multirole',
            side: 'blue',
            position: { longitude: 100.35, latitude: 35.04, altitude: 10_000 },
          },
        ],
      },
    ],
    routes: [],
    detectionZones: [
      {
        entityId: 'red-radar-a',
        side: 'red',
        center: { longitude: 100, latitude: 35, altitude: 0 },
        radiusMeters: 500_000,
        label: '红方雷达A 雷达探测范围',
        tracking: { enabled: true, targetTypes: ['enemy-aircraft', 'enemy-missile'], maxTracks: 12 },
      },
      {
        entityId: 'red-radar-b',
        side: 'red',
        center: { longitude: 100.05, latitude: 35, altitude: 0 },
        radiusMeters: 500_000,
        label: '红方雷达B 雷达探测范围',
        tracking: { enabled: true, targetTypes: ['enemy-aircraft', 'enemy-missile'], maxTracks: 12 },
      },
      {
        entityId: 'red-ew-a',
        side: 'red',
        center: { longitude: 100, latitude: 35, altitude: 0 },
        radiusMeters: 500_000,
        label: '红方电子战车A 电子战覆盖范围',
      },
      {
        entityId: 'red-ew-b',
        side: 'red',
        center: { longitude: 100.05, latitude: 35, altitude: 0 },
        radiusMeters: 500_000,
        label: '红方电子战车B 电子战覆盖范围',
      },
    ],
    strikeTasks: [],
    phases: [],
    metadata: {
      generatedAt: '2026-05-12T00:00:00.000Z',
      modelUsed: 'test',
      confidence: 1,
    },
    visualEffects: {
      enabled: true,
      weaponEffects: { enabled: true, items: [] },
      explosionEffects: { enabled: true, items: [] },
      sensorEffects: {
        enabled: true,
        radarScanEnabled: true,
        scanSpeedDegPerSec: 60,
        beamWidthDeg: 18,
      },
      electronicWarfareEffects: {
        enabled: true,
        areaEnabled: false,
        trackingEnabled: true,
        trackingTargetTypes: ['enemy-missile'],
        maxTracks: 1,
        pulseEnabled: true,
        pulseColor: '#ff9f1c',
        pulseDurationMs: 2_200,
      },
      performance: {
        mode: 'high',
        maxActiveExplosions: 4,
        maxActiveScans: 12,
        maxActivePulses: 4,
        maxActiveTrails: 20,
      },
    },
  };
}

function createBlueWeapon(id: string, longitude: number, latitude: number): Weapon {
  return {
    id,
    spec: WEAPON_DATABASE['aim-120d'],
    launcherId: 'blue-air-1',
    targetId: 'red-radar-a',
    launchTime: 0,
    impactTime: 100,
    launchPosition: { longitude, latitude, altitude: 9_000 },
    currentPosition: { longitude, latitude, altitude: 12_000 },
    targetPosition: { longitude: 100, latitude: 35, altitude: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    status: 'cruising',
    trajectory: [],
    fuelRemaining: 1,
  };
}

function createEngineWithScenario(scenario: TacticalScenario): ExecutionEngine {
  const renderer = new CaptureRenderer();
  const engine = new ExecutionEngine({} as any, renderer as any);
  engine.load(scenario);
  return engine;
}

function callPrivateEmitterFactory(
  engine: ExecutionEngine,
  method: 'createSensorEmitters' | 'createEWEmitters',
): EmitterVolume[] {
  return (engine as unknown as Record<typeof method, () => EmitterVolume[]>)[method]();
}

test('ExecutionEngine should let each active radar source dynamically track blue targets in range', () => {
  const engine = createEngineWithScenario(createBaseScenario());
  (engine as any).lastRuntimeWeapons = [
    createBlueWeapon('blue-missile-1', 100.25, 35.03),
    createBlueWeapon('blue-missile-2', 100.4, 35.05),
  ];

  const emitters = callPrivateEmitterFactory(engine, 'createSensorEmitters');

  assert.equal(emitters.length, 8);
  assert.deepEqual(new Set(emitters.map(emitter => emitter.sourceEntityId)), new Set(['red-radar-a', 'red-radar-b']));
  assert.ok(emitters.every(emitter => emitter.kind === 'radar' && emitter.mode === 'track'));
  assert.deepEqual(
    new Set(emitters.map(emitter => emitter.id.replace(/^radar-red-radar-[ab]-enemy-(aircraft|missile)-/, ''))),
    new Set(['blue-air-1', 'blue-air-2', 'blue-missile-1', 'blue-missile-2']),
  );
});

test('ExecutionEngine should use one jammer source and one blue missile target for EW tracking', () => {
  const scenario = createBaseScenario();
  if (scenario.visualEffects?.performance) {
    scenario.visualEffects.performance.maxActivePulses = 1;
  }
  const engine = createEngineWithScenario(scenario);
  (engine as any).lastRuntimeWeapons = [
    createBlueWeapon('blue-missile-1', 100.25, 35.03),
    createBlueWeapon('blue-missile-2', 100.4, 35.05),
  ];

  const emitters = callPrivateEmitterFactory(engine, 'createEWEmitters');

  assert.equal(emitters.length, 1);
  assert.equal(emitters[0].sourceEntityId, 'red-ew-a');
  assert.equal(emitters[0].kind, 'electronic-jamming');
  assert.equal(emitters[0].mode, 'track');
  assert.match(emitters[0].id, /blue-missile-1/);
});

test('ExecutionEngine should keep fixed radar and EW entities at deployed positions when phase states drift', () => {
  const scenario = createBaseScenario();
  scenario.phases = [
    {
      id: 'phase-drift',
      name: '阶段状态漂移',
      description: '固定传感器没有行动路线时不应被阶段状态插值移动',
      duration: 60,
      events: [],
      entityStates: [
        {
          entityId: 'red-radar-a',
          status: 'deployed',
          position: { longitude: 101, latitude: 36, altitude: 500 },
        },
        {
          entityId: 'red-ew-a',
          status: 'deployed',
          position: { longitude: 101.2, latitude: 36.2, altitude: 500 },
        },
      ],
    },
  ];
  const engine = createEngineWithScenario(scenario);

  (engine as any).buildPhaseMoves(0);

  assert.deepEqual((engine as any).findEntityPositionAtTime('red-radar-a', 30_000), {
    longitude: 100,
    latitude: 35,
    altitude: 0,
  });
  assert.deepEqual((engine as any).findEntityPositionAtTime('red-ew-a', 30_000), {
    longitude: 100,
    latitude: 35,
    altitude: 0,
  });

  (engine as any).applyPhaseEntityStates(scenario.phases[0]);

  assert.deepEqual((engine as any).findEntityPositionAtTime('red-radar-a', 60_000), {
    longitude: 100,
    latitude: 35,
    altitude: 0,
  });
  assert.deepEqual((engine as any).findEntityPositionAtTime('red-ew-a', 60_000), {
    longitude: 100,
    latitude: 35,
    altitude: 0,
  });
});

test('Example XML should drive radar 8-01 and radar 9-01 tracking sources plus aircraft standoff and missile launches', () => {
  globalThis.DOMParser = TestDOMParser as any;
  const xml = readFileSync('data-example/东海联合打击-2024-1777165955760.xml', 'utf8');
  const scenario = normalizeTacticalScenario(new XmlScenarioParser().parse(xml));
  const engine = createEngineWithScenario(scenario);
  const blueMissiles = [
    createBlueWeapon('blue-runtime-missile-1', 104.07, 30.65),
    createBlueWeapon('blue-runtime-missile-2', 113.66, 34.72),
  ];
  (blueMissiles[0] as any).launcherId = 'blue-g01-missile2-01';
  (blueMissiles[1] as any).launcherId = 'blue-g02-missile3-01';
  (engine as any).lastRuntimeWeapons = blueMissiles;

  const radarEmitters = callPrivateEmitterFactory(engine, 'createSensorEmitters');
  const ewEmitters = callPrivateEmitterFactory(engine, 'createEWEmitters');
  const attackEvents = scenario.phases.flatMap(phase => phase.events).filter(event => event.type === 'attack');

  assert.deepEqual(new Set(radarEmitters.map(emitter => emitter.sourceEntityId)), new Set([
    'red-g08-radar-01',
    'red-g09-radar-01',
  ]));
  assert.ok(radarEmitters.filter(emitter => emitter.sourceEntityId === 'red-g08-radar-01').length > 1);
  assert.ok(radarEmitters.filter(emitter => emitter.sourceEntityId === 'red-g09-radar-01').length > 1);
  assert.deepEqual(new Set(ewEmitters.map(emitter => emitter.sourceEntityId)), new Set([
    'red-g08-radar-01',
    'red-g09-radar-01',
  ]));
  assert.ok(ewEmitters.every(emitter => emitter.mode === 'track'));
  assert.deepEqual(attackEvents.map(event => event.sourceEntityId), [
    'red-g01-air-03',
    'red-g02-missile-01',
    'red-g04-missile-01',
    'red-g05-missile-01',
    'red-g09-missile-01',
    'blue-g01-missile2-01',
    'blue-g02-missile3-01',
  ]);
});
