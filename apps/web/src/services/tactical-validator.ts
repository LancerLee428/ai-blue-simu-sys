// apps/web/src/services/tactical-validator.ts
import type { TacticalScenario, EntitySpec, Route, DetectionZone, GeoPosition } from '../types/tactical-scenario';

/**
 * 战术约束验证错误
 */
export interface ValidationError {
  type: 'geography' | 'logic' | 'spacing' | 'completeness';
  message: string;
  details?: any;
}

/**
 * 战术约束验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * 战术约束验证服务
 */
export class TacticalValidator {
  /**
   * 验证完整战术方案
   */
  validate(scenario: TacticalScenario): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. 地域验证
    errors.push(...this.validateGeography(scenario));

    // 2. 攻防逻辑验证
    errors.push(...this.validateLogic(scenario));

    // 3. 兵力分散验证
    errors.push(...this.validateSpacing(scenario));

    // 4. 完整性验证
    errors.push(...this.validateCompleteness(scenario));

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 地域约束验证
   */
  private validateGeography(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const force of scenario.forces) {
      for (const entity of force.entities) {
        const error = this.validateEntityPosition(entity, force.side);
        if (error) errors.push(error);
      }
    }

    return errors;
  }

  /**
   * 验证单个实体位置
   */
  private validateEntityPosition(entity: EntitySpec, side: 'red' | 'blue'): ValidationError | null {
    const { longitude, latitude } = entity.position;

    if (side === 'red') {
      // 红方允许区域：中国大陆、台湾岛
      const inChina = this.isInMainlandChina(longitude, latitude);
      const inTaiwan = this.isInTaiwan(longitude, latitude);
      const inInternational = this.isInInternationalSpace(longitude, latitude);

      // 禁止出现在日本陆地
      const inJapan = this.isInJapan(longitude, latitude);
      if (inJapan) {
        return {
          type: 'geography',
          message: `红方实体 ${entity.name} 不能出现在日本陆地`,
          details: { entityId: entity.id, position: entity.position },
        };
      }

      // 允许在中国、台湾、公海
      if (!inChina && !inTaiwan && !inInternational) {
        return {
          type: 'geography',
          message: `红方实体 ${entity.name} 位置不符合部署规则`,
          details: { entityId: entity.id, position: entity.position },
        };
      }
    } else {
      // 蓝方允许区域：日本本土、冲绳
      const inJapan = this.isInJapan(longitude, latitude);
      const inInternational = this.isInInternationalSpace(longitude, latitude);

      // 禁止出现在中国大陆或台湾岛
      const inChina = this.isInMainlandChina(longitude, latitude);
      const inTaiwan = this.isInTaiwan(longitude, latitude);
      if (inChina || inTaiwan) {
        return {
          type: 'geography',
          message: `蓝方实体 ${entity.name} 不能出现在中国陆地或台湾岛`,
          details: { entityId: entity.id, position: entity.position },
        };
      }

      // 允许在日本、公海
      if (!inJapan && !inInternational) {
        return {
          type: 'geography',
          message: `蓝方实体 ${entity.name} 位置不符合部署规则`,
          details: { entityId: entity.id, position: entity.position },
        };
      }
    }

    return null;
  }

  /**
   * 检查是否在中国大陆
   */
  private isInMainlandChina(longitude: number, latitude: number): boolean {
    return longitude >= 73 && longitude <= 135 && latitude >= 18 && latitude <= 53;
  }

  /**
   * 检查是否在台湾岛
   */
  private isInTaiwan(longitude: number, latitude: number): boolean {
    return longitude >= 119 && longitude <= 122 && latitude >= 21 && latitude <= 25;
  }

  /**
   * 检查是否在日本本土/冲绳
   */
  private isInJapan(longitude: number, latitude: number): boolean {
    // 日本本土
    const inMainland = longitude >= 129 && longitude <= 145 && latitude >= 30 && latitude <= 46;
    // 冲绳
    const inOkinawa = longitude >= 127 && longitude <= 129 && latitude >= 25 && latitude <= 27;
    return inMainland || inOkinawa;
  }

  /**
   * 检查是否在公海/国际领空
   */
  private isInInternationalSpace(longitude: number, latitude: number): boolean {
    // 简化判定：不在上述任何陆地区域内
    return !this.isInMainlandChina(longitude, latitude) &&
           !this.isInTaiwan(longitude, latitude) &&
           !this.isInJapan(longitude, latitude);
  }

  /**
   * 攻防逻辑验证
   */
  private validateLogic(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    // 验证进攻路线
    errors.push(...this.validateRoutes(scenario));

    // 验证探测范围
    errors.push(...this.validateDetectionZones(scenario));

    return errors;
  }

  /**
   * 验证进攻路线
   */
  private validateRoutes(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const route of scenario.routes || []) {
      // 检查路线是否有明确目标（通过终点位置判断）
      if (route.points.length < 2) {
        errors.push({
          type: 'logic',
          message: `实体 ${route.entityId} 的路线点数量不足`,
          details: { route },
        });
        continue;
      }

      const endPoint = route.points[route.points.length - 1].position;

      // 检查路线终点是否接近潜在的敌方实体
      let hasValidTarget = false;
      for (const force of scenario.forces) {
        if (force.side === route.side) continue; // 跳过己方

        for (const entity of force.entities) {
          const distance = this.calculateDistance(endPoint, entity.position);
          if (distance <= 50000) { // 50km 内
            hasValidTarget = true;
            break;
          }
        }
        if (hasValidTarget) break;
      }

      if (!hasValidTarget) {
        errors.push({
          type: 'logic',
          message: `实体 ${route.entityId} 的进攻路线没有明确的打击目标（终点50km内无敌方实体）`,
          details: { route, endPoint },
        });
      }
    }

    return errors;
  }

  /**
   * 验证探测范围
   */
  private validateDetectionZones(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const zone of scenario.detectionZones || []) {
      // 检查探测范围是否覆盖潜在威胁方向
      // 简化判定：探测范围内应该有潜在威胁（红方探测蓝方，蓝方探测红方）

      let hasThreatCoverage = false;
      for (const force of scenario.forces) {
        if (force.side === zone.side) continue; // 跳过己方

        for (const entity of force.entities) {
          const distance = this.calculateDistance(zone.center, entity.position);
          if (distance <= zone.radiusMeters) {
            hasThreatCoverage = true;
            break;
          }
        }
        if (hasThreatCoverage) break;
      }

      if (!hasThreatCoverage) {
        errors.push({
          type: 'logic',
          message: `实体 ${zone.entityId} 的探测范围没有覆盖任何潜在威胁`,
          details: { zone },
        });
      }
    }

    return errors;
  }

  /**
   * 兵力分散验证
   */
  private validateSpacing(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];
    const MIN_SPACING_METERS = 10000; // 10km

    for (const force of scenario.forces) {
      const entities = force.entities;

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const distance = this.calculateDistance(entities[i].position, entities[j].position);

          if (distance < MIN_SPACING_METERS) {
            errors.push({
              type: 'spacing',
              message: `${force.side === 'red' ? '红方' : '蓝方'}实体 ${entities[i].name} 和 ${entities[j].name} 间距过近 (${(distance / 1000).toFixed(1)}km < 10km)`,
              details: {
                entity1: entities[i].id,
                entity2: entities[j].id,
                distance,
              },
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * 完整性验证
   */
  private validateCompleteness(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    // 检查必需字段
    if (!scenario.id) {
      errors.push({
        type: 'completeness',
        message: '方案缺少 id',
      });
    }

    if (!scenario.forces || scenario.forces.length === 0) {
      errors.push({
        type: 'completeness',
        message: '方案缺少兵力编成',
      });
    }

    if (!scenario.phases || scenario.phases.length === 0) {
      errors.push({
        type: 'completeness',
        message: '方案缺少阶段划分',
      });
    }

    return errors;
  }

  /**
   * 计算两点间距离（米）
   * 使用 Haversine 公式
   */
  private calculateDistance(pos1: GeoPosition, pos2: GeoPosition): number {
    const R = 6371000; // 地球半径（米）
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
