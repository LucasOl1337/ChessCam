import React from 'react';
import type { Move as ChessMove } from 'chess.js';
import { ChessEngine } from './chess/chessEngine';
import { Camera, Check, Copy, LogOut, Radio, Users, Video, VideoOff, RotateCw } from 'lucide-react';
import { ChessBoard } from './components/ChessBoard';
import { GamePanel } from './components/GamePanel';
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
  // History navigation for analysis (chess.com style review/scrub) - local primary
  const [historyIndex, setHistoryIndex] = React.useState<number | null>(null); // null = live position
  const [boardFlipped, setBoardFlipped] = React.useState(false); // local flip (chess.com style)
  // analysisArrows removed - will be re-added with Stockfish integration
  const [analysisResult, setAnalysisResult] = React.useState<null | { bestMove: string; eval: number }>(null);
  const [_screen, _setScreen] = React.useState<'landing' | 'game'>('game');
  const [screen, setScreen] = React.useState<'landing' | 'game'>('landing');
  const [gameMode, setGameMode] = React.useState<'local' | 'online'>('local');
  // drawOffer etc now used in JSX actions
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
  // For history scrub (local): compute FEN at selected index
  const localViewFen = !isOnlineMode && historyIndex !== null 
    ? getFenForHistoryIndex(historyIndex, moves) 
    : undefined;
  const yourColor = online.color ?? 'white';
  const opponentColor: PlayerColor = yourColor === 'white' ? 'black' : 'white';
  const isPrivateInvite = Boolean(roomFromUrl());

  React.useEffect(() => {
    setOnline((prev) => ({ ...prev, roomCode }));
    return () => cleanupRealtime();
    }, [roomCode]);


  // Keyboard shortcuts (chess.com inspired)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
      if (isOnlineMode && !gameResult) return; // conservative for online

      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'z') {
        // prev or undo
        if (!isOnlineMode) {
          const cur = historyIndex ?? moves.length - 1;
          jumpToHistory(Math.max(0, cur - 1));
          e.preventDefault();
        }
      }
      if (e.key === 'ArrowRight') {
        if (!isOnlineMode) {
          const cur = historyIndex ?? -1;
          jumpToHistory(Math.min(moves.length - 1, cur + 1));
          e.preventDefault();
        }
      }
      if (e.key.toLowerCase() === 'f') {
        setBoardFlipped(fl => !fl);
        e.preventDefault();
      }
      if (e.key.toLowerCase() === 'r' && !gameResult) {
        handleResign();
        e.preventDefault();
      }
      if ((e.key.toLowerCase() === 'd' || e.key === '?') && !gameResult) {
        offerDraw();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyIndex, moves.length, isOnlineMode, gameResult, boardFlipped]);

  // Local chess clock ticking - completely disabled in online mode (server is authoritative)
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
    setHistoryIndex(null); // new move returns to live
  };

  const resetMatchState = () => {
    setMoves([]);
    setGameResult(null);
    setHistoryIndex(null);
    resetClocks();
  };

  // Compute FEN by replaying moves up to index (for history scrub)
  function getFenForHistoryIndex(idx: number | null, moveList: MoveRecord[]): string | undefined {
    if (idx === null || !moveList || moveList.length === 0) return undefined;
    const eng = new ChessEngine();
    const toReplay = Math.min(idx + 1, moveList.length);
    for (let i = 0; i < toReplay; i++) {
      const m = moveList[i];
      if (m && 'from' in m && 'to' in m) {
        try {
          eng.makeMove(m.from as any, m.to as any, (m.promotion as any) || 'q');
        } catch {}
      } else if (m && 'san' in m && typeof m.san === 'string') {
        // Fallback: try san (less reliable without full context)
        try { (eng as any).game.move(m.san); } catch {}
      }
    }
    return eng.getFen();
  }

  function jumpToHistory(idx: number | null) {
    if (isOnlineMode) return; // view only for now, or disable
    setHistoryIndex(idx);
    // The board will receive updated externalFen via computed
  }

  // resumeToLive removed
  async function copyCurrentFEN() {
    const fen = isOnlineMode ? (onlineFen || '') : (localViewFen || (new ChessEngine().getFen()));
    if (!fen) return;
    await navigator.clipboard.writeText(fen);
    // simple feedback
    const orig = document.title;
    document.title = "FEN copied!";
    setTimeout(() => document.title = orig, 1200);
  }

  async function copyPGN() {
    // Build PGN by replaying moves (works for local; online approximate)
    const list = isOnlineMode ? onlineMoves : moves;
    if (!list.length) return;
    const eng = new ChessEngine();
    const pgnMoves: string[] = [];
    list.forEach((m, _i) => {
      if (m && 'from' in m && 'to' in m) {
        try {
          const moveObj = eng.makeMove(m.from as any, m.to as any, (m.promotion as any) || 'q');
          if (moveObj && moveObj.san) pgnMoves.push(moveObj.san);
        } catch {}
      }
    });
    const pgn = pgnMoves.length ? pgnMoves.join(' ') : '';
    if (pgn) {
      await navigator.clipboard.writeText(pgn);
      const orig = document.title;
      document.title = "PGN copied!";
      setTimeout(() => document.title = orig, 1200);
    }
  }



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
      case 'draw-offer': {
        setDrawOffer('received');
        break;
      }
      case 'draw-accepted':
      case 'draw-declined': {
        setDrawOffer(null);
        if (message.type === 'draw-accepted') {
          setGameResult('Draw by agreement.');
          playChessSound('gameover');
        }
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
    if (gameResult) return;
    if (!isOnlineMode || !online.opponentConnected) {
      // Local or no opponent: treat as draw by agreement
      setGameResult('Draw by agreement.');
      playChessSound('gameover');
      setDrawOffer(null);
      return;
    }
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


  
  function handleResign() {
    if (gameResult) return;
    if (isOnlineMode && online.opponentConnected) {
      sendRealtime({ type: 'resign' });
    } else {
      setGameResult('You resigned.');
      playChessSound('gameover');
    }
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

  const analyzePosition = React.useCallback(async () => {
    try {
      const { analysisEngine } = await import('./chess/analysisEngine');
      const eng = new ChessEngine();
      const list = isOnlineMode ? onlineMoves : moves;
      list.forEach((m: any) => {
        if (m && 'from' in m && 'to' in m) {
          try { eng.makeMove(m.from, m.to, m.promotion || 'q'); } catch {}
        }
      });
      const result = await analysisEngine.analyze(eng.getFen());
      setAnalysisResult(result);
    } catch {
      setAnalysisResult({ bestMove: '?', eval: 0 });
    }
  }, [moves, onlineMoves, isOnlineMode]);

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
            externalFen={isOnlineMode ? onlineFen : localViewFen}
            playerColor={isOnlineMode ? yourColor : (boardFlipped ? 'black' : undefined)}
            onMoveRequest={isOnlineMode ? handleOnlineMove : undefined}
            disabled={isOnlineMode && (!online.opponentConnected || onlineMovePending) || (!isOnlineMode && historyIndex !== null)}
          />
          <PlayerStrip name="You" label={isOnlineMode ? yourColor : 'white'} tone="light" timeLeft={isOnlineMode ? (yourColor === 'white' ? whiteTime : blackTime) : (yourColor === 'white' ? whiteTime : blackTime)} />
        </section>

          <GamePanel isOnlineMode={isOnlineMode} />
          <GamePanel isOnlineMode={isOnlineMode} />
        </main>
      </div>
    );
  }
}

function formatTime(seconds: number, inc = 0): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  let s = `${mins}:${secs.toString().padStart(2, '0')}`;
  if (inc > 0) s += ` (+${inc}s)`;
  return s;
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
  if (!move) return "";
  if ("san" in move && typeof move.san === "string") return move.san;
  if ("lastMove" in move && typeof move.lastMove === "string") return move.lastMove;
  return "";
}

function MovesList({ moves, onJumpTo, isLocal, currentIndex }: { moves: MoveRecord[]; onJumpTo?: (idx: number | null) => void; isLocal?: boolean; currentIndex?: number | null }) {
  if (moves.length === 0) return <div className="empty-moves">No moves yet</div>;

  const handleJump = (moveIdx: number) => {
    if (onJumpTo && isLocal) onJumpTo(moveIdx);
  };

  return (
    <div className="moves-table">
      {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, row) => {
        const white = moves[row * 2];
        const black = moves[row * 2 + 1];
        const whiteIdx = row * 2;
        const blackIdx = row * 2 + 1;
        return (
          <div className="move-row" key={row}>
            <span className="move-index">{row + 1}</span>
            <span 
              className={isLocal && onJumpTo ? "clickable-move" : ""}
              onClick={() => handleJump(whiteIdx)}
              title={isLocal ? "Click to view this position" : ""}
            >
              {moveText(white)}
            </span>
            <span 
              className={isLocal && onJumpTo && black ? "clickable-move" : ""}
              onClick={() => black && handleJump(blackIdx)}
              title={isLocal ? "Click to view this position" : ""}
            >
              {moveText(black)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default App;
