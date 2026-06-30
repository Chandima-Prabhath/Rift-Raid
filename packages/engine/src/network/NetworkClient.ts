/**
 * Rift & Raid — NetworkClient
 *
 * Phase 0 stub. Phase 2 will integrate with Colyseus for real multiplayer.
 * For now, exposes the expected API surface so client code can be written
 * against it.
 */

import type { ClientMessage, ServerMessage, ConnectionState } from '@rift-and-raid/shared';

export interface NetworkClientOptions {
  serverUrl: string;
  onMessage?: (msg: ServerMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
}

export class NetworkClient {
  private options: NetworkClientOptions;
  private state: ConnectionState = 'disconnected';
  private ws: WebSocket | null = null;

  constructor(options: NetworkClientOptions) {
    this.options = options;
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    // Phase 2 implementation will use Colyseus Client.
    // Phase 0: log only.
    this.setState('connecting');
    try {
      this.ws = new WebSocket(this.options.serverUrl);
      this.ws.onopen = () => this.setState('connected');
      this.ws.onclose = () => this.setState('disconnected');
      this.ws.onerror = () => this.setState('error');
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          this.options.onMessage?.(msg);
        } catch (err) {
          console.error('[NetworkClient] failed to parse message:', err);
        }
      };
    } catch (err) {
      console.warn('[NetworkClient] connect failed (expected in Phase 0):', err);
      this.setState('disconnected');
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
