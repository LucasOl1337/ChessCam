import { Chess } from 'chess.js';
import { askChessAgent, compactPrivateMemory, type AgentGlobalMessage } from '../../src/agent/agentGateway';
import { AGENT_MODEL_PROFILES, getAgentModelProfile } from '../../src/agent/models';

export interface Env {
  ASSETS: Fetcher;
  CHESSCAM_HUB: DurableObjectNamespace<ChessCamHub>;
  NINE_ROUTER_API_KEY: string;
  NINE_ROUTER_BASE_URL: string;
}

type PlayerColor = 'white' | 'black';

type TimeControl = {
  minutes?: number;
  increment?: number;
};

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

const START_FEN = new Chess().fen();
const ROOM_CODE_RE = /[^A-Z0-9]/g;
const AGENT_MINUTE_LIMIT = 40;
const AGENT_HOUR_LIMIT = 360;

type AgentRateWindow = {
  minuteStartedAt: number;
  minuteCount: number;
  hourStartedAt: number;
  hourCount: number;
};

type AgentMoveBody = {
  fen?: unknown;
  profileId?: unknown;
  color?: unknown;
  ply?: unknown;
  history?: unknown;
  privateMemory?: unknown;
  globalChat?: unknown;
};

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

    if (url.pathname === '/api/agent-models') {
      return Response.json({
        ok: true,
        profiles: AGENT_MODEL_PROFILES.map(({ id, label, route, available, note }) => ({ id, label, route, available, note })),
      });
    }

    if (url.pathname === '/api/agent-move') {
      const id = env.CHESSCAM_HUB.idFromName('agent-arena-v3');
      const headers = new Headers(request.headers);
      headers.set('X-ChessCam-Agent-Move', '1');
      headers.set('X-ChessCam-Origin-Host', url.hostname);
      return env.CHESSCAM_HUB.get(id).fetch(new Request(request, { headers }));
    }

    return env.ASSETS.fetch(request);
  },
};

export class ChessCamHub implements DurableObject {
  private clients = new Map<WebSocket, ClientState>();
  private rooms = new Map<string, RoomState>();
  private agentRateWindows = new Map<string, AgentRateWindow>();
  private waitingClientId?: string;

  constructor(private state: DurableObjectState, private env: Env) {
    void this.state;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/agent-move' || request.headers.get('X-ChessCam-Agent-Move') === '1') {
      return this.handleAgentMoveRequest(request);
    }

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

  private async handleAgentMoveRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, error: 'Método não permitido.' }, { status: 405 });
    }

    const origin = request.headers.get('Origin');
    const expectedHost = request.headers.get('X-ChessCam-Origin-Host') || new URL(request.url).hostname;
    if (origin && new URL(origin).hostname !== expectedHost) {
      return Response.json({ ok: false, error: 'Origem não permitida.' }, { status: 403 });
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 16_384) {
      return Response.json({ ok: false, error: 'Requisição muito grande.' }, { status: 413 });
    }

    const clientKey = request.headers.get('CF-Connecting-IP') || 'unknown';
    const retryAfter = this.consumeAgentRateLimit(clientKey);
    if (retryAfter > 0) {
      return Response.json(
        { ok: false, error: 'Muitas jogadas em sequência. Aguarde um instante.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    let body: AgentMoveBody;
    try {
      body = await request.json() as AgentMoveBody;
    } catch {
      return Response.json({ ok: false, error: 'JSON inválido.' }, { status: 400 });
    }

    const fen = typeof body.fen === 'string' ? body.fen.trim() : '';
    const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : '';
    const color = body.color === 'black' ? 'black' : body.color === 'white' ? 'white' : '';
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
          return [{
            color: candidate.color,
            ply: Math.max(1, Math.min(300, Number(candidate.ply) || 1)),
            message: candidate.message.replace(/[\r\n\t]+/g, ' ').slice(0, 180),
          }];
        })
      : [];
    const profile = getAgentModelProfile(profileId);

    if (!profile || !profile.available) {
      return Response.json({ ok: false, error: 'Modelo indisponível no 9Router da VM.' }, { status: 409 });
    }
    if (!fen || fen.length > 120 || !color) {
      return Response.json({ ok: false, error: 'Posição ou cor inválida.' }, { status: 400 });
    }

    let game: Chess;
    try {
      game = new Chess(fen);
    } catch {
      return Response.json({ ok: false, error: 'FEN inválido.' }, { status: 400 });
    }

    const expectedColor = game.turn() === 'w' ? 'white' : 'black';
    if (color !== expectedColor || game.isGameOver()) {
      return Response.json({ ok: false, error: 'A posição não está pronta para este agente.' }, { status: 409 });
    }

    const legalMoves = game.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion ?? ''}`);
    if (!legalMoves.length) {
      return Response.json({ ok: false, error: 'Não há lances legais.' }, { status: 409 });
    }

    const startedAt = Date.now();
    try {
      const turn = await askChessAgent(
        {
          baseUrl: this.env.NINE_ROUTER_BASE_URL,
          apiKey: this.env.NINE_ROUTER_API_KEY,
          route: profile.route,
          timeoutMs: 60_000,
        },
        { color, fen, legalMoves, history, ply, privateMemory, globalChat },
      );

      return Response.json({
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
      console.error('agent-move failed', stringifyError(error));
      if (isTransientAgentError(error)) {
        return Response.json(
          {
            ok: false,
            error: 'O modelo demorou além do limite. A partida foi pausada e salva para você continuar sem aceitar lances automáticos.',
            code: 'AGENT_TEMPORARILY_UNAVAILABLE',
            retryable: true,
          },
          { status: 503, headers: { 'Retry-After': '5' } },
        );
      }
      return Response.json(
        { ok: false, error: 'O agente não respondeu com um lance legal a tempo. Tente novamente.' },
        { status: 502 },
      );
    }
  }

  private consumeAgentRateLimit(clientKey: string) {
    const now = Date.now();
    const current = this.agentRateWindows.get(clientKey) ?? {
      minuteStartedAt: now,
      minuteCount: 0,
      hourStartedAt: now,
      hourCount: 0,
    };
    if (now - current.minuteStartedAt >= 60_000) {
      current.minuteStartedAt = now;
      current.minuteCount = 0;
    }
    if (now - current.hourStartedAt >= 3_600_000) {
      current.hourStartedAt = now;
      current.hourCount = 0;
    }
    if (current.minuteCount >= AGENT_MINUTE_LIMIT) {
      return Math.max(1, Math.ceil((60_000 - (now - current.minuteStartedAt)) / 1000));
    }
    if (current.hourCount >= AGENT_HOUR_LIMIT) {
      return Math.max(1, Math.ceil((3_600_000 - (now - current.hourStartedAt)) / 1000));
    }
    current.minuteCount += 1;
    current.hourCount += 1;
    this.agentRateWindows.set(clientKey, current);
    return 0;
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
        this.quickMatch(client, message.timeControl);
        break;
      case 'join-room':
        this.joinRoom(client, normalizeRoomCode(message.roomCode) || generateRoomCode(this.rooms), message.timeControl);
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
      case 'rematch':
        this.handleRematch(client);
        break;
      case 'resign':
        this.handleResign(client);
        break;
      case 'offer-draw':
        this.handleOfferDraw(client);
        break;
      case 'accept-draw':
        this.handleAcceptDraw(client);
        break;
      case 'decline-draw':
        this.handleDeclineDraw(client);
        break;
      default:
        this.send(client, { type: 'error', message: `Unknown message type: ${message.type}` });
    }
  }

  private quickMatch(client: ClientState, timeControl?: TimeControl) {
    this.leaveRoom(client, false);

    const waiting = this.findWaitingClient(client.id);
    if (waiting) {
      this.waitingClientId = undefined;
      const room = this.getRoom(waiting.roomCode) ?? this.createRoom(undefined, timeControl);
      if (!waiting.roomCode) this.addClientToRoom(waiting, room, 'white');
      this.addClientToRoom(client, room, 'black');
      this.send(client, this.roomJoinedPayload(room, client, true, false));
      this.send(waiting, { type: 'opponent-connected', roomCode: room.code, opponent: { id: client.id }, initiator: true, fen: room.game.fen() });
      return;
    }

    const room = this.createRoom(undefined, timeControl);
    this.addClientToRoom(client, room, 'white');
    this.waitingClientId = client.id;
    this.send(client, this.roomJoinedPayload(room, client, false, false));
  }

  private joinRoom(client: ClientState, roomCode: string, timeControl?: TimeControl) {
    this.leaveRoom(client, false);

    const room = this.rooms.get(roomCode) ?? this.createRoom(roomCode, timeControl);
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
      // Real elapsed time + increment (chess.com style)
      const now = Date.now();
      const elapsed = Math.floor((now - room.lastMoveTimestamp) / 1000);
      const inc = room.increment || 0;

      if (player.color === 'white') {
        room.whiteTime = Math.max(0, room.whiteTime - elapsed) + inc;
      } else {
        room.blackTime = Math.max(0, room.blackTime - elapsed) + inc;
      }
      room.lastMoveTimestamp = now;

      // Basic server-side timeout
      if (room.whiteTime <= 0) {
        this.broadcast(room, { type: 'game-over', reason: 'time', winner: 'black' });
        return;
      }
      if (room.blackTime <= 0) {
        this.broadcast(room, { type: 'game-over', reason: 'time', winner: 'white' });
        return;
      }

      this.broadcast(room, { type: 'move-made', move, fen, lastMove: `${from}-${to}`, whiteTime: room.whiteTime, blackTime: room.blackTime });

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


  private handleRematch(client: ClientState) {
    const room = this.getRoom(client.roomCode);
    if (!room) return;

    room.game.reset();
    room.lastMoveTimestamp = Date.now();

    const payload = {
      type: 'rematch',
      fen: room.game.fen(),
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
    };

    this.broadcast(room, payload);
  }

  private handleResign(client: ClientState) {
    const room = this.getRoom(client.roomCode);
    if (!room) return this.send(client, { type: 'error', message: 'Room not found.' });
    const player = room.players.get(client.id);
    if (!player?.color) return this.send(client, { type: 'error', message: 'You are not seated in this room.' });
    const winner = player.color === 'white' ? 'black' : 'white';
    this.broadcast(room, { type: 'game-over', reason: 'resignation', winner });
  }

  private handleOfferDraw(client: ClientState) {
    const room = this.getRoom(client.roomCode);
    if (!room) return;
    const opponent = this.getOpponent(client);
    if (opponent) {
      this.send(opponent, { type: 'draw-offer' });
    }
  }

  private handleAcceptDraw(client: ClientState) {
    const room = this.getRoom(client.roomCode);
    if (!room) return;
    const opponent = this.getOpponent(client);
    if (opponent) this.send(opponent, { type: 'draw-accepted' });
    this.broadcast(room, { type: 'game-over', reason: 'draw' });
  }

  private handleDeclineDraw(client: ClientState) {
    const room = this.getRoom(client.roomCode);
    if (!room) return;
    const opponent = this.getOpponent(client);
    if (opponent) this.send(opponent, { type: 'draw-declined' });
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

  private createRoom(code = generateRoomCode(this.rooms), timeControl?: TimeControl): RoomState {
    const { initialTime, increment } = normalizeTimeControl(timeControl);
    const room: RoomState = {
      code,
      game: new Chess(),
      players: new Map(),
      createdAt: Date.now(),
      whiteTime: initialTime,
      blackTime: initialTime,
      increment,
      lastMoveTimestamp: Date.now(),
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

function normalizeTimeControl(timeControl?: TimeControl) {
  const minutes = Math.max(0, timeControl?.minutes ?? 5);
  return {
    initialTime: minutes > 0 ? minutes * 60 : 24 * 60 * 60,
    increment: Math.max(0, timeControl?.increment ?? 0),
  };
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

function isTransientAgentError(error: unknown) {
  const message = stringifyError(error);
  return !/não configurado|HTTP (?:400|401|403|404)/i.test(message);
}

void START_FEN;
