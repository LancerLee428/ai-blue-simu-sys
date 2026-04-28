// apps/web/src/services/route-generator.ts
import type { GeoPosition, Route, RoutePoint, EntitySpec, TacticalScenario } from '../types/tactical-scenario';

/**
 * AI 声明式路线意图（AI 只需生成这个）
 */
export interface RouteIntent {
  entityId: string;
  targetEntityId: string;
  side: 'red' | 'blue';
  approach: 'direct' | 'flanking-north' | 'flanking-south' | 'low-altitude';
  label?: string;
}

/**
 * 路线生成器
 * 将 AI 的声明式路线意图转换为具体航路点
 */
export class RouteGenerator {
  /**
   * 从声明式意图生成完整路线
   */
  generateFromIntent(intent: RouteIntent, scenario: TacticalScenario): Route | null {
    const startEntity = this.findEntity(scenario, intent.entityId);
    const targetEntity = this.findEntity(scenario, intent.targetEntityId);

    if (!startEntity || !targetEntity) {
      console.warn(`[路线生成] 找不到实体: ${intent.entityId} -> ${intent.targetEntityId}`);
      return null;
    }

    const points = this.interpolateRoute(
      startEntity.position,
      targetEntity.position,
      intent.approach,
      startEntity.type,  // 传入实体类型用于高度约束
    );

    return {
      entityId: intent.entityId,
      side: intent.side,
      points,
      label: intent.label ?? this.generateLabel(intent.approach),
    };
  }

  /**
   * 补全现有路线：确保终点接近目标实体
   * 用于兼容 AI 直接给坐标的旧格式
   */
  fixRouteEndpoint(route: Route, scenario: TacticalScenario): Route {
    if (route.points.length < 2) return route;

    const endPoint = route.points[route.points.length - 1].position;

    // 找最近的敌方实体
    let nearestEnemy: EntitySpec | null = null;
    let nearestDist = Infinity;

    for (const force of scenario.forces) {
      if (force.side === route.side) continue;
      for (const entity of force.entities) {
        const dist = this.calculateDistance(endPoint, entity.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestEnemy = entity;
        }
      }
    }

    // 如果终点距离最近敌方 > 100km，自动延伸到敌方位置
    if (nearestEnemy && nearestDist > 100000) {
      route.points.push({ position: { ...nearestEnemy.position } });
    }

    return route;
  }

  /**
   * 在两点间插值生成航路点（带高度约束）
   */
  private interpolateRoute(
    start: GeoPosition,
    end: GeoPosition,
    approach: string,
    entityType: string,
  ): RoutePoint[] {
    const points: RoutePoint[] = [];

    // 根据实体类型确定合适的巡航高度
    const cruiseAltitude = this.getCruiseAltitude(entityType, start.altitude);

    // 起点
    points.push({ position: { ...start } });

    const midLon = (start.longitude + end.longitude) / 2;
    const midLat = (start.latitude + end.latitude) / 2;
    const dLon = end.longitude - start.longitude;
    const dLat = end.latitude - start.latitude;

    switch (approach) {
      case 'flanking-north': {
        // 北侧迂回：中间点向北偏移（适度弯曲）
        const offset = Math.abs(dLon) * 0.1;
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.3,
            latitude: start.latitude + dLat * 0.3 + offset,
            altitude: cruiseAltitude,
          },
        });
        points.push({
          position: {
            longitude: midLon,
            latitude: midLat + offset * 1.2,
            altitude: cruiseAltitude,
          },
        });
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.7,
            latitude: start.latitude + dLat * 0.7 + offset * 0.6,
            altitude: cruiseAltitude,
          },
        });
        break;
      }
      case 'flanking-south': {
        // 南侧迂回：中间点向南偏移（适度弯曲）
        const offset = Math.abs(dLon) * 0.1;
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.3,
            latitude: start.latitude + dLat * 0.3 - offset,
            altitude: cruiseAltitude,
          },
        });
        points.push({
          position: {
            longitude: midLon,
            latitude: midLat - offset * 1.2,
            altitude: cruiseAltitude,
          },
        });
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.7,
            latitude: start.latitude + dLat * 0.7 - offset * 0.6,
            altitude: cruiseAltitude,
          },
        });
        break;
      }
      case 'low-altitude': {
        // 低空突防：多个中间点，高度逐渐降低（但不能贴地）
        const minAltitude = this.getMinAltitude(entityType);
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.25,
            latitude: start.latitude + dLat * 0.25,
            altitude: cruiseAltitude * 0.7,
          },
        });
        points.push({
          position: {
            longitude: midLon,
            latitude: midLat,
            altitude: Math.max(minAltitude, cruiseAltitude * 0.4),
          },
        });
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.75,
            latitude: start.latitude + dLat * 0.75,
            altitude: Math.max(minAltitude, cruiseAltitude * 0.5),
          },
        });
        break;
      }
      default: {
        // 直线进攻：简单插值
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.33,
            latitude: start.latitude + dLat * 0.33,
            altitude: cruiseAltitude,
          },
        });
        points.push({
          position: {
            longitude: start.longitude + dLon * 0.67,
            latitude: start.latitude + dLat * 0.67,
            altitude: cruiseAltitude,
          },
        });
      }
    }

    // 终点
    points.push({ position: { ...end } });

    return points;
  }

  /**
   * 根据实体类型获取巡航高度
   */
  private getCruiseAltitude(entityType: string, startAltitude: number): number {
    // 空中平台
    if (entityType.startsWith('air-fighter') || entityType.startsWith('air-multirole')) {
      return Math.max(8000, startAltitude);
    }
    if (entityType.startsWith('air-bomber') || entityType.startsWith('air-aew')) {
      return Math.max(10000, startAltitude);
    }
    if (entityType.startsWith('air-recon')) {
      return Math.max(12000, startAltitude);
    }
    if (entityType.startsWith('helo-')) {
      return Math.max(500, startAltitude);
    }
    if (entityType.startsWith('uav-')) {
      return Math.max(3000, startAltitude);
    }

    // 海面舰艇必须在水面
    if (entityType.startsWith('ship-') && !entityType.includes('submarine')) {
      return 0;
    }

    // 潜艇在水下
    if (entityType.includes('submarine')) {
      return Math.min(-50, startAltitude);
    }

    // 地面单位
    return 0;
  }

  /**
   * 根据实体类型获取最低安全高度
   */
  private getMinAltitude(entityType: string): number {
    if (entityType.startsWith('air-')) {
      return 1000; // 飞机最低 1000m
    }
    if (entityType.startsWith('helo-')) {
      return 200; // 直升机最低 200m
    }
    if (entityType.startsWith('uav-')) {
      return 500; // 无人机最低 500m
    }
    return 0;
  }

  private findEntity(scenario: TacticalScenario, entityId: string): EntitySpec | null {
    for (const force of scenario.forces) {
      const entity = force.entities.find(e => e.id === entityId);
      if (entity) return entity;
    }
    return null;
  }

  private generateLabel(approach: string): string {
    const labels: Record<string, string> = {
      direct: '直接突击路线',
      'flanking-north': '北侧迂回路线',
      'flanking-south': '南侧迂回路线',
      'low-altitude': '低空突防路线',
    };
    return labels[approach] ?? '进攻路线';
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
