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
import { getEntity3DModelCanvas } from './entity-3d-models';
import { PLATFORM_META } from '../types/tactical-scenario';
import { generateOrbitTrack } from './orbit-calculator';
import { AiDecisionVisualizer, type RouteDecision } from './ai-decision-visualizer';

/**
 * Cesium 地图渲染引擎
 * 负责将 TacticalScenario 渲染到 Cesium 地图上
 */
export class MapRenderer {
  private viewer: Cesium.Viewer;
  private entityIdSet = new Set<string>();
  private decisionVisualizer = new AiDecisionVisualizer();
  private routeDecisions = new Map<string, RouteDecision>();
  private onRouteClick?: (routeId: string, decision: RouteDecision) => void;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.setupRouteClickHandler();
  }

  setOnRouteClick(callback: (routeId: string, decision: RouteDecision) => void) {
    this.onRouteClick = callback;
  }

  getRouteDecisions(): Map<string, RouteDecision> {
    return this.routeDecisions;
  }

  /**
   * 渲染完整战术方案
   */
  renderScenario(scenario: TacticalScenario): void {
    // 清除旧实体，避免 "already exists" 错误
    this.viewer.entities.removeAll();
    this.entityIdSet.clear();
    this.routeDecisions.clear();

    this.renderEntities(scenario);
    this.renderRoutes(scenario);
    this.renderDetectionZones(scenario.detectionZones);
    this.renderStrikeTasks(scenario);
    this.renderOrbitTracks(scenario);
  }

  /**
   * 渲染进攻路线（虚线 + 箭头，空中不贴地）+ AI 决策分析
   */
  private renderRoutes(scenario: TacticalScenario): void {
    const routes = scenario.routes;
    const allEntities = scenario.forces.flatMap(f => f.entities);
    const detectionZones = scenario.detectionZones || [];

    // 按 entityId 计数，支持同一实体多条路线（主攻/侧翼等）
    const routeCountMap = new Map<string, number>();

    routes.forEach((route) => {
      if (route.points.length < 2) return;

      // 找到路线对应的实体
      const entity = allEntities.find(e => e.id === route.entityId);
      if (!entity) return;

      // 生成 AI 决策分析
      const decision = this.decisionVisualizer.analyzeRouteDecision(
        route,
        entity,
        allEntities,
        detectionZones
      );

      // 生成唯一 ID
      const idx = routeCountMap.get(route.entityId) ?? 0;
      routeCountMap.set(route.entityId, idx + 1);
      const routeId = `route-${route.entityId}-${idx}`;

      // 保存决策数据
      this.routeDecisions.set(routeId, decision);

      const colors = FORCE_COLORS[route.side];
      const positions = route.points.map((p) =>
        Cesium.Cartesian3.fromDegrees(p.position.longitude, p.position.latitude, p.position.altitude)
      );

      // 路线不使用 clampToGround——飞机在空中飞行
      const polylineEntity = this.viewer.entities.add({
        id: routeId,
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
      (polylineEntity as any).__routeDecision = decision;

      // 末端箭头标记
      if (positions.length >= 2) {
        const arrowEntity = this.viewer.entities.add({
          id: `${routeId}-arrow`,
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
   * 渲染实体（红蓝双方兵力）- 使用精细 3D 模型
   */
  private renderEntities(scenario: TacticalScenario): void {
    scenario.forces.forEach((force) => {
      const colors = FORCE_COLORS[force.side];
      force.entities.forEach((entity) => {
        // 使用新的 3D 模型替代简单几何图形
        const shapeCanvas = getEntity3DModelCanvas(entity.type, force.side, 'deployed');
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

        // P1 功能：根据航向旋转图标（0度=正北，顺时针）
        // Cesium rotation: 0=正东，逆时针为正
        // 转换公式: cesiumRotation = -(heading - 90) * PI/180
        const heading = entity.position.heading ?? 0;
        const rotation = Cesium.Math.toRadians(-(heading - 90));

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
            rotation: rotation,  // 图标旋转
            alignedAxis: Cesium.Cartesian3.UNIT_Z,  // 绕 Z 轴旋转
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
   * 设置路线点击处理器
   */
  private setupRouteClickHandler(): void {
    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    handler.setInputAction((movement: any) => {
      const pickedObject = this.viewer.scene.pick(movement.position);
      if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
        const entityId = pickedObject.id.id;

        // 检查是否点击了路线
        if (entityId.startsWith('route-')) {
          const decision = this.routeDecisions.get(entityId);
          console.log('路线点击:', entityId, '决策数据:', decision);
          if (decision && this.onRouteClick) {
            this.onRouteClick(entityId, decision);
          } else {
            console.warn('未找到决策数据:', entityId, '可用决策:', Array.from(this.routeDecisions.keys()));
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  /**
   * 渲染探测范围（虚线边框 + 极淡填充，避免遮挡实体）
   * P0 优化：减少视觉遮挡，突出实体图标
   */
  private renderDetectionZones(zones: DetectionZone[]): void {
    zones.forEach((zone) => {
      const colors = FORCE_COLORS[zone.side];

      const cx = zone.center.longitude;
      const cy = zone.center.latitude;
      const R = zone.radiusMeters;
      const baseAlt = Math.max(0, zone.center.altitude ?? 0);

      // 地面投影圆（虚线边框 + 极淡填充）
      this.viewer.entities.add({
        id: `detection-ground-${zone.entityId}`,
        name: zone.label || '探测范围',
        position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
        ellipse: {
          semiMajorAxis: R,
          semiMinorAxis: R,
          material: colors.detectionFill.withAlpha(0.03),  // 极淡填充，几乎透明
          outline: true,
          outlineColor: colors.detectionOutline.withAlpha(0.6),
          outlineWidth: 2,
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

      // 3D 半球体（仅边框轮廓，无填充）
      const hemiEntity = this.viewer.entities.add({
        id: `detection-hemi-${zone.entityId}`,
        name: '探测半球',
        position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
        ellipsoid: {
          radii: new Cesium.Cartesian3(R, R, R),
          minimumCone: 0,
          maximumCone: Cesium.Math.PI_OVER_TWO,
          minimumClock: 0,
          maximumClock: Cesium.Math.TWO_PI,
          fill: false,  // 关闭填充
          outline: true,  // 仅显示轮廓线
          outlineColor: colors.detectionOutline.withAlpha(0.4),
          outlineWidth: 1,
          slicePartitions: 24,  // 减少分段，形成虚线效果
          stackPartitions: 12,
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
   * 更新实体位置（P1 功能：同时更新旋转角度）
   */
  updateEntityPosition(entityId: string, position: GeoPosition): void {
    const cesiumEntity = this.viewer.entities.getById(entityId);
    if (cesiumEntity) {
      (cesiumEntity as any).position = Cesium.Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude
      );

      // 如果有航向信息，更新图标旋转
      if (position.heading !== undefined && cesiumEntity.billboard) {
        const rotation = Cesium.Math.toRadians(-(position.heading - 90));
        (cesiumEntity.billboard as any).rotation = rotation;
      }
    }
  }

  /**
   * 更新实体状态样式（重新生成对应状态的 3D 模型图标）
   */
  updateEntityStatus(entityId: string, status: EntityStatus, side: ForceSide): void {
    const cesiumEntity = this.viewer.entities.getById(entityId);
    if (!cesiumEntity) return;

    const entityType = (cesiumEntity as any).__entityType as PlatformType;
    if (!entityType) return;

    // 使用新的 3D 模型
    const shapeCanvas = getEntity3DModelCanvas(entityType, side, status);
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
