// apps/web/src/services/dynamic-detection.ts
import type { GeoPosition, PlatformType } from '../types/tactical-scenario';

/**
 * 环境因素
 */
export interface EnvironmentFactors {
  weather: 'clear' | 'rain' | 'fog' | 'storm';  // 天气条件
  timeOfDay: 'day' | 'night' | 'dawn' | 'dusk'; // 时间段
  seaState?: number;  // 海况等级 (0-9)
  terrain?: 'flat' | 'urban' | 'mountain' | 'forest';  // 地形类型
}

/**
 * 目标特性
 */
export interface TargetCharacteristics {
  rcs?: number;        // 雷达截面积 (m²)
  irSignature?: number; // 红外特征
  noiseLevel?: number;  // 噪声等级 (dB)
  stealth?: boolean;    // 是否隐身
}

/**
 * 动态探测范围计算器
 * P1 功能：根据环境和目标特性动态调整探测半径
 */
export class DynamicDetectionCalculator {
  /**
   * 计算动态探测范围
   * @param baseRange 基础探测范围（米）
   * @param detectorType 探测器类型
   * @param detectorPosition 探测器位置
   * @param targetPosition 目标位置（可选，用于地形遮蔽计算）
   * @param environment 环境因素
   * @param targetChar 目标特性
   * @returns 调整后的探测范围（米）
   */
  calculateDynamicRange(
    baseRange: number,
    detectorType: 'radar' | 'sonar' | 'ew' | 'optical',
    detectorPosition: GeoPosition,
    targetPosition: GeoPosition | null,
    environment: EnvironmentFactors,
    targetChar?: TargetCharacteristics,
  ): number {
    let multiplier = 1.0;

    // 1. 天气影响
    multiplier *= this.getWeatherMultiplier(detectorType, environment.weather);

    // 2. 时间段影响（主要影响光学侦察）
    multiplier *= this.getTimeOfDayMultiplier(detectorType, environment.timeOfDay);

    // 3. 地形遮蔽（如果有目标位置）
    if (targetPosition) {
      multiplier *= this.getTerrainMultiplier(
        detectorType,
        detectorPosition,
        targetPosition,
        environment.terrain,
      );
    }

    // 4. 海况影响（声纳）
    if (detectorType === 'sonar' && environment.seaState !== undefined) {
      multiplier *= this.getSeaStateMultiplier(environment.seaState);
    }

    // 5. 目标特性影响
    if (targetChar) {
      multiplier *= this.getTargetCharMultiplier(detectorType, targetChar);
    }

    // 限制调整范围：0.2x ~ 2.0x
    multiplier = Math.max(0.2, Math.min(2.0, multiplier));

    return Math.round(baseRange * multiplier);
  }

  /**
   * 天气对探测的影响
   */
  private getWeatherMultiplier(
    detectorType: 'radar' | 'sonar' | 'ew' | 'optical',
    weather: string,
  ): number {
    const weatherEffects: Record<string, Record<string, number>> = {
      radar: {
        clear: 1.0,
        rain: 0.85,   // 雨滴散射
        fog: 0.95,    // 雾对雷达影响较小
        storm: 0.7,   // 强降雨严重衰减
      },
      optical: {
        clear: 1.0,
        rain: 0.6,    // 能见度下降
        fog: 0.3,     // 雾严重影响光学
        storm: 0.4,
      },
      ew: {
        clear: 1.0,
        rain: 0.9,
        fog: 0.95,
        storm: 0.85,  // 电离层扰动
      },
      sonar: {
        clear: 1.0,
        rain: 1.05,   // 雨滴噪声反而增强声纳
        fog: 1.0,
        storm: 0.8,   // 海浪噪声干扰
      },
    };

    return weatherEffects[detectorType]?.[weather] ?? 1.0;
  }

  /**
   * 时间段对探测的影响
   */
  private getTimeOfDayMultiplier(
    detectorType: 'radar' | 'sonar' | 'ew' | 'optical',
    timeOfDay: string,
  ): number {
    if (detectorType !== 'optical') return 1.0; // 只影响光学

    const timeEffects: Record<string, number> = {
      day: 1.0,
      night: 0.4,   // 夜间光学大幅下降
      dawn: 0.7,
      dusk: 0.7,
    };

    return timeEffects[timeOfDay] ?? 1.0;
  }

  /**
   * 地形遮蔽影响
   */
  private getTerrainMultiplier(
    detectorType: 'radar' | 'sonar' | 'ew' | 'optical',
    detectorPos: GeoPosition,
    targetPos: GeoPosition,
    terrain?: string,
  ): number {
    if (!terrain) return 1.0;

    // 简化的地形遮蔽模型：基于高度差和地形类型
    const altitudeDiff = Math.abs(detectorPos.altitude - targetPos.altitude);

    const terrainEffects: Record<string, Record<string, number>> = {
      radar: {
        flat: 1.0,
        urban: 0.75,    // 城市建筑物遮蔽
        mountain: 0.6,  // 山地严重遮蔽
        forest: 0.85,   // 森林轻微遮蔽
      },
      optical: {
        flat: 1.0,
        urban: 0.7,
        mountain: 0.5,
        forest: 0.6,    // 森林严重遮蔽光学
      },
      ew: {
        flat: 1.0,
        urban: 0.8,
        mountain: 0.7,
        forest: 0.9,
      },
      sonar: {
        flat: 1.0,      // 声纳不受地形影响（水下）
        urban: 1.0,
        mountain: 1.0,
        forest: 1.0,
      },
    };

    let multiplier = terrainEffects[detectorType]?.[terrain] ?? 1.0;

    // 高度优势：探测器高于目标时增强
    if (altitudeDiff > 1000 && detectorPos.altitude > targetPos.altitude) {
      multiplier *= 1.2;
    }

    return multiplier;
  }

  /**
   * 海况对声纳的影响
   */
  private getSeaStateMultiplier(seaState: number): number {
    // 海况等级 0-9，等级越高噪声越大
    if (seaState <= 2) return 1.0;
    if (seaState <= 4) return 0.9;
    if (seaState <= 6) return 0.75;
    return 0.6;
  }

  /**
   * 目标特性影响
   */
  private getTargetCharMultiplier(
    detectorType: 'radar' | 'sonar' | 'ew' | 'optical',
    targetChar: TargetCharacteristics,
  ): number {
    let multiplier = 1.0;

    // 隐身目标大幅降低探测范围
    if (targetChar.stealth) {
      multiplier *= detectorType === 'radar' ? 0.3 : 0.7;
    }

    // RCS 影响雷达探测
    if (detectorType === 'radar' && targetChar.rcs !== undefined) {
      // RCS 每减少 10dB，探测距离减半
      // 标准目标 RCS = 1 m²，隐身目标 < 0.01 m²
      const rcsMultiplier = Math.sqrt(targetChar.rcs / 1.0);
      multiplier *= Math.max(0.2, Math.min(2.0, rcsMultiplier));
    }

    // 红外特征影响光学侦察
    if (detectorType === 'optical' && targetChar.irSignature !== undefined) {
      multiplier *= targetChar.irSignature;
    }

    // 噪声等级影响声纳
    if (detectorType === 'sonar' && targetChar.noiseLevel !== undefined) {
      // 噪声越大越容易被探测
      multiplier *= 1 + (targetChar.noiseLevel / 100);
    }

    return multiplier;
  }

  /**
   * 根据平台类型推断目标特性
   */
  inferTargetCharacteristics(platformType: PlatformType): TargetCharacteristics {
    const charMap: Record<string, TargetCharacteristics> = {
      // 隐身平台
      'air-fighter': { rcs: 0.5, stealth: false },
      'air-bomber': { rcs: 10, stealth: false },
      'ship-submarine': { noiseLevel: 20, stealth: true },

      // 大型目标
      'ship-carrier': { rcs: 100000, noiseLevel: 80 },
      'ship-destroyer': { rcs: 10000, noiseLevel: 60 },

      // 小型目标
      'uav-strike': { rcs: 0.01, stealth: true },
      'uav-recon': { rcs: 0.01, stealth: true },
    };

    return charMap[platformType] ?? { rcs: 1.0 };
  }
}
