import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatService } from '../../../core/services/chat.service';
import { GameStateEvent } from '../../../core/models';

type Cell = 'X' | 'O' | null;
type Difficulty = 'easy' | 'hard';

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

@Component({
  selector: 'app-arcade-widget',
  standalone: true,
  template: `
    <div class="rise-in">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base">🕹️</span>
          <h3 class="text-sm font-semibold text-messenger-ink">Tic-Tac-Toe</h3>
        </div>
        <button
          type="button"
          class="rounded-full px-3 py-1 text-[11px] font-semibold transition-all duration-300"
          [class.bg-emerald-500]="multiplayer()"
          [class.text-white]="multiplayer()"
          [class.bg-messenger-wash]="!multiplayer()"
          [class.text-messenger-muted]="!multiplayer()"
          (click)="toggleMultiplayer()"
        >
          {{ multiplayer() ? 'Friend in Chat' : 'Vs Computer' }}
        </button>
      </div>

      @if (multiplayer()) {
        <p class="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
          Live match synced to this conversation. You are {{ myMark() ?? 'joining…' }}.
        </p>
      } @else {
        <div class="mb-3 flex justify-end gap-1">
          <button type="button" class="rounded-full px-3 py-1 text-xs" [class.bg-blue-50]="difficulty() === 'easy'" (click)="setDifficulty('easy')">Easy</button>
          <button type="button" class="rounded-full px-3 py-1 text-xs" [class.bg-blue-50]="difficulty() === 'hard'" (click)="setDifficulty('hard')">Unbeatable</button>
        </div>
      }

      <div class="mx-auto grid max-w-[240px] grid-cols-3 gap-2">
        @for (cell of board(); track $index) {
          <button
            type="button"
            class="flex aspect-square items-center justify-center rounded-2xl border text-3xl font-bold transition-all duration-300"
            [class.bg-white]="!cell"
            [class.border-gray-200]="!cell"
            [class.hover:bg-blue-50]="!cell && isMyTurn && !gameOver"
            [class.bg-blue-50]="cell === 'X'"
            [class.border-blue-200]="cell === 'X'"
            [class.text-messenger-blue]="cell === 'X'"
            [class.bg-rose-50]="cell === 'O'"
            [class.border-rose-200]="cell === 'O'"
            [class.text-rose-500]="cell === 'O'"
            [class.ring-2]="winLine()?.includes($index)"
            [class.ring-emerald-400]="winLine()?.includes($index)"
            [disabled]="!isMyTurn || gameOver || !!cell"
            (click)="play($index)"
          >{{ cell }}</button>
        }
      </div>

      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs font-medium text-messenger-muted">
          @if (winner() === 'X') { X wins! 🎉 }
          @else if (winner() === 'O') { O wins! 🎉 }
          @else if (winner() === 'draw') { It's a draw 🤝 }
          @else if (multiplayer()) { {{ isMyTurn ? 'Your turn' : 'Waiting for opponent…' }} }
          @else if (thinking()) { AI is thinking… }
          @else { Your turn }
        </p>
        <button
          type="button"
          class="rounded-full bg-messenger-blue px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-300 hover:bg-messenger-blue-dark"
          (click)="reset()"
        >New game</button>
      </div>
    </div>
  `
})
export class ArcadeWidgetComponent implements OnInit, OnDestroy {
  private readonly chat = inject(ChatService);
  private gameSub?: Subscription;
  private activeConversationSub?: Subscription;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;

  readonly board = signal<Cell[]>(Array<Cell>(9).fill(null));
  readonly xIsNext = signal(true);
  readonly winner = signal<Cell | 'draw' | null>(null);
  readonly winLine = signal<number[] | null>(null);
  readonly difficulty = signal<Difficulty>('hard');
  readonly thinking = signal(false);
  readonly multiplayer = signal(false);
  readonly myMark = signal<Cell>(null);
  readonly playerXId = signal<number | null>(null);
  readonly playerOId = signal<number | null>(null);

  ngOnInit(): void {
    this.gameSub = this.chat.game$.subscribe((state) => this.applyServerState(state));
    this.activeConversationSub = this.chat.activeConversationId$.subscribe((conversationId) => {
      const state = conversationId === null ? null : this.chat.latestGameState(conversationId);
      if (state) this.applyServerState(state);
    });
  }

  ngOnDestroy(): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.gameSub?.unsubscribe();
    this.activeConversationSub?.unsubscribe();
  }

  get gameOver(): boolean {
    return this.winner() !== null;
  }

  get isMyTurn(): boolean {
    if (!this.multiplayer()) return this.xIsNext();
    const userId = this.chat.currentUserId();
    return userId !== null && (
      (this.myMark() === null && this.board().every((cell) => cell === null) && this.playerXId() === null) ||
      (this.myMark() === null && this.playerXId() !== null && this.playerXId() !== userId && this.playerOId() === null && !this.xIsNext()) ||
      (this.myMark() === 'X' && this.xIsNext()) ||
      (this.myMark() === 'O' && !this.xIsNext())
    );
  }

  setDifficulty(level: Difficulty): void {
    this.difficulty.set(level);
    this.reset();
  }

  toggleMultiplayer(): void {
    this.multiplayer.update((value) => !value);
    this.myMark.set(null);
    this.playerXId.set(null);
    this.playerOId.set(null);
    this.reset();
  }

  play(index: number): void {
    if (this.gameOver || this.board()[index] || !this.isMyTurn) return;

    if (this.multiplayer()) {
      const conversation = this.chat.activeConversation();
      const userId = this.chat.currentUserId();
      if (!conversation || userId === null) return;
      const move = { conversationId: conversation.id, row: Math.floor(index / 3), column: index % 3 };
      this.chat.sendGameMove(move);
      return;
    }

    if (!this.xIsNext()) return;
    this.place(index, 'X');
    const result = this.evaluate(this.board());
    if (result.winner) {
      this.finish(result.winner, result.line);
      return;
    }
    this.xIsNext.set(false);
    this.thinking.set(true);
    this.aiTimer = setTimeout(() => {
      const move = this.chooseMove();
      if (move >= 0) this.place(move, 'O');
      this.thinking.set(false);
      const after = this.evaluate(this.board());
      if (after.winner) this.finish(after.winner, after.line);
      else if (this.board().every((cell) => cell !== null)) this.finish('draw', null);
      else this.xIsNext.set(true);
    }, 420);
  }

  reset(): void {
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.board.set(Array<Cell>(9).fill(null));
    this.xIsNext.set(true);
    this.winner.set(null);
    this.winLine.set(null);
    this.thinking.set(false);
    if (this.multiplayer()) {
      this.myMark.set(null);
      this.playerXId.set(null);
      this.playerOId.set(null);
      const conversation = this.chat.activeConversation();
      if (conversation) {
        this.chat.sendGameMove({ conversationId: conversation.id, row: -1, column: -1 });
      }
    }
  }

  private applyServerState(state: GameStateEvent): void {
    if (state.conversationId !== this.chat.activeConversation()?.id) return;
    this.multiplayer.set(true);
    this.board.set(state.board.flat().map((cell) => cell === 'X' || cell === 'O' ? cell : null));
    const userId = this.chat.currentUserId();
    this.myMark.set(state.playerXId === userId ? 'X' : state.playerOId === userId ? 'O' : null);
    this.playerXId.set(state.playerXId);
    this.playerOId.set(state.playerOId);
    this.xIsNext.set(state.xIsNext);
    if (state.winner === 'DRAW') {
      this.winner.set('draw');
      this.winLine.set(null);
    } else if (state.winner === 'X' || state.winner === 'O') {
      this.winner.set(state.winner);
      this.winLine.set(state.winLine?.length ? state.winLine : null);
    } else {
      this.winner.set(null);
      this.winLine.set(null);
    }
    this.thinking.set(false);
  }

  private place(index: number, mark: Cell): void {
    this.board.update((board) => {
      const next = [...board];
      next[index] = mark;
      return next;
    });
  }

  private finish(result: Cell | 'draw', line: number[] | null): void {
    this.winner.set(result);
    this.winLine.set(line);
  }

  private evaluate(board: Cell[]): { winner: Cell | null; line: number[] | null } {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line };
      }
    }
    return { winner: null, line: null };
  }

  private chooseMove(): number {
    const empty = this.board().map((cell, index) => cell === null ? index : -1).filter((index) => index >= 0);
    if (!empty.length) return -1;
    if (this.difficulty() === 'easy') return empty[Math.floor(Math.random() * empty.length)];
    return this.bestMove();
  }

  private bestMove(): number {
    let bestScore = -Infinity;
    let move = -1;
    for (let index = 0; index < 9; index++) {
      if (this.board()[index] !== null) continue;
      this.place(index, 'O');
      const score = this.minimax(this.board(), 0, false);
      this.board.update((board) => {
        const next = [...board];
        next[index] = null;
        return next;
      });
      if (score > bestScore) {
        bestScore = score;
        move = index;
      }
    }
    return move;
  }

  private minimax(board: Cell[], depth: number, maximizing: boolean): number {
    const { winner } = this.evaluate(board);
    if (winner === 'O') return 10 - depth;
    if (winner === 'X') return depth - 10;
    if (board.every((cell) => cell !== null)) return 0;
    let best = maximizing ? -Infinity : Infinity;
    for (let index = 0; index < 9; index++) {
      if (board[index] !== null) continue;
      board[index] = maximizing ? 'O' : 'X';
      const score = this.minimax(board, depth + 1, !maximizing);
      board[index] = null;
      best = maximizing ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
  }
}
