/**
 * WebSocket Client for Xadrez Online
 * Handles connection to the multiplayer server
 */

import type { ClientMessage, ServerMessage } from './protocol';

type MessageHandler = (msg: ServerMessage) => void;
type ConnectionHandler = () => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: MessageHandler[] = [];
  private onOpenHandlers: ConnectionHandler[] = [];
  private onCloseHandlers: ConnectionHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnect = 5;

  constructor(url?: string) {
    // In dev, Vite proxies /ws to the backend
    // In production with Cloudflare tunnel, it will be wss://...
    this.url = url ||
      (window.location.protocol === 'https:'
        ? `wss://${window.location.host}/ws`
        : `ws://${window.location.host}/ws`);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WS] Connected to server');
          this.reconnectAttempts = 0;
          this.onOpenHandlers.forEach(h => h());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as ServerMessage;
            this.handlers.forEach(handler => handler(data));
          } catch (err) {
            console.error('[WS] Failed to parse message:', err);
          }
        };

        this.ws.onclose = () => {
          console.log('[WS] Disconnected');
          this.onCloseHandlers.forEach(h => h());
          this.tryReconnect();
        };

        this.ws.onerror = (err) => {
          console.error('[WS] Error:', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private tryReconnect() {
    if (this.reconnectAttempts >= this.maxReconnect) {
      console.warn('[WS] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * this.reconnectAttempts, 5000);

    console.log(`[WS] Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send message, not connected');
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  onOpen(handler: ConnectionHandler) {
    this.onOpenHandlers.push(handler);
  }

  onClose(handler: ConnectionHandler) {
    this.onCloseHandlers.push(handler);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton for the app
export const wsClient = new WSClient();