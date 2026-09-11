import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScheduledChannel } from "./collaboration-scheduler";

describe("Slice 54: ScheduledChannel & CollaborationScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("emits immediately on leading call when idle", () => {
    const onEmit = vi.fn();
    const channel = new ScheduledChannel<number>({
      intervalMs: 33,
      onEmit,
      leading: true,
    });

    channel.schedule(1);
    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith(1);
  });

  it("coalesces burst updates to latest value within interval window", () => {
    const onEmit = vi.fn();
    const channel = new ScheduledChannel<number>({
      intervalMs: 33,
      onEmit,
      leading: true,
    });

    // Initial leading call
    channel.schedule(1);
    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith(1);

    // Rapid burst within 33ms
    channel.schedule(2);
    channel.schedule(3);
    channel.schedule(4);
    channel.schedule(100);

    // Still only 1 call fired so far
    expect(onEmit).toHaveBeenCalledTimes(1);

    // Advance time by 33ms
    vi.advanceTimersByTime(33);

    // Should have fired exactly once more with latest value (100)
    expect(onEmit).toHaveBeenCalledTimes(2);
    expect(onEmit).toHaveBeenLastCalledWith(100);
  });

  it("flush immediately executes pending payload and clears timer", () => {
    const onEmit = vi.fn();
    const channel = new ScheduledChannel<string>({
      intervalMs: 50,
      onEmit,
      leading: true,
    });

    channel.schedule("first");
    channel.schedule("second");
    channel.schedule("third");

    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith("first");

    // Flush immediately
    channel.flush();

    expect(onEmit).toHaveBeenCalledTimes(2);
    expect(onEmit).toHaveBeenLastCalledWith("third");

    // Advance timers to verify no second duplicate execution occurs
    vi.advanceTimersByTime(100);
    expect(onEmit).toHaveBeenCalledTimes(2);
  });

  it("cancel discards pending payload and aborts timer", () => {
    const onEmit = vi.fn();
    const channel = new ScheduledChannel<number>({
      intervalMs: 50,
      onEmit,
      leading: true,
    });

    channel.schedule(10);
    channel.schedule(20);

    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(channel.isPending()).toBe(true);

    channel.cancel();
    expect(channel.isPending()).toBe(false);

    vi.advanceTimersByTime(100);
    // Value 20 should have been discarded
    expect(onEmit).toHaveBeenCalledTimes(1);
  });

  it("handles non-leading mode correctly", () => {
    const onEmit = vi.fn();
    const channel = new ScheduledChannel<number>({
      intervalMs: 40,
      onEmit,
      leading: false,
    });

    channel.schedule(1);
    expect(onEmit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(40);
    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(onEmit).toHaveBeenCalledWith(1);
  });

  it("isPending correctly tracks active throttle windows and pending payloads", () => {
    const onEmit = vi.fn();
    const channel = new ScheduledChannel<number>({
      intervalMs: 33,
      onEmit,
    });

    expect(channel.isPending()).toBe(false);
    channel.schedule(1);
    channel.schedule(2);
    expect(channel.isPending()).toBe(true);

    vi.advanceTimersByTime(33);
    expect(channel.isPending()).toBe(false);
  });
});
