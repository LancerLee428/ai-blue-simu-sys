export interface AutoScenarioDemoSchedulerOptions {
  delayMs: number;
  isReady: () => boolean;
  run: () => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}

export interface AutoScenarioDemoController {
  cancel: () => void;
  hasCompleted: () => boolean;
}

export function scheduleAutoScenarioDemo(options: AutoScenarioDemoSchedulerOptions): AutoScenarioDemoController {
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  const delayMs = Math.max(0, options.delayMs);
  let startedAt: number | null = null;
  let frameId: number | null = null;
  let cancelled = false;
  let completed = false;

  const tick: FrameRequestCallback = (timestamp) => {
    if (cancelled || completed) return;
    if (startedAt === null) startedAt = timestamp;

    if (timestamp - startedAt >= delayMs && options.isReady()) {
      completed = true;
      frameId = null;
      options.run();
      return;
    }

    frameId = requestFrame(tick);
  };

  frameId = requestFrame(tick);

  return {
    cancel: () => {
      cancelled = true;
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
    },
    hasCompleted: () => completed,
  };
}

export interface AutoDemoRafDelayOptions {
  requestFrame?: (callback: FrameRequestCallback) => number;
}

export function waitAutoDemoRafDelay(delayMs: number, options: AutoDemoRafDelayOptions = {}): Promise<void> {
  const normalizedDelayMs = Math.max(0, delayMs);
  if (normalizedDelayMs === 0) return Promise.resolve();

  const requestFrame = options.requestFrame ?? requestAnimationFrame;

  return new Promise((resolve) => {
    let startedAt: number | null = null;
    let resolved = false;

    const tick: FrameRequestCallback = (timestamp) => {
      if (resolved) return;
      if (startedAt === null) startedAt = timestamp;

      if (timestamp - startedAt >= normalizedDelayMs) {
        resolved = true;
        resolve();
        return;
      }

      requestFrame(tick);
    };

    requestFrame(tick);
  });
}
