import { onMounted, onUnmounted } from "vue";
import { api } from "../services/api";
import { openLogStream } from "../services/event-source";
import { useOperationsStore } from "../stores/operations";

export function useLogStream(): void {
  const store = useOperationsStore();
  let closeStream: (() => void) | null = null;
  let stopped = false;

  const connect = () => {
    if (stopped || document.hidden) return;
    store.logConnection = "connecting";
    closeStream = openLogStream({
      onOpen: () => {
        store.logConnection = "open";
        store.logError = null;
      },
      onMessage: (line) => store.appendLog(line),
      onError: () => {
        store.logConnection = "reconnecting";
        store.logError = "Live log stream is reconnecting.";
      },
    });
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      closeStream?.();
      closeStream = null;
      store.logConnection = "closed";
    } else if (!closeStream) {
      connect();
    }
  };

  onMounted(async () => {
    stopped = false;
    try {
      const result = await api.getLogs(100);
      store.replaceLogs(result.logs);
    } catch (error) {
      store.logError =
        error instanceof Error ? error.message : "Failed to load logs.";
    }
    if (stopped) return;
    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  onUnmounted(() => {
    stopped = true;
    closeStream?.();
    closeStream = null;
    store.logConnection = "closed";
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}
