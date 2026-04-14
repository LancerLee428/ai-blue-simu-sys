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
