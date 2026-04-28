// apps/web/src/services/orbit-calculator.ts
// 开普勒轨道计算工具
// 将开普勒根数转换为地心惯性系（ECI）坐标，再转为地理坐标（经纬高）

import type { KeplerianOrbit } from '../types/tactical-scenario';

const DEG = Math.PI / 180;
const EARTH_MU = 398600.4418; // km³/s²
const EARTH_RADIUS = 6371.0;  // km

/**
 * 将开普勒根数转换为某时刻的地理坐标（经纬高）
 * @param orbit 开普勒轨道根数
 * @param offsetSeconds 相对于 epoch 的时间偏移（秒），默认 0
 */
export function keplerianToGeodetic(
  orbit: KeplerianOrbit,
  offsetSeconds = 0,
): { longitude: number; latitude: number; altitude: number } {
  const { semiMajorAxis, eccentricity, inclination, raan, argOfPerigee, trueAnomaly, epoch } = orbit;

  // 1. 计算平均运动 n (rad/s)
  const n = Math.sqrt(EARTH_MU / Math.pow(semiMajorAxis, 3));

  // 2. 将真近点角转为偏近点角 E，再转为平近点角 M
  const nu0 = trueAnomaly * DEG;
  const E0 = 2 * Math.atan2(
    Math.sqrt(1 - eccentricity) * Math.sin(nu0 / 2),
    Math.sqrt(1 + eccentricity) * Math.cos(nu0 / 2),
  );
  const M0 = E0 - eccentricity * Math.sin(E0);

  // 3. 传播平近点角
  const M = M0 + n * offsetSeconds;

  // 4. 迭代求解偏近点角 E（开普勒方程）
  let E = M;
  for (let i = 0; i < 50; i++) {
    const dE = (M - E + eccentricity * Math.sin(E)) / (1 - eccentricity * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-12) break;
  }

  // 5. 真近点角
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
    Math.sqrt(1 - eccentricity) * Math.cos(E / 2),
  );

  // 6. 轨道平面内位置（km）
  const r = semiMajorAxis * (1 - eccentricity * Math.cos(E));
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // 7. 旋转到 ECI（地心惯性系）
  const i = inclination * DEG;
  const Om = raan * DEG;
  const w = argOfPerigee * DEG;

  const cosOm = Math.cos(Om), sinOm = Math.sin(Om);
  const cosI = Math.cos(i),   sinI = Math.sin(i);
  const cosW = Math.cos(w),   sinW = Math.sin(w);

  const xECI = (cosOm * cosW - sinOm * sinW * cosI) * xOrb
             + (-cosOm * sinW - sinOm * cosW * cosI) * yOrb;
  const yECI = (sinOm * cosW + cosOm * sinW * cosI) * xOrb
             + (-sinOm * sinW + cosOm * cosW * cosI) * yOrb;
  const zECI = (sinW * sinI) * xOrb + (cosW * sinI) * yOrb;

  // 8. ECI → ECEF（考虑地球自转）
  // 地球自转角速度 (rad/s)
  const OMEGA_EARTH = 7.2921150e-5;

  // epoch 时刻的格林尼治恒星时（GMST）
  const epochMs = new Date(epoch).getTime();
  const nowMs = epochMs + offsetSeconds * 1000;
  const gmst0 = getGMST(epochMs);
  const gmst = gmst0 + OMEGA_EARTH * offsetSeconds;

  const cosG = Math.cos(gmst), sinG = Math.sin(gmst);
  const xECEF = cosG * xECI + sinG * yECI;
  const yECEF = -sinG * xECI + cosG * yECI;
  const zECEF = zECI;

  // 9. ECEF → 经纬高
  const lon = Math.atan2(yECEF, xECEF) / DEG;
  const p = Math.sqrt(xECEF * xECEF + yECEF * yECEF);
  const lat = Math.atan2(zECEF, p) / DEG; // 近似球形
  const alt = (Math.sqrt(xECEF * xECEF + yECEF * yECEF + zECEF * zECEF) - EARTH_RADIUS) * 1000; // 转为米

  return { longitude: lon, latitude: lat, altitude: alt };
}

/**
 * 生成轨道上均匀分布的 N 个点（经纬高），用于渲染轨道线
 * @param orbit 开普勒轨道根数
 * @param points 采样点数，默认 180
 */
export function generateOrbitTrack(
  orbit: KeplerianOrbit,
  points = 180,
): { longitude: number; latitude: number; altitude: number }[] {
  // 轨道周期 (秒)
  const period = 2 * Math.PI * Math.sqrt(Math.pow(orbit.semiMajorAxis, 3) / EARTH_MU);
  const result = [];
  for (let i = 0; i < points; i++) {
    const t = (i / points) * period;
    result.push(keplerianToGeodetic(orbit, t));
  }
  return result;
}

/**
 * 计算 epoch 时刻的格林尼治平恒星时（GMST，rad）
 * 使用简化公式，精度约 0.1°
 */
function getGMST(epochMs: number): number {
  // J2000.0 = 2000-01-01T12:00:00Z = 946728000000 ms
  const J2000_MS = 946728000000;
  const T = (epochMs - J2000_MS) / (86400000 * 36525); // 儒略世纪
  // IAU 1982 GMST 公式（rad）
  const gmst = (67310.54841 + (876600 * 3600 + 8640184.812866) * T
    + 0.093104 * T * T - 6.2e-6 * T * T * T) % 86400;
  return (gmst / 86400) * 2 * Math.PI;
}
