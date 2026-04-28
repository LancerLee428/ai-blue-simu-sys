// apps/web/src/services/weather-system.ts
import type { GeoPosition } from '../types/tactical-scenario';

/**
 * 天气系统
 * 影响飞行高度、速度、探测范围
 */
export class WeatherSystem {
  private weatherZones: Map<string, WeatherZone> = new Map();

  constructor() {
    this.initializeWeatherZones();
  }

  /**
   * 初始化天气区域（简化版本）
   */
  private initializeWeatherZones(): void {
    // 东海区域 - 晴朗
    this.weatherZones.set('east-sea', {
      id: 'east-sea',
      bounds: { minLon: 124, maxLon: 128, minLat: 26, maxLat: 30 },
      condition: 'clear',
      visibility: 10000, // 10km
      windSpeed: 5, // 5 m/s
      precipitation: 0,
    });

    // 台湾海峡 - 多云
    this.weatherZones.set('taiwan-strait', {
      id: 'taiwan-strait',
      bounds: { minLon: 119, maxLon: 122, minLat: 23, maxLat: 26 },
      condition: 'cloudy',
      visibility: 5000, // 5km
      windSpeed: 10, // 10 m/s
      precipitation: 0,
    });

    // 冲绳南部 - 暴风雨
    this.weatherZones.set('okinawa-south', {
      id: 'okinawa-south',
      bounds: { minLon: 126, maxLon: 128, minLat: 24, maxLat: 26 },
      condition: 'storm',
      visibility: 1000, // 1km
      windSpeed: 25, // 25 m/s
      precipitation: 50, // 50mm/h
    });
  }

  /**
   * 获取指定位置的天气
   */
  getWeather(position: GeoPosition): WeatherZone | null {
    for (const zone of this.weatherZones.values()) {
      if (this.isInZone(position, zone.bounds)) {
        return zone;
      }
    }
    return null;
  }

  /**
   * 检查飞行是否安全
   */
  checkFlightSafety(position: GeoPosition, platformType: string): FlightSafetyResult {
    const weather = this.getWeather(position);
    if (!weather) {
      return { safe: true, warnings: [] };
    }

    const warnings: string[] = [];
    let safe = true;

    // 暴风雨区域
    if (weather.condition === 'storm') {
      // 飞机必须爬升到安全高度或绕行
      if (platformType.startsWith('air-') && position.altitude < 15000) {
        warnings.push(`暴风雨区域，建议爬升至 15000m 以上或绕行`);
        safe = false;
      }

      // 直升机和无人机禁止进入
      if (platformType.startsWith('helo-') || platformType.startsWith('uav-')) {
        warnings.push(`暴风雨区域，直升机/无人机禁止进入`);
        safe = false;
      }
    }

    // 强风区域
    if (weather.windSpeed > 15) {
      if (platformType.startsWith('helo-')) {
        warnings.push(`风速 ${weather.windSpeed}m/s，直升机操控困难`);
        safe = false;
      }
      if (platformType.startsWith('uav-')) {
        warnings.push(`风速 ${weather.windSpeed}m/s，无人机可能失控`);
        safe = false;
      }
    }

    // 低可见度
    if (weather.visibility < 2000) {
      warnings.push(`能见度 ${weather.visibility}m，光学导航受限`);
    }

    return { safe, warnings, weather };
  }

  /**
   * 计算天气对速度的影响
   */
  getSpeedModifier(position: GeoPosition, platformType: string): number {
    const weather = this.getWeather(position);
    if (!weather) return 1.0;

    let modifier = 1.0;

    // 暴风雨减速
    if (weather.condition === 'storm') {
      if (platformType.startsWith('air-')) {
        modifier *= 0.7; // 飞机减速 30%
      }
      if (platformType.startsWith('ship-')) {
        modifier *= 0.5; // 舰艇减速 50%
      }
    }

    // 强风影响
    if (weather.windSpeed > 15) {
      modifier *= Math.max(0.6, 1 - weather.windSpeed / 100);
    }

    return modifier;
  }

  /**
   * 计算天气对探测范围的影响
   */
  getDetectionModifier(position: GeoPosition, sensorType: string): number {
    const weather = this.getWeather(position);
    if (!weather) return 1.0;

    let modifier = 1.0;

    // 光学传感器受天气影响最大
    if (sensorType === 'optical') {
      if (weather.condition === 'storm') {
        modifier *= 0.2; // 暴风雨时光学探测范围缩减到 20%
      } else if (weather.condition === 'cloudy') {
        modifier *= 0.6; // 多云时缩减到 60%
      }

      // 低可见度影响
      modifier *= Math.min(1.0, weather.visibility / 10000);
    }

    // 雷达受降雨影响
    if (sensorType === 'radar' && weather.precipitation > 20) {
      modifier *= 0.8; // 强降雨时雷达探测范围缩减到 80%
    }

    return modifier;
  }

  /**
   * 获取天气可视化数据
   */
  getWeatherVisualization(): WeatherVisualization[] {
    const visualizations: WeatherVisualization[] = [];

    for (const zone of this.weatherZones.values()) {
      let color: string;
      let opacity: number;

      switch (zone.condition) {
        case 'storm':
          color = 'rgba(100, 100, 100, 0.6)'; // 深灰色
          opacity = 0.6;
          break;
        case 'cloudy':
          color = 'rgba(200, 200, 200, 0.3)'; // 浅灰色
          opacity = 0.3;
          break;
        default:
          continue; // 晴朗天气不显示
      }

      visualizations.push({
        bounds: zone.bounds,
        color,
        opacity,
        label: this.getWeatherLabel(zone),
      });
    }

    return visualizations;
  }

  private getWeatherLabel(zone: WeatherZone): string {
    switch (zone.condition) {
      case 'storm':
        return `⛈️ 暴风雨 (风速 ${zone.windSpeed}m/s)`;
      case 'cloudy':
        return `☁️ 多云 (能见度 ${zone.visibility}m)`;
      case 'clear':
        return `☀️ 晴朗`;
      default:
        return '';
    }
  }

  private isInZone(position: GeoPosition, bounds: Bounds): boolean {
    return (
      position.longitude >= bounds.minLon &&
      position.longitude <= bounds.maxLon &&
      position.latitude >= bounds.minLat &&
      position.latitude <= bounds.maxLat
    );
  }
}

interface WeatherZone {
  id: string;
  bounds: Bounds;
  condition: 'clear' | 'cloudy' | 'storm';
  visibility: number; // 能见度(米)
  windSpeed: number; // 风速(m/s)
  precipitation: number; // 降水量(mm/h)
}

interface Bounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface FlightSafetyResult {
  safe: boolean;
  warnings: string[];
  weather?: WeatherZone;
}

interface WeatherVisualization {
  bounds: Bounds;
  color: string;
  opacity: number;
  label: string;
}
