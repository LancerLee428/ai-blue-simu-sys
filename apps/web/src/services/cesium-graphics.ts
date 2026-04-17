import * as Cesium from 'cesium';
import type { PlatformType, EntityStatus } from '../types/tactical-scenario';

/**
 * 态势状态视觉编码
 */
const STATUS_VISUALS = {
  planned: {
    pixelSize: 10,
    alpha: 0.7,
    outline: true,
    outlineWidth: 1,
  },
  deployed: {
    pixelSize: 14,
    alpha: 1.0,
    outline: true,
    outlineWidth: 2,
  },
  engaged: {
    pixelSize: 18,
    alpha: 1.0,
    outline: false,
    outlineWidth: 0,
  },
  destroyed: {
    pixelSize: 10,
    alpha: 0.3,
    outline: false,
    outlineWidth: 0,
  },
} as const;

/**
 * 红蓝双方颜色
 */
export const FORCE_COLORS = {
  red: {
    primary: Cesium.Color.fromCssColorString('#ff4444'),
    route: Cesium.Color.fromCssColorString('#ff6666'),
    detectionFill: Cesium.Color.fromCssColorString('rgba(255,68,68,0.15)'),
    detectionOutline: Cesium.Color.fromCssColorString('rgba(255,68,68,0.6)'),
    attack: Cesium.Color.fromCssColorString('#ff0000'),
  },
  blue: {
    primary: Cesium.Color.fromCssColorString('#4488ff'),
    route: Cesium.Color.fromCssColorString('#66aaff'),
    detectionFill: Cesium.Color.fromCssColorString('rgba(68,136,255,0.15)'),
    detectionOutline: Cesium.Color.fromCssColorString('rgba(68,136,255,0.6)'),
    attack: Cesium.Color.fromCssColorString('#0066ff'),
  },
} as const;

/**
 * 实体类型到像素大小的映射
 */
export const ENTITY_SIZES: Record<PlatformType, number> = {
  'aircraft-fighter': 14,
  'aircraft-bomber': 18,
  'aircraft-recon': 10,
  'aircraft-helicopter': 12,
  'ship': 16,
  'ground-vehicle': 12,
  'missile': 8,
  'drone': 8,
};

/**
 * 实体状态对应的尺寸倍数
 */
export const STATUS_SIZE_MULTIPLIERS: Record<EntityStatus, number> = {
  'planned': 0.8,
  'deployed': 1.0,
  'engaged': 1.2,
  'destroyed': 0.5,
};

/**
 * 获取实体在特定状态下的像素大小
 */
export function getEntityPixelSize(
  baseType: PlatformType,
  status: EntityStatus
): number {
  const baseSize = ENTITY_SIZES[baseType];
  const multiplier = STATUS_SIZE_MULTIPLIERS[status];
  return baseSize * multiplier;
}

/**
 * ScenarioEntity 接口定义
 */
export interface ScenarioEntity {
  id: string;
  sourceEntityId: string;
  name: string;
  category: 'force-unit' | 'platform';
  currentPosition: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
  currentStatus: keyof typeof STATUS_VISUALS;
  currentMissionId?: string;
}

/**
 * 根据 Ontology 对象类型获取 Cesium 实体图形配置
 */
export function getEntityGraphics(
  entity: ScenarioEntity,
  sourceEntity?: any
): Cesium.Entity.ConstructorOptions {
  const { currentPosition, currentStatus, name } = entity;
  const visuals = STATUS_VISUALS[currentStatus] || STATUS_VISUALS.planned;

  // 基础位置配置
  const position = Cesium.Cartesian3.fromDegrees(
    currentPosition.longitude,
    currentPosition.latitude,
    currentPosition.altitude
  );

  // 根据 sourceEntity 确定颜色和类型
  let color: Cesium.Color;
  let pixelSize: number;

  if (sourceEntity) {
    const isBlue = 'forceSide' in sourceEntity && sourceEntity.forceSide === 'blue';
    const isRed = 'forceSide' in sourceEntity && sourceEntity.forceSide === 'red';

    if (entity.category === 'force-unit') {
      // 兵力单元：蓝色/红色
      color = isBlue ? Cesium.Color.BLUE : Cesium.Color.RED;
    } else {
      // 平台：青色/橙色
      color = isBlue ? Cesium.Color.CYAN : Cesium.Color.ORANGE;
    }
  } else {
    // 默认颜色
    color = entity.category === 'force-unit' ? Cesium.Color.BLUE : Cesium.Color.CYAN;
  }

  // 应用状态视觉样式
  pixelSize = visuals.pixelSize;

  return {
    position,
    name,
    point: {
      pixelSize,
      color: Cesium.Color.fromAlpha(color, visuals.alpha),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: visuals.outline ? visuals.outlineWidth : 0,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    },
    label: {
      text: name,
      fillColor: Cesium.Color.WHITE,
      font: currentStatus === 'engaged' ? 'bold 15px sans-serif' : '14px sans-serif',
      pixelOffset: new Cesium.Cartesian2(0, -pixelSize - 4),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 0.8,
    },
  };
}

/**
 * 设置初始视角（台湾方向）
 */
export function setInitialView(viewer: Cesium.Viewer) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(121.0, 23.8, 800000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0.0,
    },
    duration: 2,
  });
}

/**
 * 聚焦到指定实体
 */
export function flyToEntity(viewer: Cesium.Viewer, entityId: string) {
  const entity = viewer.entities.getById(entityId);
  if (entity) {
    viewer.flyTo(entity, {
      duration: 1,
      offset: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        range: 50000,
      },
    });
  }
}

/**
 * 高亮实体（临时改变样式）
 */
export function highlightEntity(viewer: Cesium.Viewer, entityId: string, highlight: boolean) {
  const entity = viewer.entities.getById(entityId);
  if (entity && entity.point) {
    const pointAny = entity.point as any;
    const currentColor = pointAny.color as Cesium.Color | undefined;
    const currentPixelSize = pointAny.pixelSize as number | undefined;
    if (highlight) {
      pointAny.color = Cesium.Color.YELLOW;
      pointAny.pixelSize = (currentPixelSize ?? 10) * 1.5;
    } else {
      if (currentColor) {
        pointAny.color = currentColor;
        pointAny.pixelSize = currentPixelSize ?? 10;
      }
    }
  }
}

/**
 * 创建台湾区域的测试数据
 */
export function createTaiwanScenarioEntities(): ScenarioEntity[] {
  return [
    {
      id: 'entity-001',
      sourceEntityId: 'force-source-101',
      name: '蓝军机动对抗分队',
      category: 'force-unit',
      currentPosition: {
        longitude: 121.0,
        latitude: 25.1,
        altitude: 0,
      },
      currentStatus: 'planned',
    },
    {
      id: 'entity-002',
      sourceEntityId: 'platform-source-207',
      name: '电子侦察平台-07',
      category: 'platform',
      currentPosition: {
        longitude: 122.0,
        latitude: 24.0,
        altitude: 0,
      },
      currentStatus: 'deployed',
    },
    {
      id: 'entity-003',
      sourceEntityId: 'force-source-102',
      name: '防空导弹营',
      category: 'force-unit',
      currentPosition: {
        longitude: 120.8,
        latitude: 23.3,
        altitude: 0,
      },
      currentStatus: 'engaged',
    },
    {
      id: 'entity-004',
      sourceEntityId: 'platform-source-208',
      name: '预警机-01',
      category: 'platform',
      currentPosition: {
        longitude: 121.6,
        latitude: 22.3,
        altitude: 8000,
      },
      currentStatus: 'deployed',
    },
    {
      id: 'entity-005',
      sourceEntityId: 'force-source-103',
      name: '特种作战分队',
      category: 'force-unit',
      currentPosition: {
        longitude: 121.4,
        latitude: 24.7,
        altitude: 0,
      },
      currentStatus: 'planned',
    },
    {
      id: 'entity-006',
      sourceEntityId: 'platform-source-209',
      name: '无人机编队',
      category: 'platform',
      currentPosition: {
        longitude: 120.9,
        latitude: 22.8,
        altitude: 3000,
      },
      currentStatus: 'deployed',
    },
  ];
}