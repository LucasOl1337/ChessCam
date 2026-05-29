/**
 * ChessBoard - Tabuleiro de xadrez completo e jogável
 * Usa chess.js para validação total das regras
 */

import React from 'react';
import { ChessEngine } from '../chess/chessEngine';

interface ChessBoardProps {
  onGameOver?: (result: string) => void;
  onMove?: (move: any) => void;
  // Controlled mode props (for multiplayer)
  externalFen?: string;                    // When provided, board displays this FEN (parent controls state)
  playerColor?: 'white' | 'black';         // Restrict moves to this color only
  onMoveRequest?: (from: string, to: string, promotion?: string) => void; // Called instead of applying locally
  disabled?: boolean;                      // Disable all interaction
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export const ChessBoard: React.FC<ChessBoardProps> = ({
  onGameOver,
  onMove,
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

  // Sync external FEN when in controlled (multiplayer) mode
  React.useEffect(() => {
    if (externalFen && externalFen !== fen) {
      const loaded = engine.load(externalFen);
      if (loaded) {
        setFen(externalFen);
        // Clear selection when position updates from server
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    }
  }, [externalFen]);

  // Derive current display FEN
  const currentFen = externalFen || fen;
  const pieces = React.useMemo(() => parseFen(currentFen), [currentFen]);

  // In controlled mode we trust the engine state after load; turn/check/gameOver come from engine
  const turn = engine.getTurn();
  const isCheck = engine.isCheck();
  const isGameOver = engine.isGameOver();

  // Determine if this is a controlled (multiplayer) game
  const isControlled = !!onMoveRequest;

  // In controlled mode, only allow interaction on player's turn and for their color
  const isMyTurn = !playerColor || (playerColor === 'white' && turn === 'w') || (playerColor === 'black' && turn === 'b');

  function parseFen(fenString: string): Record<string, string> {
    const result: Record<string, string> = {};
    const boardPart = fenString.split(' ')[0];
    const rows = boardPart.split('/');

    rows.forEach((row, rankIndex) => {
      let fileIndex = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          fileIndex += parseInt(char);
        } else {
          const square = `${FILES[fileIndex]}${RANKS[rankIndex]}`;
          result[square] = char;
          fileIndex++;
        }
      }
    });
    return result;
  }

  const pieceSymbols: Record<string, string> = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
  };

  // Premium piece styling
  const getPieceStyle = (piece: string) => {
    const isWhite = piece === piece.toUpperCase();
    return {
      fontSize: '78px',
      lineHeight: 1,
      filter: isWhite
        ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.5)) drop-shadow(0 2px 3px rgba(0,0,0,0.4))'
        : 'drop-shadow(0 4px 8px rgba(0,0,0,0.7)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
      textShadow: isWhite
        ? '0 2px 4px rgba(0,0,0,0.6), 0 0 1px rgba(255,255,255,0.3)'
        : '0 3px 6px rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.9)',
    };
  };

  const handleSquareClick = (square: string) => {
    if (isGameOver || disabled) return;

    // In controlled (multiplayer) mode, block clicks if not your turn
    if (isControlled && !isMyTurn) return;

    const piece = pieces[square];
    const isWhitePiece = piece && piece === piece.toUpperCase();

    // Determine if the piece belongs to the current player
    const isCurrentPlayerPiece =
      (turn === 'w' && isWhitePiece) ||
      (turn === 'b' && piece && !isWhitePiece);

    // In controlled mode, also ensure the piece belongs to the assigned player color
    const isMyPiece = !playerColor ||
      (playerColor === 'white' && isWhitePiece) ||
      (playerColor === 'black' && piece && !isWhitePiece);

    // Se não tem peça selecionada
    if (selectedSquare === null) {
      // Só pode selecionar peça do turno atual E (em modo controlado) que seja do jogador
      if (isCurrentPlayerPiece && isMyPiece) {
        const moves = engine.getLegalMoves(square as any);
        setSelectedSquare(square);
        setLegalMoves(moves);
      }
      return;
    }

    // Já tem peça selecionada
    if (selectedSquare === square) {
      // Deselecionar
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // Tentar fazer o movimento
    if (isControlled && onMoveRequest) {
      // MULTIPLAYER MODE: pedir para o servidor validar e aplicar
      // Primeiro checamos client-side se é legal (melhor UX)
      const legalTargets = engine.getLegalMoves(selectedSquare as any);
      if (legalTargets.includes(square)) {
        setLastMove({ from: selectedSquare, to: square });
        onMoveRequest(selectedSquare, square);
        setSelectedSquare(null);
        setLegalMoves([]);
      } else {
        // Movimento ilegal — tentar mudar seleção
        if (isCurrentPlayerPiece && isMyPiece) {
          const moves = engine.getLegalMoves(square as any);
          setSelectedSquare(square);
          setLegalMoves(moves);
        } else {
          setSelectedSquare(null);
          setLegalMoves([]);
        }
      }
      return;
    }

    // LOCAL MODE (comportamento original)
    const moveResult = engine.makeMove(
      selectedSquare as any,
      square as any
    );

    if (moveResult) {
      const newFen = engine.getFen();
      setFen(newFen);
      setLastMove({ from: selectedSquare, to: square });
      setSelectedSquare(null);
      setLegalMoves([]);

      onMove?.(moveResult);

      // Verificar fim de jogo
      if (engine.isGameOver()) {
        let result = '';
        if (engine.isCheckmate()) {
          result = `Xeque-mate! ${turn === 'w' ? 'Pretas' : 'Brancas'} vencem!`;
        } else if (engine.isStalemate()) {
          result = 'Empate por afogamento!';
        } else if (engine.isDraw()) {
          result = 'Empate!';
        }
        onGameOver?.(result);
      }
    } else {
      // Movimento inválido - tentar selecionar outra peça do mesmo jogador
      const newPiece = pieces[square];
      const newIsWhite = newPiece && newPiece === newPiece.toUpperCase();
      const isValidNewSelection =
        (turn === 'w' && newIsWhite) ||
        (turn === 'b' && newPiece && !isWhitePiece);

      if (isValidNewSelection) {
        const moves = engine.getLegalMoves(square as any);
        setSelectedSquare(square);
        setLegalMoves(moves);
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    }
  };

  const resetGame = () => {
    engine.reset();
    setFen(engine.getFen());
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
  };

  const undoMove = () => {
    engine.undo();
    setFen(engine.getFen());
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
  };

  const isLightSquare = (fileIndex: number, rankIndex: number): boolean => {
    return (fileIndex + rankIndex) % 2 === 0;
  };

  const getSquareClass = (square: string, fileIndex: number, rankIndex: number) => {
    const light = isLightSquare(fileIndex, rankIndex);
    const isSelected = selectedSquare === square;
    const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
    const isLegalTarget = legalMoves.includes(square);

    // Richer wood colors with subtle variation
    const lightColor = light ? '#f0d9b5' : '#b58863';
    const darkColor = light ? '#d4b48c' : '#8b5a2b';

    let classes = `
      flex items-center justify-center cursor-pointer
      transition-all duration-75 select-none relative
      ${light ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'}
      hover:brightness-[0.97]
    `;

    // Elegant selection (golden glow)
    if (isSelected) {
      classes += ' ring-[6px] ring-[#f4c95f] ring-inset z-20 scale-[1.015] shadow-inner';
    }
    // Last move highlight (soft elegant blue)
    else if (isLastMoveSquare) {
      classes += ' ring-[3px] ring-[#5b9bd5] ring-inset z-10';
    }
    // Legal move targets
    else if (isLegalTarget) {
      classes += ' hover:brightness-[0.92]';
    }

    // Check highlight on king (prominent but clean red)
    if (isCheck && pieces[square]?.toLowerCase() === 'k') {
      const kingColor = pieces[square] === 'K' ? 'w' : 'b';
      if (kingColor === turn) {
        classes += ' ring-[5px] ring-[#e11d48] ring-inset z-30 animate-pulse';
      }
    }

    return classes;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Status */}
      <div className="flex items-center gap-4 text-lg font-medium">
        <div className={`px-4 py-1.5 rounded-full flex items-center gap-2 ${
          isGameOver
            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
            : turn === 'w'
              ? 'bg-white/10 text-white border border-white/30'
              : 'bg-zinc-900 text-white border border-white/20'
        }`}>
          {isGameOver ? (
            <span>Fim de jogo</span>
          ) : (
            <>
              <span>Turno:</span>
              <span className="font-bold">{turn === 'w' ? 'Brancas ♔' : 'Pretas ♚'}</span>
              {isCheck && <span className="text-red-400 font-bold ml-2">XEQUE!</span>}
              {playerColor && (
                <span className="ml-3 text-xs px-2 py-0.5 rounded bg-white/10 border border-white/20">
                  Você: {playerColor === 'white' ? 'Brancas ♔' : 'Pretas ♚'}
                </span>
              )}
            </>
          )}
        </div>

        {/* Local mode only controls */}
        {!isControlled && (
          <>
            <button
              onClick={undoMove}
              disabled={engine.getHistory().length === 0}
              className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 rounded-lg border border-white/10 transition-colors"
            >
              Desfazer
            </button>

            <button
              onClick={resetGame}
              className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-white/10 transition-colors"
            >
              Novo Jogo
            </button>
          </>
        )}

        {isControlled && !isMyTurn && !isGameOver && (
          <span className="text-sm text-white/50">Aguardando seu turno...</span>
        )}
      </div>

      {/* Premium wooden chess board */}
      <div className="inline-block p-4 bg-[#3d2b1f] rounded-2xl shadow-[0_25px_50px_-12px_rgb(0,0,0,0.6)] border border-[#2a1f16]">
        <div className="grid grid-cols-8 w-[520px] h-[520px] border-[8px] border-[#2a1f16] rounded-xl overflow-hidden shadow-inner bg-[#b58863]">
          {RANKS.map((rank, rankIndex) =>
            FILES.map((file, fileIndex) => {
              const square = `${file}${rank}`;
              const piece = pieces[square];
              const isLegal = legalMoves.includes(square);
              const isLight = isLightSquare(fileIndex, rankIndex);

              return (
                <div
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  className={getSquareClass(square, fileIndex, rankIndex)}
                  style={{
                    backgroundColor: isLight ? '#f0d9b5' : '#b58863',
                  }}
                >
                  {/* Chess piece with premium styling */}
                  {piece && (
                    <span
                      className={piece === piece.toUpperCase() ? 'text-[#f8f1e3]' : 'text-[#2c1810]'}
                      style={getPieceStyle(piece)}
                    >
                      {pieceSymbols[piece]}
                    </span>
                  )}

                  {/* Elegant legal move indicators */}
                  {isLegal && !piece && (
                    <div className="absolute w-4 h-4 bg-black/30 rounded-full shadow-inner" />
                  )}
                  {isLegal && piece && (
                    <div className="absolute inset-[3px] ring-[3.5px] ring-black/35 ring-inset rounded" />
                  )}

                  {/* Subtle coordinate labels (bottom-left of each square) */}
                  {(rankIndex === 7 && fileIndex === 0) || (fileIndex === 7 && rankIndex === 0) ? (
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-mono text-black/30 select-none">
                      {file}{rank}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legenda elegante */}
      <div className="text-[11px] text-zinc-400 flex gap-5 items-center tracking-wide">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-[#f4c95f] rounded-sm ring-1 ring-[#f4c95f]/50"></div>
          <span>Selecionada</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-black/40 rounded-full"></div>
          <span>Movimento legal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-[#5b9bd5] rounded-sm"></div>
          <span>Último lance</span>
        </div>
      </div>
    </div>
  );
};