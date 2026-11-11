/**
 * In-memory circular buffer maintaining the last 20 valid telemetry readings per device.
 * Computes Exponential Moving Average (EMA) or linear interpolation in microseconds.
 */
export class TimeSeriesWindowService {
  private static readonly MAX_WINDOW = 20;
  private windows: Map<string, number[]> = new Map();

  private getKey(deviceId: string, metric: string): string {
    return `${deviceId}::${metric}`;
  }

  public recordReading(deviceId: string, metric: string, value: number): void {
    if (isNaN(value) || value === null || value === undefined) return;
    const key = this.getKey(deviceId, metric);
    let buffer = this.windows.get(key);
    if (!buffer) {
      buffer = [];
      this.windows.set(key, buffer);
    }
    buffer.push(value);
    if (buffer.length > TimeSeriesWindowService.MAX_WINDOW) {
      buffer.shift();
    }
  }

  public getHistory(deviceId: string, metric: string): number[] {
    const key = this.getKey(deviceId, metric);
    return this.windows.get(key) || [];
  }

  /**
   * Imputes missing or outlier reading using Exponential Moving Average (EMA).
   * alpha = 2 / (N + 1) = 2 / 21 = 0.0952
   */
  public imputeEma(deviceId: string, metric: string, fallbackDefault = 36.5): number {
    const key = this.getKey(deviceId, metric);
    const buffer = this.windows.get(key);

    if (!buffer || buffer.length === 0) {
      return fallbackDefault;
    }

    if (buffer.length === 1) {
      return buffer[0];
    }

    const alpha = 2 / (buffer.length + 1);
    let ema = buffer[0];

    for (let i = 1; i < buffer.length; i++) {
      ema = alpha * buffer[i] + (1 - alpha) * ema;
    }

    return Math.round(ema * 100) / 100;
  }
}
