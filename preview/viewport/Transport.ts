export interface ViewportMessage {
  type: string;
  seq: number;
  [key: string]: unknown;
}

export type MessageListener = (message: ViewportMessage) => void;

export interface Transport {
  send(message: ViewportMessage): void;
  onMessage(listener: MessageListener): () => void;
  close(): void;
}

export interface StdioPort {
  writeLine(line: string): void;
  onLine(listener: (line: string) => void): () => void;
  close(): void;
}

/** Adapts the host's JSON-lines bridge exposed to the webview. */
export class StdioTransport implements Transport {
  private listeners = new Set<MessageListener>();
  private removeLineListener: () => void;

  constructor(private readonly port: StdioPort) {
    this.removeLineListener = port.onLine((line) => {
      try {
        const message = JSON.parse(line) as ViewportMessage;
        for (const listener of this.listeners) listener(message);
      } catch { /* Ignore malformed host lines; the host reports protocol errors. */ }
    });
  }

  send(message: ViewportMessage): void { this.port.writeLine(JSON.stringify(message)); }
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    this.removeLineListener();
    this.listeners.clear();
    this.port.close();
  }
}

/** JSON-message transport for an explicitly configured local/debug socket. */
export class WebSocketTransport implements Transport {
  private listeners = new Set<MessageListener>();

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", this.handleMessage);
  }

  private handleMessage = (event: MessageEvent): void => {
    if (typeof event.data !== "string") return;
    try {
      const message = JSON.parse(event.data) as ViewportMessage;
      for (const listener of this.listeners) listener(message);
    } catch { /* Ignore malformed frames. */ }
  };

  send(message: ViewportMessage): void {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error("Viewport socket is not open");
    this.socket.send(JSON.stringify(message));
  }
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    this.socket.removeEventListener("message", this.handleMessage);
    this.listeners.clear();
    this.socket.close();
  }
}

/** Polls a same-origin JSON-lines endpoint; POST is used for outbound messages. */
export class PollingTransport implements Transport {
  private listeners = new Set<MessageListener>();
  private timer: number;
  private closed = false;
  private lastSeq = 0;

  constructor(
    private readonly endpoint: string,
    private readonly intervalMs = 250,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.timer = window.setInterval(() => { void this.poll(); }, intervalMs);
    void this.poll();
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    try {
      const response = await this.fetcher(`${this.endpoint}?after=${this.lastSeq}`, { cache: "no-store" });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const messages = Array.isArray(body) ? body : [body];
      for (const value of messages) {
        if (!value || typeof value !== "object") continue;
        const message = value as ViewportMessage;
        if (typeof message.type !== "string" || !Number.isFinite(message.seq)) continue;
        if (message.seq <= this.lastSeq) continue;
        this.lastSeq = message.seq;
        for (const listener of this.listeners) listener(message);
      }
    } catch { /* Polling can recover after a temporary server/network failure. */ }
  }

  send(message: ViewportMessage): void {
    void this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }).catch(() => { /* The next poll remains available as a receive fallback. */ });
  }
  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  close(): void {
    this.closed = true;
    window.clearInterval(this.timer);
    this.listeners.clear();
  }
}
