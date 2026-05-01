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
    type: 'belongs_to' | 'can_command' | 'can_communicate' | 'can_detect' | 'can_strike' | 'can_support' | 'deployable_to' | 'suitable_for';
    from: string;
    to: string;
    label: string;
    metadata: Record<string, string | number | boolean>;
};
export declare const ONTOLOGY_ROOTS: readonly ["ForceUnit", "Platform", "GeoZone", "Mission"];
export declare const demoForceUnits: {
    id: string;
    unitName: string;
    unitType: "ground";
    forceSide: "blue";
    commandRelation: string;
    standardSymbolCode: string;
    maxSpeed: number;
    maxRange: number;
    sensorRange: number;
    strikeRange: number;
    dataSource: string;
    confidence: "high";
}[];
export declare const demoPlatforms: {
    id: string;
    platformName: string;
    platformType: "ship";
    weaponSystems: never[];
    sensorTypes: string[];
    propulsionType: string;
    sizeClass: "medium";
    maxSpeed: number;
    maxRange: number;
    sensorRange: number;
    strikeRange: number;
    dataSource: string;
    confidence: "high";
}[];
export declare const demoGeoZones: {
    id: string;
    zoneName: string;
    zoneType: "operation-zone";
    polygon: {
        type: string;
        coordinates: number[][][];
    };
    altitudeBand: {
        min: number;
        max: number;
    };
    controlAuthority: string;
    dataSource: string;
}[];
export declare const demoResourceGraphNodes: DemoResourceGraphNode[];
export declare const demoResourceGraphRelationships: DemoResourceGraphRelationship[];
