import { Chess } from 'chess.js';

export interface Env {
  ASSETS: Fetcher;
  CHESSCAM_HUB: DurableObjectNamespace<ChessCamHub>;
}

type PlayerColor = 'white' | 'black';

type ClientState = {
  id: string;
  ws: WebSocket;
  roomCode?: string;
  color?: PlayerColor;
};

type RoomState = {
  code: string;
  game: Chess;
  players: Map<string, ClientState>;
  createdAt: number;
};

type ClientMessage = {
  type: string;
  roomCode?: string;
  move?: { from?: string; to?: string; promotion?: string };
  payload?: unknown;
};

const START_FEN = new Chess().fen();
const ROOM_CODE_RE = /[^A-Z0-9]/g;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade.', { status: 426 });
      }

      const id = env.CHESSCAM_HUB.idFromName('global-matchmaking-v1');
      return env.CHESSCAM_HUB.get(id).fetch(request);
    }

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'chesscam-worker' });
    }

    return env.ASSETS.fetch(request);
  },
};

export class ChessCamHub implements DurableObject {
  private clients = new Map<WebSocket, ClientState>();
  private rooms = new Map<string, RoomState>();
  private waitingClientId?: string;

  constructor(private state: DurableObjectState, private env: Env) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/realtime-health') {
      return Response.json({
        ok: true,
        rooms: this.rooms.size,
        clients: this.clients.size,
        waiting: Boolean(this.waitingClientId),
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('ChessCam realtime hub. Connect with WebSocket on /ws.', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.handleSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private handleSocket(ws: WebSocket) {
    ws.accept();

    const client: ClientState = {
      id: crypto.randomUUID(),
      ws,
    };

    this.clients.set(ws, client);
    this.send(client, { type: 'connected', id: client.id });

    ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ClientMessage;
        this.handleMessage(client, message);
      } catch (error) {
        this.send(client, { type: 'error', message: `Invalid message: ${stringifyError(error)}` });
      }
    });

    ws.addEventListener('close', () => this.disconnect(client));
    ws.addEventListener('error', () => this.disconnect(client));
  }

  private handleMessage(client: ClientState, message: ClientMessage) {
    switch (message.type) {
      case 'quick-match':
        this.quickMatch(client);
        break;
      case 'join-room':
        this.joinRoom(client, normalizeRoomCode(message.roomCode) || generateRoomCode(this.rooms));
        break;
      case 'make-move':
        this.makeMove(client, message);
        break;
      case 'webrtc-offer':
      case 'webrtc-answer':
      case 'ice-candidate':
        this.forwardToOpponent(client, { type: message.type, from: client.id, payload: message.payload });
        break;
      case 'leave':
        this.leaveRoom(client, true);
        break;
      default:
        this.send(client, { type: 'error', message: `Unknown message type: ${message.type}` });
    }
  }

  private quickMatch(client: ClientState) {
    this.leaveRoom(client, false);

    const waiting = this.findWaitingClient(client.id);
    if (waiting) {
      this.waitingClientId = undefined;
      const room = this.getRoom(waiting.roomCode) ?? this.createRoom();
      if (!waiting.roomCode) this.addClientToRoom(waiting, room, 'white');
      this.addClientToRoom(client, room, 'black');
      this.send(client, this.roomJoinedPayload(room, client, true, false));
      this.send(waiting, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
      return;
    }

    const room = this.createRoom();
    this.addClientToRoom(client, room, 'white');
    this.waitingClientId = client.id;
    this.send(client, this.roomJoinedPayload(room, client, false, false));
  }

  private joinRoom(client: ClientState, roomCode: string) {
    this.leaveRoom(client, false);

    const room = this.rooms.get(roomCode) ?? this.createRoom(roomCode);
    if (room.players.size >= 2) {
      this.send(client, { type: 'error', message: 'Room is full.' });
      return;
    }

    const color = nextAvailableColor(room);
    this.addClientToRoom(client, room, color);
    const hasOpponent = room.players.size === 2;
    this.send(client, this.roomJoinedPayload(room, client, hasOpponent, false));

    if (hasOpponent) {
      const opponent = this.getOpponent(client);
      if (opponent && this.waitingClientId === opponent.id) this.waitingClientId = undefined;
      if (opponent) {
        this.send(opponent, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
      }
    }
  }

  private makeMove(client: ClientState, message: ClientMessage) {
    const room = this.getRoom(client.roomCode);
    if (!room) {
      this.send(client, { type: 'error', message: 'Room not found.' });
      return;
    }

    const player = room.players.get(client.id);
    if (!player?.color) {
      this.send(client, { type: 'error', message: 'You are not seated in this room.' });
      return;
    }

    const currentTurn: PlayerColor = room.game.turn() === 'w' ? 'white' : 'black';
    if (player.color !== currentTurn) {
      this.send(client, { type: 'error', message: 'Not your turn.' });
      return;
    }

    const { from, to, promotion = 'q' } = message.move ?? {};
    if (!from || !to) {
      this.send(client, { type: 'error', message: 'Move must include from and to squares.' });
      return;
    }

    try {
      const move = room.game.move({ from, to, promotion });
      if (!move) {
        this.send(client, { type: 'error', message: 'Invalid move.' });
        return;
      }

      const fen = room.game.fen();
      this.broadcast(room, { type: 'move-made', move, fen, lastMove: `${from}-${to}` });

      if (room.game.isCheckmate()) {
        this.broadcast(room, { type: 'game-over', reason: 'checkmate', winner: player.color });
      } else if (room.game.isStalemate()) {
        this.broadcast(room, { type: 'game-over', reason: 'stalemate' });
      } else if (room.game.isDraw()) {
        this.broadcast(room, { type: 'game-over', reason: 'draw' });
      }
    } catch (error) {
      this.send(client, { type: 'error', message: `Move failed: ${stringifyError(error)}` });
    }
  }

  private forwardToOpponent(client: ClientState, payload: unknown) {
    const opponent = this.getOpponent(client);
    if (opponent) this.send(opponent, payload);
  }

  private disconnect(client: ClientState) {
    this.leaveRoom(client, true);
    this.clients.delete(client.ws);
  }

  private leaveRoom(client: ClientState, notifyOpponent: boolean) {
    const room = this.getRoom(client.roomCode);
    if (!room) {
      if (this.waitingClientId === client.id) this.waitingClientId = undefined;
      client.roomCode = undefined;
      client.color = undefined;
      return;
    }

    room.players.delete(client.id);
    if (this.waitingClientId === client.id) this.waitingClientId = undefined;
    client.roomCode = undefined;
    client.color = undefined;

    const remaining = Array.from(room.players.values());
    if (notifyOpponent) {
      remaining.forEach((player) => this.send(player, { type: 'opponent-left' }));
    }
    remaining.forEach((player) => {
      player.roomCode = undefined;
      player.color = undefined;
    });
    this.rooms.delete(room.code);
  }

  private addClientToRoom(client: ClientState, room: RoomState, color: PlayerColor) {
    client.roomCode = room.code;
    client.color = color;
    room.players.set(client.id, client);
  }

  private roomJoinedPayload(room: RoomState, client: ClientState, opponent: boolean, initiator: boolean) {
    return {
      type: 'room-joined',
      roomCode: room.code,
      color: client.color,
      opponent: opponent ? { id: this.getOpponent(client)?.id } : undefined,
      initiator,
      fen: room.game.fen(),
      moves: [],
    };
  }

  private createRoom(code = generateRoomCode(this.rooms)): RoomState {
    const room: RoomState = {
      code,
      game: new Chess(),
      players: new Map(),
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  private getRoom(code?: string) {
    return code ? this.rooms.get(code) : undefined;
  }

  private getOpponent(client: ClientState) {
    const room = this.getRoom(client.roomCode);
    if (!room) return undefined;
    return Array.from(room.players.values()).find((player) => player.id !== client.id);
  }

  private findWaitingClient(excludeClientId: string) {
    if (!this.waitingClientId || this.waitingClientId === excludeClientId) return undefined;
    return Array.from(this.clients.values()).find((candidate) => candidate.id === this.waitingClientId && candidate.ws.readyState === WebSocket.OPEN);
  }

  private broadcast(room: RoomState, payload: unknown) {
    room.players.forEach((player) => this.send(player, payload));
  }

  private send(client: ClientState, payload: unknown) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(payload));
    }
  }
}

function normalizeRoomCode(roomCode?: string) {
  return roomCode?.toUpperCase().replace(ROOM_CODE_RE, '').slice(0, 8);
}

function generateRoomCode(existingRooms: Map<string, RoomState>) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  while (true) {
    const code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    if (!existingRooms.has(code)) return code;
  }
}

function nextAvailableColor(room: RoomState): PlayerColor {
  const colors = new Set(Array.from(room.players.values()).map((player) => player.color));
  return colors.has('white') ? 'black' : 'white';
}

function stringifyError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

void START_FEN;
