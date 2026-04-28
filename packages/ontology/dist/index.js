export const ONTOLOGY_ROOTS = ['ForceUnit', 'Platform', 'GeoZone', 'Mission'];
export const demoForceUnits = [
    {
        id: 'force-source-101',
        unitName: '蓝军机动对抗分队',
        unitType: 'ground',
        forceSide: 'blue',
        commandRelation: 'force-source-102',
        standardSymbolCode: 'SFGPU-----------',
        maxSpeed: 80,
        maxRange: 500,
        sensorRange: 50,
        strikeRange: 30,
        dataSource: 'demo',
        confidence: 'high',
    },
];
export const demoPlatforms = [
    {
        id: 'platform-source-207',
        platformName: '电子侦察平台-07',
        platformType: 'ship',
        weaponSystems: [],
        sensorTypes: ['electronic'],
        propulsionType: 'diesel',
        sizeClass: 'medium',
        maxSpeed: 30,
        maxRange: 2000,
        sensorRange: 100,
        strikeRange: 0,
        dataSource: 'demo',
        confidence: 'high',
    },
];
export const demoGeoZones = [
    {
        id: 'geo-zone-tw-001',
        zoneName: '台湾北部空域',
        zoneType: 'operation-zone',
        polygon: {
            type: 'Polygon',
            coordinates: [[[121.0, 25.1], [122.0, 25.1], [122.0, 26.0], [121.0, 26.0], [121.0, 25.1]]],
        },
        altitudeBand: { min: 0, max: 10000 },
        controlAuthority: 'blue',
        dataSource: 'demo',
    },
];
