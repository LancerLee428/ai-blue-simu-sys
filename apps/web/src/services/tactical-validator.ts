// apps/web/src/services/tactical-validator.ts
import type { TacticalScenario, EntitySpec, Route, DetectionZone, GeoPosition } from '../types/tactical-scenario';
import { PLATFORM_META } from '../types/tactical-scenario';

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

    // 1. 地域验证（红蓝方边界）
    errors.push(...this.validateGeography(scenario));

    // 2. 部署域约束验证（高度/陆/海规则）
    errors.push(...this.validateDomainConstraints(scenario));

    // 3. 攻防逻辑验证
    errors.push(...this.validateLogic(scenario));

    // 4. 兵力分散验证
    errors.push(...this.validateSpacing(scenario));

    // 5. 完整性验证
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
   * 
   * 判定优先级（从小区域到大区域，解决 bounding box 重叠问题）：
   *   台湾 → 冲绳 → 日本本土 → 中国大陆 → 公海
   */
  private validateEntityPosition(entity: EntitySpec, side: 'red' | 'blue'): ValidationError | null {
    const { longitude, latitude } = entity.position;

    // 按面积从小到大判定，精确区域优先
    const inTaiwan  = this.isInTaiwan(longitude, latitude);
    const inOkinawa = this.isInOkinawa(longitude, latitude);
    const inJapan   = this.isInJapanMainland(longitude, latitude);
    // 中国判定排除日本/冲绳重叠区域
    const inChina   = this.isInMainlandChina(longitude, latitude) && !inJapan && !inOkinawa;

    if (side === 'red') {
      // 红方禁止出现在日本本土（排除重叠区域后的纯日本区域）
      if ((inJapan || inOkinawa) && !inChina) {
        return {
          type: 'geography',
          message: `红方实体 ${entity.name} 不能出现在日本陆地`,
          details: { entityId: entity.id, position: entity.position },
        };
      }
      // 红方允许：中国、台湾、公海
      return null;
    } else {
      // 蓝方禁止出现在中国大陆或台湾岛
      if (inChina || inTaiwan) {
        return {
          type: 'geography',
          message: `蓝方实体 ${entity.name} 不能出现在中国陆地或台湾岛`,
          details: { entityId: entity.id, position: entity.position },
        };
      }
      // 蓝方允许：日本、冲绳、公海
      return null;
    }
  }

  /**
   * 检查是否在中国大陆（缩小东边界到 125°E，避免与日本九州重叠）
   */
  private isInMainlandChina(longitude: number, latitude: number): boolean {
    return longitude >= 73 && longitude <= 125 && latitude >= 18 && latitude <= 53;
  }

  /**
   * 检查是否在台湾岛
   */
  private isInTaiwan(longitude: number, latitude: number): boolean {
    return longitude >= 119 && longitude <= 122 && latitude >= 21 && latitude <= 25.5;
  }

  /**
   * 检查是否在冲绳群岛（单独判定，避免被中国 bbox 误判）
   */
  private isInOkinawa(longitude: number, latitude: number): boolean {
    return longitude >= 126 && longitude <= 129 && latitude >= 24 && latitude <= 27;
  }

  /**
   * 检查是否在日本本土（九州、四国、本州、北海道）
   */
  private isInJapanMainland(longitude: number, latitude: number): boolean {
    return longitude >= 129 && longitude <= 146 && latitude >= 30 && latitude <= 46;
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
      // 检查路线点数量
      if (route.points.length < 2) {
        errors.push({
          type: 'logic',
          message: `实体 ${route.entityId} 的路线点数量不足`,
          details: { route },
        });
        continue;
      }

      const endPoint = route.points[route.points.length - 1].position;

      // 检查路线终点是否接近某个敌方实体（放宽到 100km）
      let hasValidTarget = false;
      for (const force of scenario.forces) {
        if (force.side === route.side) continue;

        for (const entity of force.entities) {
          const distance = this.calculateDistance(endPoint, entity.position);
          if (distance <= 100000) { // 100km 内
            hasValidTarget = true;
            break;
          }
        }
        if (hasValidTarget) break;
      }

      if (!hasValidTarget) {
        errors.push({
          type: 'logic',
          message: `实体 ${route.entityId} 的进攻路线没有明确的打击目标（终点100km内无敌方实体）`,
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
      let hasThreatCoverage = false;
      for (const force of scenario.forces) {
        if (force.side === zone.side) continue;

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
        // 降级为警告，不阻塞方案
        console.warn(`[验证警告] 实体 ${zone.entityId} 的探测范围没有覆盖任何潜在威胁`);
      }
    }

    return errors;
  }

  /**
   * 兵力分散验证
   */
  private validateSpacing(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];
    const MIN_SPACING_METERS = 5000; // 放宽到 5km

    for (const force of scenario.forces) {
      const entities = force.entities;

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const distance = this.calculateDistance(entities[i].position, entities[j].position);

          if (distance < MIN_SPACING_METERS) {
            errors.push({
              type: 'spacing',
              message: `${force.side === 'red' ? '红方' : '蓝方'}实体 ${entities[i].name} 和 ${entities[j].name} 间距过近 (${(distance / 1000).toFixed(1)}km < 5km)`,
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

    if (!scenario.id) {
      errors.push({ type: 'completeness', message: '方案缺少 id' });
    }
    if (!scenario.forces || scenario.forces.length === 0) {
      errors.push({ type: 'completeness', message: '方案缺少兵力编成' });
    }
    if (!scenario.phases || scenario.phases.length === 0) {
      errors.push({ type: 'completeness', message: '方案缺少阶段划分' });
    }

    return errors;
  }

  // ---------------------------------------------------------------------------
  // 部署域约束验证
  // ---------------------------------------------------------------------------

  /**
   * 验证所有实体的部署域约束
   * 规则来源：PLATFORM_META 元数据表
   */
  private validateDomainConstraints(scenario: TacticalScenario): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const force of scenario.forces) {
      for (const entity of force.entities) {
        errors.push(...this.validateEntityDomain(entity));
      }
    }

    return errors;
  }

  /**
   * 验证单个实体的域约束
   */
  private validateEntityDomain(entity: EntitySpec): ValidationError[] {
    const errors: ValidationError[] = [];
    const meta = PLATFORM_META[entity.type];

    if (!meta) {
      // 未知类型，跳过（兼容性保护）
      return errors;
    }

    const alt = entity.position.altitude ?? 0;
    const category = meta.category;

    // ── 规则 1：地面类实体不允许有飞行高度（> 500m 视为错误） ──
    if (category === 'ground' || category === 'facility') {
      if (alt > 500) {
        errors.push({
          type: 'geography',
          message: `${entity.name}（${entity.type}）是地面/设施单元，不能部署在 ${alt}m 高空（最大 500m）`,
          details: { entityId: entity.id, altitude: alt },
        });
      }
    }

    // ── 规则 2：海面类实体 altitude 必须为 0（±10m 容差） ──
    if (category === 'naval') {
      // 潜艇允许负高度（水下）；其他海面舰须 ≈ 0
      if (entity.type !== 'ship-submarine' && Math.abs(alt) > 10) {
        errors.push({
          type: 'geography',
          message: `${entity.name}（${entity.type}）是水面舰艇，altitude 应为 0，当前为 ${alt}m`,
          details: { entityId: entity.id, altitude: alt },
        });
      }
      // 潜艇若 altitude > 10 也不合法（不应在空中）
      if (entity.type === 'ship-submarine' && alt > 10) {
        errors.push({
          type: 'geography',
          message: `${entity.name}（潜艇）altitude 应为 0 或负数（水下），当前为 ${alt}m`,
          details: { entityId: entity.id, altitude: alt },
        });
      }
    }

    // ── 规则 3：空中类实体若 altitude = 0 记为警告（由修正器处理，不阻断） ──
    // 该规则在 fixAltitudes 中处理，这里仅做双向检查：地面实体不可过高

    // ── 规则 4：地面/设施实体不能坐标落在公海（经验判断：若 terrainRequirement=land，
    //    而坐标既不在已知陆地区域，视为警告，不阻断整个方案） ──
    // 当前不做强制，由地理验证器负责陆海区分

    return errors;
  }

  /**
   * 计算两点间距离（米）- Haversine 公式
   */
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
