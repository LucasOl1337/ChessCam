/**
 * Xadrez-Online Server
 * Handles WebSocket connections for multiplayer chess + WebRTC signaling
 *
 * Run with: npx tsx server/index.ts
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Chess } from 'chess.js';

// Types matching client protocol
interface Player {
  id: string;
  color: 'white' | 'black';
  ws: WebSocket;
}

interface GameRoom {
  code: string;
  players: Map<string, Player>;
  game: Chess;
  createdAt: number;
}

interface ClientMessage {
  type: 'join-room' | 'make-move' | 'offer-draw' | 'accept-draw' | 'resign' |
        'webrtc-offer' | 'webrtc-answer' | 'ice-candidate';
  roomCode?: string;
  move?: { from: string; to: string; promotion?: string };
  payload?: any;
}

interface ServerMessage {
  type: 'room-joined' | 'move-made' | 'game-over' |
        'webrtc-offer' | 'webrtc-answer' | 'ice-candidate' | 'error';
  roomCode?: string;
  color?: 'white' | 'black';
  opponent?: { id: string };
  move?: any;
  fen?: string;
  lastMove?: string;
  reason?: string;
  winner?: 'white' | 'black';
  from?: string;
  payload?: any;
  message?: string;
}

// In-memory room storage
const rooms = new Map<string, GameRoom>();
const clients = new Map<WebSocket, { id: string; roomCode?: string }>();

// Generate 6-char alphanumeric room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for readability
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Create a new game room
function createRoom(): GameRoom {
  let code: string;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room: GameRoom = {
    code,
    players: new Map(),
    game: new Chess(),
    createdAt: Date.now(),
  };

  rooms.set(code, room);
  console.log(`[Server] Created room: ${code}`);
  return room;
}

// Get or create room
function getOrCreateRoom(roomCode?: string): GameRoom {
  if (roomCode && rooms.has(roomCode)) {
    return rooms.get(roomCode)!;
  }
  return createRoom();
}

// Broadcast message to all players in a room
function broadcastToRoom(room: GameRoom, message: ServerMessage, excludeId?: string) {
  const payload = JSON.stringify(message);
  room.players.forEach((player) => {
    if (player.id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(payload);
    }
  });
}

// Handle incoming client message
function handleClientMessage(ws: WebSocket, message: ClientMessage) {
  const client = clients.get(ws);
  if (!client) return;

  switch (message.type) {
    case 'join-room': {
      const room = getOrCreateRoom(message.roomCode);
      const playerId = client.id;

      // Check if room is full
      if (room.players.size >= 2) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Room is full'
        }));
        return;
      }

      // Assign color based on join order
      const color: 'white' | 'black' = room.players.size === 0 ? 'white' : 'black';

      const player: Player = { id: playerId, color, ws };
      room.players.set(playerId, player);
      client.roomCode = room.code;

      // Send confirmation to joining player
      ws.send(JSON.stringify({
        type: 'room-joined',
        roomCode: room.code,
        color,
        opponent: room.players.size === 2
          ? { id: Array.from(room.players.keys()).find(id => id !== playerId)! }
          : undefined,
      }));

      console.log(`[Server] Player ${playerId} joined room ${room.code} as ${color}`);

      // If second player joined, notify first player
      if (room.players.size === 2) {
        const otherPlayer = Array.from(room.players.values()).find(p => p.id !== playerId);
        if (otherPlayer) {
          otherPlayer.ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode: room.code,
            color: otherPlayer.color,
            opponent: { id: playerId },
          }));
          console.log(`[Server] Game started in room ${room.code}`);
        }
      }
      break;
    }

    case 'make-move': {
      const room = roomCode ? rooms.get(roomCode) :
                   Array.from(rooms.values()).find(r =>
                     Array.from(r.players.keys()).includes(client.id)
                   );

      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
      }

      const player = room.players.get(client.id);
      if (!player) return;

      // Validate turn
      const currentTurn = room.game.turn() === 'w' ? 'white' : 'black';
      if (player.color !== currentTurn) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
        return;
      }

      // Attempt the move
      try {
        const moveResult = room.game.move({
          from: message.move!.from,
          to: message.move!.to,
          promotion: message.move!.promotion,
        });

        if (!moveResult) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid move' }));
          return;
        }

        const fen = room.game.fen();
        const lastMove = `${message.move!.from}-${message.move!.to}`;

        // Check game over conditions
        let gameOverMessage: ServerMessage | null = null;
        if (room.game.isCheckmate()) {
          gameOverMessage = {
            type: 'game-over',
            reason: 'checkmate',
            winner: player.color,
          };
        } else if (room.game.isStalemate()) {
          gameOverMessage = { type: 'game-over', reason: 'stalemate' };
        } else if (room.game.isDraw()) {
          gameOverMessage = { type: 'game-over', reason: 'draw' };
        }

        // Broadcast move to both players
        const moveMessage: ServerMessage = {
          type: 'move-made',
          move: moveResult,
          fen,
          lastMove,
        };
        broadcastToRoom(room, moveMessage);

        if (gameOverMessage) {
          broadcastToRoom(room, gameOverMessage);
          console.log(`[Server] Game over in ${room.code}: ${gameOverMessage.reason}`);
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Move failed: ' + (error as Error).message
        }));
      }
      break;
    }

    case 'resign': {
      const room = Array.from(rooms.values()).find(r =>
        Array.from(r.players.keys()).includes(client.id)
      );
      if (!room) return;

      const player = room.players.get(client.id);
      if (!player) return;

      const winner = player.color === 'white' ? 'black' : 'white';
      broadcastToRoom(room, {
        type: 'game-over',
        reason: 'resignation',
        winner,
      });
      console.log(`[Server] Player resigned in room ${room.code}`);
      break;
    }

    // WebRTC Signaling - forward to opponent
    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'ice-candidate': {
      const room = Array.from(rooms.values()).find(r =>
        Array.from(r.players.keys()).includes(client.id)
      );
      if (!room) return;

      const player = room.players.get(client.id);
      if (!player) return;

      // Find opponent
      const opponent = Array.from(room.players.values()).find(p => p.id !== client.id);
      if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
        opponent.ws.send(JSON.stringify({
          type: message.type,
          from: client.id,
          payload: message.payload,
        }));
      }
      break;
    }

    default:
      console.warn('[Server] Unknown message type:', message.type);
  }
}

// Cleanup empty/inactive rooms periodically
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    // Remove rooms older than 1 hour with no players
    if (room.players.size === 0 && now - room.createdAt > 3600000) {
      rooms.delete(code);
      console.log(`[Server] Cleaned up inactive room: ${code}`);
    }
  });
}, 300000); // Every 5 minutes

// === Server Setup ===

const app = express();
const httpServer = createServer(app);

// WebSocket Server (attached to HTTP server on /ws path)
const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws'
});

wss.on('connection', (ws, req) => {
  const clientId = Math.random().toString(36).substring(2, 10);
  clients.set(ws, { id: clientId });
  console.log(`[Server] Client connected: ${clientId}`);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;
      handleClientMessage(ws, message);
    } catch (error) {
      console.error('[Server] Failed to parse message:', error);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client) {
      // Remove player from their room
      rooms.forEach((room) => {
        if (room.players.has(client.id)) {
          room.players.delete(client.id);
          console.log(`[Server] Player ${client.id} left room ${room.code}`);

          // Notify remaining player
          if (room.players.size === 1) {
            const remaining = Array.from(room.players.values())[0];
            remaining.ws.send(JSON.stringify({
              type: 'error',
              message: 'Opponent disconnected',
            }));
          }
        }
      });
      clients.delete(ws);
    }
    console.log(`[Server] Client disconnected: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error(`[Server] WebSocket error for ${clientId}:`, error);
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    clients: clients.size,
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[Server] Xadrez-Online server running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});