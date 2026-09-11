/**
 * Server-side per-socket, event-specific token bucket rate limiter.
 * Protects Socket.IO event loop and room broadcast channels from high-frequency
 * bursts, malicious flooding, and unthrottled clients.
 */

export type RateLimiterConfig = {
  /**
   * Maximum token capacity (maximum burst size).
   */
  capacity: number;

  /**
   * Token refill rate per second.
   */
  refillRatePerSec: number;
};

export type EventRateLimitCategory =
  | "cursor"
  | "selection"
  | "transform"
  | "heartbeat"
  | "interaction"
  | "mutation";

type TokenBucket = {
  tokens: number;
  lastRefill: number;
};

export class SocketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly configs: Record<EventRateLimitCategory, RateLimiterConfig>;

  constructor(customConfigs?: Partial<Record<EventRateLimitCategory, RateLimiterConfig>>) {
    this.configs = {
      cursor: { capacity: 80, refillRatePerSec: 60 },
      selection: { capacity: 40, refillRatePerSec: 30 },
      transform: { capacity: 80, refillRatePerSec: 60 },
      heartbeat: { capacity: 6, refillRatePerSec: 2 },
      interaction: { capacity: 80, refillRatePerSec: 60 },
      mutation: { capacity: 40, refillRatePerSec: 25 },
      ...customConfigs,
    };
  }

  /**
   * Consumes a token for a given socket and category if available.
   * Returns true if request is permitted, false if rate limit is exceeded.
   */
  public check(socketId: string, category: EventRateLimitCategory): boolean {
    const config = this.configs[category];
    const key = `${socketId}:${category}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: config.capacity - 1, lastRefill: now };
      this.buckets.set(key, bucket);
      return true;
    }

    // Refill tokens proportionally to elapsed time
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsedSec * config.refillRatePerSec;
    bucket.tokens = Math.min(config.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Removes all rate limiting state associated with a disconnected socket.
   */
  public cleanup(socketId: string): void {
    for (const key of this.buckets.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Resets all stored buckets (used in test tear-down).
   */
  public reset(): void {
    this.buckets.clear();
  }

  /**
   * Returns current active bucket count across all sockets.
   */
  public getActiveBucketCount(): number {
    return this.buckets.size;
  }
}

export const socketRateLimiter = new SocketRateLimiter();
