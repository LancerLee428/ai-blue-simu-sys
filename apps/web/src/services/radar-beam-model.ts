// apps/web/src/services/radar-beam-model.ts
import * as Cesium from 'cesium';
import type { DetectionZone, ForceSide, GeoPosition } from '../types/tactical-scenario';
import { FORCE_COLORS } from './cesium-graphics';

/**
 * 雷达波束配置
 */
export interface RadarBeamConfig {
  azimuthStart: number;    // 方位角起始（度，0=正北，顺时针）
  azimuthEnd: number;      // 方位角结束（度）
  elevationMin: number;    // 最小俯仰角（度，0=水平，90=天顶）
  elevationMax: number;    // 最大俯仰角（度）
  range: number;           // 探测距离（米）
}

/**
 * 平台类型 → 雷达波束配置
 */
const RADAR_BEAM_CONFIGS: Record<string, RadarBeamConfig> = {
  // 空中预警机：360度全向，仰角 -10° ~ 60°
  'air-aew': {
    azimuthStart: 0,
    azimuthEnd: 360,
    elevationMin: -10,
    elevationMax: 60,
    range: 500000,
  },
  // 战斗机雷达：前向 120°，仰角 -20° ~ 70°
  'air-fighter': {
    azimuthStart: -60,
    azimuthEnd: 60,
    elevationMin: -20,
    elevationMax: 70,
    range: 150000,
  },
  // 多用途战机：前向 140°，仰角 -30° ~ 80°
  'air-multirole': {
    azimuthStart: -70,
    azimuthEnd: 70,
    elevationMin: -30,
    elevationMax: 80,
    range: 160000,
  },
  // 地面雷达：360度全向，仰角 0° ~ 85°（低空盲区）
  'ground-radar': {
    azimuthStart: 0,
    azimuthEnd: 360,
    elevationMin: 2,  // 低空盲区
    elevationMax: 85,
    range: 400000,
  },
  // 防空导弹雷达：360度全向，仰角 5° ~ 80°
  'ground-sam': {
    azimuthStart: 0,
    azimuthEnd: 360,
    elevationMin: 5,
    elevationMax: 80,
    range: 200000,
  },
  // 舰载相控阵雷达：前向 240°，仰角 0° ~ 85°
  'ship-destroyer': {
    azimuthStart: -120,
    azimuthEnd: 120,
    elevationMin: 0,
    elevationMax: 85,
    range: 250000,
  },
  // 航母雷达：360度全向，仰角 0° ~ 75°
  'ship-carrier': {
    azimuthStart: 0,
    azimuthEnd: 360,
    elevationMin: 0,
    elevationMax: 75,
    range: 400000,
  },
};

/**
 * 雷达波束渲染器
 * P3 功能：渲染真实的扇形/锥形雷达波束
 */
export class RadarBeamRenderer {
  private viewer: Cesium.Viewer;

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  /**
   * 渲染雷达波束（扇形/锥形）
   */
  renderRadarBeam(
    zone: DetectionZone,
    entityType: string,
    entityHeading: number = 0,
  ): void {
    const config = RADAR_BEAM_CONFIGS[entityType];
    if (!config) {
      // 如果没有配置，回退到传统半球渲染
      this.renderTraditionalHemisphere(zone);
      return;
    }

    const colors = FORCE_COLORS[zone.side];
    const cx = zone.center.longitude;
    const cy = zone.center.latitude;
    const baseAlt = Math.max(0, zone.center.altitude ?? 0);

    // 计算实际方位角（考虑实体朝向）
    const azStart = (config.azimuthStart + entityHeading) % 360;
    const azEnd = (config.azimuthEnd + entityHeading) % 360;

    // 地面投影扇形
    this.renderGroundSector(zone, config, entityHeading, colors);

    // 3D 锥形波束
    this.render3DCone(zone, config, entityHeading, colors);
  }

  /**
   * 渲染地面投影扇形
   */
  private renderGroundSector(
    zone: DetectionZone,
    config: RadarBeamConfig,
    entityHeading: number,
    colors: any,
  ): void {
    const cx = zone.center.longitude;
    const cy = zone.center.latitude;
    const R = config.range;
    const baseAlt = Math.max(0, zone.center.altitude ?? 0);

    // 计算扇形角度范围
    const azStart = Cesium.Math.toRadians(config.azimuthStart + entityHeading);
    const azEnd = Cesium.Math.toRadians(config.azimuthEnd + entityHeading);

    // 如果是全向（360度），渲染圆形
    const isFullCircle = Math.abs(config.azimuthEnd - config.azimuthStart) >= 360;

    if (isFullCircle) {
      this.viewer.entities.add({
        id: `detection-ground-${zone.entityId}`,
        name: zone.label || '探测范围',
        position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
        ellipse: {
          semiMajorAxis: R,
          semiMinorAxis: R,
          material: colors.detectionFill.withAlpha(0.03),
          outline: true,
          outlineColor: colors.detectionOutline.withAlpha(0.6),
          outlineWidth: 2,
          height: baseAlt,
          heightReference: baseAlt < 10
            ? Cesium.HeightReference.CLAMP_TO_GROUND
            : Cesium.HeightReference.NONE,
        },
      });
    } else {
      // 扇形：使用 Corridor 或 Polygon
      const center = Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt);
      const positions = [center];

      // 生成扇形边界点
      const segments = 32;
      const angleRange = azEnd - azStart;
      for (let i = 0; i <= segments; i++) {
        const angle = azStart + (angleRange * i) / segments;
        const offsetLon = (R / 111320) * Math.sin(angle) / Math.cos(cy * Math.PI / 180);
        const offsetLat = (R / 110540) * Math.cos(angle);
        positions.push(
          Cesium.Cartesian3.fromDegrees(cx + offsetLon, cy + offsetLat, baseAlt)
        );
      }
      positions.push(center); // 闭合扇形

      this.viewer.entities.add({
        id: `detection-ground-${zone.entityId}`,
        name: zone.label || '探测范围',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: colors.detectionFill.withAlpha(0.05),
          outline: true,
          outlineColor: colors.detectionOutline.withAlpha(0.7),
          outlineWidth: 2,
          height: baseAlt,
          heightReference: baseAlt < 10
            ? Cesium.HeightReference.CLAMP_TO_GROUND
            : Cesium.HeightReference.NONE,
        },
      });
    }

    // 距离标签
    this.viewer.entities.add({
      id: `detection-label-${zone.entityId}`,
      position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
      label: {
        text: `${(R / 1000).toFixed(0)}km\n${config.elevationMin}°~${config.elevationMax}°`,
        fillColor: colors.detectionOutline,
        font: '11px monospace',
        pixelOffset: new Cesium.Cartesian2(6, 6),
        scale: 0.8,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
  }

  /**
   * 渲染 3D 锥形波束
   */
  private render3DCone(
    zone: DetectionZone,
    config: RadarBeamConfig,
    entityHeading: number,
    colors: any,
  ): void {
    const cx = zone.center.longitude;
    const cy = zone.center.latitude;
    const R = config.range;
    const baseAlt = Math.max(0, zone.center.altitude ?? 0);

    // 计算锥形参数
    const elevMin = Cesium.Math.toRadians(config.elevationMin);
    const elevMax = Cesium.Math.toRadians(config.elevationMax);
    const azStart = Cesium.Math.toRadians(config.azimuthStart + entityHeading);
    const azEnd = Cesium.Math.toRadians(config.azimuthEnd + entityHeading);

    const isFullCircle = Math.abs(config.azimuthEnd - config.azimuthStart) >= 360;

    // 使用 Cesium.EllipsoidGraphics 渲染锥形
    // minimumCone/maximumCone: 0=天顶，PI/2=水平，PI=地底
    // 转换：elevation → cone angle
    const minCone = Cesium.Math.PI_OVER_TWO - elevMax;
    const maxCone = Cesium.Math.PI_OVER_TWO - elevMin;

    this.viewer.entities.add({
      id: `detection-cone-${zone.entityId}`,
      name: '探测锥形',
      position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
      ellipsoid: {
        radii: new Cesium.Cartesian3(R, R, R),
        minimumCone: Math.max(0, minCone),
        maximumCone: Math.min(Cesium.Math.PI, maxCone),
        minimumClock: isFullCircle ? 0 : azStart,
        maximumClock: isFullCircle ? Cesium.Math.TWO_PI : azEnd,
        fill: false,
        outline: true,
        outlineColor: colors.detectionOutline.withAlpha(0.4),
        outlineWidth: 1,
        slicePartitions: 16,
        stackPartitions: 8,
      },
    });
  }

  /**
   * 传统半球渲染（回退方案）
   */
  private renderTraditionalHemisphere(zone: DetectionZone): void {
    const colors = FORCE_COLORS[zone.side];
    const cx = zone.center.longitude;
    const cy = zone.center.latitude;
    const R = zone.radiusMeters;
    const baseAlt = Math.max(0, zone.center.altitude ?? 0);

    // 地面投影圆
    this.viewer.entities.add({
      id: `detection-ground-${zone.entityId}`,
      name: zone.label || '探测范围',
      position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
      ellipse: {
        semiMajorAxis: R,
        semiMinorAxis: R,
        material: colors.detectionFill.withAlpha(0.03),
        outline: true,
        outlineColor: colors.detectionOutline.withAlpha(0.6),
        outlineWidth: 2,
        height: baseAlt,
        heightReference: baseAlt < 10
          ? Cesium.HeightReference.CLAMP_TO_GROUND
          : Cesium.HeightReference.NONE,
      },
    });

    // 3D 半球体
    this.viewer.entities.add({
      id: `detection-hemi-${zone.entityId}`,
      name: '探测半球',
      position: Cesium.Cartesian3.fromDegrees(cx, cy, baseAlt),
      ellipsoid: {
        radii: new Cesium.Cartesian3(R, R, R),
        minimumCone: 0,
        maximumCone: Cesium.Math.PI_OVER_TWO,
        minimumClock: 0,
        maximumClock: Cesium.Math.TWO_PI,
        fill: false,
        outline: true,
        outlineColor: colors.detectionOutline.withAlpha(0.4),
        outlineWidth: 1,
        slicePartitions: 24,
        stackPartitions: 12,
      },
    });
  }

  /**
   * 获取平台的雷达波束配置
   */
  static getBeamConfig(platformType: string): RadarBeamConfig | null {
    return RADAR_BEAM_CONFIGS[platformType] || null;
  }
}
