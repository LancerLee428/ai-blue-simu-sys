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

export class ExecutionEngine {
  private viewer: Cesium.Viewer;
  private renderer: MapRenderer;
  private scenario: TacticalScenario | null = null;
  private status: ExecutionStatus = 'idle';
  private currentPhaseIndex = 0;
  private phaseStartTime = 0;
  private animationFrameId: number | null = null;
  private onPhaseComplete?: (phase: Phase) => void;
  private onEventTrigger?: (event: TacticalEvent) => void;
  private onStatusChange?: (status: ExecutionStatus) => void;

  // 实体当前位置快照
  private entityPositions = new Map<string, GeoPosition>();
  private entityStatuses = new Map<string, string>();

  // 每个实体的路线分段
  private entityRouteSegments = new Map<string, { from: GeoPosition; to: GeoPosition; startMs: number; durationMs: number }[]>();

  // 防止同一相位内事件重复触发
  private firedEventsThisPhase = new Set<string>();

  constructor(viewer: Cesium.Viewer, renderer: MapRenderer) {
    this.viewer = viewer;
    this.renderer = renderer;
  }

  load(scenario: TacticalScenario): void {
    this.reset();
    this.scenario = scenario;

    scenario.forces.forEach((force) => {
      force.entities.forEach((entity) => {
        this.entityPositions.set(entity.id, { ...entity.position });
        this.entityStatuses.set(entity.id, 'planned');
      });
    });

    scenario.routes.forEach((route) => {
      const segments: { from: GeoPosition; to: GeoPosition; startMs: number; durationMs: number }[] = [];
      for (let i = 0; i < route.points.length - 1; i++) {
        const from = route.points[i].position;
        const to = route.points[i + 1].position;
        const fromSec = route.points[i].timestamp ?? i * 60;
        const toSec = route.points[i + 1].timestamp ?? (i + 1) * 60;
        segments.push({
          from,
          to,
          startMs: fromSec * 1000,
          durationMs: Math.max(1, (toSec - fromSec) * 1000),
        });
      }
      this.entityRouteSegments.set(route.entityId, segments);
    });

    this.status = 'idle';
  }

  play(): void {
    if (!this.scenario || this.currentPhaseIndex >= this.scenario.phases.length) return;
    this.status = 'running';
    this.notifyStatusChange();
    this.phaseStartTime = performance.now();
    this.firedEventsThisPhase.clear();
    this.runAnimationLoop();
  }

  pause(): void {
    this.status = 'paused';
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.notifyStatusChange();
  }

  nextPhase(): void {
    if (!this.scenario) return;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    const phase = this.scenario.phases[this.currentPhaseIndex];
    this.applyPhaseEntityStates(phase);
    if (this.currentPhaseIndex < this.scenario.phases.length - 1) {
      this.currentPhaseIndex++;
      this.phaseStartTime = performance.now();
      this.onPhaseComplete?.(phase);
      this.status = 'paused';
    } else {
      this.status = 'completed';
      this.onPhaseComplete?.(phase);
    }
    this.notifyStatusChange();
  }

  prevPhase(): void {
    if (!this.scenario || this.currentPhaseIndex <= 0) return;
    this.currentPhaseIndex--;
    this.phaseStartTime = performance.now();
    this.onPhaseComplete?.(this.scenario!.phases[this.currentPhaseIndex]);
    this.status = 'paused';
    this.notifyStatusChange();
  }

  reset(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.scenario = null;
    this.status = 'idle';
    this.currentPhaseIndex = 0;
    this.entityPositions.clear();
    this.entityStatuses.clear();
    this.entityRouteSegments.clear();
    this.notifyStatusChange();
  }

  getStatus(): { status: ExecutionStatus; currentPhaseIndex: number; totalPhases: number; currentPhase: Phase | null; progress: number } {
    const phase = this.scenario?.phases[this.currentPhaseIndex] ?? null;
    const elapsed = performance.now() - this.phaseStartTime;
    const progress = phase ? Math.min(1, elapsed / (phase.duration * 1000)) : 0;
    return {
      status: this.status,
      currentPhaseIndex: this.currentPhaseIndex,
      totalPhases: this.scenario?.phases.length ?? 0,
      currentPhase: phase,
      progress,
    };
  }

  setOnPhaseComplete(cb: (phase: Phase) => void) { this.onPhaseComplete = cb; }
  setOnEventTrigger(cb: (event: TacticalEvent) => void) { this.onEventTrigger = cb; }
  setOnStatusChange(cb: (status: ExecutionStatus) => void) { this.onStatusChange = cb; }

  private runAnimationLoop(): void {
    if (this.status !== 'running') return;

    const now = performance.now();
    const phaseElapsed = now - this.phaseStartTime;
    const phase = this.scenario?.phases[this.currentPhaseIndex];
    if (!phase) return;

    // 推进实体位置（线性插值）
    this.entityRouteSegments.forEach((segments, entityId) => {
      // Find the last segment that has started
      let activeSegment: typeof segments[number] | null = null;
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i];
        if (phaseElapsed >= seg.startMs) {
          activeSegment = seg;
          break;
        }
      }
      if (activeSegment) {
        const segElapsed = phaseElapsed - activeSegment.startMs;
        const t = Math.max(0, Math.min(1, segElapsed / activeSegment.durationMs));
        const newPos = lerpPosition(activeSegment.from, activeSegment.to, t);
        this.entityPositions.set(entityId, newPos);
        this.renderer.updateEntityPosition(entityId, newPos);
      }
    });

    // 触发事件
    phase.events.forEach((event) => {
      const eventMs = event.timestamp * 1000;
      const eventKey = `${phase.events.indexOf(event)}-${event.timestamp}`;
      if (!this.firedEventsThisPhase.has(eventKey) && phaseElapsed >= eventMs && phaseElapsed < eventMs + 500) {
        this.firedEventsThisPhase.add(eventKey);
        this.onEventTrigger?.(event);
        if (event.type === 'attack') {
          const strikeId = `${event.sourceEntityId}-${event.targetEntityId}`;
          this.renderer.triggerStrikeAnimation(strikeId);
        }
        if (event.type === 'destruction' && event.targetEntityId) {
          this.entityStatuses.set(event.targetEntityId, 'destroyed');
          // 找到 side 更新样式
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

    // 检查阶段结束
    if (phaseElapsed >= phase.duration * 1000) {
      this.applyPhaseEntityStates(phase);
      if (this.currentPhaseIndex < (this.scenario?.phases.length ?? 0) - 1) {
        const prevPhase = phase;
        this.currentPhaseIndex++;
        this.phaseStartTime = now;
        this.onPhaseComplete?.(prevPhase);
      } else {
        this.status = 'completed';
        this.onPhaseComplete?.(phase);
        this.notifyStatusChange();
        return;
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this.runAnimationLoop());
  }

  private applyPhaseEntityStates(phase: Phase): void {
    phase.entityStates.forEach((state) => {
      this.entityPositions.set(state.entityId, state.position);
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
