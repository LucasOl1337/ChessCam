/**
 * ChessCam local realtime server.
 * Mirrors the Cloudflare Worker protocol for local Vite development.
 */

import express from 'express';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Chess } from 'chess.js';
import { askChessAgent, compactPrivateMemory, type AgentGlobalMessage } from '../src/agent/agentGateway';
import { AGENT_MODEL_PROFILES, getAgentModelProfile } from '../src/agent/models';

type PlayerColor = 'white' | 'black';

type TimeControl = {
  minutes?: number;
  increment?: number;
};

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
  whiteTime: number;
  blackTime: number;
  increment: number;
  lastMoveTimestamp: number;
};

type ClientMessage = {
  type: string;
  roomCode?: string;
  move?: { from?: string; to?: string; promotion?: string };
  payload?: unknown;
  timeControl?: TimeControl;
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
  const room: GameRoom = { code, players: new Map(), game: new Chess(), createdAt: Date.now(), whiteTime: 0, blackTime: 0, lastMoveTimestamp: Date.now(), increment: 0 };
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

function quickMatch(client: Client, timeControl?: TimeControl) {
  leaveRoom(client, false);

  const waiting = Array.from(clients.values()).find(
    (candidate) => candidate.id === waitingClientId && candidate.id !== client.id && candidate.ws.readyState === WebSocket.OPEN,
  );

  if (waiting) {
    waitingClientId = undefined;
    const room = getRoom(waiting.roomCode) ?? createRoom(undefined, timeControl);
    if (!waiting.roomCode) addClientToRoom(waiting, room, 'white');
    addClientToRoom(client, room, 'black');
    send(client, roomJoinedPayload(room, client, true, false));
    send(waiting, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
    console.log(`[Server] Matched ${waiting.id} vs ${client.id} in ${room.code}`);
    return;
  }

  const room = createRoom(undefined, timeControl);
  addClientToRoom(client, room, 'white');
  waitingClientId = client.id;
  send(client, roomJoinedPayload(room, client, false, false));
}

function joinRoom(client: Client, code: string, timeControl?: TimeControl) {
  leaveRoom(client, false);
  const room = getRoom(code) ?? createRoom(code, timeControl);

  if (room.players.size >= 2) {
    send(client, { type: 'error', message: 'Room is full.' });
    return;
  }

  addClientToRoom(client, room, nextAvailableColor(room));
  const hasOpponent = room.players.size === 2;
  send(client, roomJoinedPayload(room, client, hasOpponent, false));

  if (hasOpponent) {
    const opponent = getOpponent(client);
    if (opponent && waitingClientId === opponent.id) waitingClientId = undefined;
    if (opponent) send(opponent, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
  }
}


function handleRematch(client: Client) {
  const room = getRoom(client.roomCode);
  if (!room) return;

  // Reset game while preserving time control settings
  room.game.reset();
  room.lastMoveTimestamp = Date.now();

  const payload = {
    type: 'rematch',
    fen: room.game.fen(),
    whiteTime: room.whiteTime,
    blackTime: room.blackTime,
  };

  broadcast(room, payload);
  console.log(`[Server] Rematch in room ${room.code}`);
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
    // Real chess clock logic (chess.com style)
    const now = Date.now();
    const elapsed = Math.floor((now - room.lastMoveTimestamp) / 1000);
    const inc = room.increment || 0;

    if (player.color === 'white') {
      room.whiteTime = Math.max(0, room.whiteTime - elapsed) + inc;
    } else {
      room.blackTime = Math.max(0, room.blackTime - elapsed) + inc;
    }

    room.lastMoveTimestamp = now;

    // Basic server-side time-out check
    if (room.whiteTime <= 0) {
      broadcast(room, { type: 'game-over', reason: 'time', winner: 'black' });
      return;
    }
    if (room.blackTime <= 0) {
      broadcast(room, { type: 'game-over', reason: 'time', winner: 'white' });
      return;
    }

    broadcast(room, { type: 'move-made', move, fen, lastMove: `${from}-${to}`, whiteTime: room.whiteTime, blackTime: room.blackTime });

    if (room.game.isCheckmate()) broadcast(room, { type: 'game-over', reason: 'checkmate', winner: player.color });
    else if (room.game.isStalemate()) broadcast(room, { type: 'game-over', reason: 'stalemate' });
    else if (room.game.isDraw()) broadcast(room, { type: 'game-over', reason: 'draw' });
  } catch (error) {
    send(client, { type: 'error', message: `Move failed: ${error instanceof Error ? error.message : String(error)}` });
  }
}


function handleResign(client: Client) {
  const room = getRoom(client.roomCode);
  if (!room) return send(client, { type: 'error', message: 'Room not found.' });

  const player = room.players.get(client.id);
  if (!player?.color) return send(client, { type: 'error', message: 'You are not seated in this room.' });

  const winner: PlayerColor = player.color === 'white' ? 'black' : 'white';
  broadcast(room, { type: 'game-over', reason: 'resignation', winner });
  console.log(`[Server] ${player.color} resigned in ${room.code}`);
}

function handleOfferDraw(client: Client) {
  const room = getRoom(client.roomCode);
  if (!room) return send(client, { type: 'error', message: 'Room not found.' });
  const opponent = getOpponent(client);
  if (opponent) {
    send(opponent, { type: 'draw-offer' });
    console.log(`[Server] Draw offer from ${client.id} in ${room.code}`);
  }
}

function handleAcceptDraw(client: Client) {
  const room = getRoom(client.roomCode);
  if (!room) return;
  const opponent = getOpponent(client);
  if (opponent) send(opponent, { type: 'draw-accepted' });
  broadcast(room, { type: 'game-over', reason: 'draw', winner: undefined });
  console.log(`[Server] Draw accepted in ${room.code}`);
}

function handleDeclineDraw(client: Client) {
  const room = getRoom(client.roomCode);
  if (!room) return;
  const opponent = getOpponent(client);
  if (opponent) send(opponent, { type: 'draw-declined' });
  console.log(`[Server] Draw declined in ${room.code}`);
}

function forwardToOpponent(client: Client, message: ClientMessage) {
  const opponent = getOpponent(client);
  if (opponent) send(opponent, { type: message.type, from: client.id, payload: message.payload });
}

function handleClientMessage(client: Client, message: ClientMessage) {
  switch (message.type) {
    case 'quick-match':
      quickMatch(client, message.timeControl);
      break;
    case 'join-room':
      joinRoom(client, normalizeRoomCode(message.roomCode) || generateRoomCode(), message.timeControl);
      break;
    case 'make-move':
      makeMove(client, message);
      break;
    case 'resign':
      handleResign(client);
      break;
    case 'webrtc-offer':
    case 'webrtc-answer':
    case 'ice-candidate':
      forwardToOpponent(client, message);
      break;
    case 'leave':
      leaveRoom(client, true);
      break;
    case 'rematch':
      handleRematch(client);
      break;
    case 'offer-draw':
      handleOfferDraw(client);
      break;
    case 'accept-draw':
      handleAcceptDraw(client);
      break;
    case 'decline-draw':
      handleDeclineDraw(client);
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

app.get('/api/agent-models', (_req, res) => {
  res.json({
    ok: true,
    profiles: AGENT_MODEL_PROFILES.map(({ id, label, route, available, note }) => ({ id, label, route, available, note })),
  });
});

app.post('/api/agent-move', express.json({ limit: '16kb' }), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const fen = typeof body.fen === 'string' ? body.fen.trim() : '';
  const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
  const color = body.color === 'white' || body.color === 'black' ? body.color : '';
  const ply = Math.max(1, Math.min(300, Number(body.ply) || 1));
  const history = Array.isArray(body.history)
    ? body.history.slice(-8).filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 16))
    : [];
  const privateMemory = typeof body.privateMemory === 'string' ? body.privateMemory.replace(/[\r\n\t]+/g, ' ').slice(0, 1000) : '';
  const globalChat: AgentGlobalMessage[] = Array.isArray(body.globalChat)
    ? body.globalChat.slice(-6).flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Record<string, unknown>;
        if ((candidate.color !== 'white' && candidate.color !== 'black') || typeof candidate.message !== 'string') return [];
        return [{ color: candidate.color, ply: Math.max(1, Math.min(300, Number(candidate.ply) || 1)), message: candidate.message.slice(0, 180) }];
      })
    : [];
  const profile = getAgentModelProfile(profileId);

  if (!profile?.available) return res.status(409).json({ ok: false, error: 'Modelo indisponível no 9Router.' });
  if (!fen || !color) return res.status(400).json({ ok: false, error: 'Posição ou cor inválida.' });

  let game: Chess;
  try {
    game = new Chess(fen);
  } catch {
    return res.status(400).json({ ok: false, error: 'FEN inválido.' });
  }
  const expectedColor = game.turn() === 'w' ? 'white' : 'black';
  if (expectedColor !== color || game.isGameOver()) return res.status(409).json({ ok: false, error: 'Turno inválido.' });

  const legalMoves = game.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ''}`);
  const baseUrl = process.env.NINE_ROUTER_BASE_URL;
  const apiKey = process.env.NINE_ROUTER_API_KEY;
  if (!baseUrl || !apiKey) return res.status(503).json({ ok: false, error: '9Router não configurado no servidor local.' });

  const startedAt = Date.now();
  try {
    const turn = await askChessAgent(
      { baseUrl, apiKey, route: profile.route, timeoutMs: 60_000 },
      { color, fen, legalMoves, history, ply, privateMemory, globalChat },
    );
    return res.json({
      ok: true,
      move: turn.move,
      private: turn.private,
      global: turn.global,
      memory: compactPrivateMemory(turn.private),
      inputChars: turn.inputChars,
      outputChars: turn.outputChars,
      fallback: false,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[Agent] move failed:', error);
    return res.status(502).json({ ok: false, error: 'O agente não respondeu com um lance legal a tempo.' });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`[Server] ChessCam realtime server running on http://localhost:${PORT}`);
});
