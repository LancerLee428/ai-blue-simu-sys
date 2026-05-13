// apps/web/src/services/entity-shape-icons.ts
import type { PlatformType, ForceSide, EntityStatus } from '../types/tactical-scenario';

/**
 * 形状配置
 */
interface ShapeConfig {
  draw: (ctx: CanvasRenderingContext2D, size: number, color: string) => void;
  baseSize: number;
}

/**
 * 状态尺寸倍数
 */
const STATUS_MULTIPLIER: Record<EntityStatus, number> = {
  planned: 0.8,
  deployed: 1.0,
  engaged: 1.3,
  destroyed: 0.6,
};

/**
 * 颜色配置
 */
const SIDE_COLORS: Record<ForceSide, { fill: string; stroke: string; destroyed: string }> = {
  red:  { fill: '#ff4444', stroke: '#ff8888', destroyed: '#666666' },
  blue: { fill: '#4488ff', stroke: '#88bbff', destroyed: '#666666' },
};

// ---------------------------------------------------------------------------
// Draw helpers — 空中力量
// ---------------------------------------------------------------------------

/** 尖头三角形（战斗机/多用途） */
function drawTriangle(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  ctx.beginPath();
  ctx.moveTo(h, 2);
  ctx.lineTo(size - 2, size - 2);
  ctx.lineTo(2, size - 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 宽翼三角形（轰炸机） */
function drawBomberTriangle(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  ctx.beginPath();
  ctx.moveTo(h, 1);
  ctx.lineTo(size - 1, size - 1);
  ctx.lineTo(1, size - 1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 机身中线
  ctx.beginPath();
  ctx.moveTo(h, size * 0.3);
  ctx.lineTo(h, size - 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 带天线的三角形（电子战/预警） */
function drawEwTriangle(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const pad = size * 0.12;
  ctx.beginPath();
  ctx.moveTo(h, pad);
  ctx.lineTo(size - pad, size - pad);
  ctx.lineTo(pad, size - pad);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 天线横线
  ctx.beginPath();
  ctx.moveTo(size * 0.2, size * 0.55);
  ctx.lineTo(size * 0.8, size * 0.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 小型三角形（侦察机） */
function drawSmallTriangle(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const pad = size * 0.18;
  ctx.beginPath();
  ctx.moveTo(h, pad);
  ctx.lineTo(size - pad, size - pad);
  ctx.lineTo(pad, size - pad);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 圆形（直升机系列） */
function drawCircle(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  ctx.beginPath();
  ctx.arc(h, h, h - 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 圆+螺旋桨（武装直升机） */
function drawAttackHelo(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const r = h - 3;
  ctx.beginPath();
  ctx.arc(h, h, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 旋翼横线
  ctx.beginPath();
  ctx.moveTo(h - r + 1, h);
  ctx.lineTo(h + r - 1, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 机枪点
  ctx.beginPath();
  ctx.arc(h, h + r - 3, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** 小圆+十字（无人机） */
function drawDrone(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const r = h - 3;
  ctx.beginPath();
  ctx.arc(h, h, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h, h - r + 2);
  ctx.lineTo(h, h + r - 2);
  ctx.moveTo(h - r + 2, h);
  ctx.lineTo(h + r - 2, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 多点圆（蜂群无人机） */
function drawSwarm(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const r = 3;
  const positions = [
    [h, h], [h - 6, h - 5], [h + 6, h - 5],
    [h - 5, h + 5], [h + 5, h + 5],
  ];
  for (const [x, y] of positions) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Draw helpers — 海上力量
// ---------------------------------------------------------------------------

/** 大菱形（航母） */
function drawCarrier(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  ctx.beginPath();
  ctx.moveTo(h, 1);
  ctx.lineTo(size - 1, h);
  ctx.lineTo(h, size - 1);
  ctx.lineTo(1, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 飞行甲板横线
  ctx.beginPath();
  ctx.moveTo(h * 0.5, h);
  ctx.lineTo(h * 1.5, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 标准菱形（驱逐舰/护卫舰） */
function drawDiamond(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  ctx.beginPath();
  ctx.moveTo(h, 2);
  ctx.lineTo(size - 2, h);
  ctx.lineTo(h, size - 2);
  ctx.lineTo(2, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 向下菱形（潜艇） */
function drawSubmarine(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  // 椭圆体
  ctx.beginPath();
  ctx.ellipse(h, h * 1.1, h - 3, h * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 指挥塔
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.fillRect(h - 3, 2, 6, 5);
  ctx.strokeRect(h - 3, 2, 6, 5);
}

/** 宽平底菱形（两栖舰） */
function drawAmphibious(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  ctx.beginPath();
  ctx.moveTo(h, 2);
  ctx.lineTo(size - 2, h * 0.8);
  ctx.lineTo(size - 4, size - 2);
  ctx.lineTo(4, size - 2);
  ctx.lineTo(2, h * 0.8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 小菱形+点（无人艇） */
function drawUsv(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const pad = size * 0.25;
  ctx.beginPath();
  ctx.moveTo(h, pad);
  ctx.lineTo(size - pad, h);
  ctx.lineTo(h, size - pad);
  ctx.lineTo(pad, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Draw helpers — 地面力量
// ---------------------------------------------------------------------------

/** 填充矩形（坦克基础形） */
function drawRect(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 3;
  ctx.fillStyle = color;
  ctx.fillRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
}

/** 矩形+炮管（坦克） */
function drawTank(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 4;
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  // 炮管
  ctx.beginPath();
  ctx.moveTo(h, pad + 2);
  ctx.lineTo(h, 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 矩形+侧开口（步兵战车） */
function drawIfv(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 3;
  ctx.fillStyle = color;
  ctx.fillRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  // 舱门线
  ctx.beginPath();
  ctx.moveTo(pad, size * 0.6);
  ctx.lineTo(size - pad, size * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 矩形+弧（自行火炮） */
function drawSpg(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 3;
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(pad, h, size - pad * 2, size - h - pad);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, h, size - pad * 2, size - h - pad);
  // 炮身
  ctx.beginPath();
  ctx.moveTo(h, h);
  ctx.lineTo(h, 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

/** 矩形+多根短线（火箭炮） */
function drawMlrs(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 4;
  ctx.fillStyle = color;
  ctx.fillRect(pad, size * 0.45, size - pad * 2, size * 0.45);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(pad, size * 0.45, size - pad * 2, size * 0.45);
  // 多管
  const tubeCount = 3;
  const tubeWidth = (size - pad * 2) / tubeCount;
  for (let i = 0; i < tubeCount; i++) {
    ctx.beginPath();
    ctx.moveTo(pad + tubeWidth * i + tubeWidth / 2, size * 0.45);
    ctx.lineTo(pad + tubeWidth * i + tubeWidth / 2, 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** 矩形+上方弧（SAM防空） */
function drawSam(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 4;
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(pad, h, size - pad * 2, h - pad);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, h, size - pad * 2, h - pad);
  // 导弹发射架弧
  ctx.beginPath();
  ctx.arc(h, h, h * 0.6, Math.PI, 0);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 矩形+扇面（雷达） */
function drawRadar(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 4;
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(pad, h + 2, size - pad * 2, h - pad - 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, h + 2, size - pad * 2, h - pad - 2);
  // 雷达扇面
  ctx.beginPath();
  ctx.moveTo(h, h + 2);
  ctx.arc(h, h + 2, h * 0.8, -Math.PI * 0.75, -Math.PI * 0.25);
  ctx.closePath();
  ctx.fillStyle = `${color}99`;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** 矩形+闪电（电子战车） */
function drawEw(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 3;
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad + 2, size - pad * 2, size - pad * 2 - 4);
  // 闪电符号
  ctx.beginPath();
  ctx.moveTo(h + 2, pad + 4);
  ctx.lineTo(h - 2, h);
  ctx.lineTo(h + 2, h);
  ctx.lineTo(h - 2, size - 5);
  ctx.strokeStyle = '#ffff66';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 矩形+旗（指挥所） */
function drawHq(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 3;
  const h = size / 2;
  ctx.fillStyle = color;
  ctx.fillRect(pad, pad + 4, size - pad * 2, size - pad * 2 - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad + 4, size - pad * 2, size - pad * 2 - 4);
  // 旗杆+旗帜
  ctx.beginPath();
  ctx.moveTo(h, pad + 4);
  ctx.lineTo(h, 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(h, 1);
  ctx.lineTo(h + 5, 3);
  ctx.lineTo(h, 5);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Draw helpers — 设施
// ---------------------------------------------------------------------------

/** 带跑道的矩形（机场） */
function drawAirbase(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const pad = 2;
  const h = size / 2;
  ctx.fillStyle = `${color}99`;
  ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pad, pad, size - pad * 2, size - pad * 2);
  // 跑道线
  ctx.beginPath();
  ctx.moveTo(pad + 3, h);
  ctx.lineTo(size - pad - 3, h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 跑道中虚线
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(pad + 6, h);
  ctx.lineTo(size - pad - 6, h);
  ctx.strokeStyle = `${color}`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** 锚形（港口） */
function drawPort(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  // 外框
  ctx.fillStyle = `${color}99`;
  ctx.fillRect(2, 2, size - 4, size - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  // 锚竖杆
  ctx.beginPath();
  ctx.moveTo(h, 4);
  ctx.lineTo(h, size - 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 横杆
  ctx.beginPath();
  ctx.moveTo(h - 5, 7);
  ctx.lineTo(h + 5, 7);
  ctx.stroke();
  // 底环
  ctx.beginPath();
  ctx.arc(h, size - 8, 4, 0, Math.PI);
  ctx.stroke();
}

/** 星形（指挥中心/高价值目标） */
function drawCommand(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  const outerR = h - 2;
  const innerR = outerR * 0.4;
  const points = 5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    if (i === 0) ctx.moveTo(h + r * Math.cos(angle), h + r * Math.sin(angle));
    else ctx.lineTo(h + r * Math.cos(angle), h + r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** 带叉（打击目标） */
function drawTarget(ctx: CanvasRenderingContext2D, size: number, color: string) {
  const h = size / 2;
  // 外圆
  ctx.beginPath();
  ctx.arc(h, h, h - 2, 0, Math.PI * 2);
  ctx.fillStyle = `${color}55`;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 内圆
  ctx.beginPath();
  ctx.arc(h, h, h * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // 十字准星
  ctx.beginPath();
  ctx.moveTo(h, 2);
  ctx.lineTo(h, size - 2);
  ctx.moveTo(2, h);
  ctx.lineTo(size - 2, h);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// 平台类型 → 形状配置映射
// ---------------------------------------------------------------------------

const SHAPE_CONFIGS: Record<PlatformType, ShapeConfig> = {
  // 空中力量
  'air-fighter':     { draw: drawTriangle,       baseSize: 28 },
  'air-multirole':   { draw: drawTriangle,       baseSize: 30 },
  'air-bomber':      { draw: drawBomberTriangle, baseSize: 36 },
  'air-jammer':      { draw: drawEwTriangle,     baseSize: 28 },
  'air-aew':         { draw: drawEwTriangle,     baseSize: 32 },
  'air-recon':       { draw: drawSmallTriangle,  baseSize: 22 },
  'helo-attack':     { draw: drawAttackHelo,     baseSize: 26 },
  'helo-transport':  { draw: drawCircle,         baseSize: 24 },
  'uav-strike':      { draw: drawDrone,          baseSize: 20 },
  'uav-recon':       { draw: drawDrone,          baseSize: 18 },
  'uav-swarm':       { draw: drawSwarm,          baseSize: 28 },
  'space-satellite': { draw: drawDrone,          baseSize: 24 },

  // 海上力量
  'ship-carrier':    { draw: drawCarrier,        baseSize: 40 },
  'ship-destroyer':  { draw: drawDiamond,        baseSize: 32 },
  'ship-frigate':    { draw: drawDiamond,        baseSize: 28 },
  'ship-submarine':  { draw: drawSubmarine,      baseSize: 30 },
  'ship-amphibious': { draw: drawAmphibious,     baseSize: 34 },
  'ship-usv':        { draw: drawUsv,            baseSize: 22 },

  // 地面力量
  'ground-tank':     { draw: drawTank,           baseSize: 26 },
  'ground-ifv':      { draw: drawIfv,            baseSize: 24 },
  'ground-spg':      { draw: drawSpg,            baseSize: 26 },
  'ground-mlrs':     { draw: drawMlrs,           baseSize: 28 },
  'ground-sam':      { draw: drawSam,            baseSize: 28 },
  'ground-radar':    { draw: drawRadar,          baseSize: 28 },
  'ground-ew':       { draw: drawEw,             baseSize: 24 },
  'ground-hq':       { draw: drawHq,             baseSize: 26 },

  // 设施
  'facility-airbase':  { draw: drawAirbase,      baseSize: 36 },
  'facility-port':     { draw: drawPort,         baseSize: 32 },
  'facility-command':  { draw: drawCommand,      baseSize: 30 },
  'facility-radar':    { draw: drawRadar,        baseSize: 30 },
  'facility-target':   { draw: drawTarget,       baseSize: 28 },
};

// 图标缓存
const iconCache = new Map<string, HTMLCanvasElement>();

/**
 * 获取实体图标的 Canvas（带缓存）
 */
export function getEntityShapeCanvas(
  type: PlatformType,
  side: ForceSide,
  status: EntityStatus = 'deployed',
): HTMLCanvasElement {
  const cacheKey = `${type}-${side}-${status}`;
  if (iconCache.has(cacheKey)) {
    return iconCache.get(cacheKey)!;
  }

  const config = SHAPE_CONFIGS[type] ?? { draw: drawCircle, baseSize: 20 };
  const multiplier = STATUS_MULTIPLIER[status] ?? 1.0;
  const canvasSize = Math.round(config.baseSize * multiplier);

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d')!;

  const colors = SIDE_COLORS[side];
  const fillColor = status === 'destroyed' ? colors.destroyed : colors.fill;

  if (status === 'destroyed') {
    ctx.globalAlpha = 0.4;
  }

  config.draw(ctx, canvasSize, fillColor);

  iconCache.set(cacheKey, canvas);
  return canvas;
}

/**
 * 清除图标缓存
 */
export function clearShapeIconCache() {
  iconCache.clear();
}
