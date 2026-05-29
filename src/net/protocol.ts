/**
 * WebSocket Protocol Definitions
 * Shared between client and server
 */

export type ClientMessage =
  | { type: 'join-room'; roomCode?: string }
  | { type: 'make-move'; move: { from: string; to: string; promotion?: string } }
  | { type: 'offer-draw' | 'accept-draw' | 'resign' }
  | { type: 'webrtc-offer' | 'webrtc-answer' | 'ice-candidate'; payload: unknown };

export type ServerMessage =
  | { type: 'room-joined'; roomCode: string; color: 'white' | 'black'; opponent?: { id: string } }
  | { type: 'move-made'; move: unknown; fen: string; lastMove: string }
  | { type: 'game-over'; reason: 'checkmate' | 'stalemate' | 'draw' | 'resignation'; winner?: 'white' | 'black' }
  | { type: 'webrtc-offer' | 'webrtc-answer' | 'ice-candidate'; from: string; payload: unknown }
  | { type: 'error'; message: string };

export interface RoomState {
  code: string;
  color: 'white' | 'black';
  opponentId?: string;
  fen?: string;
}