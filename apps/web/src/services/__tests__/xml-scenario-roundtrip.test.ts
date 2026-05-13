import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
      <VisualModel alias="fj" uri="fj/ZDJ_01_v3.glb" scale="0.08" minimumPixelSize="72" headingOffsetDeg="90" pitchOffsetDeg="-4" rollOffsetDeg="2" color="#31f5ff" colorBlendMode="mix" colorBlendAmount="0.7" silhouetteColor="#ffffff" silhouetteSize="2"/>
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
  assert.equal(fighter.visualModel?.color, '#31f5ff');
  assert.equal(fighter.visualModel?.colorBlendMode, 'mix');
  assert.equal(fighter.visualModel?.colorBlendAmount, 0.7);
  assert.equal(fighter.visualModel?.silhouetteColor, '#ffffff');
  assert.equal(fighter.visualModel?.silhouetteSize, 2);
  assert.equal(radar.visualModel?.alias, 'ld');
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.alias, 'dd');
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.uri, 'dd/XHDD_01.glb');
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.headingOffsetDeg, 180);
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.pitchOffsetDeg, -8);
  assert.equal(scenario.visualEffects?.weaponEffects.items[0].visualModel?.rollOffsetDeg, 1);

  const exported = new XmlScenarioExporter().export(scenario);
  assert.match(exported, /<VisualModel alias="fj" uri="fj\/ZDJ_01_v3\.glb" scale="0.08" minimumPixelSize="72" headingOffsetDeg="90" pitchOffsetDeg="-4" rollOffsetDeg="2" color="#31f5ff" colorBlendMode="mix" colorBlendAmount="0.7" silhouetteColor="#ffffff" silhouetteSize="2"\/>/);
  assert.match(exported, /<VisualModel alias="ld" uri="ld\/ld_01\.glb" scale="0.006" minimumPixelSize="64"\/>/);
  assert.match(exported, /modelAlias="dd"/);
  assert.match(exported, /modelUri="dd\/XHDD_01\.glb"/);
  assert.match(exported, /modelMinimumPixelSize="48"/);
  assert.match(exported, /modelPitchOffsetDeg="-8"/);
  assert.match(exported, /modelRollOffsetDeg="1"/);
});

test('XML parser and exporter should preserve entity formation role markers', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scenario id="formation-role-demo" version="1">
  <Participating>
    <Equipment id="red-lead" formationRole="L">
      <Name>红方长机</Name>
      <Components>
        <Component id="red-lead-mover">
          <Type>air_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>121</Longitude>
            <Latitude>25</Latitude>
            <Altitude>10000</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
  </Participating>
  <Supporting>
    <Equipment id="blue-command">
      <Name>蓝方指控节点</Name>
      <FormationRole>C</FormationRole>
      <Components>
        <Component id="blue-command-mover">
          <Type>facility_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>122</Longitude>
            <Latitude>25.5</Latitude>
            <Altitude>0</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
  </Supporting>
</Scenario>`;

  globalThis.DOMParser = TestDOMParser as any;
  globalThis.XMLSerializer = TestXMLSerializer as any;
  globalThis.document = {
    implementation: new TestDocument().implementation,
  } as unknown as Document;

  const scenario = new XmlScenarioParser().parse(xml);
  const redLead = scenario.forces[0].entities[0];
  const blueCommand = scenario.forces[1].entities[0];

  assert.equal(redLead.formationRole, 'L');
  assert.equal(blueCommand.formationRole, 'C');

  const exported = new XmlScenarioExporter().export(scenario);
  assert.match(exported, /<FormationRole>L<\/FormationRole>/);
  assert.match(exported, /<FormationRole>C<\/FormationRole>/);
});

test('XML parser should infer ground electronic warfare vehicles separately from air jammers', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scenario id="ew-type-demo" version="1">
  <Supporting>
    <Equipment id="blue-ew">
      <Name>蓝方电子战车-01</Name>
      <Components>
        <Component id="blue-ew-mover">
          <Type>ground-ew_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>113</Longitude>
            <Latitude>34</Latitude>
            <Altitude>0</Altitude>
          </InitialState>
        </Component>
        <Component id="blue-ew-suite">
          <Name>电子战压制系统</Name>
          <Type>sensor_ew</Type>
        </Component>
      </Components>
    </Equipment>
  </Supporting>
</Scenario>`;

  globalThis.DOMParser = TestDOMParser as any;
  const scenario = new XmlScenarioParser().parse(xml);
  const blueForce = scenario.forces.find(force => force.side === 'blue');

  assert.equal(blueForce?.entities[0]?.type, 'ground-ew');
});

test('XML parser and exporter should preserve hierarchical formation groups', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Scenario id="formation-group-demo" version="1">
  <Participating>
    <Equipment id="red-air-01">
      <Name>红方飞机01</Name>
      <FormationRole>L</FormationRole>
      <Components>
        <Component id="red-air-01-mover">
          <Type>air_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>121</Longitude>
            <Latitude>25</Latitude>
            <Altitude>10000</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
    <Equipment id="red-air-02">
      <Name>红方飞机02</Name>
      <FormationRole>L</FormationRole>
      <Components>
        <Component id="red-air-02-mover">
          <Type>air_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>121.1</Longitude>
            <Latitude>25.1</Latitude>
            <Altitude>10000</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
    <Equipment id="red-radar-01">
      <Name>红方雷达01</Name>
      <FormationRole>C</FormationRole>
      <Components>
        <Component id="red-radar-01-mover">
          <Type>facility_mover</Type>
          <InitialState>
            <PositionType>Geodetic</PositionType>
            <Longitude>122</Longitude>
            <Latitude>25.5</Latitude>
            <Altitude>0</Altitude>
          </InitialState>
        </Component>
      </Components>
    </Equipment>
  </Participating>
  <Interactions>
    <Groups>
      <Group id="red-group-01" name="红方空情引导编组1" side="red" type="formation">
        <Group id="red-group-01-air" name="飞机1" type="category" formationRole="L">
          <Member equipRef="red-air-01" role="飞机1-L"/>
          <Member equipRef="red-air-02" role="飞机1-L"/>
        </Group>
        <Group id="red-group-01-radar" name="雷达1" type="category" formationRole="C">
          <Member equipRef="red-radar-01" role="雷达1-C"/>
        </Group>
      </Group>
    </Groups>
  </Interactions>
</Scenario>`;

  globalThis.DOMParser = TestDOMParser as any;
  globalThis.XMLSerializer = TestXMLSerializer as any;
  globalThis.document = {
    implementation: new TestDocument().implementation,
  } as unknown as Document;

  const scenario = new XmlScenarioParser().parse(xml);
  const group = scenario.interactions?.groups[0];

  assert.equal(group?.side, 'red');
  assert.equal(group?.children?.length, 2);
  assert.equal(group?.members.length, 3);
  assert.equal(group?.children?.[0].name, '飞机1');
  assert.equal(group?.children?.[0].formationRole, 'L');
  assert.equal(group?.members[0].categoryName, '飞机1');
  assert.equal(group?.members[2].categoryName, '雷达1');
  assert.equal(group?.members[2].formationRole, 'C');

  const exported = new XmlScenarioExporter().export(scenario);
  assert.match(exported, /<Group id="red-group-01" name="红方空情引导编组1" side="red" type="formation">/);
  assert.match(exported, /<Group id="red-group-01-air" name="飞机1" type="category" formationRole="L">/);
  assert.match(exported, /<Group id="red-group-01-radar" name="雷达1" type="category" formationRole="C">/);
  assert.match(exported, /<Member equipRef="red-air-01" role="飞机1-L"\/>/);
  assert.match(exported, /<Member equipRef="red-radar-01" role="雷达1-C"\/>/);
});

test('Example XML should configure limited red radar tracking, EW diversion, and missile intercept launches', () => {
  const xml = readFileSync('data-example/东海-动态推演-0513.xml', 'utf8');
  globalThis.DOMParser = TestDOMParser as any;

  const scenario = new XmlScenarioParser().parse(xml);
  const redRadarZones = scenario.detectionZones.filter(zone => (
    zone.side === 'red'
    && zone.label?.includes('雷达探测范围')
  ));
  const recommendations = scenario.postRunRecommendations ?? [];
  const redEwZones = scenario.detectionZones.filter(zone => zone.label?.includes('电子战干扰'));
  const satelliteZone = scenario.detectionZones.find(zone => zone.entityId === 'red-g05-satellite-01');
  const ewEffects = scenario.visualEffects?.electronicWarfareEffects;
  const performance = scenario.visualEffects?.performance;
  const strikeAttackers = scenario.strikeTasks.map(task => task.attackerEntityId);
  const allTrajectoryAltitudes = scenario.strikeTasks.flatMap(task =>
    task.weaponTrajectory?.points.map(point => point.position.altitude) ?? [],
  );
  const redSatellite = scenario.forces
    .flatMap(force => force.entities)
    .find(entity => entity.id === 'red-g05-satellite-01');
  const redRadarEntityIds = scenario.forces
    .flatMap(force => force.entities)
    .filter(entity => entity.side === 'red' && /-radar-/.test(entity.id))
    .map(entity => entity.id)
    .sort();
  const blueMissileEntityIds = scenario.forces
    .flatMap(force => force.entities)
    .filter(entity => entity.side === 'blue' && /-missile-/.test(entity.id))
    .map(entity => entity.id);
  const blueGroups = scenario.interactions?.groups.filter(group => group.side === 'blue') ?? [];
  const redGroups = scenario.interactions?.groups.filter(group => group.side === 'red') ?? [];
  const attackEvents = scenario.phases.flatMap(phase => phase.events).filter(event => event.type === 'attack');
  const detectionEvents = scenario.phases.flatMap(phase => phase.events).filter(event => event.type === 'detection');
  const recommendationEvent = scenario.phases
    .flatMap(phase => phase.events)
    .find(event => event.detail.includes('推荐在山东半岛烟台外缘再部署一部补盲雷达'));

  assert.deepEqual(redRadarEntityIds, [
    'red-g01-radar-01',
    'red-g01-radar-02',
    'red-g02-radar-01',
    'red-g02-radar-02',
    'red-g03-radar-01',
    'red-g03-radar-02',
    'red-g04-radar-01',
    'red-g04-radar-02',
  ]);
  assert.equal(redSatellite?.side, 'red');
  assert.equal(redSatellite?.type, 'space-satellite');
  assert.equal(redSatellite?.visualModel?.alias, 'wx');
  assert.deepEqual(redSatellite?.loadout?.sensors, ['optical', 'radar']);
  assert.ok((redSatellite?.position.altitude ?? 0) >= 700_000);
  assert.equal(blueMissileEntityIds.length, 30);
  assert.equal(blueGroups.length, 6);
  assert.ok(blueGroups.every(group => group.members.length === 5));
  assert.ok(blueGroups.some(group => group.name.includes('关岛北部')));
  assert.ok(blueGroups.some(group => group.name.includes('关岛南部')));
  assert.equal(xml.includes('夏威夷'), false);
  assert.equal(redGroups.length, 5);
  assert.deepEqual(
    redRadarZones.map(zone => zone.entityId).sort(),
    ['red-g01-radar-01', 'red-g03-radar-01'],
  );
  assert.deepEqual(
    redRadarZones.filter(zone => zone.tracking?.enabled).map(zone => zone.entityId).sort(),
    ['red-g01-radar-01', 'red-g03-radar-01'],
  );
  assert.equal(redRadarZones.find(zone => zone.entityId === 'red-g01-radar-01')?.radiusMeters, 1_150_000);
  assert.equal(redRadarZones.find(zone => zone.entityId === 'red-g03-radar-01')?.radiusMeters, 1_050_000);
  assert.ok(redRadarZones.every(zone => zone.tracking?.maxTracks === 2));
  assert.equal(satelliteZone?.tracking?.enabled, true);
  assert.equal(satelliteZone?.tracking?.maxTracks, 4);
  assert.deepEqual(redEwZones.map(zone => zone.entityId), ['red-g01-radar-02']);
  assert.equal(redEwZones[0]?.radiusMeters, 800_000);
  assert.equal(ewEffects?.areaEnabled, false);
  assert.deepEqual(ewEffects?.trackingTargetTypes, ['enemy-missile']);
  assert.equal(ewEffects?.maxTracks, 1);
  assert.equal(performance?.maxActiveScans, 8);
  assert.equal(performance?.maxActivePulses, 1);
  assert.ok(scenario.strikeTasks.every(task => (task.weaponTrajectory?.points.length ?? 0) >= 4));
  assert.ok(Math.max(...allTrajectoryAltitudes) >= 8_600_000);
  assert.deepEqual(strikeAttackers.filter(id => id.startsWith('red-')), [
    'red-g01-radar-01',
    'red-g01-radar-02',
    'red-g03-radar-01',
  ]);
  assert.deepEqual(strikeAttackers.filter(id => id.startsWith('blue-')), [
    'blue-g01-missile-01',
    'blue-g02-missile-01',
    'blue-g03-missile-01',
    'blue-g05-missile-01',
  ]);
  assert.deepEqual(attackEvents.map(event => event.sourceEntityId), [
    'blue-g01-missile-01',
    'red-g01-radar-01',
    'blue-g02-missile-01',
    'blue-g03-missile-01',
    'red-g01-radar-02',
    'blue-g05-missile-01',
    'red-g03-radar-01',
  ]);
  assert.deepEqual(
    attackEvents
      .filter(event => event.sourceEntityId.startsWith('red-'))
      .map(event => event.interceptedEntityId),
    ['blue-g01-missile-01', 'blue-g02-missile-01', 'blue-g03-missile-01'],
  );
  assert.ok(detectionEvents.filter(event => event.sourceEntityId === 'red-g05-satellite-01').length >= 4);
  assert.ok(detectionEvents.some(event => event.sourceEntityId === 'red-g01-radar-01' && event.targetEntityId === 'blue-g01-missile-01'));
  assert.ok(detectionEvents.some(event => event.sourceEntityId === 'red-g03-radar-01' && event.targetEntityId === 'blue-g02-missile-01'));
  assert.equal(attackEvents.filter(event => event.targetEntityId?.includes('intercept')).length, 3);
  assert.ok(attackEvents.some(event => event.targetEntityId === 'red-diverted-impact-marker' && event.detail.includes('改变落点')));
  assert.ok(recommendationEvent);
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].type, 'radar-deployment');
  assert.equal(recommendations[0].priority, 'high');
  assert.equal(recommendations[0].location.name, '山东半岛烟台外缘补盲雷达点');
  assert.match(new XmlScenarioExporter().export(scenario), /<PostRunRecommendations>/);
});
