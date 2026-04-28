import * as Cesium from 'cesium';
import type {
  TacticalScenario,
  Phase,
  GeoPosition,
  ExecutionStatus,
  TacticalEvent,
  ForceSide,
  EntityStateInPhase,
} from '../types/tactical-scenario';
import type { MapRenderer } from './map-renderer';
import { DetectionInteraction, type DetectionEvent } from './detection-interaction';
import { CollisionDetector } from './collision-detector';
import { WeatherSystem } from './weather-system';
import { ElectronicWarfareManager } from './electronic-warfare';

/**
 * 线性插值
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function lerpPosition(from: GeoPosition, to: GeoPosition, t: number): GeoPosition {
  return {
    longitude: lerp(from.longitude, to.longitude, t),
    latitude: lerp(from.latitude, to.latitude, t),
    altitude: lerp(from.altitude, to.altitude, t),
    heading: calculateHeading(from, to),  // P1 功能：计算航向
  };
}

/**
 * 计算两点间的航向角（度，0=正北，顺时针）
 */
function calculateHeading(from: GeoPosition, to: GeoPosition): number {
  const lat1 = from.latitude * Math.PI / 180;
  const lat2 = to.latitude * Math.PI / 180;
  const dLon = (to.longitude - from.longitude) * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;

  // 转换为 0-360 度范围
  return (bearing + 360) % 360;
}

/**
 * 当前阶段每个实体的移动段：从 from → to，在 [0, durationMs] 内插值
 */
interface PhaseEntityMove {
  entityId: string;
  from: GeoPosition;
  to: GeoPosition;
  durationMs: number;
}

export class ExecutionEngine {
  private viewer: Cesium.Viewer;
  private renderer: MapRenderer;
  private detectionInteraction: DetectionInteraction;
  private collisionDetector: CollisionDetector;
  private weatherSystem: WeatherSystem;
  private ewManager: ElectronicWarfareManager;
  private scenario: TacticalScenario | null = null;
  private status: ExecutionStatus = 'idle';
  private currentPhaseIndex = 0;
  private animationFrameId: number | null = null;
  private onPhaseComplete?: (phase: Phase) => void;
  private onEventTrigger?: (event: TacticalEvent) => void;
  private onStatusChange?: (status: ExecutionStatus) => void;
  private onProgressUpdate?: (progress: { currentTime: number; progress: number; currentPhaseIndex: number }) => void;
  private onDetectionEvent?: (event: DetectionEvent) => void;
  private onCollisionWarning?: (entityId: string, warnings: string[]) => void;

  // 进度更新节流（使用 RAF，每 100ms 更新一次）
  private lastProgressUpdateTime: number = 0;
  private readonly PROGRESS_UPDATE_INTERVAL = 100; // ms

  // 实体当前位置快照（跨阶段持久保存）
  private entityPositions = new Map<string, GeoPosition>();
  private entityStatuses = new Map<string, string>();

  // 当前阶段的实体移动计划（每次进入新阶段时重建）
  private currentPhaseMoves: PhaseEntityMove[] = [];

  // 防止同一相位内事件重复触发
  private firedEventsThisPhase = new Set<string>();

  // 时间控制
  private speed: number = 1;
  private lastRealTime: number = 0;
  private virtualElapsedMs: number = 0; // 当前阶段内已过去的虚拟时间（ms）

  constructor(viewer: Cesium.Viewer, renderer: MapRenderer) {
    this.viewer = viewer;
    this.renderer = renderer;
    this.detectionInteraction = new DetectionInteraction();
    this.collisionDetector = new CollisionDetector();
    this.weatherSystem = new WeatherSystem();
    this.ewManager = new ElectronicWarfareManager();

    // 设置探测事件回调
    this.detectionInteraction.setOnDetectionEvent((event) => {
      this.handleDetectionEvent(event);
    });
  }

  load(scenario: TacticalScenario): void {
    this.reset();
    this.scenario = scenario;

    // 如果 phases 为空但有 routes，自动生成 phases
    if ((!scenario.phases || scenario.phases.length === 0) && scenario.routes && scenario.routes.length > 0) {
      this.generatePhasesFromRoutes(scenario);
    }

    // 初始化探测交互引擎
    this.detectionInteraction.setScenario(scenario);

    // 初始化电子战管理器
    scenario.forces.forEach((force) => {
      force.entities.forEach((entity) => {
        this.ewManager.registerJammer(entity);
      });
    });

    // 初始化实体位置为其原始部署位置
    scenario.forces.forEach((force) => {
      force.entities.forEach((entity) => {
        this.entityPositions.set(entity.id, { ...entity.position });
        this.entityStatuses.set(entity.id, 'planned');
      });
    });

    this.status = 'idle';
    this.notifyStatusChange();
  }

  /**
   * 设置倍速（立即触发状态同步）
   */
  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(20, speed));
    // 立即通知状态变化，确保 UI 同步
    this.notifyStatusChange();
  }

  /**
   * 获取当前倍速
   */
  getSpeed(): number {
    return this.speed;
  }

  /**
   * 播放
   */
  play(): void {
    if (!this.scenario || this.currentPhaseIndex >= this.scenario.phases.length) return;

    if (this.status === 'completed') {
      // 如果已完成，重新开始
      this.virtualElapsedMs = 0;
      this.currentPhaseIndex = 0;
      this.firedEventsThisPhase.clear();
      this.detectionInteraction.reset();
      // 实体位置回到起始
      this.scenario.forces.forEach((force) => {
        force.entities.forEach((entity) => {
          this.entityPositions.set(entity.id, { ...entity.position });
        });
      });
    }

    // 为当前阶段建立移动计划
    this.buildPhaseMoves(this.currentPhaseIndex);

    this.status = 'running';
    // 关键修复：无论从哪个状态开始播放，都重置时间基准
    this.lastRealTime = performance.now();
    this.notifyStatusChange();

    if (this.animationFrameId === null) {
      this.runAnimationLoop();
    }
  }

  /**
   * 暂停
   */
  pause(): void {
    this.status = 'paused';
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.notifyStatusChange();
  }

  /**
   * 停止并复位
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.virtualElapsedMs = 0;
    this.currentPhaseIndex = 0;
    this.firedEventsThisPhase.clear();
    this.status = 'idle';

    // 将所有实体复位到初始位置
    if (this.scenario) {
      this.scenario.forces.forEach((force) => {
        force.entities.forEach((entity) => {
          this.entityPositions.set(entity.id, { ...entity.position });
          this.renderer.updateEntityPosition(entity.id, entity.position);
          this.renderer.updateEntityStatus(entity.id, 'deployed', force.side);
        });
      });
    }

    this.notifyStatusChange();
  }

  /**
   * 下一阶段
   */
  nextPhase(): void {
    if (!this.scenario) return;
    const phase = this.scenario.phases[this.currentPhaseIndex];
    if (phase) this.applyPhaseEntityStates(phase);

    if (this.currentPhaseIndex < this.scenario.phases.length - 1) {
      this.currentPhaseIndex++;
      this.virtualElapsedMs = 0;
      this.firedEventsThisPhase.clear();
      this.onPhaseComplete?.(phase);
    } else {
      this.status = 'completed';
      this.onPhaseComplete?.(phase);
    }
    this.notifyStatusChange();
  }

  /**
   * 上一阶段
   */
  prevPhase(): void {
    if (!this.scenario || this.currentPhaseIndex <= 0) return;
    this.currentPhaseIndex--;
    this.virtualElapsedMs = 0;
    this.firedEventsThisPhase.clear();
    this.notifyStatusChange();
  }

  /**
   * 步进
   */
  step(deltaSeconds: number) {
    const phase = this.scenario?.phases[this.currentPhaseIndex];
    if (!phase) return;

    this.virtualElapsedMs = Math.max(0, Math.min(
      phase.duration * 1000,
      this.virtualElapsedMs + deltaSeconds * 1000
    ));
    this.updateEntitiesToTime(this.virtualElapsedMs);
  }

  reset(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.scenario = null;
    this.status = 'idle';
    this.currentPhaseIndex = 0;
    this.virtualElapsedMs = 0;
    this.entityPositions.clear();
    this.entityStatuses.clear();
    this.currentPhaseMoves = [];
    this.firedEventsThisPhase.clear();
    this.detectionInteraction.reset();
    this.ewManager.reset();
    this.notifyStatusChange();
  }

  getStatus(): {
    status: ExecutionStatus;
    currentPhaseIndex: number;
    totalPhases: number;
    currentPhase: Phase | null;
    progress: number;
    speed: number;
    currentTime: number;
  } {
    const phase = this.scenario?.phases[this.currentPhaseIndex] ?? null;
    const progress = phase ? Math.min(1, this.virtualElapsedMs / (phase.duration * 1000)) : 0;
    return {
      status: this.status,
      currentPhaseIndex: this.currentPhaseIndex,
      totalPhases: this.scenario?.phases.length ?? 0,
      currentPhase: phase,
      progress,
      speed: this.speed,
      currentTime: this.virtualElapsedMs / 1000,
    };
  }

  setOnPhaseComplete(cb: (phase: Phase) => void) { this.onPhaseComplete = cb; }
  setOnEventTrigger(cb: (event: TacticalEvent) => void) { this.onEventTrigger = cb; }
  setOnStatusChange(cb: (status: ExecutionStatus) => void) { this.onStatusChange = cb; }
  setOnProgressUpdate(cb: (progress: { currentTime: number; progress: number; currentPhaseIndex: number }) => void) { this.onProgressUpdate = cb; }
  setOnDetectionEvent(cb: (event: DetectionEvent) => void) { this.onDetectionEvent = cb; }
  setOnCollisionWarning(cb: (entityId: string, warnings: string[]) => void) { this.onCollisionWarning = cb; }

  // 获取系统实例供外部使用
  getWeatherSystem() { return this.weatherSystem; }
  getEWManager() { return this.ewManager; }
  getCollisionDetector() { return this.collisionDetector; }

  /**
   * 处理探测事件（P0 功能：视觉反馈）
   */
  private handleDetectionEvent(event: DetectionEvent): void {
    // 通知外部监听器
    this.onDetectionEvent?.(event);

    // 视觉反馈：高亮被探测实体
    const detectedEntity = this.viewer.entities.getById(event.detectedEntityId);
    if (detectedEntity && detectedEntity.billboard) {
      // 闪烁效果：临时放大并改变颜色
      const originalWidth = (detectedEntity.billboard as any).width;
      const originalHeight = (detectedEntity.billboard as any).height;

      this.runDetectionFlash(detectedEntity, originalWidth, originalHeight);
    }

    // 在探测范围边缘添加警告标记
    this.renderDetectionWarning(event);
  }

  /**
   * 使用 RAF 驱动探测告警闪烁，避免定时器和动画循环混用。
   */
  private runDetectionFlash(detectedEntity: Cesium.Entity, originalWidth: any, originalHeight: any): void {
    const startTime = performance.now();
    const flashDurationMs = 1200;
    const flashIntervalMs = 200;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed >= flashDurationMs) {
        if (detectedEntity.billboard) {
          (detectedEntity.billboard as any).width = originalWidth;
          (detectedEntity.billboard as any).height = originalHeight;
        }
        return;
      }

      if (detectedEntity.billboard) {
        const flashIndex = Math.floor(elapsed / flashIntervalMs);
        const scale = flashIndex % 2 === 0 ? 1.3 : 1.0;
        (detectedEntity.billboard as any).width = originalWidth * scale;
        (detectedEntity.billboard as any).height = originalHeight * scale;
      }

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  /**
   * 渲染探测警告标记
   */
  private renderDetectionWarning(event: DetectionEvent): void {
    const detectedEntity = this.viewer.entities.getById(event.detectedEntityId);
    if (!detectedEntity) return;

    const position = (detectedEntity as any).position?.getValue
      ? (detectedEntity as any).position.getValue(this.viewer.clock.currentTime)
      : null;
    if (!position) return;

    // 创建警告图标（感叹号）
    const warningCanvas = document.createElement('canvas');
    warningCanvas.width = 24;
    warningCanvas.height = 24;
    const ctx = warningCanvas.getContext('2d')!;

    // 红色三角形
    ctx.beginPath();
    ctx.moveTo(12, 2);
    ctx.lineTo(22, 20);
    ctx.lineTo(2, 20);
    ctx.closePath();
    ctx.fillStyle = event.detectorSide === 'blue' ? '#ff4444' : '#4488ff';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 白色感叹号
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, 7, 4, 8);
    ctx.fillRect(10, 17, 4, 3);

    const warningEntity = this.viewer.entities.add({
      position,
      billboard: {
        image: warningCanvas.toDataURL(),
        width: 24,
        height: 24,
        pixelOffset: new Cesium.Cartesian2(20, -20),
        heightReference: Cesium.HeightReference.NONE,
      },
    });
    (warningEntity as any).__tacticalLayer = true;

    this.removeWarningOnNextFrames(warningEntity, 2000);
  }

  private removeWarningOnNextFrames(warningEntity: Cesium.Entity, delayMs: number): void {
    const startTime = performance.now();

    const checkElapsed = (now: number) => {
      if (now - startTime >= delayMs) {
        this.viewer.entities.remove(warningEntity);
        return;
      }

      requestAnimationFrame(checkElapsed);
    };

    requestAnimationFrame(checkElapsed);
  }

  /**
   * 从 routes 自动生成 phases
   */
  private generatePhasesFromRoutes(scenario: TacticalScenario): void {
    if (!scenario.routes || scenario.routes.length === 0) return;

    // 计算所有路线的总时长
    let maxDuration = 60; // 默认60秒
    scenario.routes.forEach(route => {
      if (route.points.length > 1) {
        const lastPoint = route.points[route.points.length - 1];
        if (lastPoint.timestamp && lastPoint.timestamp > maxDuration) {
          maxDuration = lastPoint.timestamp;
        }
      }
    });

    // 创建单个阶段，包含所有路线的终点作为目标位置
    const entityStates: EntityStateInPhase[] = [];

    scenario.routes.forEach(route => {
      if (route.points.length > 0) {
        const targetPoint = route.points[route.points.length - 1];
        entityStates.push({
          entityId: route.entityId,
          position: targetPoint.position,
          status: 'deployed',
        });
      }
    });

    // 为没有路线的实体添加状态（保持原位）
    scenario.forces.forEach(force => {
      force.entities.forEach(entity => {
        if (!scenario.routes?.some(r => r.entityId === entity.id)) {
          entityStates.push({
            entityId: entity.id,
            position: entity.position,
            status: 'planned',
          });
        }
      });
    });

    const phase: Phase = {
      id: 'phase-auto-generated',
      name: '机动阶段',
      description: '根据路线自动生成的机动阶段',
      duration: maxDuration,
      events: [],
      entityStates,
    };

    scenario.phases = [phase];
  }

  /**
   * 为指定阶段建立移动计划：
   * 从当前 entityPositions（上阶段末位置）→ 本阶段 entityStates 目标位置
   */
  private buildPhaseMoves(phaseIndex: number): void {
    this.currentPhaseMoves = [];
    const phase = this.scenario?.phases[phaseIndex];
    if (!phase) return;

    const phaseDurationMs = Math.max(1, phase.duration * 1000);

    phase.entityStates.forEach((state) => {
      const fromPos = this.entityPositions.get(state.entityId);
      if (!fromPos) return;

      // 如果起点和终点几乎一致，跳过（避免无意义移动）
      const dx = Math.abs(state.position.longitude - fromPos.longitude);
      const dy = Math.abs(state.position.latitude - fromPos.latitude);
      const dz = Math.abs(state.position.altitude - fromPos.altitude);
      if (dx < 1e-8 && dy < 1e-8 && dz < 1) return;

      this.currentPhaseMoves.push({
        entityId: state.entityId,
        from: { ...fromPos },
        to: { ...state.position },
        durationMs: phaseDurationMs,
      });
    });
  }

  /**
   * 更新实体到当前阶段内指定虚拟时间（阶段内相对时间）
   */
  private updateEntitiesToTime(virtualMs: number) {
    if (!this.scenario) return;

    this.currentPhaseMoves.forEach((move) => {
      const t = Math.max(0, Math.min(1, virtualMs / move.durationMs));
      let newPos = lerpPosition(move.from, move.to, t);

      // 获取实体类型
      let entityType: string | undefined;
      for (const force of this.scenario!.forces) {
        const entity = force.entities.find(e => e.id === move.entityId);
        if (entity) {
          entityType = entity.type;
          break;
        }
      }

      if (entityType) {
        // 碰撞检测
        const collisionResult = this.collisionDetector.checkPosition(newPos, entityType as any);
        if (!collisionResult.valid) {
          // 发出警告但不阻止移动（可选：停止移动）
          this.onCollisionWarning?.(move.entityId, collisionResult.violations);
          console.warn(`实体 ${move.entityId} 碰撞警告:`, collisionResult.violations);
        }

        // 天气影响速度
        const speedModifier = this.weatherSystem.getSpeedModifier(newPos, entityType);
        if (speedModifier < 1.0) {
          // 减速：调整插值进度
          const adjustedT = t * speedModifier;
          newPos = lerpPosition(move.from, move.to, adjustedT);
        }

        // 飞行安全检查
        const safetyResult = this.weatherSystem.checkFlightSafety(newPos, entityType);
        if (!safetyResult.safe) {
          console.warn(`实体 ${move.entityId} 飞行安全警告:`, safetyResult.warnings);
        }
      }

      this.renderer.updateEntityPosition(move.entityId, newPos);
      this.entityPositions.set(move.entityId, newPos);
    });
  }

  /**
   * 动画主循环 — 用累计虚拟时间驱动，倍速直接影响时间推进速度
   */
  private runAnimationLoop(): void {
    if (this.status !== 'running') {
      this.animationFrameId = null;
      return;
    }

    const now = performance.now();
    const realDeltaMs = now - this.lastRealTime;
    this.lastRealTime = now;

    // 核心：累计虚拟时间 = 真实时间差 × 倍速
    this.virtualElapsedMs += realDeltaMs * this.speed;

    const phase = this.scenario?.phases[this.currentPhaseIndex];
    if (!phase) {
      this.animationFrameId = null;
      return;
    }

    // 更新实体位置
    this.updateEntitiesToTime(this.virtualElapsedMs);

    // 同步干扰机当前位置，探测逻辑统一通过电子战管理器计算有效探测半径。
    this.entityPositions.forEach((position, entityId) => {
      this.ewManager.updateJammerPosition(entityId, position);
    });

    // 检查探测交互（P0 功能），传入电子战管理器
    this.detectionInteraction.checkDetections(
      this.entityPositions,
      this.virtualElapsedMs / 1000,
      this.ewManager
    );

    // 节流进度更新（每 100ms 触发一次，使用 RAF）
    if (now - this.lastProgressUpdateTime >= this.PROGRESS_UPDATE_INTERVAL) {
      this.lastProgressUpdateTime = now;
      this.onProgressUpdate?.({
        currentTime: this.virtualElapsedMs / 1000,
        progress: this.virtualElapsedMs / (phase.duration * 1000),
        currentPhaseIndex: this.currentPhaseIndex,
      });
    }

    // 触发事件
    phase.events.forEach((event, idx) => {
      const eventMs = event.timestamp * 1000;
      const eventKey = `${idx}-${event.timestamp}`;
      if (!this.firedEventsThisPhase.has(eventKey) && this.virtualElapsedMs >= eventMs) {
        this.firedEventsThisPhase.add(eventKey);
        this.onEventTrigger?.(event);
        if (event.type === 'attack') {
          this.renderer.triggerStrikeAnimation(event.sourceEntityId, event.targetEntityId ?? '');
        }
        if (event.type === 'destruction' && event.targetEntityId) {
          this.entityStatuses.set(event.targetEntityId, 'destroyed');
          if (this.scenario) {
            for (const force of this.scenario.forces) {
              const found = force.entities.find(e => e.id === event.targetEntityId);
              if (found) {
                this.renderer.updateEntityStatus(event.targetEntityId!, 'destroyed', found.side);
                break;
              }
            }
          }
        }
      }
    });

    // 检查阶段是否结束
    if (this.virtualElapsedMs >= phase.duration * 1000) {
      // 阶段结束：将实体快照更新到阶段末位置，作为下一阶段起点
      this.applyPhaseEntityStates(phase);

      if (this.currentPhaseIndex < (this.scenario?.phases.length ?? 0) - 1) {
        this.currentPhaseIndex++;
        this.virtualElapsedMs = 0;
        this.firedEventsThisPhase.clear();
        // 为下一阶段建立移动计划（从上阶段末位置出发）
        this.buildPhaseMoves(this.currentPhaseIndex);
        this.onPhaseComplete?.(phase);
      } else {
        this.status = 'completed';
        this.onPhaseComplete?.(phase);
        this.notifyStatusChange();
        this.animationFrameId = null;
        return;
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.runAnimationLoop());
  }

  private applyPhaseEntityStates(phase: Phase): void {
    phase.entityStates.forEach((state) => {
      // 持久化当前阶段末实体位置，作为下一阶段 buildPhaseMoves 的起点
      this.entityPositions.set(state.entityId, { ...state.position });
      this.renderer.updateEntityPosition(state.entityId, state.position);
      if (state.status) {
        this.entityStatuses.set(state.entityId, state.status);
      }
      if (!this.scenario) return;
      let found: { side: string } | undefined;
      for (const force of this.scenario.forces) {
        const entity = force.entities.find(e => e.id === state.entityId);
        if (entity) {
          found = entity;
          break;
        }
      }
      if (state.status === 'engaged' && found) {
        this.renderer.updateEntityStatus(state.entityId, 'engaged', found.side as ForceSide);
      }
    });
  }

  private notifyStatusChange(): void {
    this.onStatusChange?.(this.status);
  }
}
