import React from 'react';
import type { Move as ChessMove } from 'chess.js';
import { Camera, Check, Copy, LogOut, Radio, Users, Video, VideoOff } from 'lucide-react';
import { ChessBoard } from './components/ChessBoard';
import { playChessSound } from './sound';


const wsEndpoint = () => {
  const configured = import.meta.env.VITE_CHESSCAM_WS_URL as string | undefined;
  if (configured) return configured;
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
};

const makeRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const roomFromUrl = () => {
  const room = new URLSearchParams(window.location.search).get('room');
  return room?.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase() || undefined;
};

type PlayerColor = 'white' | 'black';

type MoveRecord = ChessMove | { san?: string; lastMove?: string; [key: string]: unknown };

type RealtimeMessage = {
  type: string;
  id?: string;
  roomCode?: string;
  color?: PlayerColor;
  opponent?: { id?: string };
  initiator?: boolean;
  fen?: string;
  moves?: MoveRecord[];
  move?: MoveRecord;
  payload?: unknown;
  message?: string;
  reason?: string;
  winner?: PlayerColor;
  whiteTime?: number;
  blackTime?: number;
};

type OnlineState = {
  connected: boolean;
  searching: boolean;
  opponentConnected: boolean;
  roomCode: string;
  color?: PlayerColor;
  error?: string;
};

function App() {
  const [roomCode] = React.useState(() => roomFromUrl() ?? makeRoomCode());
  const [copied, setCopied] = React.useState(false);
  const [gameResult, setGameResult] = React.useState<string | null>(null);
  const [moves, setMoves] = React.useState<MoveRecord[]>([]);
  const [onlineMoves, setOnlineMoves] = React.useState<MoveRecord[]>([]);
  const [onlineFen, setOnlineFen] = React.useState<string | undefined>();
  const [onlineMovePending, setOnlineMovePending] = React.useState(false);
  const [online, setOnline] = React.useState<OnlineState>({
    connected: false,
    searching: false,
    opponentConnected: false,
    roomCode,
  });
  const [cameraEnabled, setCameraEnabled] = React.useState(false);
  const [drawOffer, setDrawOffer] = React.useState<null | 'pending' | 'received'>(null);
  // Referenced in room-card JSX buttons below
  void [drawOffer, offerDraw, acceptDraw, declineDraw];
  // Chess clocks (local mode for now - major gameplay upgrade)
  const [timeControl, setTimeControl] = React.useState({ minutes: 5, increment: 0 }); // 5+0 default
  const [whiteTime, setWhiteTime] = React.useState(5 * 60);
  const [blackTime, setBlackTime] = React.useState(5 * 60);
  const [activeColor, setActiveColor] = React.useState<'white' | 'black'>('white');
  const timerRef = React.useRef<number | null>(null);


  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const peerRef = React.useRef<RTCPeerConnection | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);

  const isOnlineMode = online.connected;
  const visibleMoves = onlineMoves.length ? onlineMoves : moves;
  const yourColor = online.color ?? 'white';
  const opponentColor: PlayerColor = yourColor === 'white' ? 'black' : 'white';
  const isPrivateInvite = Boolean(roomFromUrl());

  React.useEffect(() => {
    setOnline((prev) => ({ ...prev, roomCode }));
    return () => cleanupRealtime();
    }, [roomCode]);

  // Local chess clock ticking (core gameplay)
  React.useEffect(() => {
    if (isOnlineMode || gameResult) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (activeColor === 'white') setWhiteTime(t => Math.max(0, t-1));
      else setBlackTime(t => Math.max(0, t-1));
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [activeColor, isOnlineMode, gameResult]);

  // Time-out handling
  React.useEffect(() => {
    if (!isOnlineMode && (whiteTime === 0 || blackTime === 0) && !gameResult) {
      const winner = whiteTime === 0 ? 'black' : 'white';
      setGameResult(`Time out — ${winner[0].toUpperCase() + winner.slice(1)} wins.`);
      playChessSound('gameover');
    }
  }, [whiteTime, blackTime, isOnlineMode, gameResult]);

  function resetClocks() {
    const total = timeControl.minutes * 60;
    setWhiteTime(total);
    setBlackTime(total);
    setActiveColor('white');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Time control selector UI (added dynamically in JSX below)

  const copyRoom = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/?room=${online.roomCode || roomCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleMove = (move: MoveRecord) => {
    setMoves((prev) => [...prev, move]);
  };

  const resetMatchState = () => {
    setMoves([]);
    setGameResult(null);
    resetClocks();
  };

  async function startCameraMatch() {
    try {
      setGameResult(null);
      setOnlineMoves([]);
      setOnlineMovePending(false);
      setOnline((prev) => ({ ...prev, searching: true, error: undefined }));
      await ensureLocalMedia();
      const ws = await connectSocket();
      const urlRoom = roomFromUrl();
      ws.send(JSON.stringify(urlRoom
        ? { type: 'join-room', roomCode: urlRoom, timeControl }
        : { type: 'quick-match', timeControl }));
    } catch (error) {
      setOnline((prev) => ({
        ...prev,
        searching: false,
        error: error instanceof Error ? error.message : 'Could not start camera match.',
      }));
    }
  }

  async function ensureLocalMedia() {
    if (localStreamRef.current) return localStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' },
      audio: true,
    });

    localStreamRef.current = stream;
    setCameraEnabled(true);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  async function connectSocket() {
    if (wsRef.current?.readyState === WebSocket.OPEN) return wsRef.current;

    const ws = new WebSocket(wsEndpoint());
    wsRef.current = ws;

    ws.onopen = () => setOnline((prev) => ({ ...prev, connected: true, error: undefined }));
    ws.onclose = () => {
      setOnline((prev) => ({ ...prev, connected: false, searching: false, opponentConnected: false }));
      setOnlineMovePending(false);
    };
    ws.onerror = () => setOnline((prev) => ({ ...prev, error: 'Realtime connection failed.' }));
    ws.onmessage = async (event) => {
      const message = JSON.parse(event.data) as RealtimeMessage;
      await handleRealtimeMessage(message);
    };

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('Could not connect to ChessCam realtime.')), { once: true });
    });

    return ws;
  }

  async function ensurePeerConnection() {
    if (peerRef.current) return peerRef.current;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const stream = await ensureLocalMedia();
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) sendRealtime({ type: 'ice-candidate', payload: event.candidate });
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
        setOnline((prev) => ({ ...prev, error: 'Video connection dropped. Chess is still synced.' }));
      }
    };

    peerRef.current = peer;
    return peer;
  }

  async function handleRealtimeMessage(message: RealtimeMessage) {
    switch (message.type) {
      case 'connected': {
        break;
      }
      case 'room-joined': {
        if (message.fen) setOnlineFen(message.fen);
        if (typeof message.whiteTime === 'number') setWhiteTime(message.whiteTime);
        if (typeof message.blackTime === 'number') setBlackTime(message.blackTime);
        setOnlineMoves(Array.isArray(message.moves) ? message.moves : []);
        setOnline((prev) => ({
          ...prev,
          connected: true,
          searching: !message.opponent,
          opponentConnected: Boolean(message.opponent),
          roomCode: message.roomCode ?? prev.roomCode,
          color: message.color ?? prev.color,
          error: undefined,
        }));
        if (message.opponent && message.initiator) await createOffer();
        break;
      }
      case 'opponent-connected': {
        if (message.fen) setOnlineFen(message.fen);
        if (typeof message.whiteTime === 'number') setWhiteTime(message.whiteTime);
        if (typeof message.blackTime === 'number') setBlackTime(message.blackTime);
        setOnline((prev) => ({ ...prev, searching: false, opponentConnected: true, error: undefined }));
        if (message.initiator) await createOffer();
        break;
      }
      case 'move-made': {
        setOnlineMovePending(false);
        if (message.fen) setOnlineFen(message.fen);
        if (typeof message.whiteTime === 'number') setWhiteTime(message.whiteTime);
        if (typeof message.blackTime === 'number') setBlackTime(message.blackTime);
        const move = message.move;
        if (move) {
          setOnlineMoves((prev) => [...prev, move]);
          playChessSound('move');
        }
        break;
      }
      case 'game-over': {
        setOnlineMovePending(false);
        const winner = message.winner ? `${message.winner[0].toUpperCase()}${message.winner.slice(1)} wins.` : 'Draw.';
        setGameResult(`${message.reason ?? 'Game over'} — ${winner}`);
        break;
      }
      case 'webrtc-offer': {
        const peer = await ensurePeerConnection();
        await peer.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendRealtime({ type: 'webrtc-answer', payload: answer });
        break;
      }
      case 'webrtc-answer': {
        if (peerRef.current) await peerRef.current.setRemoteDescription(new RTCSessionDescription(message.payload as RTCSessionDescriptionInit));
        break;
      }
      case 'ice-candidate': {
        if (peerRef.current && message.payload) await peerRef.current.addIceCandidate(new RTCIceCandidate(message.payload as RTCIceCandidateInit));
        break;
      }
      case 'opponent-left': {
        peerRef.current?.close();
        peerRef.current = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        setOnlineMovePending(false);
        setOnline((prev) => ({ ...prev, opponentConnected: false, searching: false, error: 'Opponent disconnected. Start a new camera match.' }));
        break;
      }
      case 'error': {
        setOnlineMovePending(false);
        setOnline((prev) => ({ ...prev, error: message.message, searching: false }));
        break;
      }
      case 'rematch': {
        // Server reset the game - sync new state
        if (message.fen) setOnlineFen(message.fen);
        setOnlineMoves([]);
        setGameResult(null);
        setOnlineMovePending(false);
        if (typeof message.whiteTime === 'number') setWhiteTime(message.whiteTime);
        if (typeof message.blackTime === 'number') setBlackTime(message.blackTime);
        resetClocks(); // will be overridden by server values if provided
        break;
      }
    }
  }

  async function createOffer() {
    const peer = await ensurePeerConnection();
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendRealtime({ type: 'webrtc-offer', payload: offer });
  }

  function sendRealtime(message: unknown) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    setOnline((prev) => ({ ...prev, error: 'Realtime socket is not connected.' }));
    return false;
  }

  function handleOnlineMove(from: string, to: string, promotion = 'q') {
    setOnlineMovePending(true);
    const sent = sendRealtime({ type: 'make-move', move: { from, to, promotion } });
    if (!sent) setOnlineMovePending(false);
  }


  function offerDraw() {
    if (!online.opponentConnected || gameResult) return;
    sendRealtime({ type: 'offer-draw' });
    setDrawOffer('pending');
  }

  function acceptDraw() {
    sendRealtime({ type: 'accept-draw' });
    setDrawOffer(null);
  }

  function declineDraw() {
    sendRealtime({ type: 'decline-draw' });
    setDrawOffer(null);
  }


  function leaveCameraMatch() {
    sendRealtime({ type: 'leave' });
    cleanupRealtime();
    setOnline({ connected: false, searching: false, opponentConnected: false, roomCode });
    setOnlineFen(undefined);
    setOnlineMoves([]);
    setOnlineMovePending(false);
  }

  function cleanupRealtime() {
    wsRef.current?.close();
    wsRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setCameraEnabled(false);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Camera size={18} /></div>
          <div>
            <div className="brand-name">ChessCam</div>
            <div className="brand-subtitle">Play chess. Meet live.</div>
          </div>
        </div>
        <div className="topbar-status">
          <span className={`status-dot ${online.connected ? 'live' : ''}`} />
          {online.connected ? (online.opponentConnected ? 'Camera match live' : 'Searching camera match') : 'Local board online'}
        </div>
      </header>

      <main className="game-layout">
        <section className="board-column" aria-label="Chess board">
          <PlayerStrip
            name={online.opponentConnected ? 'Camera opponent' : 'Guest opponent'}
            label={isOnlineMode ? opponentColor : 'black'}
            tone="dark"
            timeLeft={isOnlineMode ? (yourColor === 'white' ? blackTime : whiteTime) : (yourColor === 'white' ? blackTime : whiteTime)}
          />
          <ChessBoard
            key={isOnlineMode ? `online-${online.roomCode}` : 'local'}
            onGameOver={setGameResult}
            onMove={isOnlineMode ? undefined : handleMove}
            onReset={resetMatchState}
            externalFen={isOnlineMode ? onlineFen : undefined}
            playerColor={isOnlineMode ? yourColor : undefined}
            onMoveRequest={isOnlineMode ? handleOnlineMove : undefined}
            disabled={isOnlineMode && (!online.opponentConnected || onlineMovePending)}
          />
          <PlayerStrip name="You" label={isOnlineMode ? yourColor : 'white'} tone="light" timeLeft={isOnlineMode ? (yourColor === 'white' ? whiteTime : blackTime) : (yourColor === 'white' ? whiteTime : blackTime)} />
        </section>

        <aside className="game-panel" aria-label="Game panel">
          <section className="panel-card room-card">
            <div className="panel-kicker"><Radio size={14} /> Camera room</div>
            <div className="room-code-row">
              <span className="room-code">{online.roomCode || roomCode}</span>
              <button className="icon-button" onClick={copyRoom} aria-label="Copy room link">
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <button className="match-button" onClick={startCameraMatch} disabled={online.searching || online.opponentConnected}>
              <Users size={17} /> {online.searching ? 'Finding opponent...' : isPrivateInvite ? 'Join private camera room' : 'Start camera match'}
            </button>
            {online.connected ? (
              <button className="leave-button" onClick={leaveCameraMatch}>
                <LogOut size={16} /> Leave match
              </button>
            ) : null}
            {online.error ? <div className="panel-error">{online.error}</div> : null}
          </section>

          <section className="panel-card time-control-card">
            <div className="panel-title">Time Control (local)</div>
            <div className="time-presets">
              {[{label:"5+0", minutes:5, increment:0},{label:"10+5", minutes:10, increment:5},{label:"15+10", minutes:15, increment:10},{label:"∞", minutes:0, increment:0}].map(tc => (
                <button
                  key={tc.label}
                  className={`time-preset-btn ${timeControl.minutes === tc.minutes && timeControl.increment === tc.increment ? 'active' : ''}`}
                  onClick={() => {
                    const newTC = { minutes: tc.minutes, increment: tc.increment };
                    setTimeControl(newTC);
                    const total = tc.minutes * 60;
                    setWhiteTime(total);
                    setBlackTime(total);
                    setActiveColor('white');
                  }}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </section>
          <section className="video-grid" aria-label="Camera previews">
            <div className="video-tile remote">
              <video ref={remoteVideoRef} autoPlay playsInline />
              {!online.opponentConnected ? <div className="video-empty"><VideoOff size={20} /> Waiting for stranger</div> : null}
            </div>
            <div className="video-tile local">
              <video ref={localVideoRef} autoPlay muted playsInline />
              {!cameraEnabled ? <div className="video-empty"><Video size={20} /> Camera off</div> : null}
            </div>
          </section>

          <section className="panel-card result-card">
            <div className="panel-title">Game</div>
            {gameResult ? (
              <div>
                <div className="result-banner">{gameResult}</div>
                {online.opponentConnected && (
                  <button
                    className="match-button"
                    style={{marginTop: '8px', background: '#4a7c59'}}
                    onClick={() => sendRealtime({ type: 'rematch' })}
                  >
                    Rematch
                  </button>
                )}
              </div>
            ) : (
              <div className="panel-muted">
                {isOnlineMode
                  ? online.opponentConnected
                    ? onlineMovePending
                      ? 'Move sent. Waiting for server validation.'
                      : 'Synced online match. Webcam is peer-to-peer; moves are server validated.'
                    : 'Camera is ready. Waiting for another player.'
                  : 'Local test board. Start a camera match to play a stranger online.'}
              </div>
            )}
          </section>

          <section className="panel-card move-card">
            <div className="panel-title">Moves</div>
            <MovesList moves={visibleMoves} />
          </section>
        </aside>
      </main>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function PlayerStrip({ name, label, tone, timeLeft }: { name: string; label: string; tone: 'light' | 'dark'; timeLeft?: number; }) {
  return (
    <div className={`player-strip ${tone}`}>
      <div className="player-avatar">{label[0].toUpperCase()}</div>
      <div className="player-meta">
        <div className="player-name">{name}</div>
        <div className="player-label">{label}</div>
      </div>
      <div className={`player-clock ${timeLeft !== undefined && timeLeft < 30 ? "low-time" : ""}`}>
        {timeLeft !== undefined ? formatTime(timeLeft) : "10:00"}
      </div>
    </div>
  );
}

function moveText(move?: MoveRecord) {
  if (!move) return '';
  if ('san' in move && typeof move.san === 'string') return move.san;
  if ('lastMove' in move && typeof move.lastMove === 'string') return move.lastMove;
  return '';
}

function MovesList({ moves }: { moves: MoveRecord[] }) {
  if (moves.length === 0) return <div className="empty-moves">No moves yet</div>;

  return (
    <div className="moves-table">
      {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, row) => {
        const white = moves[row * 2];
        const black = moves[row * 2 + 1];
        return (
          <div className="move-row" key={row}>
            <span className="move-index">{row + 1}</span>
            <span>{moveText(white)}</span>
            <span>{moveText(black)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default App;
