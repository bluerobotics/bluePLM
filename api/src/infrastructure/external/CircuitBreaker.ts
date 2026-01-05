/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures when calling external services by
 * stopping calls when failure threshold is exceeded.
 *
 * States:
 * - closed: Normal operation, calls pass through
 * - open: Failures exceeded threshold, calls fail immediately
 * - half-open: Testing if service recovered (after resetTimeout)
 */

type State = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  threshold?: number;
  /** Time to wait before testing if service recovered (default: 30000ms) */
  resetTimeout?: number;
  /** Name for logging/debugging */
  name?: string;
}

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private lastFailure: number | null = null;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly name: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.name = options.name ?? 'CircuitBreaker';
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - (this.lastFailure ?? 0);
      if (timeSinceFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitBreakerError(
          `${this.name}: Circuit breaker is open`,
          this.state,
          this.failures
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): { state: State; failures: number; lastFailure: number | null } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailure,
    };
  }

  /**
   * Reset the circuit breaker manually
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailure = null;
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: State,
    public readonly failures: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}
