import type { OntologyEquipment, MountPoint } from '../types/deployment';

/**
 * Ontology 装备服务
 * 从实际 Ontology 加载装备定义
 */
export class OntologyEquipmentService {
  private equipment: Map<string, OntologyEquipment> = new Map();

  constructor() {
    this.loadDemoEquipment();
  }

  /**
   * 加载演示装备数据
   */
  private loadDemoEquipment() {
    // 武器装备
    this.registerEquipment({
      id: 'weapon-missile-aa',
      name: '中程空空导弹',
      type: 'weapon',
      compatibility: ['aircraft', 'platform-air'],
      weight: 150,
      powerRequirement: 2,
      slotType: 'hardpoint',
      description: '用于中程空中拦截'
    });

    this.registerEquipment({
      id: 'weapon-missile-ag',
      name: '空地导弹',
      type: 'weapon',
      compatibility: ['aircraft', 'helicopter'],
      weight: 200,
      powerRequirement: 3,
      slotType: 'hardpoint',
      description: '精确对地攻击导弹'
    });

    this.registerEquipment({
      id: 'weapon-bomb-precision',
      name: '精确制导炸弹',
      type: 'weapon',
      compatibility: ['aircraft', 'bomber'],
      weight: 500,
      powerRequirement: 1,
      slotType: 'bomb-rack',
      description: 'GPS制导精确炸弹'
    });

    // 传感器装备
    this.registerEquipment({
      id: 'sensor-radar-aesa',
      name: '有源相控阵雷达',
      type: 'sensor',
      compatibility: ['aircraft', 'ship', 'ground-vehicle'],
      weight: 100,
      powerRequirement: 4,
      slotType: 'electronics',
      description: '先进多功能雷达'
    });

    this.registerEquipment({
      id: 'sensor-esm',
      name: '电子支援设备',
      type: 'sensor',
      compatibility: ['aircraft', 'ship'],
      weight: 50,
      powerRequirement: 2,
      slotType: 'electronics',
      description: '电子信号监测与干扰'
    });

    this.registerEquipment({
      id: 'sensor-ir-st',
      name: '红外搜索跟踪系统',
      type: 'sensor',
      compatibility: ['aircraft'],
      weight: 30,
      powerRequirement: 1,
      slotType: 'electronics',
      description: '被动红外探测'
    });

    // 通信装备
    this.registerEquipment({
      id: 'comm-satellite',
      name: '卫星通信终端',
      type: 'communication',
      compatibility: ['aircraft', 'ship', 'ground-vehicle'],
      weight: 40,
      powerRequirement: 2,
      slotType: 'communications',
      description: '宽带卫星通信'
    });

    this.registerEquipment({
      id: 'comm-data-link',
      name: '战术数据链',
      type: 'communication',
      compatibility: ['aircraft', 'ship', 'ground-vehicle'],
      weight: 25,
      powerRequirement: 1,
      slotType: 'communications',
      description: '16号战术数据链'
    });
  }

  /**
   * 注册装备
   */
  private registerEquipment(equipment: OntologyEquipment) {
    this.equipment.set(equipment.id, equipment);
  }

  /**
   * 获取所有装备
   */
  getAllEquipment(): OntologyEquipment[] {
    return Array.from(this.equipment.values());
  }

  /**
   * 按类型获取装备
   */
  getEquipmentByType(type: string): OntologyEquipment[] {
    return this.getAllEquipment().filter(eq => eq.type === type);
  }

  /**
   * 获取兼容的装备
   */
  getCompatibleEquipment(platformType: string): OntologyEquipment[] {
    return this.getAllEquipment().filter(eq =>
      eq.compatibility.includes(platformType) || eq.compatibility.includes('all')
    );
  }

  /**
   * 获取挂载点定义
   */
  getMountPointsForPlatform(platformId: string): MountPoint[] {
    // 演示数据，实际应从 Ontology 加载
    if (platformId.includes('aircraft') || platformId.includes('recon')) {
      return [
        {
          id: 'hardpoint-1',
          name: '机翼挂点1',
          slotType: 'hardpoint',
          maxCapacity: 2,
          compatibleTypes: ['weapon-missile-aa', 'weapon-missile-ag']
        },
        {
          id: 'hardpoint-2',
          name: '机翼挂点2',
          slotType: 'hardpoint',
          maxCapacity: 2,
          compatibleTypes: ['weapon-missile-aa', 'weapon-missile-ag']
        },
        {
          id: 'electronics-1',
          name: '电子设备舱',
          slotType: 'electronics',
          maxCapacity: 3,
          compatibleTypes: ['sensor-radar-aesa', 'sensor-esm', 'sensor-ir-st']
        }
      ];
    } else if (platformId.includes('ship')) {
      return [
        {
          id: 'vls-1',
          name: '垂直发射系统',
          slotType: 'vls',
          maxCapacity: 8,
          compatibleTypes: ['weapon-missile-aa', 'weapon-missile-ag']
        },
        {
          id: 'electronics-1',
          name: '电子战套间',
          slotType: 'electronics',
          maxCapacity: 4,
          compatibleTypes: ['sensor-radar-aesa', 'sensor-esm']
        }
      ];
    } else {
      return [
        {
          id: 'generic-1',
          name: '通用装备槽',
          slotType: 'generic',
          maxCapacity: 1,
          compatibleTypes: ['all']
        }
      ];
    }
  }
}

// 全局单例
export const ontologyEquipmentService = new OntologyEquipmentService();