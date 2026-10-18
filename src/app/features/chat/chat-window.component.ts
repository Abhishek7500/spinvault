import { Component, ElementRef, OnDestroy, ViewChild, input, output, signal } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { combineLatest, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { ChatMessage, Conversation, MessageType, SubscriptionStatus, UserProfile } from '../../core/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { ChatBubbleComponent } from '../../shared/chat-bubble.component';
import { PremiumUpgradeModalComponent } from '../../shared/premium-upgrade-modal.component';
import { ProfileDrawerComponent } from './profile-drawer.component';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    AsyncPipe,
    DatePipe,
    FormsModule,
    AvatarComponent,
    ChatBubbleComponent,
    PremiumUpgradeModalComponent,
    ProfileDrawerComponent
  ],
  template: `
    <section class="flex h-full min-w-0 flex-1 flex-col bg-[#f7f9fc]">
      @if (vm$ | async; as vm) {
        @if (vm.conversation) {
          <header class="flex items-center justify-between border-b border-gray-200/80 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
            <div class="flex items-center gap-3">
              @if (mobile()) {
                <button type="button" class="rounded-full px-2 py-1 text-messenger-muted hover:bg-gray-100" (click)="back.emit()" aria-label="Back to chats">
                  ←
                </button>
              }
              <button
                type="button"
                class="flex items-center gap-3 text-left disabled:cursor-default"
                [disabled]="!vm.otherParticipant"
                (click)="openProfileDrawer(vm.otherParticipant)"
              >
                <app-avatar
                  [name]="title(vm.conversation)"
                  [color]="accent(vm.conversation)"
                  [online]="isOnline(vm.conversation)"
                  [showStatus]="true"
                />
                <span>
                  <span class="block text-base font-semibold text-messenger-ink">{{ title(vm.conversation) }}</span>
                  <span class="flex items-center gap-1 text-xs text-messenger-muted">
                    @if (isOnline(vm.conversation)) {
                      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Active now
                    } @else {
                      <span class="h-1.5 w-1.5 rounded-full bg-gray-300"></span> Offline
                    }
                  </span>
                </span>
              </button>
            </div>
            @if (subscription(); as sub) {
              <span
                class="rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all duration-300"
                [class.bg-gradient-to-r]="true"
                [class.from-amber-400]="!sub.premium"
                [class.to-orange-500]="!sub.premium"
                [class.text-white]="!sub.premium"
                [class.from-emerald-400]="sub.premium"
                [class.to-teal-500]="sub.premium"
              >
                {{ sub.premium ? '⭐ Paid Family' : 'Free' }}
              </span>
            }
          </header>

          <div #scroller class="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-[#f7f9fc] to-blue-50/40 px-5 py-6">
            @for (message of vm.messages; track message.id) {
              <app-chat-bubble
                [message]="message"
                [mine]="message.senderId === me?.id"
                [showSender]="message.senderId !== me?.id && vm.conversation.type === 'GROUP'"
                (react)="onReact($event, message)"
                (unlocked)="onUnlocked(message)"
              />
            }
            @if (vm.typists.length) {
              <div class="flex items-end gap-2 text-sm text-messenger-muted">
                <div class="relative">
                  <div class="memeoi-bounce flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-messenger-blue to-indigo-500 text-lg shadow-sm">
                    {{ typistEmoji(vm.typists[0].displayName) }}
                  </div>
                  <span class="pulse-ring absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-messenger-blue"></span>
                </div>
                <div class="bubble-pop mb-1 flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm">
                  <span class="typing-dot h-2 w-2 rounded-full bg-messenger-blue"></span>
                  <span class="typing-dot h-2 w-2 rounded-full bg-messenger-blue"></span>
                  <span class="typing-dot h-2 w-2 rounded-full bg-messenger-blue"></span>
                </div>
                <span class="mb-2 text-[11px]">{{ vm.typists[0].displayName }} is typing…</span>
              </div>
            }
            <div #messageEnd></div>
          </div>

          @if (capsuleMode()) {
            <div class="flex items-center gap-3 border-t border-amber-200 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 px-4 py-3 text-xs text-amber-900">
              <div class="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 p-3 shadow-sm">
                <span class="text-lg" aria-hidden="true">⏳</span>
                <span class="font-semibold">Vault Release Countdown</span>
              <input
                type="number"
                min="1"
                class="w-20 rounded-lg border border-amber-300 bg-white/80 px-2 py-1.5"
                [(ngModel)]="capsuleDays"
                name="capsuleDays"
              />
                <span>days</span>
              </div>
              <button class="ml-auto font-semibold text-amber-700 hover:underline" type="button" (click)="capsuleMode.set(false)">
                Cancel
              </button>
            </div>
          }

          <form class="border-t border-gray-200 bg-white px-4 py-3" (ngSubmit)="send()">
            @if (pendingAttachment(); as attachment) {
              <div class="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-messenger-wash p-2">
                @if (attachment.messageType === 'PHOTO') {
                  <img [src]="attachment.previewUrl" alt="Attachment preview" class="h-16 w-16 rounded-lg object-cover" />
                } @else {
                  <video [src]="attachment.previewUrl" class="h-16 w-24 rounded-lg object-cover" muted></video>
                }
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-semibold text-messenger-ink">{{ attachment.file.name }}</p>
                  <p class="text-[11px] text-messenger-muted">Ready to send</p>
                </div>
                <button type="button" class="rounded-full px-2 py-1 text-sm text-messenger-muted hover:bg-white" (click)="removeAttachment()" [disabled]="sending()" aria-label="Remove attachment">
                  ✕
                </button>
              </div>
            }
            @if (sendError()) {
              <p class="mb-2 text-xs text-rose-600" role="alert">{{ sendError() }}</p>
            }
            <div class="flex items-center gap-2 rounded-full bg-messenger-wash px-4 py-2">
              <label class="cursor-pointer text-messenger-muted hover:text-messenger-blue" [class.pointer-events-none]="sending()" [class.opacity-50]="sending()" title="Attach photo or video">
                📎
                <input type="file" class="hidden" accept="image/*,video/*" [disabled]="sending()" (change)="onFileSelected($event)" />
              </label>
              <button
                type="button"
                class="text-messenger-muted hover:text-amber-600"
                title="Lock a time capsule"
                (click)="capsuleMode.set(!capsuleMode())"
                [disabled]="sending()"
              >
                🔒
              </button>
              <input
                class="flex-1 bg-transparent py-2 text-sm outline-none"
                placeholder="Aa"
                [(ngModel)]="draft"
                name="draft"
                (ngModelChange)="onDraftChange()"
                autocomplete="off"
                [disabled]="sending()"
              />
              <button
                class="font-semibold text-messenger-blue disabled:text-gray-400"
                type="submit"
                [disabled]="sending() || (!draft.trim() && !capsuleMode() && !pendingAttachment())"
              >
                {{ sending() ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </form>
        } @else {
          <div class="flex h-full flex-col items-center justify-center text-center">
            @if (mobile()) {
              <button type="button" class="mb-4 rounded-full px-4 py-2 text-sm font-semibold text-messenger-blue hover:bg-blue-50" (click)="back.emit()">
                ← Back to chats
              </button>
            }
            <div class="flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-pane">💬</div>
            <h2 class="mt-6 text-2xl font-semibold">Select a conversation</h2>
            <p class="mt-2 max-w-sm text-sm text-messenger-muted">
              Pick someone from the left, or search for a teammate to start a live chat.
            </p>
          </div>
        }
      }

      <app-premium-upgrade-modal
        [open]="premiumOpen()"
        [status]="subscription()"
        [reason]="premiumReason()"
        [failed]="upgradeFailed()"
        (upgraded)="onUpgrade()"
        (closed)="premiumOpen.set(false)"
      />
      <app-profile-drawer
        [open]="profileDrawerOpen()"
        [user]="selectedUserForProfile()"
        (closed)="profileDrawerOpen.set(false)"
      />
    </section>
  `
})
export class ChatWindowComponent implements OnDestroy {
  readonly mobile = input(false);
  readonly back = output<void>();
  draft = '';
  capsuleDays = 30;
  readonly capsuleMode = signal(false);
  readonly premiumOpen = signal(false);
  readonly upgradeFailed = signal(false);
  readonly premiumReason = signal('general');
  readonly subscription = signal<SubscriptionStatus | null>(null);
  readonly profileDrawerOpen = signal(false);
  readonly selectedUserForProfile = signal<UserProfile | null>(null);
  readonly pendingAttachment = signal<{ conversationId: number; file: File; previewUrl: string; messageType: MessageType } | null>(null);
  readonly sending = signal(false);
  readonly sendError = signal('');
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptions = [
    this.chat.subscription$.subscribe((status) => this.subscription.set(status)),
    this.chat.freshIncomingMessages$.subscribe((message) => this.scrollForFreshIncoming(message))
  ];
  readonly me = this.auth.currentUser();
  readonly vm$ = combineLatest([
    this.chat.conversations$,
    this.chat.activeConversationId$,
    this.chat.messages$,
    this.chat.typing$
  ]).pipe(
    map(([conversations, activeId, messages, typists]) => {
      const conversation = conversations.find((item) => item.id === activeId) ?? null;
      return {
        conversation,
        otherParticipant: conversation?.participants.find((participant) => participant.id !== this.me?.id) ?? null,
        messages,
        typists
      };
    })
  );

  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;
  @ViewChild('messageEnd') messageEnd?: ElementRef<HTMLElement>;

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService
  ) {
  }

  ngOnDestroy(): void {
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.clearPendingAttachment();
  }

  send(): void {
    const conversationId = this.activeId();
    if (!conversationId || this.sending()) {
      return;
    }
    const attachment = this.pendingAttachment();
    this.sendError.set('');

    if (attachment) {
      if (attachment.conversationId !== conversationId) {
        this.sendError.set('Return to the chat where you selected this attachment to send it.');
        return;
      }
      this.sending.set(true);
      const content = this.draft.trim() || null;
      this.chat.uploadMedia(attachment.file).subscribe({
        next: (asset) => {
          if (this.activeId() !== conversationId) {
            this.sending.set(false);
            this.sendError.set('The conversation changed while uploading. Return to the original chat and send again.');
            return;
          }
          this.chat.send({
            conversationId,
            content,
            messageType: attachment.messageType,
            mediaUrl: asset.url
          });
          this.finishSend();
        },
        error: (err: HttpErrorResponse) => {
          this.sending.set(false);
          this.handlePremium(err);
        }
      });
      return;
    }

    if (!this.draft.trim() && !this.capsuleMode()) return;
    if (this.capsuleMode()) {
      const days = Math.max(1, Math.floor(this.capsuleDays || 1));
      const unlockAt = new Date(Date.now() + days * 86400000).toISOString();
      this.chat.send({
        conversationId,
        content: this.draft.trim() || null,
        messageType: 'CAPSULE',
        unlockAt
      });
      this.capsuleMode.set(false);
    } else {
      this.chat.send({
        conversationId,
        content: this.draft,
        messageType: 'TEXT'
      });
    }
    this.finishSend();
  }

  private finishSend(): void {
    this.draft = '';
    this.clearPendingAttachment();
    this.sending.set(false);
    this.capsuleMode.set(false);
    this.chat.notifyTyping(false);
  }

  openProfileDrawer(user: UserProfile | null): void {
    if (!user) return;
    this.selectedUserForProfile.set(user);
    this.profileDrawerOpen.set(true);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const conversationId = this.activeId();
    if (!file || !conversationId) return;
    this.clearPendingAttachment();
    const messageType: MessageType = file.type.startsWith('video/') ? 'VIDEO' : 'PHOTO';
    this.pendingAttachment.set({ conversationId, file, previewUrl: URL.createObjectURL(file), messageType });
    this.capsuleMode.set(false);
    this.sendError.set('');
    input.value = '';
  }

  removeAttachment(): void {
    if (!this.sending()) this.clearPendingAttachment();
  }

  onReact(reactionType: string, message: ChatMessage): void {
    this.chat.react(message.id, reactionType);
  }

  onUnlocked(message: ChatMessage): void {
    // Refresh the active thread so the now-readable capsule content appears.
    this.chat.openConversation(message.conversationId);
  }

  onUpgrade(): void {
    this.upgradeFailed.set(false);
    this.chat.upgrade().subscribe({
      next: () => {
        this.upgradeFailed.set(false);
        this.premiumOpen.set(false);
      },
      error: (error: unknown) => {
        this.upgradeFailed.set(true);
        console.error('Unable to upgrade subscription.', error);
      }
    });
  }

  onDraftChange(): void {
    this.chat.notifyTyping(!!this.draft.trim());
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
    }
    this.typingTimer = setTimeout(() => this.chat.notifyTyping(false), 1500);
  }

  /** Surface a 403 premium gate as the upgrade modal. */
  private handlePremium(err: HttpErrorResponse): void {
    if (err.status === 403) {
      this.premiumReason.set((err.error?.feature as string) ?? 'general');
      this.upgradeFailed.set(false);
      this.premiumOpen.set(true);
      return;
    }
    this.sendError.set(err.error?.message ?? 'The attachment could not be sent. Please try again.');
    console.error('Unable to send chat attachment.', err);
  }

  private activeId(): number | null {
    return this.chat.activeConversation()?.id ?? null;
  }

  title(conversation: Conversation): string {
    if (conversation.type === 'GROUP') {
      return conversation.title;
    }
    return conversation.participants.find((p) => p.id !== this.me?.id)?.displayName ?? conversation.title;
  }

  accent(conversation: Conversation): string {
    return conversation.participants.find((p) => p.id !== this.me?.id)?.avatarColor ?? '#0084FF';
  }

  isOnline(conversation: Conversation): boolean {
    return conversation.participants.some((p) => p.id !== this.me?.id && p.online);
  }

  /** Deterministic Memoji for a typist, derived from their name. */
  typistEmoji(name: string): string {
    const memojis = ['🙂', '😎', '🤠', '🧑‍🚀', '🦸', '🧙', '🦊', '🐼', '🐨', '🦁'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash + name.charCodeAt(i)) % memojis.length;
    }
    return memojis[hash];
  }

  private clearPendingAttachment(): void {
    const attachment = this.pendingAttachment();
    if (attachment) URL.revokeObjectURL(attachment.previewUrl);
    this.pendingAttachment.set(null);
  }

  private scrollForFreshIncoming(message: ChatMessage): void {
    if (message.conversationId !== this.activeId() || message.senderId === this.me?.id) return;
    const el = this.scroller?.nativeElement;
    if (!el || el.scrollHeight - el.scrollTop - el.clientHeight > 80) return;
    requestAnimationFrame(() =>
      this.messageEnd?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' })
    );
  }
}
