import { onMounted, onUnmounted } from "vue";

export function usePolling(
  task: () => Promise<void>,
  intervalMs: number,
): void {
  let timer: number | undefined;
  let stopped = false;
  let inFlight = false;

  const schedule = () => {
    if (!stopped) timer = window.setTimeout(run, intervalMs);
  };

  const run = async () => {
    if (stopped) return;
    if (document.hidden || inFlight) {
      schedule();
      return;
    }
    inFlight = true;
    try {
      await task();
    } finally {
      inFlight = false;
      schedule();
    }
  };

  const onVisibilityChange = () => {
    if (!document.hidden && !inFlight) {
      if (timer) window.clearTimeout(timer);
      void run();
    }
  };

  onMounted(() => {
    stopped = false;
    document.addEventListener("visibilitychange", onVisibilityChange);
    void run();
  });

  onUnmounted(() => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}
