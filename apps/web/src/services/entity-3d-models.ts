// apps/web/src/services/entity-3d-models.ts
import type { PlatformType, ForceSide, EntityStatus } from '../types/tactical-scenario';

/**
 * 3D 实体模型渲染器
 * 使用 Canvas 绘制更真实的飞机、坦克、舰艇、雷达等三维模型
 */

interface ModelConfig {
  draw: (ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) => void;
  baseSize: number;
}

const STATUS_MULTIPLIER: Record<EntityStatus, number> = {
  planned: 0.8,
  deployed: 1.0,
  engaged: 1.3,
  destroyed: 0.6,
};

const SIDE_COLORS: Record<ForceSide, { fill: string; stroke: string; accent: string }> = {
  red:  { fill: '#ff4444', stroke: '#ff8888', accent: '#cc0000' },
  blue: { fill: '#4488ff', stroke: '#88bbff', accent: '#0044cc' },
};

// ============================================================================
// 空中力量 3D 模型
// ============================================================================

/** 战斗机 - 侧视图带机翼和尾翼 */
function drawFighter3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 机身主体（流线型）
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.35);  // 机头
  ctx.quadraticCurveTo(cx + size * 0.08, cy - size * 0.2, cx + size * 0.1, cy);  // 右侧机身
  ctx.lineTo(cx + size * 0.08, cy + size * 0.25);  // 机尾右
  ctx.lineTo(cx, cy + size * 0.3);  // 尾部中心
  ctx.lineTo(cx - size * 0.08, cy + size * 0.25);  // 机尾左
  ctx.lineTo(cx - size * 0.1, cy);  // 左侧机身
  ctx.quadraticCurveTo(cx - size * 0.08, cy - size * 0.2, cx, cy - size * 0.35);  // 回到机头
  ctx.closePath();

  // 渐变填充
  const gradient = ctx.createLinearGradient(cx - size * 0.1, 0, cx + size * 0.1, 0);
  gradient.addColorStop(0, colors.accent);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, colors.accent);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 主翼（三角翼）
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.35, cy + size * 0.05);
  ctx.lineTo(cx - size * 0.05, cy - size * 0.05);
  ctx.lineTo(cx - size * 0.05, cy + size * 0.15);
  ctx.closePath();
  ctx.fillStyle = colors.stroke;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + size * 0.35, cy + size * 0.05);
  ctx.lineTo(cx + size * 0.05, cy - size * 0.05);
  ctx.lineTo(cx + size * 0.05, cy + size * 0.15);
  ctx.closePath();
  ctx.fillStyle = colors.stroke;
  ctx.fill();
  ctx.stroke();

  // 垂直尾翼
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.2);
  ctx.lineTo(cx - size * 0.08, cy + size * 0.35);
  ctx.lineTo(cx + size * 0.08, cy + size * 0.35);
  ctx.closePath();
  ctx.fillStyle = colors.accent;
  ctx.fill();
  ctx.stroke();

  // 驾驶舱（高光）
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.15, size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fill();
}

/** 轰炸机 - 更大更宽 */
function drawBomber3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 机身（粗壮）
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.3);
  ctx.quadraticCurveTo(cx + size * 0.15, cy - size * 0.15, cx + size * 0.15, cy + size * 0.1);
  ctx.lineTo(cx + size * 0.12, cy + size * 0.25);
  ctx.lineTo(cx, cy + size * 0.28);
  ctx.lineTo(cx - size * 0.12, cy + size * 0.25);
  ctx.lineTo(cx - size * 0.15, cy + size * 0.1);
  ctx.quadraticCurveTo(cx - size * 0.15, cy - size * 0.15, cx, cy - size * 0.3);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 宽翼
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy + size * 0.1);
  ctx.lineTo(cx - size * 0.1, cy - size * 0.1);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.2);
  ctx.closePath();
  ctx.fillStyle = colors.stroke;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + size * 0.4, cy + size * 0.1);
  ctx.lineTo(cx + size * 0.1, cy - size * 0.1);
  ctx.lineTo(cx + size * 0.1, cy + size * 0.2);
  ctx.closePath();
  ctx.fillStyle = colors.stroke;
  ctx.fill();
  ctx.stroke();

  // 发动机舱（两侧）
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.18, cy, size * 0.08, size * 0.15);
  ctx.fillRect(cx + size * 0.1, cy, size * 0.08, size * 0.15);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.18, cy, size * 0.08, size * 0.15);
  ctx.strokeRect(cx + size * 0.1, cy, size * 0.08, size * 0.15);
}

/** 直升机 - 旋翼 + 机身 */
function drawHelo3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 机身（椭圆）
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.12, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 驾驶舱（前部透明罩）
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.15, size * 0.1, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 主旋翼（旋转效果）
  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size * 0.05);
    const endX = cx + Math.cos(angle) * size * 0.35;
    const endY = cy - size * 0.05 + Math.sin(angle) * size * 0.35;
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 尾梁
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.03, cy + size * 0.15, size * 0.06, size * 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.03, cy + size * 0.15, size * 0.06, size * 0.2);

  // 尾旋翼
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.35, size * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = colors.stroke;
  ctx.fill();
  ctx.stroke();
}

// ============================================================================
// 海上力量 3D 模型
// ============================================================================

/** 航母 - 飞行甲板 + 舰岛 */
function drawCarrier3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 舰体（梯形）
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.35);  // 舰首
  ctx.lineTo(cx + size * 0.25, cy + size * 0.2);  // 右舷
  ctx.lineTo(cx + size * 0.2, cy + size * 0.35);  // 舰尾右
  ctx.lineTo(cx - size * 0.2, cy + size * 0.35);  // 舰尾左
  ctx.lineTo(cx - size * 0.25, cy + size * 0.2);  // 左舷
  ctx.closePath();

  const gradient = ctx.createLinearGradient(cx - size * 0.25, 0, cx + size * 0.25, 0);
  gradient.addColorStop(0, colors.accent);
  gradient.addColorStop(0.5, color);
  gradient.addColorStop(1, colors.accent);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 飞行甲板标线
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.15, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.15, cy + size * 0.15);
  ctx.stroke();
  ctx.setLineDash([]);

  // 舰岛（右侧）
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx + size * 0.08, cy - size * 0.1, size * 0.12, size * 0.25);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx + size * 0.08, cy - size * 0.1, size * 0.12, size * 0.25);

  // 雷达天线
  ctx.fillStyle = '#ffaa00';
  ctx.fillRect(cx + size * 0.12, cy - size * 0.15, size * 0.04, size * 0.05);
}

/** 驱逐舰 - 舰体 + 相控阵雷达 */
function drawDestroyer3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 舰体
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.3);
  ctx.lineTo(cx + size * 0.15, cy + size * 0.25);
  ctx.lineTo(cx - size * 0.15, cy + size * 0.25);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 上层建筑
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.1, cy - size * 0.05, size * 0.2, size * 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.1, cy - size * 0.05, size * 0.2, size * 0.2);

  // 相控阵雷达（四面）
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(cx - size * 0.12, cy, size * 0.08, size * 0.08);
  ctx.fillRect(cx + size * 0.04, cy, size * 0.08, size * 0.08);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cx - size * 0.12, cy, size * 0.08, size * 0.08);
  ctx.strokeRect(cx + size * 0.04, cy, size * 0.08, size * 0.08);

  // 垂直发射单元（前甲板）
  ctx.fillStyle = colors.stroke;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(cx - size * 0.08 + i * size * 0.08, cy - size * 0.2, size * 0.06, size * 0.08);
  }
}

/** 潜艇 - 水下轮廓 */
function drawSubmarine3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 艇体（雪茄型）
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.05, size * 0.12, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 指挥塔（围壳）
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.08, cy - size * 0.15, size * 0.16, size * 0.15);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.08, cy - size * 0.15, size * 0.16, size * 0.15);

  // 潜望镜
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.15);
  ctx.lineTo(cx, cy - size * 0.25);
  ctx.stroke();

  // 水波纹效果
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================================================
// 地面力量 3D 模型
// ============================================================================

/** 坦克 - 炮塔 + 履带 */
function drawTank3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 车体
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.18, cy + size * 0.05, size * 0.36, size * 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - size * 0.18, cy + size * 0.05, size * 0.36, size * 0.2);

  // 履带（两侧）
  ctx.fillStyle = '#333333';
  ctx.fillRect(cx - size * 0.22, cy + size * 0.08, size * 0.04, size * 0.18);
  ctx.fillRect(cx + size * 0.18, cy + size * 0.08, size * 0.04, size * 0.18);
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.22, cy + size * 0.08, size * 0.04, size * 0.18);
  ctx.strokeRect(cx + size * 0.18, cy + size * 0.08, size * 0.04, size * 0.18);

  // 炮塔
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.15, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 主炮
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.02, cy - size * 0.3, size * 0.04, size * 0.3);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.02, cy - size * 0.3, size * 0.04, size * 0.3);

  // 炮口制退器
  ctx.fillStyle = '#666666';
  ctx.fillRect(cx - size * 0.03, cy - size * 0.32, size * 0.06, size * 0.04);
}

/** 雷达站 - 旋转雷达 + 基座 */
function drawRadarStation3D(ctx: CanvasRenderingContext2D, size: number, color: string, side: ForceSide) {
  const colors = SIDE_COLORS[side];
  const cx = size / 2;
  const cy = size / 2;

  // 基座
  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - size * 0.15, cy + size * 0.15, size * 0.3, size * 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - size * 0.15, cy + size * 0.15, size * 0.3, size * 0.2);

  // 支撑柱
  ctx.fillStyle = color;
  ctx.fillRect(cx - size * 0.05, cy - size * 0.05, size * 0.1, size * 0.2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.05, cy - size * 0.05, size * 0.1, size * 0.2);

  // 雷达天线（旋转扇面）
  ctx.save();
  ctx.translate(cx, cy - size * 0.05);

  // 雷达罩
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
  ctx.fill();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 扫描波束
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, size * 0.25, -Math.PI / 4, Math.PI / 4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();

  // 天线阵列
  ctx.fillStyle = '#00ff88';
  ctx.fillRect(cx - size * 0.15, cy - size * 0.1, size * 0.3, size * 0.08);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - size * 0.15, cy - size * 0.1, size * 0.3, size * 0.08);
}

// ============================================================================
// 模型配置映射
// ============================================================================

const MODEL_3D_CONFIGS: Record<PlatformType, ModelConfig> = {
  // 空中力量
  'air-fighter':     { draw: drawFighter3D,       baseSize: 32 },
  'air-multirole':   { draw: drawFighter3D,       baseSize: 34 },
  'air-bomber':      { draw: drawBomber3D,        baseSize: 40 },
  'air-jammer':      { draw: drawFighter3D,       baseSize: 32 },
  'air-aew':         { draw: drawBomber3D,        baseSize: 36 },
  'air-recon':       { draw: drawFighter3D,       baseSize: 28 },
  'helo-attack':     { draw: drawHelo3D,          baseSize: 30 },
  'helo-transport':  { draw: drawHelo3D,          baseSize: 32 },
  'uav-strike':      { draw: drawFighter3D,       baseSize: 24 },
  'uav-recon':       { draw: drawFighter3D,       baseSize: 22 },
  'uav-swarm':       { draw: drawFighter3D,       baseSize: 20 },
  'space-satellite': { draw: drawFighter3D,       baseSize: 26 },

  // 海上力量
  'ship-carrier':    { draw: drawCarrier3D,       baseSize: 44 },
  'ship-destroyer':  { draw: drawDestroyer3D,     baseSize: 36 },
  'ship-frigate':    { draw: drawDestroyer3D,     baseSize: 32 },
  'ship-submarine':  { draw: drawSubmarine3D,     baseSize: 34 },
  'ship-amphibious': { draw: drawCarrier3D,       baseSize: 38 },
  'ship-usv':        { draw: drawDestroyer3D,     baseSize: 24 },

  // 地面力量
  'ground-tank':     { draw: drawTank3D,          baseSize: 30 },
  'ground-ifv':      { draw: drawTank3D,          baseSize: 28 },
  'ground-spg':      { draw: drawTank3D,          baseSize: 30 },
  'ground-mlrs':     { draw: drawTank3D,          baseSize: 32 },
  'ground-sam':      { draw: drawRadarStation3D,  baseSize: 32 },
  'ground-radar':    { draw: drawRadarStation3D,  baseSize: 34 },
  'ground-ew':       { draw: drawRadarStation3D,  baseSize: 30 },
  'ground-hq':       { draw: drawTank3D,          baseSize: 30 },

  // 设施
  'facility-airbase':  { draw: drawCarrier3D,     baseSize: 40 },
  'facility-port':     { draw: drawCarrier3D,     baseSize: 36 },
  'facility-command':  { draw: drawRadarStation3D, baseSize: 34 },
  'facility-radar':    { draw: drawRadarStation3D, baseSize: 36 },
  'facility-target':   { draw: drawTank3D,        baseSize: 32 },
};

// 图标缓存
const model3DCache = new Map<string, HTMLCanvasElement>();

/**
 * 获取实体 3D 模型的 Canvas（带缓存）
 */
export function getEntity3DModelCanvas(
  type: PlatformType,
  side: ForceSide,
  status: EntityStatus = 'deployed',
): HTMLCanvasElement {
  const cacheKey = `${type}-${side}-${status}`;
  if (model3DCache.has(cacheKey)) {
    return model3DCache.get(cacheKey)!;
  }

  const config = MODEL_3D_CONFIGS[type];
  if (!config) {
    // 回退到简单圆形
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(10, 10, 8, 0, Math.PI * 2);
    ctx.fillStyle = side === 'red' ? '#ff4444' : '#4488ff';
    ctx.fill();
    model3DCache.set(cacheKey, canvas);
    return canvas;
  }

  const multiplier = STATUS_MULTIPLIER[status] ?? 1.0;
  const canvasSize = Math.round(config.baseSize * multiplier);

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  const colors = SIDE_COLORS[side];
  const fillColor = status === 'destroyed' ? '#666666' : colors.fill;

  if (status === 'destroyed') {
    ctx.globalAlpha = 0.4;
  }

  config.draw(ctx, canvasSize, fillColor, side);

  model3DCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * 清除 3D 模型缓存
 */
export function clear3DModelCache() {
  model3DCache.clear();
}
