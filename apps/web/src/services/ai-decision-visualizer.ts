// apps/web/src/services/ai-decision-visualizer.ts
import type { Route, EntitySpec, DetectionZone } from '../types/tactical-scenario';

/**
 * AI 决策可视化器
 * 显示 AI 为什么选择这条路线、这个目标
 */
export class AiDecisionVisualizer {
  /**
   * 分析并生成路线决策理由
   */
  analyzeRouteDecision(
    route: Route,
    entity: EntitySpec,
    allEntities: EntitySpec[],
    detectionZones: DetectionZone[],
  ): RouteDecision {
    const targetEntity = allEntities.find(e => {
      const lastPoint = route.points[route.points.length - 1];
      const dist = this.calculateDistance(e.position, lastPoint.position);
      return dist < 10000; // 终点 10km 内的实体
    });

    if (!targetEntity) {
      return {
        routeId: route.entityId,
        reasoning: '未找到目标实体',
        factors: [],
        score: 0,
      };
    }

    const factors: DecisionFactor[] = [];
    let totalScore = 0;

    // 因素 1: 目标价值
    const targetValue = this.evaluateTargetValue(targetEntity);
    factors.push({
      name: '目标价值',
      description: this.getTargetValueDescription(targetEntity),
      weight: 0.3,
      score: targetValue,
    });
    totalScore += targetValue * 0.3;

    // 因素 2: 路线安全性
    const routeSafety = this.evaluateRouteSafety(route, detectionZones, entity.side);
    factors.push({
      name: '路线安全性',
      description: routeSafety.description,
      weight: 0.25,
      score: routeSafety.score,
    });
    totalScore += routeSafety.score * 0.25;

    // 因素 3: 距离效率
    const distance = this.calculateRouteDistance(route);
    const distanceScore = Math.max(0, 1 - distance / 1000000); // 1000km 为基准
    factors.push({
      name: '距离效率',
      description: `航程 ${(distance / 1000).toFixed(0)}km`,
      weight: 0.2,
      score: distanceScore,
    });
    totalScore += distanceScore * 0.2;

    // 因素 4: 战术优势
    const tacticalAdvantage = this.evaluateTacticalAdvantage(route, entity, targetEntity);
    factors.push({
      name: '战术优势',
      description: tacticalAdvantage.description,
      weight: 0.25,
      score: tacticalAdvantage.score,
    });
    totalScore += tacticalAdvantage.score * 0.25;

    return {
      routeId: route.entityId,
      targetId: targetEntity.id,
      targetName: targetEntity.name,
      reasoning: this.generateReasoning(entity, targetEntity, factors),
      factors,
      score: totalScore,
    };
  }

  /**
   * 评估目标价值
   */
  private evaluateTargetValue(target: EntitySpec): number {
    // 高价值目标
    const highValueTypes = [
      'ship-carrier',      // 航母
      'air-aew',           // 预警机
      'facility-command',  // 指挥中心
      'ground-radar',      // 雷达站
    ];

    // 中价值目标
    const mediumValueTypes = [
      'ship-destroyer',    // 驱逐舰
      'air-bomber',        // 轰炸机
      'facility-airbase',  // 机场
      'ground-sam',        // 防空导弹
    ];

    if (highValueTypes.includes(target.type)) {
      return 0.9;
    } else if (mediumValueTypes.includes(target.type)) {
      return 0.6;
    } else {
      return 0.3;
    }
  }

  /**
   * 获取目标价值描述
   */
  private getTargetValueDescription(target: EntitySpec): string {
    const valueMap: Record<string, string> = {
      'ship-carrier': '航母 - 战略级高价值目标',
      'air-aew': '预警机 - 关键感知节点',
      'facility-command': '指挥中心 - 指挥体系核心',
      'ground-radar': '雷达站 - 防空网关键节点',
      'ship-destroyer': '驱逐舰 - 重要作战平台',
      'air-bomber': '轰炸机 - 远程打击威胁',
      'facility-airbase': '机场 - 空中力量基地',
      'ground-sam': '防空导弹 - 区域防空威胁',
    };

    return valueMap[target.type] || `${target.name} - 一般目标`;
  }

  /**
   * 评估路线安全性
   */
  private evaluateRouteSafety(
    route: Route,
    detectionZones: DetectionZone[],
    attackerSide: 'red' | 'blue',
  ): { score: number; description: string } {
    let exposureTime = 0;
    let totalTime = route.points.length;

    // 检查每个航路点是否在敌方探测范围内
    for (const point of route.points) {
      for (const zone of detectionZones) {
        if (zone.side === attackerSide) continue; // 跳过己方探测范围

        const dist = this.calculateDistance(point.position, zone.center);
        if (dist < zone.radiusMeters) {
          exposureTime++;
          break;
        }
      }
    }

    const exposureRatio = exposureTime / totalTime;
    const score = Math.max(0, 1 - exposureRatio);

    let description: string;
    if (exposureRatio < 0.2) {
      description = '隐蔽性好，大部分航段避开敌方探测';
    } else if (exposureRatio < 0.5) {
      description = '部分航段暴露在敌方探测范围内';
    } else {
      description = '高风险路线，长时间暴露在敌方探测下';
    }

    return { score, description };
  }

  /**
   * 评估战术优势
   */
  private evaluateTacticalAdvantage(
    route: Route,
    attacker: EntitySpec,
    target: EntitySpec,
  ): { score: number; description: string } {
    let score = 0.5; // 基础分
    const advantages: string[] = [];

    // 高度优势（空中平台）
    if (attacker.type.startsWith('air-') && attacker.position.altitude > 8000) {
      score += 0.2;
      advantages.push('高空优势');
    }

    // 速度优势
    if (this.isFastPlatform(attacker.type) && !this.isFastPlatform(target.type)) {
      score += 0.15;
      advantages.push('速度优势');
    }

    // 隐蔽接近（低空突防）
    const avgAltitude = route.points.reduce((sum, p) => sum + p.position.altitude, 0) / route.points.length;
    if (attacker.type.startsWith('air-') && avgAltitude < 2000) {
      score += 0.15;
      advantages.push('低空突防');
    }

    const description = advantages.length > 0
      ? `具备 ${advantages.join('、')}`
      : '无明显战术优势';

    return { score: Math.min(1, score), description };
  }

  /**
   * 生成决策理由
   */
  private generateReasoning(
    attacker: EntitySpec,
    target: EntitySpec,
    factors: DecisionFactor[],
  ): string {
    const topFactors = factors
      .sort((a, b) => b.score * b.weight - a.score * a.weight)
      .slice(0, 2);

    return `${attacker.name} 选择攻击 ${target.name}，主要考虑：${topFactors.map(f => f.description).join('；')}`;
  }

  private isFastPlatform(type: string): boolean {
    return type.startsWith('air-fighter') || type.startsWith('air-multirole');
  }

  private calculateRouteDistance(route: Route): number {
    let totalDistance = 0;
    for (let i = 0; i < route.points.length - 1; i++) {
      totalDistance += this.calculateDistance(
        route.points[i].position,
        route.points[i + 1].position,
      );
    }
    return totalDistance;
  }

  private calculateDistance(pos1: any, pos2: any): number {
    const R = 6371000;
    const lat1 = (pos1.latitude * Math.PI) / 180;
    const lat2 = (pos2.latitude * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLon = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

export interface RouteDecision {
  routeId: string;
  targetId?: string;
  targetName?: string;
  reasoning: string;
  factors: DecisionFactor[];
  score: number;
}

export interface DecisionFactor {
  name: string;
  description: string;
  weight: number;
  score: number; // 0-1
}
