/**
 * Room Manager
 * Handles joining/creating rooms and game state for multiplayer
 */

import { wsClient } from './wsClient';
import type { ServerMessage, ClientMessage } from './protocol';

export type PlayerColor = 'white' | 'black';

export interface RoomState {
  code: string;
  color: PlayerColor;
  opponentConnected: boolean;
  fen?: string;
  lastMove?: string;
  gameOver?: {
    reason: string;
    winner?: PlayerColor;
  };
}

type RoomListener = (state: Partial<RoomState>) => void;

class RoomManager {
  private state: Partial<RoomState> = {};
  private listeners: RoomListener[] = [];
  private unsubscribeWs?: () => void;

  constructor() {
    this.setupWebSocketListeners();
  }

  private setupWebSocketListeners() {
    this.unsubscribeWs = wsClient.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room-joined':
          this.updateState({
            code: msg.roomCode,
            color: msg.color,
            opponentConnected: !!msg.opponent,
          });
          break;

        case 'move-made':
          this.updateState({
            fen: msg.fen,
            lastMove: msg.lastMove,
          });
          break;

        case 'game-over':
          this.updateState({
            gameOver: {
              reason: msg.reason,
              winner: msg.winner,
            },
          });
          break;

        case 'error':
          console.error('[Room] Server error:', msg.message);
          // Could emit error state here
          break;
      }
    });
  }

  private updateState(newState: Partial<RoomState>) {
    this.state = { ...this.state, ...newState };
    this.listeners.forEach(listener => listener(this.state));
  }

  subscribe(listener: RoomListener) {
    this.listeners.push(listener);
    listener(this.state); // immediate emit current state
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  async joinRoom(roomCode?: string): Promise<void> {
    if (!wsClient.isConnected) {
      await wsClient.connect();
    }

    wsClient.send({
      type: 'join-room',
      roomCode,
    });
  }

  makeMove(from: string, to: string, promotion?: string) {
    wsClient.send({
      type: 'make-move',
      move: { from, to, promotion },
    });
  }

  resign() {
    wsClient.send({ type: 'resign' });
  }

  get currentState() {
    return this.state;
  }

  disconnect() {
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
    }
    wsClient.disconnect();
  }
}

export const roomManager = new RoomManager();