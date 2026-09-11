import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRafScheduler } from "./raf.utils";

describe("raf.utils - createRafScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules a callback via requestAnimationFrame and executes when frame fires", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<number>(cb);

    expect(scheduler.isPending()).toBe(false);
    scheduler.schedule(10);
    expect(scheduler.isPending()).toBe(true);
    expect(cb).not.toHaveBeenCalled();

    // Trigger animation frame
    vi.runAllTimers();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(10);
    expect(scheduler.isPending()).toBe(false);
  });

  it("coalesces multiple rapid schedule calls between frames to a single execution with latest data", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<number>(cb);

    scheduler.schedule(1);
    scheduler.schedule(2);
    scheduler.schedule(3);
    scheduler.schedule(4);

    expect(cb).not.toHaveBeenCalled();
    expect(scheduler.isPending()).toBe(true);

    vi.runAllTimers();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(4);
    expect(scheduler.isPending()).toBe(false);
  });

  it("cancels pending animation frame cleanly", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<string>(cb);

    scheduler.schedule("update-1");
    expect(scheduler.isPending()).toBe(true);

    scheduler.cancel();
    expect(scheduler.isPending()).toBe(false);

    vi.runAllTimers();
    expect(cb).not.toHaveBeenCalled();
  });

  it("flushes pending update synchronously and cancels scheduled animation frame", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<{ x: number; y: number }>(cb);

    scheduler.schedule({ x: 10, y: 20 });
    scheduler.schedule({ x: 30, y: 40 });
    expect(scheduler.isPending()).toBe(true);

    scheduler.flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ x: 30, y: 40 });
    expect(scheduler.isPending()).toBe(false);

    // Verify that the subsequent timer does NOT fire cb again
    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("flush does nothing if no update is pending", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<number>(cb);

    scheduler.flush();
    expect(cb).not.toHaveBeenCalled();
    expect(scheduler.isPending()).toBe(false);
  });

  it("can schedule again after a frame finishes", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<number>(cb);

    scheduler.schedule(1);
    vi.runAllTimers();
    expect(cb).toHaveBeenLastCalledWith(1);

    scheduler.schedule(2);
    vi.runAllTimers();
    expect(cb).toHaveBeenLastCalledWith(2);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("handles consecutive cancellation and rescheduling without leaking", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<string>(cb);

    scheduler.schedule("a");
    scheduler.cancel();
    expect(scheduler.isPending()).toBe(false);

    scheduler.schedule("b");
    expect(scheduler.isPending()).toBe(true);

    vi.runAllTimers();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith("b");
  });

  it("preserves reference integrity for complex objects without mutating payloads", () => {
    const cb = vi.fn();
    const scheduler = createRafScheduler<{ points: number[]; meta: { id: string } }>(cb);

    const payload1 = { points: [1, 2], meta: { id: "p1" } };
    const payload2 = { points: [1, 2, 3, 4], meta: { id: "p2" } };

    scheduler.schedule(payload1);
    scheduler.schedule(payload2);

    vi.runAllTimers();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(payload2);
  });
});
