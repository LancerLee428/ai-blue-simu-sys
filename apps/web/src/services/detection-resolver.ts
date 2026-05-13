// apps/web/src/services/detection-resolver.ts
import type { EntitySpec, DetectionZone, GeoPosition, TacticalScenario } from '../types/tactical-scenario';

/**
 * AI 声明式探测意图（AI 只需生成这个）
 */
export interface DetectionIntent {
  entityId: string;
  type: 'radar' | 'sonar' | 'ew' | 'optical';
  side: 'red' | 'blue';
}

/**
 * 平台类型 → 探测类型 → 默认半径（米）
 */
const DETECTION_RANGE_TABLE: Record<string, Record<string, number>> = {
  // 空中力量
  'air-fighter':     { radar: 150000, ew: 80000, optical: 30000 },
  'air-multirole':   { radar: 160000, ew: 90000, optical: 30000 },
  'air-bomber':      { radar: 120000, ew: 60000, optical: 20000 },
  'air-jammer':      { radar: 200000, ew: 300000, optical: 40000 },
  'air-aew':         { radar: 500000, ew: 400000, optical: 100000 },
  'air-recon':       { radar: 350000, ew: 200000, optical: 80000 },
  'helo-attack':     { radar: 60000,  ew: 30000, optical: 15000 },
  'helo-transport':  { radar: 40000,  optical: 10000 },
  'uav-strike':      { radar: 100000, optical: 50000 },
  'uav-recon':       { radar: 150000, optical: 80000, ew: 60000 },
  'uav-swarm':       { radar: 30000,  optical: 20000 },
  'space-satellite': { radar: 50000000, optical: 50000000, ew: 50000000 },
  // 海上力量
  'ship-carrier':    { radar: 400000, sonar: 100000, ew: 200000 },
  'ship-destroyer':  { radar: 250000, sonar: 60000, ew: 120000 },
  'ship-frigate':    { radar: 200000, sonar: 80000, ew: 100000 },
  'ship-submarine':  { sonar: 150000, radar: 30000 },
  'ship-amphibious': { radar: 150000, sonar: 40000 },
  'ship-usv':        { radar: 50000, optical: 30000 },
  // 地面力量
  'ground-tank':     { optical: 8000,  radar: 15000 },
  'ground-ifv':      { optical: 6000 },
  'ground-spg':      { radar: 30000, optical: 10000 },
  'ground-mlrs':     { radar: 50000 },
  'ground-sam':      { radar: 200000, ew: 100000 },
  'ground-radar':    { radar: 400000, ew: 200000 },
  'ground-ew':       { ew: 300000, radar: 150000 },
  'ground-hq':       { radar: 100000 },
  // 设施
  'facility-airbase': { radar: 300000 },
  'facility-port':    { radar: 150000 },
  'facility-radar':   { radar: 500000, ew: 300000 },
};

/**
 * 具有自动探测能力的平台类型集合
 */
const AUTO_SENSOR_TYPES = new Set([
  'air-aew', 'air-recon', 'air-jammer',
  'air-fighter', 'air-multirole',
  'space-satellite',
  'ship-carrier', 'ship-destroyer', 'ship-frigate',
  'ground-sam', 'ground-radar', 'ground-ew',
  'facility-radar',
]);

/**
 * 探测范围解析器
 * 将 AI 的声明式探测意图转换为具体的探测范围数据
 */
export class DetectionResolver {
  /**
   * 从声明式意图解析探测范围
   */
  resolveFromIntent(intent: DetectionIntent, scenario: TacticalScenario): DetectionZone | null {
    const entity = this.findEntity(scenario, intent.entityId);
    if (!entity) {
      console.warn(`[探测解析] 找不到实体: ${intent.entityId}`);
      return null;
    }

    // 根据平台类型和探测类型获取默认半径
    let radius = DETECTION_RANGE_TABLE[entity.type]?.[intent.type] ?? 50000;

    // 检查是否能覆盖至少一个对手，如果不能则自动扩大
    const nearestEnemy = this.findNearestEnemy(entity, scenario);
    if (nearestEnemy) {
      const dist = this.calculateDistance(entity.position, nearestEnemy.position);
      if (dist > radius) {
        // 扩大到最近敌方距离的 1.1 倍，但不超过 500km
        radius = Math.min(dist * 1.1, 500000);
      }
    }

    return {
      entityId: intent.entityId,
      side: intent.side,
      center: { ...entity.position },
      radiusMeters: Math.round(radius),
      label: this.generateLabel(entity.name, intent.type),
    };
  }

  /**
   * 补全现有探测范围：如果半径不够则扩大
   * 用于兼容 AI 直接给半径的旧格式
   */
  fixDetectionZone(zone: DetectionZone, scenario: TacticalScenario): DetectionZone {
    // 找最近的敌方实体
    let nearestDist = Infinity;
    for (const force of scenario.forces) {
      if (force.side === zone.side) continue;
      for (const entity of force.entities) {
        const dist = this.calculateDistance(zone.center, entity.position);
        if (dist < nearestDist) {
          nearestDist = dist;
        }
      }
    }

    // 如果当前半径覆盖不到最近敌方，扩大到 1.1 倍距离
    if (nearestDist > zone.radiusMeters && nearestDist < 500000) {
      zone.radiusMeters = Math.round(nearestDist * 1.1);
    }

    return zone;
  }

  /**
   * 为方案中所有没有探测范围的感知平台自动添加
   */
  autoAssignDetectionZones(scenario: TacticalScenario): DetectionZone[] {
    const existingEntityIds = new Set(
      (scenario.detectionZones || []).map(z => z.entityId)
    );

    const autoZones: DetectionZone[] = [];

    for (const force of scenario.forces) {
      for (const entity of force.entities) {
        if (existingEntityIds.has(entity.id)) continue;
        if (!AUTO_SENSOR_TYPES.has(entity.type)) continue;

        const zone = this.resolveFromIntent(
          { entityId: entity.id, type: 'radar', side: force.side },
          scenario,
        );
        if (zone) autoZones.push(zone);
      }
    }

    return autoZones;
  }

  private findEntity(scenario: TacticalScenario, entityId: string): EntitySpec | null {
    for (const force of scenario.forces) {
      const entity = force.entities.find(e => e.id === entityId);
      if (entity) return entity;
    }
    return null;
  }

  private findNearestEnemy(entity: EntitySpec, scenario: TacticalScenario): EntitySpec | null {
    let nearest: EntitySpec | null = null;
    let nearestDist = Infinity;

    for (const force of scenario.forces) {
      if (force.side === entity.side) continue;
      for (const enemy of force.entities) {
        const dist = this.calculateDistance(entity.position, enemy.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = enemy;
        }
      }
    }

    return nearest;
  }

  private generateLabel(entityName: string, type: string): string {
    const typeLabels: Record<string, string> = {
      radar: '雷达探测范围',
      sonar: '声纳探测范围',
      ew: '电子战覆盖范围',
      optical: '光学侦察范围',
    };
    return `${entityName} ${typeLabels[type] ?? '探测范围'}`;
  }

  private calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
    const R = 6371000;
    const lat1Rad = (pos1.latitude * Math.PI) / 180;
    const lat2Rad = (pos2.latitude * Math.PI) / 180;
    const deltaLatRad = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}
