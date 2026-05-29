/**
 * ChessCam local realtime server.
 * Mirrors the Cloudflare Worker protocol for local Vite development.
 */

import express from 'express';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Chess } from 'chess.js';

type PlayerColor = 'white' | 'black';

type Client = {
  id: string;
  ws: WebSocket;
  roomCode?: string;
  color?: PlayerColor;
};

type GameRoom = {
  code: string;
  players: Map<string, Client>;
  game: Chess;
  createdAt: number;
};

type ClientMessage = {
  type: string;
  roomCode?: string;
  move?: { from?: string; to?: string; promotion?: string };
  payload?: unknown;
};

const rooms = new Map<string, GameRoom>();
const clients = new Map<WebSocket, Client>();
let waitingClientId: string | undefined;

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  while (true) {
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

function normalizeRoomCode(code?: string) {
  return code?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function createRoom(code = generateRoomCode()): GameRoom {
  const room: GameRoom = { code, players: new Map(), game: new Chess(), createdAt: Date.now() };
  rooms.set(code, room);
  console.log(`[Server] Created room ${code}`);
  return room;
}

function getRoom(code?: string) {
  return code ? rooms.get(code) : undefined;
}

function nextAvailableColor(room: GameRoom): PlayerColor {
  const colors = new Set(Array.from(room.players.values()).map((player) => player.color));
  return colors.has('white') ? 'black' : 'white';
}

function send(client: Client, payload: unknown) {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(payload));
}

function getOpponent(client: Client) {
  const room = getRoom(client.roomCode);
  if (!room) return undefined;
  return Array.from(room.players.values()).find((player) => player.id !== client.id);
}

function broadcast(room: GameRoom, payload: unknown) {
  room.players.forEach((player) => send(player, payload));
}

function addClientToRoom(client: Client, room: GameRoom, color: PlayerColor) {
  client.roomCode = room.code;
  client.color = color;
  room.players.set(client.id, client);
}

function roomJoinedPayload(room: GameRoom, client: Client, opponent: boolean, initiator: boolean) {
  return {
    type: 'room-joined',
    roomCode: room.code,
    color: client.color,
    opponent: opponent ? { id: getOpponent(client)?.id } : undefined,
    initiator,
    fen: room.game.fen(),
    moves: [],
  };
}

function leaveRoom(client: Client, notifyOpponent: boolean) {
  const room = getRoom(client.roomCode);
  if (!room) {
    if (waitingClientId === client.id) waitingClientId = undefined;
    client.roomCode = undefined;
    client.color = undefined;
    return;
  }

  room.players.delete(client.id);
  if (waitingClientId === client.id) waitingClientId = undefined;
  client.roomCode = undefined;
  client.color = undefined;

  const remaining = Array.from(room.players.values());
  if (notifyOpponent) remaining.forEach((player) => send(player, { type: 'opponent-left' }));
  remaining.forEach((player) => {
    player.roomCode = undefined;
    player.color = undefined;
  });
  rooms.delete(room.code);
}

function quickMatch(client: Client) {
  leaveRoom(client, false);

  const waiting = Array.from(clients.values()).find(
    (candidate) => candidate.id === waitingClientId && candidate.id !== client.id && candidate.ws.readyState === WebSocket.OPEN,
  );

  if (waiting) {
    waitingClientId = undefined;
    const room = getRoom(waiting.roomCode) ?? createRoom();
    if (!waiting.roomCode) addClientToRoom(waiting, room, 'white');
    addClientToRoom(client, room, 'black');
    send(client, roomJoinedPayload(room, client, true, false));
    send(waiting, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
    console.log(`[Server] Matched ${waiting.id} vs ${client.id} in ${room.code}`);
    return;
  }

  const room = createRoom();
  addClientToRoom(client, room, 'white');
  waitingClientId = client.id;
  send(client, roomJoinedPayload(room, client, false, false));
}

function joinRoom(client: Client, code: string) {
  leaveRoom(client, false);
  const room = getRoom(code) ?? createRoom(code);

  if (room.players.size >= 2) {
    send(client, { type: 'error', message: 'Room is full.' });
    return;
  }

  addClientToRoom(client, room, nextAvailableColor(room));
  const hasOpponent = room.players.size === 2;
  send(client, roomJoinedPayload(room, client, hasOpponent, false));

  if (hasOpponent) {
    const opponent = getOpponent(client);
    if (opponent) send(opponent, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
  } else {
    waitingClientId = client.id;
  }
}

function makeMove(client: Client, message: ClientMessage) {
  const room = getRoom(client.roomCode);
  if (!room) return send(client, { type: 'error', message: 'Room not found.' });

  const player = room.players.get(client.id);
  if (!player?.color) return send(client, { type: 'error', message: 'You are not seated in this room.' });

  const currentTurn: PlayerColor = room.game.turn() === 'w' ? 'white' : 'black';
  if (player.color !== currentTurn) return send(client, { type: 'error', message: 'Not your turn.' });

  const { from, to, promotion = 'q' } = message.move ?? {};
  if (!from || !to) return send(client, { type: 'error', message: 'Move must include from and to squares.' });

  try {
    const move = room.game.move({ from, to, promotion });
    if (!move) return send(client, { type: 'error', message: 'Invalid move.' });

    const fen = room.game.fen();
    broadcast(room, { type: 'move-made', move, fen, lastMove: `${from}-${to}` });

    if (room.game.isCheckmate()) broadcast(room, { type: 'game-over', reason: 'checkmate', winner: player.color });
    else if (room.game.isStalemate()) broadcast(room, { type: 'game-over', reason: 'stalemate' });
    else if (room.game.isDraw()) broadcast(room, { type: 'game-over', reason: 'draw' });
  } catch (error) {
    send(client, { type: 'error', message: `Move failed: ${error instanceof Error ? error.message : String(error)}` });
  }
}

function forwardToOpponent(client: Client, message: ClientMessage) {
  const opponent = getOpponent(client);
  if (opponent) send(opponent, { type: message.type, from: client.id, payload: message.payload });
}

function handleClientMessage(client: Client, message: ClientMessage) {
  switch (message.type) {
    case 'quick-match':
      quickMatch(client);
      break;
    case 'join-room':
      joinRoom(client, normalizeRoomCode(message.roomCode) || generateRoomCode());
      break;
    case 'make-move':
      makeMove(client, message);
      break;
    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'ice-candidate':
      forwardToOpponent(client, message);
      break;
    case 'leave':
      leaveRoom(client, true);
      break;
    default:
      send(client, { type: 'error', message: `Unknown message type: ${message.type}` });
  }
}

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (room.players.size === 0 || now - room.createdAt > 2 * 60 * 60 * 1000) rooms.delete(code);
  });
}, 300000);

const app = express();
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  const client: Client = { id: Math.random().toString(36).substring(2, 10), ws };
  clients.set(ws, client);
  send(client, { type: 'connected', id: client.id });
  console.log(`[Server] Client connected ${client.id}`);

  ws.on('message', (data) => {
    try {
      handleClientMessage(client, JSON.parse(data.toString()) as ClientMessage);
    } catch (error) {
      send(client, { type: 'error', message: `Invalid message: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  ws.on('close', () => {
    leaveRoom(client, true);
    clients.delete(ws);
    console.log(`[Server] Client disconnected ${client.id}`);
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: rooms.size, clients: clients.size, waiting: Boolean(waitingClientId) });
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[Server] ChessCam realtime server running on http://localhost:${PORT}`);
});
