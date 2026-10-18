import { Component, OnDestroy, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { SubscriptionStatus, UserProfile } from '../../core/models';

/**
 * Glassmorphic right-side profile drawer. Slides in when a user taps a name or
 * avatar in the chat header, showing their connection state, email, assigned
 * subscription tier badge, and a summary card — plus a manual premium upgrade
 * action for the signed-in user.
 */
@Component({
  selector: 'app-profile-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open() && user()) {
      <!-- Backdrop -->
      <div class="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300" (click)="closed.emit()"></div>
    }

    <aside
      class="fixed right-0 top-0 z-50 flex h-full w-[340px] max-w-[85vw] transform flex-col border-l border-white/40 bg-white/80 shadow-pane backdrop-blur-2xl transition-transform duration-300"
      [class.translate-x-full]="!open() || !user()"
      [class.pointer-events-none]="!open() || !user()"
      [attr.aria-hidden]="!open() || !user()"
      [attr.inert]="!open() || !user() ? '' : null"
    >
      @if (user()) {
        <header class="flex items-center justify-between border-b border-white/40 px-5 py-4">
          <h2 class="text-sm font-bold uppercase tracking-wide text-messenger-muted">Profile</h2>
          <button type="button" class="text-messenger-muted transition hover:text-messenger-ink" (click)="closed.emit()" aria-label="Close">✕</button>
        </header>

        <div class="flex-1 space-y-5 overflow-y-auto px-5 py-6">
          <div class="flex flex-col items-center text-center">
            <div class="relative">
              <div class="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white shadow-lg" [style.background]="user()!.avatarColor">
                {{ initials(user()!.displayName) }}
              </div>
              <span class="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white" [class.bg-emerald-500]="user()!.online" [class.bg-gray-300]="!user()!.online"></span>
            </div>
            <h3 class="mt-3 text-lg font-bold text-messenger-ink">{{ user()!.displayName }}</h3>
            <p class="text-sm text-messenger-muted">&#64;{{ user()!.username }}</p>
            <span class="mt-2 flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold text-messenger-muted shadow-sm">
              <span class="h-1.5 w-1.5 rounded-full" [class.bg-emerald-500]="user()!.online" [class.bg-gray-400]="!user()!.online"></span>
              {{ user()!.online ? 'Active now' : 'Offline' }}
            </span>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 shadow-sm">
              <span class="text-xs font-medium text-messenger-muted">Email</span>
              <span class="truncate text-sm font-medium text-messenger-ink">{{ user()!.email }}</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-white/70 px-4 py-3 shadow-sm">
              <span class="text-xs font-medium text-messenger-muted">Member since</span>
              <span class="text-sm font-medium text-messenger-ink">{{ user()!.createdAt | date: 'MMM yyyy' }}</span>
            </div>
          </div>

          <div class="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-pane">
            <p class="text-[11px] uppercase tracking-wide text-white/60">Subscription tier</p>
            <div class="mt-1 flex items-center gap-2">
              <span class="text-xl">{{ isMe() && subscription()?.premium ? '⭐' : '🔓' }}</span>
              <span class="text-base font-bold">
                {{ isMe() ? (subscription()?.premium ? 'Paid Family' : 'Free Personal') : 'Not shared' }}
              </span>
            </div>
            @if (!subscription()?.premium && isMe()) {
              @if (upgradeError()) {
                <p class="mt-3 text-xs text-rose-200" role="alert">{{ upgradeError() }}</p>
              }
              <button
                type="button"
                class="mt-3 w-full rounded-full bg-gradient-to-r from-messenger-blue to-indigo-600 py-2.5 text-xs font-bold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] disabled:opacity-60"
                [disabled]="processing()"
                (click)="upgrade()"
              >
                {{ processing() ? 'Processing…' : '✨ Upgrade to Premium' }}
              </button>
            }
          </div>

          <div class="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-messenger-muted">About</h4>
            @if (isMe()) {
              <textarea
                class="w-full resize-none rounded-xl border border-gray-200 bg-white/80 p-3 text-sm leading-relaxed text-messenger-ink outline-none focus:ring-2 focus:ring-messenger-blue"
                rows="3"
                maxlength="240"
                aria-label="Personal summary"
                [(ngModel)]="summary"
              ></textarea>
              <p class="mt-1 text-right text-[10px] text-messenger-muted">{{ summary.length }}/240</p>
            } @else {
              <p class="text-sm leading-relaxed text-messenger-ink">
                {{ user()!.displayName.split(' ')[0] }} is {{ user()!.online ? 'online and ready to chat' : 'currently offline' }}.
                Send a message or lock a time-capsule to reach them.
              </p>
            }
          </div>
        </div>
      }
    </aside>
  `
})
export class ProfileDrawerComponent implements OnDestroy {
  /** Whether the drawer is visible. */
  readonly open = input<boolean>(false);
  /** The user whose profile is shown. */
  readonly user = input<UserProfile | null>(null);
  readonly closed = output<void>();

  private readonly auth = inject(AuthService);
  private readonly chat = inject(ChatService);
  private subscriptionRef?: Subscription;

  readonly processing = signal(false);
  readonly upgradeError = signal('');
  readonly subscription = signal<SubscriptionStatus | null>(null);
  summary = 'Here to connect, share ideas, and make good things happen.';

  constructor() {
    this.subscriptionRef = this.chat.subscription$.subscribe((status) => this.subscription.set(status));
  }

  ngOnDestroy(): void {
    this.subscriptionRef?.unsubscribe();
  }

  isMe(): boolean {
    return this.user()?.id === this.auth.currentUser()?.id;
  }

  upgrade(): void {
    this.upgradeError.set('');
    this.processing.set(true);
    this.chat.upgrade().subscribe({
      next: () => this.processing.set(false),
      error: (error: unknown) => {
        this.processing.set(false);
        this.upgradeError.set(error instanceof Error ? error.message : 'Unable to complete the upgrade. Please try again.');
        console.error('Unable to upgrade subscription from profile drawer.', error);
      }
    });
  }

  initials(name: string): string {
    return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
}
