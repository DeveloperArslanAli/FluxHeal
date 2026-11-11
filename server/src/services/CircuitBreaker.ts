import { CircuitBreakerState, CircuitBreakerStats } from '../types/index.js';

export interface CircuitBreakerOptions {
  timeoutMs?: number;
  maxFailures?: number;
  resetTimeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures = 0;
  private consecutiveSuccesses = 0;
  private totalCalls = 0;
  private totalTimeouts = 0;
  private totalTrips = 0;
  private lastFailure: string | null = null;
  private lastFailureTimestamp = 0;
  private lastStateChange: string = new Date().toISOString();

  private readonly timeoutMs: number;
  private readonly maxFailures: number;
  private readonly resetTimeoutMs: number;
  private stateChangeListeners: Array<(state: CircuitBreakerState, stats: CircuitBreakerStats) => void> = [];

  constructor(options: CircuitBreakerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.maxFailures = options.maxFailures ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 10000;
  }

  public onStateChange(listener: (state: CircuitBreakerState, stats: CircuitBreakerStats) => void): void {
    this.stateChangeListeners.push(listener);
  }

  private notifyListeners(): void {
    const stats = this.getStats();
    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.state, stats);
      } catch (err) {
        console.error('[CircuitBreaker] Listener error:', err);
      }
    }
  }

  public getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalCalls: this.totalCalls,
      totalTimeouts: this.totalTimeouts,
      totalTrips: this.totalTrips,
      timeoutMs: this.timeoutMs,
      lastFailure: this.lastFailure,
      lastStateChange: this.lastStateChange,
    };
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.consecutiveSuccesses = 0;
    this.lastStateChange = new Date().toISOString();
    this.notifyListeners();
  }

  public forceState(state: CircuitBreakerState): void {
    this.state = state;
    this.lastStateChange = new Date().toISOString();
    this.notifyListeners();
  }

  /**
   * Executes an action protected by 3000ms circuit breaker.
   * If action exceeds timeout or trips breaker, triggers fallback instantaneously.
   */
  public async execute<T>(
    action: () => Promise<T>,
    fallback: (err: Error) => Promise<T> | T
  ): Promise<{ result: T; fallbackInvoked: boolean; executionMs: number }> {
    const start = performance.now();
    this.totalCalls += 1;

    // Check if OPEN state should attempt recovery to HALF_OPEN
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTimestamp > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.lastStateChange = new Date().toISOString();
        this.notifyListeners();
      } else {
        // Fast-fail: Breaker is OPEN, directly bypass action to fallback
        const err = new Error(`CircuitBreaker is OPEN (tripped due to repeated timeouts/failures). Bypassing to Tier-1 heuristic.`);
        const fallbackRes = await fallback(err);
        return {
          result: fallbackRes,
          fallbackInvoked: true,
          executionMs: Math.round((performance.now() - start) * 100) / 100,
        };
      }
    }

    let timer: NodeJS.Timeout | null = null;
    try {
      const actionPromise = action();
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          this.totalTimeouts += 1;
          reject(new Error(`CircuitBreaker Timeout: Action exceeded ${this.timeoutMs}ms SLA threshold.`));
        }, this.timeoutMs);
      });

      const result = await Promise.race([actionPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      // Success recovery logic
      this.consecutiveSuccesses += 1;
      if (this.state === 'HALF_OPEN' && this.consecutiveSuccesses >= 2) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.lastStateChange = new Date().toISOString();
        this.notifyListeners();
      }

      return {
        result,
        fallbackInvoked: false,
        executionMs: Math.round((performance.now() - start) * 100) / 100,
      };
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      this.failures += 1;
      this.consecutiveSuccesses = 0;
      this.lastFailure = err.message;
      this.lastFailureTimestamp = Date.now();

      // Check if breaker trips
      if (this.failures >= this.maxFailures) {
        this.state = 'OPEN';
        this.totalTrips += 1;
        this.lastStateChange = new Date().toISOString();
        this.notifyListeners();
      }

      const fallbackRes = await fallback(err);
      return {
        result: fallbackRes,
        fallbackInvoked: true,
        executionMs: Math.round((performance.now() - start) * 100) / 100,
      };
    }
  }
}
