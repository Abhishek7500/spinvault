import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { Conversation, UserProfile } from '../../core/models';
import { AvatarComponent } from '../../shared/avatar.component';
import { CreateGroupModalComponent } from './create-group-modal.component';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule, AvatarComponent, CreateGroupModalComponent],
  template: `
    <aside class="flex h-full w-full flex-col border-r border-gray-200 bg-white md:w-[360px]">
      <header class="flex items-center justify-between px-4 pb-3 pt-5">
        <div class="flex items-center gap-3">
          @if (me) {
            <app-avatar [name]="me.displayName" [color]="me.avatarColor" size="md" />
          }
          <div>
            <div class="flex w-full items-center justify-between">
              <h1 class="text-xl font-bold">Chats</h1>
              <button
                type="button"
                class="rounded-full p-2 text-messenger-blue hover:bg-blue-50"
                (click)="showCreateGroup.set(true)"
                aria-label="Create group chat"
                title="Create group chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-6 w-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>
            <p class="text-xs text-messenger-muted">{{ me?.displayName }}</p>
          </div>
        </div>
        <button class="rounded-full px-3 py-1 text-sm font-medium text-messenger-blue hover:bg-blue-50" (click)="logout()">
          Log out
        </button>
      </header>

      <div class="px-4">
        <input
          class="w-full rounded-full bg-messenger-wash px-4 py-2.5 text-sm outline-none ring-messenger-blue focus:bg-white focus:ring-2"
          placeholder="Search Messenger"
          [(ngModel)]="query"
          (ngModelChange)="onSearch($event)"
        />
      </div>

      <div class="mt-3 flex-1 overflow-y-auto px-2 pb-4">
        @if (query.trim()) {
          <p class="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-messenger-muted">People</p>
          @for (person of people$ | async; track person.id) {
            <button class="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-messenger-wash" (click)="startChat(person)">
              <app-avatar [name]="person.displayName" [color]="person.avatarColor" [online]="person.online" [showStatus]="true" size="sm" />
              <div>
                <p class="font-medium">{{ person.displayName }}</p>
                <p class="text-xs text-messenger-muted">{{ person.online ? 'Active now' : '@' + person.username }}</p>
              </div>
            </button>
          }
        } @else {
          @for (conversation of conversations$ | async; track conversation.id) {
            <button
              class="mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition"
              [class.bg-blue-50]="(activeId$ | async) === conversation.id"
              [class.hover:bg-messenger-wash]="(activeId$ | async) !== conversation.id"
              (click)="open(conversation)"
            >
              <app-avatar
                [name]="title(conversation)"
                [color]="accent(conversation)"
                [online]="isOnline(conversation)"
                [showStatus]="true"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate font-semibold" [class.font-bold]="conversation.unreadCount > 0">{{ title(conversation) }}</p>
                  <span class="shrink-0 text-[11px] text-messenger-muted">{{ conversation.lastMessageAt | date: 'shortTime' }}</span>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-sm" [class.text-messenger-ink]="conversation.unreadCount > 0" [class.font-medium]="conversation.unreadCount > 0" [class.text-messenger-muted]="conversation.unreadCount === 0">
                    {{ conversation.lastMessagePreview || 'No messages yet' }}
                  </p>
                  @if (conversation.unreadCount > 0) {
                    <span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-messenger-blue px-1.5 text-[11px] font-semibold text-white">
                      {{ conversation.unreadCount }}
                    </span>
                  }
                </div>
              </div>
            </button>
          }
        }
      </div>
    </aside>
    <app-create-group-modal
      [open]="showCreateGroup()"
      (closed)="showCreateGroup.set(false)"
      (created)="onGroupCreated()"
    />
  `
})
export class ConversationListComponent {
  readonly conversationOpened = output<void>();
  readonly showCreateGroup = signal(false);
  query = '';
  readonly conversations$ = this.chat.conversations$;
  readonly people$ = this.chat.people$;
  readonly activeId$ = this.chat.activeConversationId$;
  readonly me = this.auth.currentUser();

  constructor(
    private readonly chat: ChatService,
    private readonly auth: AuthService
  ) {}

  onSearch(value: string): void {
    this.chat.searchPeople(value).subscribe();
  }

  onGroupCreated(): void {
    this.showCreateGroup.set(false);
    this.conversationOpened.emit();
  }

  open(conversation: Conversation): void {
    this.chat.openConversation(conversation.id);
    this.conversationOpened.emit();
  }

  startChat(person: UserProfile): void {
    this.query = '';
    this.chat.startDirectChat(person.id);
    this.conversationOpened.emit();
  }

  logout(): void {
    this.chat.shutdown();
    this.auth.logout();
  }

  title(conversation: Conversation): string {
    if (conversation.type === 'GROUP') {
      return conversation.title;
    }
    const other = conversation.participants.find((p) => p.id !== this.me?.id);
    return other?.displayName ?? conversation.title;
  }

  accent(conversation: Conversation): string {
    const other = conversation.participants.find((p) => p.id !== this.me?.id);
    return other?.avatarColor ?? '#0084FF';
  }

  isOnline(conversation: Conversation): boolean {
    if (conversation.type === 'GROUP') {
      return conversation.participants.some((p) => p.id !== this.me?.id && p.online);
    }
    return conversation.participants.some((p) => p.id !== this.me?.id && p.online);
  }
}
