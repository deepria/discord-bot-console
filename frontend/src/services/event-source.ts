export interface LogStreamHandlers {
  onOpen: () => void;
  onMessage: (line: string) => void;
  onError: () => void;
}

export function openLogStream(handlers: LogStreamHandlers): () => void {
  const source = new EventSource("/api/logs/stream");
  source.onopen = handlers.onOpen;
  source.onmessage = (event) => handlers.onMessage(event.data);
  source.onerror = handlers.onError;
  return () => source.close();
}
