import { Component, OnInit, input, output, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { inject } from '@angular/core';
import { ChatService } from '../../core/services/chat.service';

/**
 * Modal for spawning a multi-user group chat. The user types a group title and
 * selects one or more recipients; on submit it fires {@code POST /api/conversations}
 * with {@code { title, userIds }} and opens the new room.
 */
@Component({
  selector: 'app-create-group-modal',
  standalone: true,
  imports: [AsyncPipe, FormsModule],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="closed.emit()"></div>
        <div class="rise-in relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-pane">
          <header class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 class="text-base font-bold text-messenger-ink">New Group Chat</h2>
            <button type="button" class="text-messenger-muted hover:text-messenger-ink" (click)="closed.emit()" aria-label="Close">✕</button>
          </header>

          <div class="space-y-4 px-5 py-4">
            @if (errorMessage()) {
              <p class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{{ errorMessage() }}</p>
            }
            <div>
              <label class="mb-1 block text-xs font-semibold text-messenger-muted">Group title</label>
              <input
                class="w-full rounded-xl border border-gray-200 bg-messenger-wash px-3 py-2.5 text-sm outline-none ring-messenger-blue focus:bg-white focus:ring-2"
                placeholder="e.g. Weekend Trip 🏝️"
                [(ngModel)]="title"
                name="title"
              />
            </div>

            <div>
              <label class="mb-1 block text-xs font-semibold text-messenger-muted">Add at least 2 members ({{ selected().size }})</label>
              <div class="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-1">
                @for (person of people$ | async; track person.id) {
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition"
                    [class.bg-blue-50]="selected().has(person.id)"
                    [class.hover:bg-gray-50]="!selected().has(person.id)"
                    (click)="toggle(person.id)"
                  >
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" [style.background]="person.avatarColor">
                      {{ person.displayName.slice(0, 1) }}
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-messenger-ink">{{ person.displayName }}</span>
                      <span class="block truncate text-xs text-messenger-muted">{{ person.online ? 'Active now' : '@' + person.username }}</span>
                    </span>
                    <span
                      class="flex h-5 w-5 items-center justify-center rounded-full border text-[11px]"
                      [class.bg-messenger-blue]="selected().has(person.id)"
                      [class.border-messenger-blue]="selected().has(person.id)"
                      [class.text-white]="selected().has(person.id)"
                      [class.border-gray-300]="!selected().has(person.id)"
                    >
                      {{ selected().has(person.id) ? '✓' : '' }}
                    </span>
                  </button>
                }
              </div>
            </div>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <button type="button" class="rounded-full px-4 py-2 text-sm font-medium text-messenger-muted hover:bg-gray-50" (click)="closed.emit()">Cancel</button>
            <button
              type="button"
              class="rounded-full bg-messenger-blue px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-messenger-blue-dark disabled:opacity-40"
              [disabled]="!canCreate() || processing()"
              (click)="create()"
            >
              {{ processing() ? 'Creating…' : 'Create Group' }}
            </button>
          </footer>
        </div>
      </div>
    }
  `
})
export class CreateGroupModalComponent implements OnInit {
  readonly open = input<boolean>(false);
  /** Emitted after a successful creation so the parent can close the modal. */
  readonly created = output<number>();
  readonly closed = output<void>();

  private readonly chat = inject(ChatService);

  title = '';
  readonly selected = signal<Set<number>>(new Set());
  readonly processing = signal(false);
  readonly errorMessage = signal('');
  readonly people$ = this.chat.people$;

  ngOnInit(): void {
    this.chat.searchPeople('').subscribe();
  }

  toggle(userId: number): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  canCreate(): boolean {
    return this.title.trim().length > 0 && this.selected().size >= 2;
  }

  create(): void {
    if (!this.canCreate()) {
      return;
    }
    this.errorMessage.set('');
    this.processing.set(true);
    this.chat.createGroup(this.title.trim(), [...this.selected()]).subscribe({
      next: (conversation) => {
        this.processing.set(false);
        this.title = '';
        this.selected.set(new Set());
        this.created.emit(conversation.id);
      },
      error: (error: unknown) => {
        this.processing.set(false);
        this.errorMessage.set(error instanceof Error ? error.message : 'Unable to create the group. Please try again.');
      }
    });
  }
}
