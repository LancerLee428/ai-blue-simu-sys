export type DemoResourceGraphNode = {
  id: string;
  type: 'force-unit' | 'platform' | 'weapon' | 'sensor' | 'geo-zone' | 'mission';
  name: string;
  side?: 'red' | 'blue' | 'neutral';
  capabilities: string[];
  status: 'available' | 'unavailable' | 'reserved';
  metadata: Record<string, string | number | boolean | string[]>;
};

export type DemoResourceGraphRelationship = {
  id: string;
  type:
    | 'belongs_to'
    | 'can_command'
    | 'can_communicate'
    | 'can_detect'
    | 'can_strike'
    | 'can_support'
    | 'deployable_to'
    | 'suitable_for';
  from: string;
  to: string;
  label: string;
  metadata: Record<string, string | number | boolean>;
};

export const ONTOLOGY_ROOTS = ['ForceUnit', 'Platform', 'GeoZone', 'Mission'] as const;

export const demoForceUnits = [
  {
    id: 'force-source-101',
    unitName: '蓝军机动对抗分队',
    unitType: 'ground' as const,
    forceSide: 'blue' as const,
    commandRelation: 'force-source-102',
    standardSymbolCode: 'SFGPU-----------',
    maxSpeed: 80,
    maxRange: 500,
    sensorRange: 50,
    strikeRange: 30,
    dataSource: 'demo',
    confidence: 'high' as const,
  },
];

export const demoPlatforms = [
  {
    id: 'platform-source-207',
    platformName: '电子侦察平台-07',
    platformType: 'ship' as const,
    weaponSystems: [],
    sensorTypes: ['electronic'],
    propulsionType: 'diesel',
    sizeClass: 'medium' as const,
    maxSpeed: 30,
    maxRange: 2000,
    sensorRange: 100,
    strikeRange: 0,
    dataSource: 'demo',
    confidence: 'high' as const,
  },
];

export const demoGeoZones = [
  {
    id: 'geo-zone-tw-001',
    zoneName: '台湾北部空域',
    zoneType: 'operation-zone' as const,
    polygon: {
      type: 'Polygon',
      coordinates: [[[121.0, 25.1], [122.0, 25.1], [122.0, 26.0], [121.0, 26.0], [121.0, 25.1]]],
    },
    altitudeBand: { min: 0, max: 10000 },
    controlAuthority: 'blue',
    dataSource: 'demo',
  },
];

export const demoResourceGraphNodes: DemoResourceGraphNode[] = [
  {
    id: 'unit-blue-c2-001',
    type: 'force-unit',
    name: '蓝方联合指挥节点',
    side: 'blue',
    capabilities: ['command_link', 'communication_control'],
    status: 'available',
    metadata: {
      echelon: 'joint-command',
      homeRegion: '台湾东部海域',
    },
  },
  {
    id: 'platform-blue-recon-001',
    type: 'platform',
    name: '电子侦察平台-07',
    side: 'blue',
    capabilities: ['air_recon', 'ew_support', 'electronic_detection'],
    status: 'available',
    metadata: {
      platformType: 'air-recon',
      maxRangeKm: 1800,
      sensorRangeKm: 350,
      defaultLongitude: 123.8,
      defaultLatitude: 24.6,
      defaultAltitude: 9000,
    },
  },
  {
    id: 'platform-blue-jammer-001',
    type: 'platform',
    name: '电子压制平台-03',
    side: 'blue',
    capabilities: ['ew_support', 'communication_jamming'],
    status: 'available',
    metadata: {
      platformType: 'air-jammer',
      maxRangeKm: 1500,
      sensorRangeKm: 180,
      defaultLongitude: 124.2,
      defaultLatitude: 24.9,
      defaultAltitude: 8500,
    },
  },
  {
    id: 'platform-blue-strike-001',
    type: 'platform',
    name: '远程打击编队-11',
    side: 'blue',
    capabilities: ['long_range_strike', 'anti_surface_strike'],
    status: 'available',
    metadata: {
      platformType: 'air-multirole',
      maxRangeKm: 2200,
      strikeRangeKm: 450,
      defaultLongitude: 123.5,
      defaultLatitude: 24.1,
      defaultAltitude: 10000,
    },
  },
  {
    id: 'sensor-blue-electronic-001',
    type: 'sensor',
    name: '宽域电子侦察载荷',
    side: 'blue',
    capabilities: ['electronic_detection', 'signal_intercept'],
    status: 'available',
    metadata: {
      sensorType: 'ew',
      rangeKm: 350,
    },
  },
  {
    id: 'weapon-blue-stand-off-001',
    type: 'weapon',
    name: '防区外精确打击弹药',
    side: 'blue',
    capabilities: ['long_range_strike'],
    status: 'available',
    metadata: {
      weaponType: 'stand-off',
      rangeKm: 450,
    },
  },
  {
    id: 'geo-zone-east-taiwan-sea',
    type: 'geo-zone',
    name: '台湾东部海域',
    side: 'neutral',
    capabilities: ['air_operation_area', 'maritime_operation_area'],
    status: 'available',
    metadata: {
      lonMin: 122,
      lonMax: 126,
      latMin: 22,
      latMax: 26,
    },
  },
  {
    id: 'mission-recon-strike',
    type: 'mission',
    name: '侦察打击任务',
    side: 'neutral',
    capabilities: ['air_recon', 'ew_support', 'long_range_strike', 'command_link'],
    status: 'available',
    metadata: {
      missionType: '侦察打击',
    },
  },
];

export const demoResourceGraphRelationships: DemoResourceGraphRelationship[] = [
  {
    id: 'rel-blue-c2-command-recon',
    type: 'can_command',
    from: 'unit-blue-c2-001',
    to: 'platform-blue-recon-001',
    label: '指挥电子侦察平台',
    metadata: { latencyMs: 80 },
  },
  {
    id: 'rel-blue-c2-command-jammer',
    type: 'can_command',
    from: 'unit-blue-c2-001',
    to: 'platform-blue-jammer-001',
    label: '指挥电子压制平台',
    metadata: { latencyMs: 90 },
  },
  {
    id: 'rel-blue-c2-command-strike',
    type: 'can_command',
    from: 'unit-blue-c2-001',
    to: 'platform-blue-strike-001',
    label: '指挥远程打击编队',
    metadata: { latencyMs: 120 },
  },
  {
    id: 'rel-recon-carries-sensor',
    type: 'belongs_to',
    from: 'sensor-blue-electronic-001',
    to: 'platform-blue-recon-001',
    label: '侦察载荷挂载于电子侦察平台',
    metadata: {},
  },
  {
    id: 'rel-strike-carries-weapon',
    type: 'belongs_to',
    from: 'weapon-blue-stand-off-001',
    to: 'platform-blue-strike-001',
    label: '防区外弹药挂载于远程打击编队',
    metadata: {},
  },
  {
    id: 'rel-recon-detects-zone',
    type: 'can_detect',
    from: 'platform-blue-recon-001',
    to: 'geo-zone-east-taiwan-sea',
    label: '电子侦察平台覆盖台湾东部海域',
    metadata: { rangeKm: 350 },
  },
  {
    id: 'rel-strike-covers-zone',
    type: 'can_strike',
    from: 'platform-blue-strike-001',
    to: 'geo-zone-east-taiwan-sea',
    label: '远程打击编队覆盖台湾东部海域',
    metadata: { rangeKm: 450 },
  },
  {
    id: 'rel-recon-communicates-jammer',
    type: 'can_communicate',
    from: 'platform-blue-recon-001',
    to: 'platform-blue-jammer-001',
    label: '侦察平台向压制平台共享目标信号',
    metadata: { bandwidthMbps: 20 },
  },
  {
    id: 'rel-jammer-supports-strike',
    type: 'can_support',
    from: 'platform-blue-jammer-001',
    to: 'platform-blue-strike-001',
    label: '电子压制平台支援远程打击编队',
    metadata: {},
  },
  {
    id: 'rel-mission-suitable-recon',
    type: 'suitable_for',
    from: 'platform-blue-recon-001',
    to: 'mission-recon-strike',
    label: '电子侦察平台适合侦察打击任务',
    metadata: {},
  },
  {
    id: 'rel-mission-suitable-strike',
    type: 'suitable_for',
    from: 'platform-blue-strike-001',
    to: 'mission-recon-strike',
    label: '远程打击编队适合侦察打击任务',
    metadata: {},
  },
  {
    id: 'rel-platform-deployable-east-taiwan',
    type: 'deployable_to',
    from: 'platform-blue-recon-001',
    to: 'geo-zone-east-taiwan-sea',
    label: '电子侦察平台可部署至台湾东部海域',
    metadata: {},
  },
];
