// apps/web/src/services/map-renderer.ts
import * as Cesium from 'cesium';
import type {
  TacticalScenario,
  GeoPosition,
  ForceSide,
  Route,
  DetectionZone,
  EntityStatus,
  PlatformType,
} from '../types/tactical-scenario';
import { FORCE_COLORS, getEntityPixelSize } from './cesium-graphics';

/**
 * Cesium 地图渲染引擎
 * 负责将 TacticalScenario 渲染到 Cesium 地图上
 */
export class MapRenderer {
  private viewer: Cesium.Viewer;
  private entityIdSet = new Set<string>();

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  /**
   * 渲染完整战术方案
   */
  renderScenario(scenario: TacticalScenario): void {
    this.clearTacticalLayers();
    this.renderEntities(scenario);
    this.renderRoutes(scenario.routes);
    this.renderDetectionZones(scenario.detectionZones);
    this.renderStrikeTasks(scenario);
  }

  /**
   * 清空战术层（L2-L5）
   */
  clearTacticalLayers(): void {
    const toRemove: string[] = [];
    this.viewer.entities.values.forEach((e) => {
      if ((e as any).__tacticalLayer) {
        toRemove.push(e.id);
      }
    });
    toRemove.forEach((id) => this.viewer.entities.removeById(id));
    this.entityIdSet.clear();
  }

  /**
   * 渲染实体（红蓝双方兵力）
   */
  private renderEntities(scenario: TacticalScenario): void {
    scenario.forces.forEach((force) => {
      const colors = FORCE_COLORS[force.side];
      force.entities.forEach((entity) => {
        // TODO: Use entity.status when entities have status field
        const pixelSize = getEntityPixelSize(entity.type, 'planned');

        const cesiumEntity = this.viewer.entities.add({
          id: entity.id,
          name: entity.name,
          position: Cesium.Cartesian3.fromDegrees(
            entity.position.longitude,
            entity.position.latitude,
            entity.position.altitude
          ),
          point: {
            pixelSize,
            color: colors.primary,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: entity.name,
            fillColor: Cesium.Color.WHITE,
            font: '13px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -20),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            scale: 0.8,
          },
        });
        (cesiumEntity as any).__tacticalLayer = true;
        (cesiumEntity as any).__originalColor = colors.primary;
        (cesiumEntity as any).__originalPixelSize = pixelSize;
        (cesiumEntity as any).__side = force.side;
        (cesiumEntity as any).__entityType = entity.type;
        this.entityIdSet.add(entity.id);
      });
    });
  }

  /**
   * 渲染进攻路线（虚线 + 箭头）
   */
  private renderRoutes(routes: Route[]): void {
    routes.forEach((route) => {
      if (route.points.length < 2) return;
      const colors = FORCE_COLORS[route.side];
      const positions = route.points.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.position.longitude, p.position.latitude, p.position.altitude)
      );

      const polylineEntity = this.viewer.entities.add({
        id: `route-${route.entityId}`,
        name: route.label || `路线-${route.entityId}`,
        polyline: {
          positions,
          width: 3,
          material: new Cesium.PolylineDashMaterialProperty({
            color: colors.route,
            dashLength: 16,
          }),
          clampToGround: true,
        },
      });
      (polylineEntity as any).__tacticalLayer = true;

      if (positions.length >= 2) {
        const arrowEntity = this.viewer.entities.add({
          id: `route-arrow-${route.entityId}`,
          name: '方向箭头',
          position: positions[positions.length - 1],
          point: {
            pixelSize: 10,
            color: colors.route,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
        (arrowEntity as any).__tacticalLayer = true;
      }
    });
  }

  /**
   * 渲染探测范围（半透明椭圆）
   */
  private renderDetectionZones(zones: DetectionZone[]): void {
    zones.forEach((zone) => {
      const colors = FORCE_COLORS[zone.side];
      const center = Cesium.Cartesian3.fromDegrees(
        zone.center.longitude,
        zone.center.latitude,
        zone.center.altitude
      );

      const entity = this.viewer.entities.add({
        id: `detection-${zone.entityId}`,
        name: zone.label || '探测范围',
        position: center,
        ellipse: {
          semiMajorAxis: zone.radiusMeters,
          semiMinorAxis: zone.radiusMeters,
          material: colors.detectionFill,
          outline: true,
          outlineColor: colors.detectionOutline,
          outlineWidth: 2,
          height: zone.center.altitude,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: zone.label || `${(zone.radiusMeters / 1000).toFixed(0)}km`,
          fillColor: colors.detectionOutline,
          font: '12px sans-serif',
          pixelOffset: new Cesium.Cartesian2(10, 10),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          scale: 0.7,
        },
      });
      (entity as any).__tacticalLayer = true;
    });
  }

  /**
   * 渲染打击任务（打击点标记）
   */
  private renderStrikeTasks(scenario: TacticalScenario): void {
    scenario.strikeTasks.forEach((task) => {
      let targetPosition: GeoPosition | null = null;
      for (const force of scenario.forces) {
        const found = force.entities.find((e) => e.id === task.targetEntityId);
        if (found) { targetPosition = found.position; break; }
      }
      if (!targetPosition) return;

      const attackerForce = scenario.forces.find((f) =>
        f.entities.some((e) => e.id === task.attackerEntityId)
      );
      const side = attackerForce?.side || 'red';
      const colors = FORCE_COLORS[side];

      const entity = this.viewer.entities.add({
        id: `strike-${task.id}`,
        name: `打击-${task.id}`,
        position: Cesium.Cartesian3.fromDegrees(
          targetPosition.longitude,
          targetPosition.latitude,
          targetPosition.altitude
        ),
        point: {
          pixelSize: 20,
          color: colors.attack,
          outlineColor: Cesium.Color.YELLOW,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: 'X',
          fillColor: Cesium.Color.RED,
          font: 'bold 16px sans-serif',
          scale: 1.0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      (entity as any).__tacticalLayer = true;
      (entity as any).__strikeTask = task;
    });
  }

  /**
   * 更新实体位置
   */
  updateEntityPosition(entityId: string, position: GeoPosition): void {
    const cesiumEntity = this.viewer.entities.getById(entityId);
    if (cesiumEntity) {
      (cesiumEntity as any).position = Cesium.Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude
      );
      // Restore original color if it was highlighted
      const originalColor = (cesiumEntity as any).__originalColor;
      if (originalColor) {
        (cesiumEntity.point as any).color = originalColor;
        (cesiumEntity.point as any).pixelSize = ((cesiumEntity as any).__originalPixelSize as number) || 14;
      }
    }
  }

  /**
   * 更新实体状态样式
   */
  updateEntityStatus(entityId: string, status: EntityStatus, side: ForceSide): void {
    const cesiumEntity = this.viewer.entities.getById(entityId);
    if (cesiumEntity && cesiumEntity.point) {
      const colors = FORCE_COLORS[side];
      const entityType = (cesiumEntity as any).__entityType as PlatformType;

      const pixelSize = getEntityPixelSize(entityType, status);
      const pointAny = cesiumEntity.point as any;
      pointAny.pixelSize = pixelSize;
      pointAny.color = status === 'destroyed'
        ? Cesium.Color.GRAY
        : colors.primary;
    }
  }

  /**
   * 触发打击动画
   */
  triggerStrikeAnimation(strikeId: string): void {
    const entity = this.viewer.entities.getById(`strike-${strikeId}`);
    if (!entity) return;
    const task = (entity as any).__strikeTask;
    if (!task) return;
    const attackerForce = this.viewer.entities.values.find((e) => e.id === task?.attackerEntityId);
    const side = attackerForce ? (attackerForce as any).__side : 'red';
    const colors = FORCE_COLORS[side as ForceSide];
    let alpha = 1.0;
    const handler = () => {
      alpha -= 0.05;
      if (alpha <= 0) {
        this.viewer.scene.postRender.removeEventListener(handler);
        return;
      }
      if (entity.point) {
        (entity.point as any).color = Cesium.Color.fromAlpha(colors.attack, alpha);
      }
    };
    this.viewer.scene.postRender.addEventListener(handler);
  }

  /**
   * 获取战术实体 ID 列表
   */
  getTacticalEntityIds(): string[] {
    return Array.from(this.entityIdSet);
  }

  /**
   * 聚焦到战术区域
   */
  flyToScenario(scenario: TacticalScenario): void {
    const entityIds = scenario.forces.flatMap((force) =>
      force.entities.map((entity) => entity.id)
    );
    const entities = entityIds
      .map((id) => this.viewer.entities.getById(id))
      .filter((e): e is Cesium.Entity => e !== undefined);

    if (entities.length > 0) {
      this.viewer.flyTo(entities, {
        duration: 2,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-45),
          100000
        ),
      });
    }
  }
}
