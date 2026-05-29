import React from 'react';
import { Chessboard, type ChessboardOptions } from 'react-chessboard';
import { RotateCcw, StepBack } from 'lucide-react';
import type { Move as ChessMove, Square } from 'chess.js';
import { ChessEngine } from '../chess/chessEngine';

type PromotionPiece = 'q' | 'r' | 'b' | 'n';

interface ChessBoardProps {
  onGameOver?: (result: string) => void;
  onMove?: (move: ChessMove) => void;
  onReset?: () => void;
  externalFen?: string;
  playerColor?: 'white' | 'black';
  onMoveRequest?: (from: Square, to: Square, promotion?: PromotionPiece) => void;
  disabled?: boolean;
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
}) => {
  const [engine] = React.useState(() => new ChessEngine());
  const [fen, setFen] = React.useState(() => externalFen || engine.getFen());
  const [selectedSquare, setSelectedSquare] = React.useState<string | null>(null);
  const [legalMoves, setLegalMoves] = React.useState<string[]>([]);
  const [lastMove, setLastMove] = React.useState<{ from: string; to: string } | null>(null);

  const currentFen = externalFen || fen;
  const activeEngine = React.useMemo(() => (externalFen ? new ChessEngine(externalFen) : engine), [engine, externalFen]);
  const pieces = React.useMemo(() => parseFen(currentFen), [currentFen]);
  const turn = activeEngine.getTurn();
  const isCheck = activeEngine.isCheck();
  const isGameOver = activeEngine.isGameOver();
  const isControlled = Boolean(onMoveRequest);
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

  function applyMove(from: string, to: string) {
    if (disabled || isGameOver || (isControlled && !isMyTurn)) return false;
    if (!activeEngine.getLegalMoves(from as Square).includes(to)) return false;

    if (isControlled && onMoveRequest) {
      setLastMove({ from, to });
      onMoveRequest(from as Square, to as Square, 'q');
      clearSelection();
      return true;
    }

    const move = engine.makeMove(from as Square, to as Square, 'q');
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

  function handleSquareClick(square: string) {
    if (disabled || isGameOver || (isControlled && !isMyTurn)) return;

    if (selectedSquare && applyMove(selectedSquare, square)) return;
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
    clearSelection();
    onReset?.();
  }

  function undoMove() {
    engine.undo();
    setFen(engine.getFen());
    setLastMove(null);
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
    allowDragging: !disabled && !isGameOver && (!isControlled || isMyTurn),
    canDragPiece: ({ square }) => Boolean(square && ownsTurnPiece(square)),
    onPieceDrop: ({ sourceSquare, targetSquare }) => {
      if (!targetSquare) return false;
      return applyMove(sourceSquare, targetSquare);
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
      </div>
    </div>
  );
};
