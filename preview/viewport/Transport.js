/** Adapts the host's JSON-lines bridge exposed to the webview. */
export class StdioTransport {
    constructor(port) {
        this.port = port;
        this.listeners = new Set();
        this.removeLineListener = port.onLine((line) => {
            try {
                const message = JSON.parse(line);
                for (const listener of this.listeners)
                    listener(message);
            }
            catch { /* Ignore malformed host lines; the host reports protocol errors. */ }
        });
    }
    send(message) { this.port.writeLine(JSON.stringify(message)); }
    onMessage(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    close() {
        this.removeLineListener();
        this.listeners.clear();
        this.port.close();
    }
}
/** JSON-message transport for an explicitly configured local/debug socket. */
export class WebSocketTransport {
    constructor(socket) {
        this.socket = socket;
        this.listeners = new Set();
        this.handleMessage = (event) => {
            if (typeof event.data !== "string")
                return;
            try {
                const message = JSON.parse(event.data);
                for (const listener of this.listeners)
                    listener(message);
            }
            catch { /* Ignore malformed frames. */ }
        };
        socket.addEventListener("message", this.handleMessage);
    }
    send(message) {
        if (this.socket.readyState !== WebSocket.OPEN)
            throw new Error("Viewport socket is not open");
        this.socket.send(JSON.stringify(message));
    }
    onMessage(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    close() {
        this.socket.removeEventListener("message", this.handleMessage);
        this.listeners.clear();
        this.socket.close();
    }
}
/** Polls a same-origin JSON-lines endpoint; POST is used for outbound messages. */
export class PollingTransport {
    constructor(endpoint, intervalMs = 250, fetcher = fetch) {
        this.endpoint = endpoint;
        this.intervalMs = intervalMs;
        this.fetcher = fetcher;
        this.listeners = new Set();
        this.closed = false;
        this.lastSeq = 0;
        this.timer = window.setInterval(() => { void this.poll(); }, intervalMs);
        void this.poll();
    }
    async poll() {
        if (this.closed)
            return;
        try {
            const response = await this.fetcher(`${this.endpoint}?after=${this.lastSeq}`, { cache: "no-store" });
            if (!response.ok)
                return;
            const body = await response.json();
            const messages = Array.isArray(body) ? body : [body];
            for (const value of messages) {
                if (!value || typeof value !== "object")
                    continue;
                const message = value;
                if (typeof message.type !== "string" || !Number.isFinite(message.seq))
                    continue;
                if (message.seq <= this.lastSeq)
                    continue;
                this.lastSeq = message.seq;
                for (const listener of this.listeners)
                    listener(message);
            }
        }
        catch { /* Polling can recover after a temporary server/network failure. */ }
    }
    send(message) {
        void this.fetcher(this.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message),
        }).catch(() => { });
    }
    onMessage(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    close() {
        this.closed = true;
        window.clearInterval(this.timer);
        this.listeners.clear();
    }
}
