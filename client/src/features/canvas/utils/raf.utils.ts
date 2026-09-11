import { useEffect, useRef } from "react";

export interface RafScheduler<T> {
  schedule: (data: T) => void;
  cancel: () => void;
  flush: () => void;
  isPending: () => boolean;
}

/**
 * Creates a lightweight, framework-agnostic requestAnimationFrame coalescer.
 * Coalesces high-frequency updates (e.g. pointermove, wheel) to at most one execution
 * per browser animation frame, passing the latest data.
 */
const safeRequestAnimationFrame = (callback: () => void): number => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return Number(setTimeout(callback, 16));
};

const safeCancelAnimationFrame = (id: number): void => {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(id);
    return;
  }
  clearTimeout(id);
};

export function createRafScheduler<T>(callback: (data: T) => void): RafScheduler<T> {
  let rafId: number | null = null;
  let pendingData: T | null = null;
  let hasPending = false;

  const cancel = (): void => {
    if (rafId !== null) {
      safeCancelAnimationFrame(rafId);
      rafId = null;
    }
    pendingData = null;
    hasPending = false;
  };

  const flush = (): void => {
    if (rafId !== null) {
      safeCancelAnimationFrame(rafId);
      rafId = null;
    }
    if (hasPending) {
      const data = pendingData as T;
      pendingData = null;
      hasPending = false;
      callback(data);
    }
  };

  const schedule = (data: T): void => {
    pendingData = data;
    hasPending = true;

    if (rafId === null) {
      rafId = safeRequestAnimationFrame(() => {
        rafId = null;
        if (hasPending) {
          const latest = pendingData as T;
          pendingData = null;
          hasPending = false;
          callback(latest);
        }
      });
    }
  };

  const isPending = (): boolean => hasPending;

  return {
    schedule,
    cancel,
    flush,
    isPending,
  };
}

/**
 * React hook that manages a requestAnimationFrame scheduler lifecycle.
 * Guarantees zero stale closures by referencing the latest callback,
 * and automatically cancels pending frames on component unmount.
 */
export function useRafScheduler<T>(callback: (data: T) => void): RafScheduler<T> {
  const callbackRef = useRef<(data: T) => void>(callback);
  callbackRef.current = callback;

  const schedulerRef = useRef<RafScheduler<T> | null>(null);

  if (!schedulerRef.current) {
    schedulerRef.current = createRafScheduler<T>((data: T) => {
      callbackRef.current(data);
    });
  }

  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => {
      scheduler?.cancel();
    };
  }, []);

  return schedulerRef.current;
}
