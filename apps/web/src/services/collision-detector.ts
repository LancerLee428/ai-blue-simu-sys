// apps/web/src/services/collision-detector.ts
import type { GeoPosition, PlatformType } from '../types/tactical-scenario';

/**
 * 碰撞检测器
 * 检测飞机穿山、舰艇上岸等违规情况
 */
export class CollisionDetector {
  /**
   * 检查位置是否合法
   */
  checkPosition(position: GeoPosition, platformType: PlatformType): CollisionResult {
    const terrain = this.getTerrainType(position);
    const violations: string[] = [];

    // 空中平台不能穿山
    if (this.isAirPlatform(platformType)) {
      const groundElevation = this.getGroundElevation(position);
      if (position.altitude < groundElevation + 100) {
        violations.push(`飞机高度 ${position.altitude}m 低于地面高度 ${groundElevation}m，会撞山`);
      }
    }

    // 舰艇不能上岸
    if (this.isShipPlatform(platformType)) {
      if (terrain === 'land') {
        violations.push(`舰艇位于陆地上 (${position.longitude.toFixed(2)}, ${position.latitude.toFixed(2)})`);
      }
    }

    // 地面单位不能在海上
    if (this.isGroundPlatform(platformType)) {
      if (terrain === 'water') {
        violations.push(`地面单位位于海上 (${position.longitude.toFixed(2)}, ${position.latitude.toFixed(2)})`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      terrain,
    };
  }

  /**
   * 获取地形类型（简化版本）
   */
  private getTerrainType(position: GeoPosition): 'land' | 'water' | 'mountain' {
    const { longitude, latitude } = position;

    // 中国大陆
    if (longitude >= 73 && longitude <= 135 && latitude >= 18 && latitude <= 53) {
      // 山区判断（简化）
      if (
        (longitude >= 85 && longitude <= 105 && latitude >= 27 && latitude <= 40) || // 青藏高原
        (longitude >= 100 && longitude <= 110 && latitude >= 30 && latitude <= 35)   // 秦岭
      ) {
        return 'mountain';
      }
      return 'land';
    }

    // 日本列岛
    if (longitude >= 129 && longitude <= 146 && latitude >= 30 && latitude <= 46) {
      return 'land';
    }

    // 台湾岛
    if (longitude >= 119 && longitude <= 122 && latitude >= 21 && latitude <= 25) {
      return 'land';
    }

    // 琉球群岛
    if (longitude >= 123 && longitude <= 131 && latitude >= 24 && latitude <= 31) {
      return 'land';
    }

    // 其他区域默认为海洋
    return 'water';
  }

  /**
   * 获取地面高程（简化版本）
   */
  private getGroundElevation(position: GeoPosition): number {
    const terrain = this.getTerrainType(position);

    if (terrain === 'mountain') {
      // 山区高程 1000-5000m
      return 2000 + Math.random() * 3000;
    }

    if (terrain === 'land') {
      // 平原高程 0-500m
      return Math.random() * 500;
    }

    // 海洋高程 0m
    return 0;
  }

  private isAirPlatform(type: PlatformType): boolean {
    return type.startsWith('air-') || type.startsWith('helo-') || type.startsWith('uav-');
  }

  private isShipPlatform(type: PlatformType): boolean {
    return type.startsWith('ship-');
  }

  private isGroundPlatform(type: PlatformType): boolean {
    return type.startsWith('ground-') || type.startsWith('facility-');
  }
}

export interface CollisionResult {
  valid: boolean;
  violations: string[];
  terrain: 'land' | 'water' | 'mountain';
}
