export interface AutoDemoCameraConfig {
  headingDeg: number;
  pitchDeg: number;
  rangeMeters: number | null;
  flyDurationSec: number;
}

export interface AutoDemoConfig {
  planId: string;
  importDelayMs: number;
  playDelayAfterCameraArriveMs: number;
  camera: AutoDemoCameraConfig;
}

export const AUTO_DEMO_CONFIG: AutoDemoConfig = {
  planId: 'plan-auto-default-scenario',

  // 页面进入或刷新后，等待多久自动导入默认 XML。
  importDelayMs: 4_000,

  // 镜头飞到目标后，再等待多久开始推演。保持 0 表示镜头到位后立刻开始。
  playDelayAfterCameraArriveMs: 2,

  camera: {
    // 水平绕目标旋转角度，0 表示从北向看。
    headingDeg: 10,

    // 俯仰角，越接近 -90 越接近俯视。
    pitchDeg: -50,

    // null 表示按卫星高度自动计算；也可以改成固定距离，如 600_000。
    rangeMeters: 6000_000,

    // 镜头飞行持续时间，单位秒。
    flyDurationSec: 2,
  },
};
