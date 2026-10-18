import { Component, computed, effect, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ChatMessage, ReactionSummary } from '../core/models';
import { ReactionBarComponent } from '../shared/reaction-bar.component';
import { CountdownTimerComponent } from '../shared/countdown-timer.component';
import { resolveMediaUrl } from './media-url';

/**
 * A single chat bubble. Renders one of four payloads:
 * <ul>
 *   <li><b>Sealed capsule</b> — padlock + blurred placeholder + live countdown.</li>
 *   <li><b>Photo</b> — image with rounded corners and an optional caption.</li>
 *   <li><b>Video</b> — inline &lt;video&gt; player with an optional caption.</li>
 *   <li><b>Text</b> — classic bubble (default).</li>
 * </ul>
 * A {@link ReactionBarComponent} sits underneath with optimistic Signals so a
 * tap updates the tally instantly while the server broadcast catches up.
 */
@Component({
  selector: 'app-chat-bubble',
  standalone: true,
  imports: [DatePipe, ReactionBarComponent, CountdownTimerComponent],
  template: `
    <div class="flex" [class.justify-end]="mine()">
      <div class="max-w-[75%]">
        @if (showSender()) {
          <p class="mb-1 pl-1 text-[11px] font-medium text-messenger-muted">{{ message().senderName }}</p>
        }

        <div
          class="overflow-hidden rounded-2xl text-sm shadow-sm"
          [class.bg-messenger-blue]="mine() && !isMediaOnly()"
          [class.text-white]="mine() && !isMediaOnly()"
          [class.rounded-br-md]="mine()"
          [class.bg-white]="!mine()"
          [class.rounded-bl-md]="!mine()"
          [class.px-4]="!isMediaOnly()"
          [class.py-2.5]="!isMediaOnly()"
        >
          @switch (message().messageType) {
            @case ('CAPSULE') {
              @if (sealed()) {
                <!-- Locked time-capsule placeholder -->
                <div class="w-64 select-none p-1">
                  <div class="relative flex h-32 flex-col items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300">
                    <span class="text-3xl">🔒</span>
                    <p class="text-xs font-semibold uppercase tracking-wide text-slate-600">Time Capsule</p>
                    <div class="pointer-events-none absolute inset-0 backdrop-blur-md"></div>
                  </div>
                  <div class="flex items-center justify-between px-1 pt-2 pb-1 text-xs">
                    <span class="text-messenger-muted">Unlocks in</span>
                    <app-countdown-timer
                      [target]="message().unlockAt"
                      (unlocked)="reveal()"
                    />
                  </div>
                </div>
              } @else {
                <div class="px-1 py-1">
                  <div class="rounded-xl bg-amber-50 px-3 py-2">
                    <p class="whitespace-pre-wrap break-words leading-relaxed">{{ message().content }}</p>
                  </div>
                  <p class="px-1 pt-1 text-[11px] text-messenger-muted">🎁 Capsule unlocked</p>
                </div>
              }
            }
            @case ('PHOTO') {
              <img
                [src]="mediaSrc()"
                alt="Shared photo"
                class="max-h-72 w-full rounded-xl object-cover transition-all duration-300"
                loading="lazy"
              />
              @if (message().content) {
                <p class="px-3 pt-2 pb-1 leading-relaxed">{{ message().content }}</p>
              }
            }
            @case ('VIDEO') {
              <video
                [src]="mediaSrc()"
                controls
                class="max-h-72 w-full rounded-xl bg-black"
              ></video>
              @if (message().content) {
                <p class="px-3 pt-2 pb-1 leading-relaxed">{{ message().content }}</p>
              }
            }
            @default {
              <p class="whitespace-pre-wrap break-words leading-relaxed">{{ message().content }}</p>
            }
          }
        </div>

        <app-reaction-bar
          class="block"
          [reactions]="localReactions()"
          [align]="mine() ? 'right' : 'left'"
          (toggled)="onToggleReaction($event)"
        />

        <p class="mt-1 px-1 text-[10px] text-messenger-muted" [class.text-right]="mine()">
          {{ message().createdAt | date: 'shortTime' }}
        </p>
      </div>
    </div>
  `
})
export class ChatBubbleComponent {
  readonly message = input.required<ChatMessage>();
  /** True when the current user authored the message. */
  readonly mine = input<boolean>(false);
  /** Show the sender name above the bubble (group chats, incoming only). */
  readonly showSender = input<boolean>(false);
  /** Emits the emoji the viewer tapped. */
  readonly react = output<string>();
  /** Emits when a sealed capsule's countdown hits zero (parent should refresh). */
  readonly unlocked = output<ChatMessage>();

  /** Local, optimistic mirror of the reaction tallies. */
  readonly localReactions = signal<ReactionSummary[]>([]);

  readonly sealed = computed(() => this.message().sealed);

  /** True for PHOTO/VIDEO so the bubble omits text-bubble padding/background. */
  readonly isMediaOnly = computed(() => {
    const type = this.message().messageType;
    return type === 'PHOTO' || type === 'VIDEO';
  });

  /**
   * Absolute URL for the media asset. The backend stores relative keys like
   * {@code /api/media/{id}}; when the SPA is served from a different origin we
   * must prefix the backend host or the <img>/<video> request 404s.
   */
  readonly mediaSrc = computed(() => resolveMediaUrl(this.message().mediaUrl));

  constructor() {
    // Re-sync local tallies from the authoritative server payload whenever it
    // changes (e.g. a broadcast from another participant). allowSignalWrites is
    // required because we write to localReactions from within the effect.
    effect(() => {
      this.localReactions.set(this.message().reactions ?? []);
    }, { allowSignalWrites: true });
  }

  onToggleReaction(reactionType: string): void {
    // Optimistic increment/decrement for instant UI feedback.
    this.applyOptimistic(reactionType);
    this.react.emit(reactionType);
  }

  reveal(): void {
    this.unlocked.emit(this.message());
  }

  private applyOptimistic(reactionType: string): void {
    const current = this.localReactions();
    const index = current.findIndex((r) => r.reactionType === reactionType);
    if (index >= 0) {
      const existing = current[index];
      const nextCount = existing.reactedByMe ? existing.count - 1 : existing.count + 1;
      const next = [...current];
      if (nextCount <= 0) {
        next.splice(index, 1);
      } else {
        next[index] = { ...existing, count: nextCount, reactedByMe: !existing.reactedByMe };
      }
      this.localReactions.set(next);
    } else {
      this.localReactions.set([...current, { reactionType, count: 1, reactedByMe: true }]);
    }
  }
}
