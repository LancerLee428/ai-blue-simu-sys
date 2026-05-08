// apps/web/src/services/electronic-warfare.ts
import type { EntitySpec, DetectionZone, GeoPosition } from '../types/tactical-scenario';

/**
 * 电子战效果管理器
 * 处理电子战机干扰、雷达压制等效果
 */
export class ElectronicWarfareManager {
  private jammerZones: Map<string, JammerZone> = new Map();

  reset(): void {
    this.jammerZones.clear();
  }

  /**
   * 注册电子战机干扰区域
   */
  registerJammer(entity: EntitySpec): void {
    if (!this.isJammerPlatform(entity.type)) return;

    const jammerZone: JammerZone = {
      entityId: entity.id,
      position: entity.position,
      radius: this.getJammerRadius(entity.type),
      power: this.getJammerPower(entity.type),
      active: true,
    };

    this.jammerZones.set(entity.id, jammerZone);
  }

  /**
   * 更新干扰机位置
   */
  updateJammerPosition(entityId: string, position: GeoPosition): void {
    const zone = this.jammerZones.get(entityId);
    if (zone) {
      zone.position = position;
    }
  }

  overrideJammerRadius(entityId: string, radiusMeters: number): void {
    const zone = this.jammerZones.get(entityId);
    if (zone && radiusMeters > 0) {
      zone.radius = radiusMeters;
    }
  }

  /**
   * 计算探测范围受干扰后的实际范围
   */
  calculateJammedDetectionRange(
    detectionZone: DetectionZone,
    observerEntity: EntitySpec,
    allEntities: EntitySpec[],
  ): number {
    let originalRange = detectionZone.radiusMeters;
    let jammedRange = originalRange;

    // 检查是否有敌方干扰机在附近
    for (const entity of allEntities) {
      if (entity.side === observerEntity.side) continue;

      const jammerZone = this.jammerZones.get(entity.id);
      if (!jammerZone || !jammerZone.active) continue;

      const distance = this.calculateDistance(observerEntity.position, jammerZone.position);

      // 如果在干扰范围内
      if (distance < jammerZone.radius) {
        // 干扰强度随距离衰减
        const jamStrength = jammerZone.power * (1 - distance / jammerZone.radius);

        // 探测范围缩减（最多缩减到 20%）
        const reductionFactor = Math.max(0.2, 1 - jamStrength * 0.8);
        jammedRange = Math.min(jammedRange, originalRange * reductionFactor);
      }
    }

    return jammedRange;
  }

  /**
   * 获取干扰区域可视化数据
   */
  getJammerVisualization(entityId: string): JammerVisualization | null {
    const zone = this.jammerZones.get(entityId);
    if (!zone || !zone.active) return null;

    return {
      entityId: zone.entityId,
      position: zone.position,
      radius: zone.radius,
      power: zone.power,
      color: 'rgba(255, 100, 0, 0.3)', // 橙色半透明
      pulseSpeed: 2.0, // 脉冲动画速度
    };
  }

  getActiveJammerZones(): JammerVisualization[] {
    return Array.from(this.jammerZones.values())
      .filter(zone => zone.active)
      .map(zone => ({
        entityId: zone.entityId,
        position: zone.position,
        radius: zone.radius,
        power: zone.power,
        color: 'rgba(255, 100, 0, 0.3)',
        pulseSpeed: 2.0,
      }));
  }

  /**
   * 激活/停用干扰机
   */
  setJammerActive(entityId: string, active: boolean): void {
    const zone = this.jammerZones.get(entityId);
    if (zone) {
      zone.active = active;
    }
  }

  private isJammerPlatform(type: string): boolean {
    return type === 'air-jammer' || type === 'ground-ew';
  }

  private getJammerRadius(type: string): number {
    switch (type) {
      case 'air-jammer':
        return 150000; // 150km 干扰半径
      case 'ground-ew':
        return 80000; // 80km 干扰半径
      default:
        return 50000;
    }
  }

  private getJammerPower(type: string): number {
    switch (type) {
      case 'air-jammer':
        return 0.8; // 80% 干扰强度
      case 'ground-ew':
        return 0.6; // 60% 干扰强度
      default:
        return 0.5;
    }
  }

  private calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
    const R = 6371000;
    const lat1 = (pos1.latitude * Math.PI) / 180;
    const lat2 = (pos2.latitude * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLon = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

interface JammerZone {
  entityId: string;
  position: GeoPosition;
  radius: number;
  power: number;
  active: boolean;
}

interface JammerVisualization {
  entityId: string;
  position: GeoPosition;
  radius: number;
  power: number;
  color: string;
  pulseSpeed: number;
}
