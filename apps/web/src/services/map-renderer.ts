// apps/web/src/services/map-renderer.ts
import * as Cesium from 'cesium';
import { AUTO_DEMO_CONFIG, type AutoDemoCameraConfig } from '../config/auto-demo';
import type {
  TacticalScenario,
  EntitySpec,
  GeoPosition,
  ForceSide,
  Route,
  DetectionZone,
  EntityStatus,
  PlatformType,
  Weapon,
  VisualEffectsConfig,
  ExplosionEffectType,
  RuntimeVisualUpdate,
  EmitterVolume,
  ExplosionRuntimeState,
  WeaponImpactEvent,
} from '../types/tactical-scenario';
import { FORCE_COLORS, getEntityPixelSize } from './cesium-graphics';
import { getEntityShapeCanvas } from './entity-shape-icons';
import { getEntity3DModelCanvas } from './entity-3d-models';
import { PLATFORM_META } from '../types/tactical-scenario';
import { generateOrbitTrack } from './orbit-calculator';
import { AiDecisionVisualizer, type RouteDecision } from './ai-decision-visualizer';
import { ExplosionRenderer, resolveExplosionEffectConfig } from './explosion-renderer';
import {
  createElectronicSuppressionBeamLayers,
  createRadarBeamEdgeIndices,
  createRadarBeamMesh,
  createRadarScanEmitterModel,
  getCesiumClockRangeForTacticalSector,
  getStaleRuntimeEmitterIds,
  prepareRuntimeExplosionsForRender,
  resolveStaticDetectionVisible,
  shouldRenderRuntimeRadarBaseVolume,
  shouldRenderRuntimeEmitterBeam,
  shouldRenderRuntimeExplosions,
  shouldRenderRuntimeRadarScan,
} from './runtime-visual-math';
import { buildRuntimeWeaponTrail } from './runtime-weapon-trail';
import { resolveVisualModel, resolveWeaponVisualModel, type ResolvedVisualModel } from './visual-models';
import { findScenarioSatelliteCameraTarget, getSatelliteCameraRangeMeters } from './scenario-camera';

const SIDE_VISUALS: Record<ForceSide, {
  label: Cesium.Color;
  labelOutline: Cesium.Color;
}> = {
  red: {
    label: Cesium.Color.fromCssColorString('#ff6b5f'),
    labelOutline: Cesium.Color.fromCssColorString('#260606'),
  },
  blue: {
    label: Cesium.Color.fromCssColorString('#6bb6ff'),
    labelOutline: Cesium.Color.fromCssColorString('#05162e'),
  },
};

export interface RuntimeVisualDebugOptions {
  staticDetectionVisible: boolean | null;
  runtimeRadarScanVisible: boolean | null;
  runtimeJammingVisible: boolean | null;
  runtimeExplosionVisible: boolean | null;
}

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
  private weaponIds = new Set<string>();
  private emitterIds = new Set<string>();
  private radarScanPrimitives = new Map<string, Cesium.Primitive>();
  private staticDetectionIds = new Set<string>();
  private visualEffects: VisualEffectsConfig | null = null;
  private entityModelById = new Map<string, ResolvedVisualModel>();
  private entityHeadingById = new Map<string, number>();
  private weaponModelById = new Map<string, ResolvedVisualModel>();
  private weaponTrailHistoryById = new Map<string, GeoPosition[]>();
  private impactMarkerIds = new Set<string>();
  private explosionRenderer: ExplosionRenderer;
  private lastRuntimeVisualUpdate: RuntimeVisualUpdate | null = null;
  private debugExplosionFallbackPosition: GeoPosition | null = null;
  private debugExplosionFrameId: number | null = null;
  private debugOptions: RuntimeVisualDebugOptions = {
    staticDetectionVisible: null,
    runtimeRadarScanVisible: null,
    runtimeJammingVisible: null,
    runtimeExplosionVisible: null,
  };

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
    this.explosionRenderer = new ExplosionRenderer(viewer);
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
    this.clearRuntimeVisuals();
    this.explosionRenderer.reset();
    this.cancelDebugExplosionLoop();
    this.viewer.entities.removeAll();
    this.entityIdSet.clear();
    this.routeDecisions.clear();
    this.weaponIds.clear();
    this.staticDetectionIds.clear();
    this.impactMarkerIds.clear();
    this.entityModelById.clear();
    this.entityHeadingById.clear();
    this.weaponModelById.clear();
    this.visualEffects = scenario.visualEffects ?? null;
    this.debugExplosionFallbackPosition = this.getScenarioDebugExplosionPosition(scenario);

    this.renderEntities(scenario);
    this.renderRoutes(scenario);
    this.renderDetectionZones(scenario.detectionZones);
    this.renderOrbitTracks(scenario);
    this.lastRuntimeVisualUpdate = {
      virtualTimeMs: 0,
      executionStatus: 'idle',
      entities: new Map(),
      weapons: [],
      sensorEmitters: [],
      ewEmitters: [],
      explosions: [],
    };
    this.updateRuntimeVisuals(this.lastRuntimeVisualUpdate);
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
    this.weaponIds.clear();
    this.clearRuntimeVisuals();
    this.explosionRenderer.reset();
    this.cancelDebugExplosionLoop();
    this.visualEffects = null;
    this.entityModelById.clear();
    this.entityHeadingById.clear();
    this.weaponModelById.clear();
    this.weaponTrailHistoryById.clear();
    this.staticDetectionIds.clear();
    this.impactMarkerIds.clear();
    this.debugExplosionFallbackPosition = null;
  }

  updateRuntimeVisuals(update: RuntimeVisualUpdate): void {
    this.lastRuntimeVisualUpdate = update;
    this.setStaticDetectionVisible(resolveStaticDetectionVisible(
      update.executionStatus,
      this.debugOptions.staticDetectionVisible,
    ));
    this.syncWeapons(update.weapons);
    this.renderRuntimeEmitters(
      [...update.sensorEmitters, ...update.ewEmitters],
      update.virtualTimeMs,
      shouldRenderRuntimeRadarScan(update.executionStatus, this.debugOptions.runtimeRadarScanVisible),
      this.debugOptions.runtimeJammingVisible ?? update.executionStatus === 'running',
    );
    if (shouldRenderRuntimeExplosions(
      update.executionStatus,
      this.debugOptions.runtimeExplosionVisible,
      update.explosions.length > 0,
    )) {
      this.renderRuntimeExplosions(prepareRuntimeExplosionsForRender({
        explosions: update.explosions,
        debugVisible: this.debugOptions.runtimeExplosionVisible,
        virtualTimeMs: update.virtualTimeMs,
        fallbackPosition: this.debugExplosionFallbackPosition,
      }), update.virtualTimeMs);
    } else {
      this.explosionRenderer.reset();
    }
    this.viewer.scene.requestRender();
  }

  setRuntimeVisualDebugOptions(options: Partial<RuntimeVisualDebugOptions>): void {
    this.debugOptions = {
      ...this.debugOptions,
      ...options,
    };

    if (options.staticDetectionVisible !== undefined) {
      this.setStaticDetectionVisible(options.staticDetectionVisible ?? true);
    }
    if (options.runtimeRadarScanVisible === false) {
      this.removeRuntimeRadarScans();
    }
    if (options.runtimeJammingVisible === false) {
      this.removeRuntimeEWEmitters();
    }
    if (options.runtimeExplosionVisible === false) {
      this.cancelDebugExplosionLoop();
      this.explosionRenderer.reset();
    } else if (options.runtimeExplosionVisible === true) {
      this.startDebugExplosionLoop();
    }

    if (this.lastRuntimeVisualUpdate) {
      this.updateRuntimeVisuals(this.lastRuntimeVisualUpdate);
      return;
    }
    this.viewer.scene.requestRender();
  }

  /**
   * 渲染实体（红蓝双方兵力）- 使用精细 3D 模型
   */
  private renderEntities(scenario: TacticalScenario): void {
    scenario.forces.forEach((force) => {
      const colors = FORCE_COLORS[force.side];
      force.entities.forEach((entity) => {
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
        const modelConfig = resolveVisualModel(entity.visualModel, entity.type);

        if (modelConfig) {
          const cesiumEntity = this.viewer.entities.add({
            id: entity.id,
            name: entity.name,
            position: Cesium.Cartesian3.fromDegrees(
              entity.position.longitude,
              entity.position.latitude,
              renderAltitude + modelConfig.heightOffsetMeters,
            ),
            orientation: this.createHeadingOrientation(
              entity.position.longitude,
              entity.position.latitude,
              renderAltitude,
              heading + modelConfig.headingOffsetDeg,
              modelConfig.pitchOffsetDeg,
              modelConfig.rollOffsetDeg,
            ),
            model: {
              uri: modelConfig.uri,
              scale: modelConfig.scale,
              minimumPixelSize: modelConfig.minimumPixelSize,
              ...(modelConfig.maximumScale !== undefined ? { maximumScale: modelConfig.maximumScale } : {}),
              heightReference: heightRef,
            },
            label: this.createEntityLabel(entity, force.side, 42, heightRef),
          });
          (cesiumEntity as any).__tacticalLayer = true;
          (cesiumEntity as any).__originalColor = colors.primary;
          (cesiumEntity as any).__side = force.side;
          (cesiumEntity as any).__entityType = entity.type;
          (cesiumEntity as any).__visualModel = modelConfig;
          this.entityIdSet.add(entity.id);
          this.entityModelById.set(entity.id, modelConfig);
          this.entityHeadingById.set(entity.id, heading);
          return;
        }

        // 没有可用 glb 时保留 canvas 图标兜底
        const shapeCanvas = getEntity3DModelCanvas(entity.type, force.side, 'deployed');
        const imageUrl = shapeCanvas.toDataURL('image/png');

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
          label: this.createEntityLabel(entity, force.side, shapeCanvas.height, heightRef),
        });
        (cesiumEntity as any).__tacticalLayer = true;
        (cesiumEntity as any).__originalColor = colors.primary;
        (cesiumEntity as any).__side = force.side;
        (cesiumEntity as any).__entityType = entity.type;
        this.entityIdSet.add(entity.id);
        this.entityHeadingById.set(entity.id, heading);
      });
    });
  }

  private createEntityLabel(
    entity: Pick<EntitySpec, 'name'>,
    side: ForceSide,
    visualHeight: number,
    heightReference: Cesium.HeightReference,
  ): Cesium.LabelGraphics.ConstructorOptions {
    const visual = SIDE_VISUALS[side];
    return {
      text: entity.name,
      fillColor: visual.label,
      font: '13px sans-serif',
      pixelOffset: new Cesium.Cartesian2(0, -(visualHeight / 2) - 6),
      heightReference,
      scale: 0.8,
      outlineColor: visual.labelOutline,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    };
  }

  private createHeadingOrientation(
    longitude: number,
    latitude: number,
    altitude: number,
    headingDeg: number,
    pitchDeg = 0,
    rollDeg = 0,
  ): Cesium.Quaternion {
    return Cesium.Transforms.headingPitchRollQuaternion(
      Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude),
      new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(headingDeg),
        Cesium.Math.toRadians(pitchDeg),
        Cesium.Math.toRadians(rollDeg),
      ),
    );
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
    zones.forEach((zone, index) => {
      const colors = FORCE_COLORS[zone.side];
      const ids = this.getStaticDetectionEntityIds(zone, index);

      const cx = zone.center.longitude;
      const cy = zone.center.latitude;
      const R = Math.max(1, zone.radiusMeters);
      const baseAlt = Math.max(0, zone.center.altitude ?? 0);

      // 地面投影圆（虚线边框 + 极淡填充）
      this.viewer.entities.add({
        id: ids.ground,
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
      this.staticDetectionIds.add(ids.ground);

      // 3D 半球体（仅边框轮廓，无填充）
      const hemiEntity = this.viewer.entities.add({
        id: ids.hemi,
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
      this.staticDetectionIds.add(ids.hemi);
    });
  }

  private getStaticDetectionEntityIds(zone: DetectionZone, index: number): { ground: string; hemi: string } {
    const suffix = this.getStaticDetectionZoneSuffix(zone, index);
    return {
      ground: `detection-ground-${zone.entityId}-${suffix}`,
      hemi: `detection-hemi-${zone.entityId}-${suffix}`,
    };
  }

  private getStaticDetectionZoneSuffix(zone: DetectionZone, index: number): string {
    const label = zone.label
      ?.trim()
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    return label || `zone-${index}`;
  }

  private syncWeapons(weapons: Weapon[]): void {
    const activeIds = new Set<string>();

    weapons.forEach((weapon) => {
      activeIds.add(weapon.id);
      const weaponModel = this.resolveRuntimeWeaponModel(weapon);
      const trailPoints = buildRuntimeWeaponTrail({
        trajectory: weapon.trajectory,
        currentPosition: weapon.currentPosition,
        samplesPerSegment: 10,
      });
      const mergedTrailPoints = this.mergeWeaponTrail(
        this.weaponTrailHistoryById.get(weapon.id) ?? [],
        trailPoints,
      );
      this.weaponTrailHistoryById.set(weapon.id, mergedTrailPoints);
      const positions = mergedTrailPoints.map((point) =>
        Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, point.altitude)
      );
      const missilePosition = Cesium.Cartesian3.fromDegrees(
        weapon.currentPosition.longitude,
        weapon.currentPosition.latitude,
        weapon.currentPosition.altitude,
      );
      const existingMissile = this.viewer.entities.getById(weapon.id);

      if (existingMissile) {
        (existingMissile as any).position = missilePosition;
        if (weaponModel) {
          (existingMissile as any).orientation = this.createWeaponOrientation(weapon, weaponModel);
        }
      } else {
        const missileEntity = weaponModel
          ? this.viewer.entities.add({
              id: weapon.id,
              name: weapon.spec.name,
              position: missilePosition,
              orientation: this.createWeaponOrientation(weapon, weaponModel),
              model: {
                uri: weaponModel.uri,
                scale: weaponModel.scale,
                minimumPixelSize: weaponModel.minimumPixelSize,
                ...(weaponModel.maximumScale !== undefined ? { maximumScale: weaponModel.maximumScale } : {}),
                heightReference: Cesium.HeightReference.NONE,
              },
            })
          : this.viewer.entities.add({
              id: weapon.id,
              name: weapon.spec.name,
              position: missilePosition,
              point: {
                pixelSize: 9,
                color: Cesium.Color.fromCssColorString('#f8fafc'),
                outlineColor: Cesium.Color.fromCssColorString('#f97316'),
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.NONE,
              },
            });
        (missileEntity as any).__tacticalLayer = true;
        if (weaponModel) this.weaponModelById.set(weapon.id, weaponModel);
      }

      const trailId = `${weapon.id}-trail`;
      const existingTrail = this.viewer.entities.getById(trailId);
      if (existingTrail?.polyline) {
        (existingTrail.polyline as any).positions = positions;
      } else {
        const trailEntity = this.viewer.entities.add({
          id: trailId,
          name: `${weapon.spec.name} 轨迹`,
          polyline: {
            positions,
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: Cesium.Color.fromCssColorString('#ffd24a').withAlpha(0.85),
            }),
            clampToGround: false,
            arcType: Cesium.ArcType.GEODESIC,
          },
        });
        (trailEntity as any).__tacticalLayer = true;
      }
      activeIds.add(trailId);
    });

    for (const weaponId of Array.from(this.weaponIds)) {
      if (activeIds.has(weaponId)) continue;
      this.viewer.entities.removeById(weaponId);
      this.viewer.entities.removeById(`${weaponId}-trail`);
      this.weaponIds.delete(weaponId);
      this.weaponModelById.delete(weaponId);
      this.weaponTrailHistoryById.delete(weaponId);
    }

    weapons.forEach((weapon) => this.weaponIds.add(weapon.id));
  }

  private mergeWeaponTrail(previous: GeoPosition[], next: GeoPosition[]): GeoPosition[] {
    if (previous.length === 0) return next.map(point => ({ ...point }));
    if (next.length === 0) return previous.map(point => ({ ...point }));

    const merged = previous.map(point => ({ ...point }));
    const firstNext = next[0];
    const existingStartIndex = merged.findIndex(point => this.isSameTrailPoint(point, firstNext));
    const pointsToAppend = existingStartIndex >= 0 ? next.slice(1) : next;

    pointsToAppend.forEach((point) => {
      const previousPoint = merged[merged.length - 1];
      if (!previousPoint || !this.isSameTrailPoint(previousPoint, point)) {
        merged.push({ ...point });
      }
    });

    const maxPoints = Math.max(32, Math.floor(this.visualEffects?.performance?.maxActiveTrails ?? 20) * 24);
    return merged.slice(Math.max(0, merged.length - maxPoints));
  }

  private isSameTrailPoint(left: GeoPosition, right: GeoPosition): boolean {
    return Math.abs(left.longitude - right.longitude) < 1e-8
      && Math.abs(left.latitude - right.latitude) < 1e-8
      && Math.abs(left.altitude - right.altitude) < 1e-3;
  }

  private resolveRuntimeWeaponModel(weapon: Weapon): ResolvedVisualModel | null {
    const cached = this.weaponModelById.get(weapon.id);
    if (cached) return cached;

    const effect = this.visualEffects?.weaponEffects.items.find(item => item.weaponId === weapon.spec.id);
    const resolved = resolveWeaponVisualModel(effect?.visualModel);
    if (resolved) this.weaponModelById.set(weapon.id, resolved);
    return resolved;
  }

  private createWeaponOrientation(
    weapon: Weapon,
    model: ResolvedVisualModel,
  ): Cesium.Quaternion {
    const previousPoint = weapon.trajectory.length >= 2
      ? weapon.trajectory[weapon.trajectory.length - 2]
      : weapon.launchPosition;
    const headingDeg = this.computeHeadingDegrees(previousPoint, weapon.currentPosition);
    const horizontalMeters = this.distanceMeters2D(previousPoint, weapon.currentPosition);
    const verticalMeters = weapon.currentPosition.altitude - previousPoint.altitude;
    const pitchDeg = horizontalMeters > 0
      ? Cesium.Math.toDegrees(Math.atan2(verticalMeters, horizontalMeters))
      : 0;

    return Cesium.Transforms.headingPitchRollQuaternion(
      Cesium.Cartesian3.fromDegrees(
        weapon.currentPosition.longitude,
        weapon.currentPosition.latitude,
        weapon.currentPosition.altitude,
      ),
      new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(headingDeg + model.headingOffsetDeg),
        Cesium.Math.toRadians(pitchDeg + model.pitchOffsetDeg),
        Cesium.Math.toRadians(model.rollOffsetDeg),
      ),
    );
  }

  private computeHeadingDegrees(from: GeoPosition, to: GeoPosition): number {
    const lat1 = Cesium.Math.toRadians(from.latitude);
    const lat2 = Cesium.Math.toRadians(to.latitude);
    const dLon = Cesium.Math.toRadians(to.longitude - from.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2)
      - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (Cesium.Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
  }

  private distanceMeters2D(from: GeoPosition, to: GeoPosition): number {
    const earthRadius = 6_371_000;
    const lat1 = Cesium.Math.toRadians(from.latitude);
    const lat2 = Cesium.Math.toRadians(to.latitude);
    const dLat = Cesium.Math.toRadians(to.latitude - from.latitude);
    const dLon = Cesium.Math.toRadians(to.longitude - from.longitude);
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  private renderRuntimeEmitters(
    emitters: EmitterVolume[],
    virtualTimeMs: number,
    renderRadarScan: boolean,
    renderEW: boolean,
  ): void {
    const activeIds = new Set<string>();
    const maxScans = this.visualEffects?.performance?.maxActiveScans ?? 8;
    const maxPulses = this.visualEffects?.performance?.maxActivePulses ?? 4;
    let radarScanCount = 0;
    let pulseCount = 0;

    emitters.forEach((emitter) => {
      if (!emitter.active || this.visualEffects?.enabled === false) return;
      if (emitter.kind === 'radar' && this.visualEffects?.sensorEffects?.enabled === false) return;
      if (emitter.kind === 'electronic-jamming' && !renderEW) return;
      if (emitter.kind === 'electronic-jamming' && this.visualEffects?.electronicWarfareEffects?.enabled === false) return;

      const baseId = `emitter-${emitter.id}`;
      const isJammingTrack = emitter.kind === 'electronic-jamming' && emitter.mode === 'track';
      const radarScanEnabled = this.visualEffects?.sensorEffects?.radarScanEnabled !== false;
      if (!isJammingTrack && shouldRenderRuntimeRadarBaseVolume({ kind: emitter.kind, radarScanEnabled })) {
        activeIds.add(baseId);
        this.upsertEmitterVolume(baseId, emitter, {
          rangeMeters: emitter.rangeMeters,
          alpha: emitter.kind === 'radar' ? 0.08 : 0.07,
          outlineAlpha: emitter.kind === 'radar' ? 0.22 : 0.3,
        });
      }

      if (isJammingTrack && shouldRenderRuntimeEmitterBeam({
        emitter,
        renderRadarScan,
        radarScanCount,
        maxRadarScans: maxScans,
      })) {
        createElectronicSuppressionBeamLayers({
          virtualTimeMs,
          pulseCycleMs: emitter.pulseCycleMs,
        }).forEach(layer => activeIds.add(`${baseId}-${layer.idSuffix}`));
        this.upsertElectronicSuppressionBeam(baseId, emitter, virtualTimeMs);
      }

      if (emitter.kind === 'radar' && radarScanEnabled && shouldRenderRuntimeEmitterBeam({
        emitter,
        renderRadarScan,
        radarScanCount,
        maxRadarScans: maxScans,
      })) {
        const scanEmitter = this.createRadarScanEmitter(emitter, virtualTimeMs);
        const scanId = `${baseId}-scan`;
        activeIds.add(scanId);
        this.upsertRadarScanBeam(scanId, scanEmitter);
        radarScanCount += 1;
      }

      if (
        emitter.kind === 'electronic-jamming'
        && emitter.mode !== 'track'
        && this.visualEffects?.electronicWarfareEffects?.pulseEnabled !== false
        && pulseCount < maxPulses
      ) {
        const progress = this.getPulseProgress(emitter, virtualTimeMs);
        const pulseId = `${baseId}-pulse`;
        activeIds.add(pulseId);
        this.upsertEmitterVolume(pulseId, emitter, {
          rangeMeters: Math.max(1, emitter.rangeMeters * progress),
          alpha: Math.max(0, 0.12 * (1 - progress)),
          outlineAlpha: Math.max(0, 0.35 * (1 - progress)),
        });
        pulseCount += 1;
      }
    });

    getStaleRuntimeEmitterIds(this.emitterIds, activeIds).forEach((id) => {
      this.removeRuntimeEmitterById(id);
      this.emitterIds.delete(id);
    });
  }

  private removeRuntimeRadarScans(): void {
    Array.from(this.emitterIds)
      .filter(id => id.includes('radar') && id.endsWith('-scan'))
      .forEach((id) => {
        this.removeRuntimeEmitterById(id);
        this.emitterIds.delete(id);
      });
  }

  private removeRuntimeEWEmitters(): void {
    Array.from(this.emitterIds)
      .filter(id => id.includes('ew-'))
      .forEach((id) => {
        this.removeRuntimeEmitterById(id);
        this.emitterIds.delete(id);
      });
  }

  private removeRuntimeEmitterById(id: string): void {
    const primitive = this.radarScanPrimitives.get(id);
    if (primitive) {
      this.viewer.scene.primitives.remove(primitive);
      this.radarScanPrimitives.delete(id);
    }
    this.viewer.entities.removeById(id);
  }

  private replaceRuntimePrimitive(id: string, primitive: Cesium.Primitive): void {
    const existing = this.radarScanPrimitives.get(id);
    if (existing) {
      this.viewer.scene.primitives.remove(existing);
      this.radarScanPrimitives.delete(id);
    }

    (primitive as any).__tacticalLayer = true;
    this.viewer.scene.primitives.add(primitive);
    this.radarScanPrimitives.set(id, primitive);
    this.emitterIds.add(id);
  }

  private upsertRadarScanBeam(id: string, emitter: EmitterVolume): void {
    const color = this.getEmitterColor(emitter);
    const position = Cesium.Cartesian3.fromDegrees(
      emitter.position.longitude,
      emitter.position.latitude,
      Math.max(0, emitter.position.altitude ?? 0),
    );
    const mesh = createRadarBeamMesh({
      rangeMeters: emitter.rangeMeters,
      azimuthWidthDeg: emitter.azimuthWidthDeg,
      elevationMinDeg: emitter.elevationMinDeg,
      elevationMaxDeg: emitter.elevationMaxDeg,
      segments: 28,
    });
    const attributes = new Cesium.GeometryAttributes();
    attributes.position = new Cesium.GeometryAttribute({
      componentDatatype: Cesium.ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: new Float64Array(mesh.positions),
    });
    const geometry = new Cesium.Geometry({
      attributes,
      indices: mesh.indices.length > 65_535
        ? new Uint32Array(mesh.indices)
        : new Uint16Array(mesh.indices),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      boundingSphere: Cesium.BoundingSphere.fromVertices(mesh.positions),
    });
    const modelMatrix = this.getRadarBeamModelMatrix(position, emitter.headingDeg + emitter.azimuthCenterDeg);
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry,
        modelMatrix,
        id,
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.08)),
        },
      }),
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: true,
        faceForward: true,
        translucent: true,
        closed: false,
      }),
      asynchronous: false,
      allowPicking: false,
    });

    this.replaceRuntimePrimitive(id, primitive);
  }

  private upsertElectronicSuppressionBeam(id: string, emitter: EmitterVolume, virtualTimeMs: number): void {
    const activeLayerIds = new Set<string>();
    const baseColor = this.getEmitterColor(emitter);
    const position = Cesium.Cartesian3.fromDegrees(
      emitter.position.longitude,
      emitter.position.latitude,
      Math.max(0, emitter.position.altitude ?? 0),
    );
    const elevationCenter = (emitter.elevationMinDeg + emitter.elevationMaxDeg) / 2;
    const elevationWidth = Math.max(1, emitter.elevationMaxDeg - emitter.elevationMinDeg);

    createElectronicSuppressionBeamLayers({
      virtualTimeMs,
      pulseCycleMs: emitter.pulseCycleMs,
    }).forEach((layer) => {
      const layerId = `${id}-${layer.idSuffix}`;
      activeLayerIds.add(layerId);

      const layerElevationWidth = elevationWidth * layer.elevationWidthScale;
      const mesh = createRadarBeamMesh({
        rangeMeters: emitter.rangeMeters * layer.rangeScale,
        azimuthWidthDeg: emitter.azimuthWidthDeg * layer.azimuthWidthScale,
        elevationMinDeg: elevationCenter + layer.elevationOffsetDeg - layerElevationWidth / 2,
        elevationMaxDeg: elevationCenter + layer.elevationOffsetDeg + layerElevationWidth / 2,
        segments: layer.drawEdges ? 36 : 28,
      });
      const attributes = new Cesium.GeometryAttributes();
      attributes.position = new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(mesh.positions),
      });
      const indices = layer.drawEdges
        ? createRadarBeamEdgeIndices({
            perimeterStart: mesh.perimeterStart,
            perimeterCount: mesh.perimeterCount,
          })
        : mesh.indices;
      const geometry = new Cesium.Geometry({
        attributes,
        indices: indices.length > 65_535
          ? new Uint32Array(indices)
          : new Uint16Array(indices),
        primitiveType: layer.drawEdges ? Cesium.PrimitiveType.LINES : Cesium.PrimitiveType.TRIANGLES,
        boundingSphere: Cesium.BoundingSphere.fromVertices(mesh.positions),
      });
      const modelMatrix = this.getRadarBeamModelMatrix(
        position,
        emitter.headingDeg + emitter.azimuthCenterDeg + layer.azimuthOffsetDeg,
      );
      const primitive = new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry,
          modelMatrix,
          id: layerId,
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(baseColor.withAlpha(layer.alpha)),
          },
        }),
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          faceForward: true,
          translucent: true,
          closed: false,
        }),
        asynchronous: false,
        allowPicking: false,
      });

      this.replaceRuntimePrimitive(layerId, primitive);
    });

    Array.from(this.emitterIds)
      .filter(emitterId => emitterId.startsWith(`${id}-`) && !activeLayerIds.has(emitterId))
      .forEach((staleId) => {
        this.removeRuntimeEmitterById(staleId);
        this.emitterIds.delete(staleId);
      });
  }

  private getRadarBeamModelMatrix(position: Cesium.Cartesian3, headingDeg: number): Cesium.Matrix4 {
    const localFrame = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const headingRotation = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(-headingDeg));
    const rotationMatrix = Cesium.Matrix4.fromRotation(headingRotation);
    return Cesium.Matrix4.multiply(localFrame, rotationMatrix, new Cesium.Matrix4());
  }

  private upsertEmitterVolume(
    id: string,
    emitter: EmitterVolume,
    options: { rangeMeters: number; alpha: number; outlineAlpha: number },
  ): void {
    const existing = this.viewer.entities.getById(id);
    const color = this.getEmitterColor(emitter);
    const position = Cesium.Cartesian3.fromDegrees(
      emitter.position.longitude,
      emitter.position.latitude,
      Math.max(0, emitter.position.altitude ?? 0),
    );
    const minCone = Math.max(0, Cesium.Math.PI_OVER_TWO - Cesium.Math.toRadians(emitter.elevationMaxDeg));
    const maxCone = Math.min(Cesium.Math.PI, Cesium.Math.PI_OVER_TWO - Cesium.Math.toRadians(emitter.elevationMinDeg));
    const { minimumClock, maximumClock } = getCesiumClockRangeForTacticalSector({
      headingDeg: emitter.headingDeg,
      azimuthCenterDeg: emitter.azimuthCenterDeg,
      azimuthWidthDeg: emitter.azimuthWidthDeg,
    });
    const radii = new Cesium.Cartesian3(options.rangeMeters, options.rangeMeters, options.rangeMeters);

    if (existing) {
      (existing as any).position = position;
      if (existing.ellipsoid) {
        (existing.ellipsoid as any).radii = radii;
        (existing.ellipsoid as any).minimumCone = minCone;
        (existing.ellipsoid as any).maximumCone = maxCone;
        (existing.ellipsoid as any).minimumClock = minimumClock;
        (existing.ellipsoid as any).maximumClock = maximumClock;
        (existing.ellipsoid as any).material = color.withAlpha(options.alpha);
        (existing.ellipsoid as any).outlineColor = color.withAlpha(options.outlineAlpha);
      }
      return;
    }

    const entity = this.viewer.entities.add({
      id,
      name: emitter.kind === 'radar' ? '雷达立体波束' : '电子干扰立体波束',
      position,
      ellipsoid: {
        radii,
        minimumCone: minCone,
        maximumCone: maxCone,
        minimumClock,
        maximumClock,
        fill: true,
        material: color.withAlpha(options.alpha),
        outline: true,
        outlineColor: color.withAlpha(options.outlineAlpha),
        outlineWidth: 1,
        slicePartitions: 24,
        stackPartitions: 12,
      },
    });
    (entity as any).__tacticalLayer = true;
    this.emitterIds.add(id);
  }

  private createRadarScanEmitter(emitter: EmitterVolume, virtualTimeMs: number): EmitterVolume {
    return createRadarScanEmitterModel(emitter, {
      virtualTimeMs,
      beamWidthDeg: this.visualEffects?.sensorEffects?.beamWidthDeg ?? 18,
    });
  }

  private getPulseProgress(emitter: EmitterVolume, virtualTimeMs: number): number {
    const cycle = Math.max(1, emitter.pulseCycleMs);
    return (virtualTimeMs % cycle) / cycle;
  }

  private getEmitterColor(emitter: EmitterVolume): Cesium.Color {
    if (emitter.kind === 'electronic-jamming') {
      return Cesium.Color.fromCssColorString(this.visualEffects?.electronicWarfareEffects?.pulseColor ?? '#ff9f1c');
    }
    const configured = this.visualEffects?.sensorEffects?.color;
    return configured
      ? Cesium.Color.fromCssColorString(configured)
      : FORCE_COLORS[emitter.side].detectionOutline;
  }

  private renderRuntimeExplosions(explosions: ExplosionRuntimeState[], virtualTimeMs: number): void {
    this.explosionRenderer.renderVirtualExplosions(
      explosions.map(explosion => ({
        ...explosion,
        effect: this.getExplosionEffect(explosion.type),
      })),
      virtualTimeMs,
    );
  }

  private startDebugExplosionLoop(): void {
    if (this.debugExplosionFrameId !== null) return;
    const startedAt = performance.now();
    if (!this.lastRuntimeVisualUpdate) {
      this.lastRuntimeVisualUpdate = {
        virtualTimeMs: 0,
        executionStatus: 'idle',
        entities: new Map(),
        weapons: [],
        sensorEmitters: [],
        ewEmitters: [],
        explosions: [],
      };
    }

    const tick = () => {
      if (this.debugOptions.runtimeExplosionVisible !== true) {
        this.debugExplosionFrameId = null;
        return;
      }

      if (this.lastRuntimeVisualUpdate) {
        this.updateRuntimeVisuals({
          ...this.lastRuntimeVisualUpdate,
          virtualTimeMs: startedAt + (performance.now() - startedAt),
        });
      }

      this.debugExplosionFrameId = requestAnimationFrame(tick);
    };

    this.debugExplosionFrameId = requestAnimationFrame(tick);
  }

  private cancelDebugExplosionLoop(): void {
    if (this.debugExplosionFrameId === null) return;
    cancelAnimationFrame(this.debugExplosionFrameId);
    this.debugExplosionFrameId = null;
  }

  private getExplosionEffect(type: ExplosionEffectType) {
    return resolveExplosionEffectConfig(type, this.visualEffects);
  }

  private getScenarioDebugExplosionPosition(scenario: TacticalScenario): GeoPosition | null {
    const targetEntityId = scenario.strikeTasks[0]?.targetEntityId;
    const targetEntity = targetEntityId
      ? scenario.forces.flatMap(force => force.entities).find(entity => entity.id === targetEntityId)
      : null;
    const fallbackEntity = targetEntity ?? scenario.forces.flatMap(force => force.entities)[0];

    if (!fallbackEntity) return null;

    return {
      longitude: fallbackEntity.position.longitude,
      latitude: fallbackEntity.position.latitude,
      altitude: fallbackEntity.position.altitude > 100 ? fallbackEntity.position.altitude : 0,
      heading: fallbackEntity.position.heading,
    };
  }

  private setStaticDetectionVisible(visible: boolean): void {
    this.staticDetectionIds.forEach((id) => {
      const entity = this.viewer.entities.getById(id);
      if (entity) entity.show = visible;
    });
  }

  private clearRuntimeVisuals(): void {
    this.emitterIds.forEach(id => this.removeRuntimeEmitterById(id));
    this.emitterIds.clear();
    this.weaponIds.forEach((weaponId) => {
      this.viewer.entities.removeById(weaponId);
      this.viewer.entities.removeById(`${weaponId}-trail`);
    });
    this.weaponIds.clear();
    this.weaponModelById.clear();
    this.weaponTrailHistoryById.clear();
    this.impactMarkerIds.forEach(id => this.viewer.entities.removeById(id));
    this.impactMarkerIds.clear();
    this.setStaticDetectionVisible(true);
  }

  /**
   * 记录命中结果（只在运行时 weapon-impact 事件触发后显示）
   */
  recordWeaponImpact(event: WeaponImpactEvent): void {
    const markerId = `impact-${event.weaponId}`;
    if (this.viewer.entities.getById(markerId)) return;
    const hitPosition = event.hitPosition;

    const entity = this.viewer.entities.add({
      id: markerId,
      name: event.detail || '命中结果',
      position: Cesium.Cartesian3.fromDegrees(
        hitPosition.longitude,
        hitPosition.latitude,
        hitPosition.altitude > 100 ? hitPosition.altitude : 0,
      ),
      billboard: {
        image: this.createStrikeMarkerCanvas(),
        width: 32,
        height: 32,
        heightReference: hitPosition.altitude > 100
          ? Cesium.HeightReference.NONE
          : Cesium.HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
      },
      label: {
        text: event.detail || '命中',
        fillColor: Cesium.Color.fromCssColorString('#ff4444'),
        font: '11px monospace',
        pixelOffset: new Cesium.Cartesian2(0, 22),
        scale: 0.85,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        heightReference: hitPosition.altitude > 100
          ? Cesium.HeightReference.NONE
          : Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    (entity as any).__tacticalLayer = true;
    (entity as any).__impactEvent = event;
    this.impactMarkerIds.add(markerId);
    this.viewer.scene.requestRender();
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
      const modelConfig = this.entityModelById.get(entityId);
      (cesiumEntity as any).position = Cesium.Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude + (modelConfig?.heightOffsetMeters ?? 0),
      );

      if (modelConfig) {
        const heading = position.heading ?? this.entityHeadingById.get(entityId) ?? 0;
        (cesiumEntity as any).orientation = this.createHeadingOrientation(
          position.longitude,
          position.latitude,
          position.altitude,
          heading + modelConfig.headingOffsetDeg,
          modelConfig.pitchOffsetDeg,
          modelConfig.rollOffsetDeg,
        );
        this.entityHeadingById.set(entityId, heading);
      }

      // 如果有航向信息，更新图标旋转
      if (position.heading !== undefined && cesiumEntity.billboard) {
        const rotation = Cesium.Math.toRadians(-(position.heading - 90));
        (cesiumEntity.billboard as any).rotation = rotation;
        this.entityHeadingById.set(entityId, position.heading);
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

    if (cesiumEntity.model) {
      (cesiumEntity as any).show = status !== 'destroyed';
      return;
    }

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
   * 获取战术实体 ID 列表
   */
  getTacticalEntityIds(): string[] {
    return Array.from(this.entityIdSet);
  }

  /**
   * 聚焦到战术区域（全局视角）
   */
  flyToScenario(
    scenario: TacticalScenario,
    cameraConfig: AutoDemoCameraConfig = AUTO_DEMO_CONFIG.camera,
  ): Promise<boolean> {
    const satelliteTarget = findScenarioSatelliteCameraTarget(scenario);
    if (satelliteTarget) {
      const targetEntity = this.viewer.entities.getById(satelliteTarget.id);
      const rangeMeters = getSatelliteCameraRangeMeters(satelliteTarget, cameraConfig);
      if (targetEntity) {
        return this.viewer.flyTo(targetEntity, {
          duration: cameraConfig.flyDurationSec,
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(cameraConfig.headingDeg),
            Cesium.Math.toRadians(cameraConfig.pitchDeg),
            rangeMeters,
          ),
        });
      }

      return new Promise((resolve) => {
        this.viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            satelliteTarget.position.longitude,
            satelliteTarget.position.latitude,
            satelliteTarget.position.altitude + rangeMeters,
          ),
          orientation: {
            heading: Cesium.Math.toRadians(cameraConfig.headingDeg),
            pitch: Cesium.Math.toRadians(cameraConfig.pitchDeg),
            roll: 0,
          },
          duration: cameraConfig.flyDurationSec,
          complete: () => resolve(true),
          cancel: () => resolve(false),
        });
      });
    }

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

    if (allPositions.length === 0) return Promise.resolve(false);

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
    const range = Math.min(Math.max(neededRange * 1.8, 500000), 2_500_000); // 1.8x 余量，上限 2500km

    return new Promise((resolve) => {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, range),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
        duration: 2.5,
        complete: () => resolve(true),
        cancel: () => resolve(false),
      });
    });
  }
}
