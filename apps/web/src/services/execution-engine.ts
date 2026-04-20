import * as Cesium from 'cesium';
import type {
  TacticalScenario,
  Phase,
  GeoPosition,
  ExecutionStatus,
  TacticalEvent,
  ForceSide,
} from '../types/tactical-scenario';
import type { MapRenderer } from './map-renderer';

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
  };
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
  private scenario: TacticalScenario | null = null;
  private status: ExecutionStatus = 'idle';
  private currentPhaseIndex = 0;
  private animationFrameId: number | null = null;
  private onPhaseComplete?: (phase: Phase) => void;
  private onEventTrigger?: (event: TacticalEvent) => void;
  private onStatusChange?: (status: ExecutionStatus) => void;

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
  }

  load(scenario: TacticalScenario): void {
    this.reset();
    this.scenario = scenario;

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
   * 设置倍速
   */
  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(20, speed));
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
    this.currentPhaseMoves.forEach((move) => {
      const t = Math.max(0, Math.min(1, virtualMs / move.durationMs));
      const newPos = lerpPosition(move.from, move.to, t);
      this.renderer.updateEntityPosition(move.entityId, newPos);
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
