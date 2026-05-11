import test from 'node:test';
import assert from 'node:assert/strict';
import { js2xml, xml2js, type Element as XmlElement } from 'xml-js';

import { XmlScenarioParser } from '../xml-scenario-parser';
import { XmlScenarioExporter } from '../xml-scenario-exporter';

type XmlNode = XmlElement & { parentNode?: XmlNode };

class TestTextNode {
  public readonly type = 'text';

  constructor(public text: string) {}

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
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

  get childNodes(): Array<TestElement | TestTextNode> {
    return this.elements;
  }

  get textContent(): string {
    return this.elements.map(child => child.textContent).join('');
  }

  set textContent(value: string) {
    this.elements = [new TestTextNode(value)];
  }

  appendChild(child: TestElement | TestTextNode): TestElement | TestTextNode {
    if (child instanceof TestElement) child.parentNode = this;
    this.elements.push(child);
    return child;
  }

  removeChild(child: TestElement | TestTextNode): void {
    this.elements = this.elements.filter(item => item !== child);
  }

  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }

  getAttribute(key: string): string | null {
    return this.attributes[key] ?? null;
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

class TestXMLSerializer {
  serializeToString(doc: TestDocument): string {
    return js2xml({
      elements: [doc.documentElement.toXmlElement()],
    }, { compact: false });
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

test('XML parser and exporter should preserve weapon trajectory key points', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scenario id="trajectory-demo" version="1">
  <Summary>导弹轨迹关键点演示</Summary>
  <Participating>
    <Equipment id="red-fighter1">
      <Name>歼-16-01</Name>
      <Components>
        <Component id="red-fighter1-mover">
          <Type>space_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>127.75</Longitude>
            <Latitude>26.38</Latitude>
            <Altitude>11000</Altitude>
          </InitialState>
        </Component>
      </Components>
      <Loadout>
        <Weapons><Weapon id="aim-120d"/></Weapons>
      </Loadout>
    </Equipment>
  </Participating>
  <Supporting>
    <Equipment id="blue-aew1">
      <Name>E-2C-01</Name>
      <Components>
        <Component id="blue-aew1-mover">
          <Type>space_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>126.8</Longitude>
            <Latitude>26</Latitude>
            <Altitude>11000</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
  </Supporting>
  <StrikeTasks>
    <StrikeTask id="strike-1" attackerEntityId="red-fighter1" targetEntityId="blue-aew1" phaseId="phase-1" timestamp="12" detail="歼-16-01 使用 AIM-120D 攻击 E-2C-01">
      <WeaponTrajectory mode="manual" interpolation="catmull-rom">
        <TrajectoryPoint index="0" role="launch" progress="0" longitude="127.75" latitude="26.38" altitude="11000"/>
        <TrajectoryPoint index="1" role="boost" progress="0.25" longitude="127.45" latitude="26.30" altitude="13200"/>
        <TrajectoryPoint index="2" role="impact" progress="1" longitude="126.8" latitude="26" altitude="11000"/>
      </WeaponTrajectory>
    </StrikeTask>
  </StrikeTasks>
</Scenario>`;

  globalThis.DOMParser = TestDOMParser as any;
  globalThis.XMLSerializer = TestXMLSerializer as any;
  globalThis.document = {
    implementation: new TestDocument().implementation,
  } as unknown as Document;

  const scenario = new XmlScenarioParser().parse(xml);
  assert.equal(scenario.strikeTasks[0].weaponTrajectory?.points.length, 3);
  assert.equal(scenario.strikeTasks[0].weaponTrajectory?.points[1].role, 'boost');

  const exported = new XmlScenarioExporter().export(scenario);
  assert.match(exported, /<WeaponTrajectory mode="manual" interpolation="catmull-rom">/);
  assert.match(exported, /role="boost"/);
  assert.match(exported, /altitude="13200"/);
});

test('XML parser and exporter should preserve visual model configuration', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scenario id="visual-model-demo" version="1">
  <Participating>
    <Equipment id="red-fighter1">
      <Name>歼-16-01</Name>
      <VisualModel alias="fj" uri="fj/ZDJ_01_v3.glb" scale="0.08" minimumPixelSize="72" headingOffsetDeg="90" pitchOffsetDeg="-4" rollOffsetDeg="2"/>
      <Components>
        <Component id="red-fighter1-mover">
          <Type>air_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>127.75</Longitude>
            <Latitude>26.38</Latitude>
            <Altitude>11000</Altitude>
          </InitialState>
        </Component>
      </Components>
      <Loadout>
        <Weapons><Weapon id="aim-120d"/></Weapons>
      </Loadout>
    </Equipment>
  </Participating>
  <Supporting>
    <Equipment id="blue-radar1">
      <Name>AN/TPY-2</Name>
      <VisualModel alias="ld" uri="ld/ld_01.glb" scale="0.006" minimumPixelSize="64"/>
      <Components>
        <Component id="blue-radar1-mover">
          <Type>facility_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>127.78</Longitude>
            <Latitude>26.34</Latitude>
            <Altitude>0</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
  </Supporting>
  <VisualEffects enabled="true">
    <WeaponEffects enabled="true">
      <WeaponEffect weaponId="aim-120d" trailEnabled="true" trailColor="#ffd24a" trailWidth="3" iconStyle="missile" modelAlias="dd" modelUri="dd/XHDD_01.glb" modelScale="0.04" modelMinimumPixelSize="48" modelHeadingOffsetDeg="180" modelPitchOffsetDeg="-8" modelRollOffsetDeg="1"/>
    </WeaponEffects>
    <ExplosionEffects enabled="true"/>
  </VisualEffects>
</Scenario>`;

  globalThis.DOMParser = TestDOMParser as any;
  globalThis.XMLSerializer = TestXMLSerializer as any;
  globalThis.document = {
    implementation: new TestDocument().implementation,
  } as unknown as Document;

  const scenario = new XmlScenarioParser().parse(xml);
  const fighter = scenario.forces[0].entities[0];
  const radar = scenario.forces[1].entities[0];

  assert.equal(fighter.visualModel?.alias, 'fj');
  assert.equal(fighter.visualModel?.uri, 'fj/ZDJ_01_v3.glb');
  assert.equal(fighter.visualModel?.scale, 0.08);
  assert.equal(fighter.visualModel?.minimumPixelSize, 72);
  assert.equal(fighter.visualModel?.headingOffsetDeg, 90);
  assert.equal(fighter.visualModel?.pitchOffsetDeg, -4);
  assert.equal(fighter.visualModel?.rollOffsetDeg, 2);
  assert.equal(radar.visualModel?.alias, 'ld');
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.alias, 'dd');
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.uri, 'dd/XHDD_01.glb');
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.headingOffsetDeg, 180);
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.pitchOffsetDeg, -8);
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.rollOffsetDeg, 1);

  const exported = new XmlScenarioExporter().export(scenario);
  assert.match(exported, /<VisualModel alias="fj" uri="fj\/ZDJ_01_v3\.glb" scale="0.08" minimumPixelSize="72" headingOffsetDeg="90" pitchOffsetDeg="-4" rollOffsetDeg="2"\/>/);
  assert.match(exported, /<VisualModel alias="ld" uri="ld\/ld_01\.glb" scale="0.006" minimumPixelSize="64"\/>/);
  assert.match(exported, /modelAlias="dd"/);
  assert.match(exported, /modelUri="dd\/XHDD_01\.glb"/);
  assert.match(exported, /modelMinimumPixelSize="48"/);
  assert.match(exported, /modelPitchOffsetDeg="-8"/);
  assert.match(exported, /modelRollOffsetDeg="1"/);
});
