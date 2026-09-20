/**
 * One socket per room. Reconnects with a backoff, and re-sends nothing on its
 * own — the server replays the whole room state in the `init` frame, so a
 * reconnect always lands you back in sync.
 */

import { WS_BASE, getToken } from './api';

export type SocketEvent = { type: string; payload: any };

type Listener = (event: SocketEvent) => void;

export class RoomSocket {
  private ws: WebSocket | null = null;
  private roomId: string;
  private listener: Listener;
  private onStatus: (connected: boolean) => void;
  private retries = 0;
  private closedByUs = false;
  private retryTimer: any = null;
  private pingTimer: any = null;

  constructor(roomId: string, listener: Listener, onStatus: (c: boolean) => void) {
    this.roomId = roomId;
    this.listener = listener;
    this.onStatus = onStatus;
  }

  connect() {
    const token = getToken();
    if (!token) return;
    this.closedByUs = false;

    const url = `${WS_BASE}/ws/rooms/${this.roomId}/?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.onStatus(true);
      this.pingTimer = setInterval(() => this.send('ping', { t: Date.now() }), 25000);
    };

    ws.onmessage = (event) => {
      try {
        this.listener(JSON.parse(event.data));
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.onStatus(false);
      if (this.closedByUs) return;
      // 500ms, 1s, 2s, 4s… capped at 10s.
      const delay = Math.min(10000, 500 * 2 ** this.retries);
      this.retries += 1;
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };

    ws.onerror = () => ws.close();
  }

  send(type: string, payload: any = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }

  close() {
    this.closedByUs = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}
