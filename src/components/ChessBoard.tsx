import React from 'react';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { RotateCcw, StepBack } from 'lucide-react';
import type { Move as ChessMove, Square } from 'chess.js';
import { ChessEngine, type PromotionPiece } from '../chess/chessEngine';

const PIECE_SYMBOLS: Record<PromotionPiece, { w: string; b: string }> = {
  q: { w: '♕', b: '♛' },
  r: { w: '♖', b: '♜' },
  b: { w: '♗', b: '♝' },
  n: { w: '♘', b: '♞' },
};

interface ChessBoardProps {
  onGameOver?: (result: string) => void;
  onMove?: (move: ChessMove) => void;
  onReset?: () => void;
  externalFen?: string;
  playerColor?: 'white' | 'black';
  onMoveRequest?: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  disabled?: boolean;
  arrows?: Array<{ from: string; to: string; color?: string }>; // for analysis arrows (chess.com style)
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export const ChessBoard: React.FC<ChessBoardProps> = ({
  onGameOver,
  onMove,
  onReset,
  externalFen,
  playerColor,
  onMoveRequest,
  disabled = false,
  arrows = [],
}) => {
  const [engine] = React.useState(() => new ChessEngine());
  const [fen, setFen] = React.useState(() => externalFen || engine.getFen());
  const [selectedSquare, setSelectedSquare] = React.useState<string | null>(null);
  const [legalMoves, setLegalMoves] = React.useState<string[]>([]);
  const [lastMove, setLastMove] = React.useState<{ from: string; to: string } | null>(null);
  const [pendingPromotion, setPendingPromotion] = React.useState<null | { from: string; to: string; options: PromotionPiece[]; fen: string }>(null);

  const currentFen = externalFen || fen;
  const activeEngine = React.useMemo(() => (externalFen ? new ChessEngine(externalFen) : engine), [engine, externalFen]);
  const pieces = React.useMemo(() => parseFen(currentFen), [currentFen]);
  const turn = activeEngine.getTurn();
  const isCheck = activeEngine.isCheck();
  const isGameOver = activeEngine.isGameOver();
  const isControlled = Boolean(onMoveRequest);
  const activePendingPromotion = pendingPromotion && pendingPromotion.fen === currentFen && !isGameOver ? pendingPromotion : null;
  const isMyTurn = !playerColor || (playerColor === 'white' && turn === 'w') || (playerColor === 'black' && turn === 'b');


  function parseFen(fenString: string): Record<string, string> {
    const result: Record<string, string> = {};
    const rows = fenString.split(' ')[0].split('/');

    rows.forEach((row, rankIndex) => {
      let fileIndex = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          fileIndex += Number(char);
        } else {
          result[`${FILES[fileIndex]}${RANKS[rankIndex]}`] = char;
          fileIndex += 1;
        }
      }
    });

    return result;
  }

  function clearSelection() {
    setSelectedSquare(null);
    setLegalMoves([]);
  }

  function ownsTurnPiece(square: string) {
    const piece = pieces[square];
    if (!piece) return false;

    const isWhitePiece = piece === piece.toUpperCase();
    const belongsToTurn = (turn === 'w' && isWhitePiece) || (turn === 'b' && !isWhitePiece);
    const belongsToPlayer = !playerColor || (playerColor === 'white' ? isWhitePiece : !isWhitePiece);

    return belongsToTurn && belongsToPlayer;
  }

  function selectSquare(square: string) {
    if (!ownsTurnPiece(square)) return false;
    setSelectedSquare(square);
    setLegalMoves(activeEngine.getLegalMoves(square as Square));
    return true;
  }

  function applyMove(from: string, to: string, promotion: PromotionPiece = 'q') {
    if (disabled || isGameOver || (isControlled && !isMyTurn)) return false;
    if (!activeEngine.getLegalMoves(from as Square).includes(to)) return false;

    if (isControlled && onMoveRequest) {
      setLastMove({ from, to });
      onMoveRequest(from as Square, to as Square, promotion);
      clearSelection();
      return true;
    }

    const move = engine.makeMove(from as Square, to as Square, promotion);
    if (!move) return false;

    setFen(engine.getFen());
    setLastMove({ from, to });
    clearSelection();
    onMove?.(move);

    if (engine.isGameOver()) {
      if (engine.isCheckmate()) {
        onGameOver?.(`Checkmate. ${turn === 'w' ? 'Black' : 'White'} wins.`);
      } else if (engine.isStalemate()) {
        onGameOver?.('Draw by stalemate.');
      } else if (engine.isDraw()) {
        onGameOver?.('Draw.');
      }
    }

    return true;
  }

  function handleMoveAttempt(from: string, to: string) {
    if (disabled || isGameOver || (isControlled && !isMyTurn)) return false;
    if (!activeEngine.getLegalMoves(from as Square).includes(to)) return false;

    // Check if this is a promoting move
    const engForProm = externalFen ? new ChessEngine(externalFen) : engine;
    const options = engForProm.getPromotionOptions(from as Square, to as Square);
    if (options.length > 0) {
      setPendingPromotion({ from, to, options, fen: currentFen });
      clearSelection();
      return false; // Do not apply yet; user must choose piece. (drag will snap back)
    }

    return applyMove(from, to);
  }

  function completePromotion(piece: PromotionPiece) {
    if (!activePendingPromotion) return;
    const { from, to } = activePendingPromotion;
    setPendingPromotion(null);
    applyMove(from, to, piece);
  }

  function cancelPromotion() {
    setPendingPromotion(null);
  }

  function handleSquareClick(square: string) {
    if (disabled || isGameOver || (isControlled && !isMyTurn)) return;

    if (selectedSquare) {
      handleMoveAttempt(selectedSquare, square);
      return;
    }
    if (selectedSquare === square) {
      clearSelection();
      return;
    }

    if (!selectSquare(square)) clearSelection();
  }

  function resetGame() {
    engine.reset();
    setFen(engine.getFen());
    setLastMove(null);
    setPendingPromotion(null);
    clearSelection();
    onReset?.();
  }

  function undoMove() {
    engine.undo();
    setFen(engine.getFen());
    setLastMove(null);
    setPendingPromotion(null);
    clearSelection();
  }

  const squareStyles = React.useMemo(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (lastMove) {
      styles[lastMove.from] = { background: 'rgba(246, 246, 105, 0.36)' };
      styles[lastMove.to] = { background: 'rgba(246, 246, 105, 0.46)' };
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
        background: 'rgba(255, 214, 79, 0.72)',
        boxShadow: 'inset 0 0 0 3px rgba(30, 30, 30, 0.20)',
      };
    }

    legalMoves.forEach((square) => {
      const occupied = Boolean(pieces[square]);
      styles[square] = {
        ...(styles[square] ?? {}),
        backgroundImage: occupied
          ? 'radial-gradient(transparent 0%, transparent 72%, rgba(40,40,40,.33) 73%, rgba(40,40,40,.33) 84%, transparent 85%)'
          : 'radial-gradient(circle, rgba(40,40,40,.32) 0 17%, transparent 18%)',
      };
    });

    return styles;
  }, [lastMove, legalMoves, pieces, selectedSquare]);

  const boardOptions: ChessboardOptions = {
    id: 'chesscam-board',
    position: currentFen,
    showNotation: true,
    boardOrientation: playerColor === 'black' ? 'black' : 'white',
    animationDurationInMs: 150,
    darkSquareStyle: { backgroundColor: '#779954' },
    lightSquareStyle: { backgroundColor: '#eeeed2' },
    squareStyles,
    boardStyle: {
      borderRadius: 4,
      boxShadow: '0 14px 28px rgba(0,0,0,.34)',
    },
    draggingPieceStyle: {
      filter: 'drop-shadow(0 10px 12px rgba(0,0,0,.35))',
    },
    allowDragging: !disabled && !isGameOver && (!isControlled || isMyTurn) && !activePendingPromotion,
    canDragPiece: ({ square }) => Boolean(square && ownsTurnPiece(square) && !activePendingPromotion),
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;
      return handleMoveAttempt(sourceSquare, targetSquare);
    },
    onSquareClick: ({ square }) => handleSquareClick(square),
    onPieceClick: ({ square }) => {
      if (square) handleSquareClick(square);
    },
  };

  return (
    <div className="board-card">
      <div className="board-toolbar">
        <div className="turn-pill">
          <span className={`turn-dot ${turn === 'w' ? 'white' : 'black'}`} />
          {isGameOver ? 'Game over' : `${turn === 'w' ? 'White' : 'Black'} to move`}
          {isCheck && !isGameOver ? <strong>Check</strong> : null}
        </div>
        {!isControlled ? (
          <div className="board-actions">
            <button className="board-icon-button" onClick={undoMove} disabled={engine.getHistory().length === 0} aria-label="Undo move">
              <StepBack size={17} />
            </button>
            <button className="board-icon-button" onClick={resetGame} aria-label="New game">
              <RotateCcw size={17} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="board-frame">
        <Chessboard options={boardOptions} />
          
          {/* Analysis arrows overlay (chess.com style) */}
          {arrows.length > 0 && (
            <svg 
              className="analysis-arrows" 
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
              viewBox="0 0 100 100" 
              preserveAspectRatio="none"
            >
              {arrows.map((arrow, i) => {
                const fromFile = 'abcdefgh'.indexOf(arrow.from[0]);
                const fromRank = 8 - parseInt(arrow.from[1]);
                const toFile = 'abcdefgh'.indexOf(arrow.to[0]);
                const toRank = 8 - parseInt(arrow.to[1]);
                
                const x1 = (fromFile + 0.5) * (100/8);
                const y1 = (fromRank + 0.5) * (100/8);
                const x2 = (toFile + 0.5) * (100/8);
                const y2 = (toRank + 0.5) * (100/8);
                
                const color = arrow.color || '#4a90e2';
                
                return (
                  <g key={i}>
                    <defs>
                      <marker id={`arrowhead-${i}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill={color} />
                      </marker>
                    </defs>
                    <line 
                      x1={x1} y1={y1} x2={x2} y2={y2} 
                      stroke={color} 
                      strokeWidth="2" 
                      strokeOpacity="0.85"
                      markerEnd={`url(#arrowhead-${i})`}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {activePendingPromotion && (
          <div className="promotion-overlay">
            <div className="promotion-dialog" role="dialog" aria-label="Choose promotion piece">
              <div className="promotion-title">Promote to</div>
              <div className="promotion-choices">
                {activePendingPromotion.options
                  .slice()
                  .sort((a, b) => 'qrbn'.indexOf(a) - 'qrbn'.indexOf(b))
                  .map((p) => {
                    const isWhiteTurn = turn === 'w';
                    const sym = PIECE_SYMBOLS[p][isWhiteTurn ? 'w' : 'b'];
                    return (
                      <button
                        key={p}
                        type="button"
                        className="promotion-choice"
                        onClick={() => completePromotion(p)}
                        aria-label={`Promote to ${p === 'q' ? 'queen' : p === 'r' ? 'rook' : p === 'b' ? 'bishop' : 'knight'}`}
                      >
                        {sym}
                      </button>
                    );
                  })}
              </div>
              <button type="button" className="promotion-cancel" onClick={cancelPromotion}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
