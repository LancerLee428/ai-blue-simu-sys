// apps/web/src/services/detection-interaction.ts
import type { TacticalScenario, DetectionZone, GeoPosition, ForceSide } from '../types/tactical-scenario';
import type { ElectronicWarfareManager } from './electronic-warfare';

/**
 * 探测事件
 */
export interface DetectionEvent {
  detectorEntityId: string;      // 探测方实体 ID
  detectedEntityId: string;      // 被探测实体 ID
  detectorSide: ForceSide;       // 探测方阵营
  detectedSide: ForceSide;       // 被探测方阵营
  timestamp: number;             // 事件时间戳（秒）
  distance: number;              // 距离（米）
  detectionType: 'radar' | 'sonar' | 'ew' | 'optical';
}

/**
 * 探测交互引擎
 * 负责检测敌方实体进入我方探测范围的事件
 */
export class DetectionInteraction {
  private scenario: TacticalScenario | null = null;
  private onDetectionEvent?: (event: DetectionEvent) => void;

  // 记录已触发的探测事件（避免重复触发）
  private firedDetections = new Set<string>();

  setScenario(scenario: TacticalScenario): void {
    this.scenario = scenario;
    this.firedDetections.clear();
  }

  setOnDetectionEvent(callback: (event: DetectionEvent) => void): void {
    this.onDetectionEvent = callback;
  }

  /**
   * 检查探测交互（在每帧动画中调用）
   * @param entityPositions 当前所有实体的位置快照
   * @param currentTime 当前虚拟时间（秒）
   * @param ewManager 电子战管理器（可选）
   */
  checkDetections(
    entityPositions: Map<string, GeoPosition>,
    currentTime: number,
    ewManager?: ElectronicWarfareManager
  ): void {
    if (!this.scenario) return;

    const detectionZones = this.scenario.detectionZones || [];
    const allEntities = this.scenario.forces.flatMap(force => force.entities);

    detectionZones.forEach((zone) => {
      // 找到探测方实体
      let detectorEntity = allEntities.find(entity => entity.id === zone.entityId) ?? null;
      for (const force of this.scenario!.forces) {
        const found = force.entities.find(e => e.id === zone.entityId);
        if (found) {
          detectorEntity = {
            ...found,
            position: entityPositions.get(found.id) ?? found.position,
          };
          break;
        }
      }
      if (!detectorEntity) return;

      // 检查所有敌方实体
      for (const force of this.scenario!.forces) {
        if (force.side === detectorEntity.side) continue; // 跳过己方

        for (const entity of force.entities) {
          const entityPos = entityPositions.get(entity.id);
          if (!entityPos) continue;

          const distance = this.calculateDistance(zone.center, entityPos);

          // 应用电子战干扰效果
          let effectiveRadius = zone.radiusMeters;
          if (ewManager) {
            const detectionType = this.inferDetectionType(zone.label || '');
            if (detectionType === 'radar') {
              effectiveRadius = ewManager.calculateJammedDetectionRange(
                zone,
                detectorEntity,
                allEntities,
              );
            }
          }

          // 如果敌方进入探测范围
          if (distance <= effectiveRadius) {
            const eventKey = `${zone.entityId}-${entity.id}`;

            // 避免重复触发
            if (!this.firedDetections.has(eventKey)) {
              this.firedDetections.add(eventKey);

              const detectionEvent: DetectionEvent = {
                detectorEntityId: zone.entityId,
                detectedEntityId: entity.id,
                detectorSide: detectorEntity.side,
                detectedSide: force.side,
                timestamp: currentTime,
                distance,
                detectionType: this.inferDetectionType(zone.label || ''),
              };

              this.onDetectionEvent?.(detectionEvent);
            }
          }
        }
      }
    });
  }

  /**
   * 重置探测记录（用于推演重新开始时）
   */
  reset(): void {
    this.firedDetections.clear();
  }

  /**
   * 从探测范围标签推断探测类型
   */
  private inferDetectionType(label: string): 'radar' | 'sonar' | 'ew' | 'optical' {
    if (label.includes('雷达')) return 'radar';
    if (label.includes('声纳')) return 'sonar';
    if (label.includes('电子战')) return 'ew';
    if (label.includes('光学') || label.includes('侦察')) return 'optical';
    return 'radar'; // 默认
  }

  /**
   * 计算两点间距离（Haversine 公式）
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
