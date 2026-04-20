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
import { getEntityShapeCanvas } from './entity-shape-icons';
import { PLATFORM_META } from '../types/tactical-scenario';
import { generateOrbitTrack } from './orbit-calculator';

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
    // 清除旧实体，避免 "already exists" 错误
    this.viewer.entities.removeAll();
    this.entityIdSet.clear();

    this.renderEntities(scenario);
    this.renderRoutes(scenario.routes);
    this.renderDetectionZones(scenario.detectionZones);
    this.renderStrikeTasks(scenario);
    this.renderOrbitTracks(scenario);
  }

  /**
   * 清空战术层（L2-L5）
   */
  clearTacticalLayers(): void {
    const toRemove: string[] = [];
    const values = Array.from(this.viewer.entities.values);
    values.forEach((e) => {
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
        const shapeCanvas = getEntityShapeCanvas(entity.type, force.side, 'deployed');
        const imageUrl = shapeCanvas.toDataURL('image/png');

        // 空中力量高度兜底：如果 AI 生成了 altitude=0，用 PLATFORM_META.defaultAltitude
        const meta = PLATFORM_META[entity.type];
        const isAir = meta?.category === 'air';
        const renderAltitude = isAir && entity.position.altitude === 0
          ? meta.defaultAltitude
          : entity.position.altitude;

        // 有高度的实体（飞机等）不钉到地面
        const hasAltitude = renderAltitude > 100;
        const heightRef = hasAltitude
          ? Cesium.HeightReference.NONE
          : Cesium.HeightReference.CLAMP_TO_GROUND;

        const cesiumEntity = this.viewer.entities.add({
          id: entity.id,
          name: entity.name,
          position: Cesium.Cartesian3.fromDegrees(
            entity.position.longitude,
            entity.position.latitude,
            renderAltitude
          ),
          billboard: {
            image: imageUrl,
            width: shapeCanvas.width,
            height: shapeCanvas.height,
            heightReference: heightRef,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          },
          label: {
            text: entity.name,
            fillColor: Cesium.Color.WHITE,
            font: '13px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -(shapeCanvas.height / 2) - 6),
            heightReference: heightRef,
            scale: 0.8,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          },
        });
        (cesiumEntity as any).__tacticalLayer = true;
        (cesiumEntity as any).__originalColor = colors.primary;
        (cesiumEntity as any).__side = force.side;
        (cesiumEntity as any).__entityType = entity.type;
        this.entityIdSet.add(entity.id);
      });
    });
  }

  /**
   * 渲染进攻路线（虚线 + 箭头，空中不贴地）
   */
  private renderRoutes(routes: Route[]): void {
    routes.forEach((route) => {
      if (route.points.length < 2) return;
      const colors = FORCE_COLORS[route.side];
      const positions = route.points.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.position.longitude, p.position.latitude, p.position.altitude)
      );

      // 路线不使用 clampToGround——飞机在空中飞行
      const polylineEntity = this.viewer.entities.add({
        id: `route-${route.entityId}`,
        name: route.label || `路线-${route.entityId}`,
        polyline: {
          positions,
          width: 2.5,
          material: new Cesium.PolylineDashMaterialProperty({
            color: colors.route.withAlpha(0.7),
            dashLength: 12,
          }),
          clampToGround: false,
          arcType: Cesium.ArcType.GEODESIC,
        },
      });
      (polylineEntity as any).__tacticalLayer = true;

      // 末端箭头标记
      if (positions.length >= 2) {
        const arrowEntity = this.viewer.entities.add({
          id: `route-arrow-${route.entityId}`,
          name: '方向箭头',
          position: positions[positions.length - 1],
          point: {
            pixelSize: 8,
            color: colors.route,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE,
          },
        });
        (arrowEntity as any).__tacticalLayer = true;
      }
    });
  }

  /**
   * 渲染探测范围（平滑 3D 半球，无网格线）
   * 使用 Cesium EllipsoidGraphics 实现，与参考图风格一致
   */
  private renderDetectionZones(zones: DetectionZone[]): void {
    zones.forEach((zone) => {
      const colors = FORCE_COLORS[zone.side];

      const cx = zone.center.longitude;
      const cy = zone.center.latitude;
      const R = zone.radiusMeters;
      const baseAlt = Math.max(0, zone.center.altitude ?? 0);

      // 地面投影圆（表示水平探测范围）
      this.viewer.entities.add({
        id: `detection-ground-${zone.entityId}`,
        name: zone.label || '探测范围',
        position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
        ellipse: {
          semiMajorAxis: R,
          semiMinorAxis: R,
          material: colors.detectionFill,
          outline: true,
          outlineColor: colors.detectionOutline,
          outlineWidth: 1.5,
          height: baseAlt,
          heightReference: baseAlt < 10
            ? Cesium.HeightReference.CLAMP_TO_GROUND
            : Cesium.HeightReference.NONE,
        },
        label: {
          text: `${(R / 1000).toFixed(0)}km`,
          fillColor: colors.detectionOutline,
          font: '11px monospace',
          pixelOffset: new Cesium.Cartesian2(6, 6),
          scale: 0.8,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });

      // 3D 半球体（平滑无网格线，向上延伸：地面→天空）
      const hemiEntity = this.viewer.entities.add({
        id: `detection-hemi-${zone.entityId}`,
        name: '探测半球',
        position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
        ellipsoid: {
          // Cesium cone 角度：0=顶点(+Z)，PI/2=赤道平面，PI=底部(-Z)
          // minimumCone=0, maximumCone=PI/2 → 朝上的半球（地面→天空）
          radii: new Cesium.Cartesian3(R, R, R),
          minimumCone: 0,
          maximumCone: Cesium.Math.PI_OVER_TWO,
          minimumClock: 0,
          maximumClock: Cesium.Math.TWO_PI,
          fill: true,
          material: colors.detectionFill.withAlpha(0.2),
          outline: false,
          slicePartitions: 128,
          stackPartitions: 128,
          subdivisions: 128,
        },
      });
      (hemiEntity as any).__tacticalLayer = true;
    });
  }

  /**
   * 渲染打击任务（目标位置放置红叉标记）
   */
  private renderStrikeTasks(scenario: TacticalScenario): void {
    scenario.strikeTasks.forEach((task) => {
      let targetPosition: GeoPosition | null = null;
      let targetSide: 'red' | 'blue' = 'blue';
      for (const force of scenario.forces) {
        const found = force.entities.find((e) => e.id === task.targetEntityId);
        if (found) {
          targetPosition = found.position;
          targetSide = force.side;  // 目标方（用于爆炸颜色）
          break;
        }
      }
      if (!targetPosition) return;

      const entity = this.viewer.entities.add({
        id: `strike-${task.id}`,
        name: task.detail || `打击任务`,
        position: Cesium.Cartesian3.fromDegrees(
          targetPosition.longitude,
          targetPosition.latitude,
          targetPosition.altitude > 100 ? targetPosition.altitude : 0
        ),
        billboard: {
          image: this.createStrikeMarkerCanvas(),
          width: 32,
          height: 32,
          heightReference: targetPosition.altitude > 100
            ? Cesium.HeightReference.NONE
            : Cesium.HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
        },
        label: {
          text: task.detail || '打击',
          fillColor: Cesium.Color.fromCssColorString('#ff4444'),
          font: '11px monospace',
          pixelOffset: new Cesium.Cartesian2(0, 22),
          scale: 0.85,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          heightReference: targetPosition.altitude > 100
            ? Cesium.HeightReference.NONE
            : Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      (entity as any).__tacticalLayer = true;
      (entity as any).__strikeTask = task;
      (entity as any).__targetSide = targetSide;
    });
  }

  /**
   * 渲染卫星轨道线（针对有 position.orbit 的实体）
   */
  private renderOrbitTracks(scenario: TacticalScenario): void {
    scenario.forces.forEach((force) => {
      force.entities.forEach((entity) => {
        const orbit = entity.position.orbit;
        if (!orbit || orbit.type !== 'Keplerian') return;

        const trackPoints = generateOrbitTrack(orbit, 180);
        const positions = trackPoints.map((p) =>
          Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude, p.altitude)
        );

        const trackEntity = this.viewer.entities.add({
          id: `orbit-track-${entity.id}`,
          name: `${entity.name} 轨道`,
          polyline: {
            positions,
            width: 1.5,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.15,
              color: Cesium.Color.fromCssColorString('#00d6c9').withAlpha(0.6),
            }),
            clampToGround: false,
            arcType: Cesium.ArcType.NONE,
          },
        });
        (trackEntity as any).__tacticalLayer = true;
      });
    });
  }

  /**
   */
  private createStrikeMarkerCanvas(): string {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 外圈橙色圆
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 80, 0, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#ff5500';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 红色 ✕
    ctx.strokeStyle = '#ff2222';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(size - 8, size - 8);
    ctx.moveTo(size - 8, 8);
    ctx.lineTo(8, size - 8);
    ctx.stroke();

    return canvas.toDataURL('image/png');
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
    }
  }

  /**
   * 更新实体状态样式（重新生成对应状态的形状图标）
   */
  updateEntityStatus(entityId: string, status: EntityStatus, side: ForceSide): void {
    const cesiumEntity = this.viewer.entities.getById(entityId);
    if (!cesiumEntity) return;

    const entityType = (cesiumEntity as any).__entityType as PlatformType;
    if (!entityType) return;

    const shapeCanvas = getEntityShapeCanvas(entityType, side, status);
    const imageUrl = shapeCanvas.toDataURL('image/png');

    if (cesiumEntity.billboard) {
      (cesiumEntity.billboard as any).image = imageUrl;
      (cesiumEntity.billboard as any).width = shapeCanvas.width;
      (cesiumEntity.billboard as any).height = shapeCanvas.height;
    }
  }

  /**
   * 触发打击爆炸动画
   * 通过 source+target ID 匹配打击任务实体，在目标位置渲染爆炸
   */
  triggerStrikeAnimation(sourceEntityId: string, targetEntityId: string): void {
    // 遇历所有 strike-* 实体，找到 targetEntityId 匹配的那个
    let strikeEntity: Cesium.Entity | undefined;
    this.viewer.entities.values.forEach((e) => {
      if (!strikeEntity && e.id?.startsWith('strike-')) {
        const task = (e as any).__strikeTask;
        if (task && task.targetEntityId === targetEntityId) {
          strikeEntity = e;
        }
      }
    });
    if (!strikeEntity) return;

    const position = (strikeEntity as any).position?.getValue
      ? (strikeEntity as any).position.getValue(this.viewer.clock.currentTime)
      : null;
    if (!position) return;

    const targetSide: ForceSide = (strikeEntity as any).__targetSide ?? 'blue';
    this.renderStrikeExplosion(position, targetSide);
  }

  /**
   * 爆炸动画实现
   * 用 postRender 逐帧更新：
   *   - 内圈（橙色）：快速膨胀 0→40px，持续 0.6s
   *   - 外圈（红色/黄色）：慢速膨胀 0→70px，持续 1.0s
   *   - 两圈同时淡出
   */
  renderStrikeExplosion(position: Cesium.Cartesian3, targetSide: ForceSide): void {
    const startTime = Date.now();
    const INNER_DURATION = 600;  // ms
    const OUTER_DURATION = 1000; // ms
    const MAX_INNER = 40;
    const MAX_OUTER = 72;

    // 用 Billboard 渲染爆炸帧（无 Primitive，兼容性更好）
    const innerCanvas = document.createElement('canvas');
    innerCanvas.width = MAX_OUTER * 2;
    innerCanvas.height = MAX_OUTER * 2;

    const innerBill = this.viewer.entities.add({
      position,
      billboard: {
        image: innerCanvas.toDataURL(),
        width: MAX_OUTER * 2,
        height: MAX_OUTER * 2,
        heightReference: Cesium.HeightReference.NONE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    (innerBill as any).__tacticalLayer = true;

    const handler = () => {
      const elapsed = Date.now() - startTime;
      const ctx = innerCanvas.getContext('2d')!;
      const cx = MAX_OUTER;
      const cy = MAX_OUTER;

      ctx.clearRect(0, 0, innerCanvas.width, innerCanvas.height);

      // ── 外圈（红色/蓝色，依据目标方） ─────────────────
      if (elapsed < OUTER_DURATION) {
        const t2 = elapsed / OUTER_DURATION;
        const r2 = MAX_OUTER * t2;
        const a2 = Math.max(0, 1 - t2);
        const outerColor = targetSide === 'blue' ? `rgba(255,80,0,${a2 * 0.6})` : `rgba(0,150,255,${a2 * 0.6})`;
        const outerStroke = targetSide === 'blue' ? `rgba(255,200,0,${a2})` : `rgba(80,200,255,${a2})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r2, 0, Math.PI * 2);
        ctx.fillStyle = outerColor;
        ctx.fill();
        ctx.strokeStyle = outerStroke;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // ── 内圈（白→橙，高亮核心） ──────────────────────
      if (elapsed < INNER_DURATION) {
        const t1 = elapsed / INNER_DURATION;
        const r1 = MAX_INNER * t1;
        const a1 = Math.max(0, 1 - t1 * 1.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,180,${a1 * 0.9})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,120,0,${a1})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 更新 billboard 图像
      if (innerBill.billboard) {
        (innerBill.billboard as any).image = innerCanvas.toDataURL();
      }

      if (elapsed >= OUTER_DURATION) {
        this.viewer.scene.postRender.removeEventListener(handler);
        this.viewer.entities.remove(innerBill);
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
   * 聚焦到战术区域（全局视角）
   */
  flyToScenario(scenario: TacticalScenario): void {
    // 收集所有实体坐标
    const allPositions: Cesium.Cartesian3[] = [];
    scenario.forces.forEach((force) => {
      force.entities.forEach((entity) => {
        allPositions.push(
          Cesium.Cartesian3.fromDegrees(
            entity.position.longitude,
            entity.position.latitude,
            entity.position.altitude
          )
        );
      });
    });

    if (allPositions.length === 0) return;

    // 计算所有实体的边界框
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    allPositions.forEach((pos) => {
      const cart = Cesium.Cartographic.fromCartesian(pos);
      const lon = Cesium.Math.toDegrees(cart.longitude);
      const lat = Cesium.Math.toDegrees(cart.latitude);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    const spanLon = maxLon - minLon;
    const spanLat = maxLat - minLat;

    // 根据跨度计算合适的飞行高度（保证所有实体在视野内，并留有余量）
    const maxSpan = Math.max(spanLon, spanLat);
    const earthCircumference = 40075000; // 米
    const neededRange = Math.max(
      maxSpan / 360 * earthCircumference / Math.cos(centerLat * Math.PI / 180),
      500000 // 最小 500km
    );
    const range = Math.max(neededRange * 1.8, 500000); // 1.8x 余量

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, range),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 2.5,
    });
  }
}
