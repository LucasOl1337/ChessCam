/**
 * Chess Engine Wrapper
 * Thin wrapper around chess.js providing a clean API
 */

import { Chess } from 'chess.js';
import type { Square } from './types';

export class ChessEngine {
  private game: Chess;

  constructor(fen?: string) {
    this.game = fen ? new Chess(fen) : new Chess();
  }

  /**
   * Get current FEN string
   */
  getFen(): string {
    return this.game.fen();
  }

  /**
   * Get current turn ('w' or 'b')
   */
  getTurn(): 'w' | 'b' {
    return this.game.turn();
  }

  /**
   * Get all legal moves for a square (or all legal moves if no square provided)
   */
  getLegalMoves(square?: Square): string[] {
    const moves = square
      ? this.game.moves({ square, verbose: true })
      : this.game.moves({ verbose: true });

    return moves.map(m => m.to);
  }

  /**
   * Attempt to make a move
   */
  makeMove(from: Square, to: Square, promotion?: 'q' | 'r' | 'b' | 'n'): any {
    try {
      const result = this.game.move({
        from,
        to,
        promotion: promotion || 'q', // Default to queen
      });
      return result;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if game is in check
   */
  isCheck(): boolean {
    return this.game.isCheck();
  }

  /**
   * Check if game is checkmate
   */
  isCheckmate(): boolean {
    return this.game.isCheckmate();
  }

  /**
   * Check if game is stalemate
   */
  isStalemate(): boolean {
    return this.game.isStalemate();
  }

  /**
   * Check if game is draw
   */
  isDraw(): boolean {
    return this.game.isDraw();
  }

  /**
   * Get game over status
   */
  isGameOver(): boolean {
    return this.game.isGameOver();
  }

  /**
   * Get move history
   */
  getHistory(): any[] {
    return this.game.history({ verbose: true });
  }

  /**
   * Undo last move
   */
  undo(): any {
    return this.game.undo();
  }

  /**
   * Reset to starting position
   */
  reset(): void {
    this.game.reset();
  }

  /**
   * Load a position from FEN
   */
  load(fen: string): boolean {
    try {
      this.game.load(fen);
      return true;
    } catch {
      return false;
    }
  }
}

// Export a singleton instance for local play
export const localGame = new ChessEngine();