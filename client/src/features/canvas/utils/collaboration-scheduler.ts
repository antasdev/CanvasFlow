/**
 * Collaboration Rate Scheduler for high-frequency ephemeral collaboration events.
 * Provides deterministic rate bounding, latest-value coalescing, and immediate
 * flush/cancellation guarantees for real-time presence and preview streaming.
 */

export type SchedulerOptions<T> = {
  /**
   * Minimum interval between network emissions in milliseconds.
   */
  intervalMs: number;

  /**
   * Consumer callback to transmit the latest coalesced payload.
   */
  onEmit: (data: T) => void;

  /**
   * Whether the first call in an idle cycle emits immediately.
   * Defaults to true.
   */
  leading?: boolean;
};

export class ScheduledChannel<T> {
  private pendingData: T | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastEmitTime = 0;
  private readonly intervalMs: number;
  private readonly onEmit: (data: T) => void;
  private readonly leading: boolean;

  constructor(options: SchedulerOptions<T>) {
    this.intervalMs = Math.max(1, options.intervalMs);
    this.onEmit = options.onEmit;
    this.leading = options.leading ?? true;
  }

  /**
   * Schedules an ephemeral data payload. Intermediate values overwrite
   * previous un-emitted values (latest-value semantics).
   */
  public schedule(data: T): void {
    this.pendingData = data;
    const now = Date.now();
    const elapsed = now - this.lastEmitTime;

    if (this.leading && elapsed >= this.intervalMs && this.timerId === null) {
      this.lastEmitTime = now;
      this.pendingData = null;
      this.onEmit(data);
      return;
    }

    if (this.timerId === null) {
      const delay = Math.max(0, this.intervalMs - elapsed);
      this.timerId = setTimeout(() => {
        this.timerId = null;
        this.lastEmitTime = Date.now();
        if (this.pendingData !== null) {
          const toEmit = this.pendingData;
          this.pendingData = null;
          this.onEmit(toEmit);
        }
      }, delay);
    }
  }

  /**
   * Immediately transmits any pending coalesced payload and clears pending timers.
   */
  public flush(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.pendingData !== null) {
      const toEmit = this.pendingData;
      this.pendingData = null;
      this.lastEmitTime = Date.now();
      this.onEmit(toEmit);
    }
  }

  /**
   * Cancels any pending scheduled timer and discards pending ephemeral data.
   */
  public cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.pendingData = null;
  }

  /**
   * Returns true if there is a pending scheduled payload or an active throttle timer.
   */
  public isPending(): boolean {
    return this.pendingData !== null || this.timerId !== null;
  }
}
