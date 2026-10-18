import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ChatMessage,
  Conversation,
  GameMovePayload,
  GameStateEvent,
  MediaUploadResponse,
  PageResponse,
  PresenceEvent,
  ReactionEvent,
  SendMessagePayload,
  SubscriptionStatus,
  TypingEvent,
  UserProfile
} from '../models';
import { AuthService } from './auth.service';
import { WebsocketService } from './websocket.service';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  private readonly activeIdSubject = new BehaviorSubject<number | null>(null);
  private readonly messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  private readonly typingSubject = new BehaviorSubject<TypingEvent[]>([]);
  private readonly peopleSubject = new BehaviorSubject<UserProfile[]>([]);
  private readonly subscriptionSubject = new BehaviorSubject<SubscriptionStatus | null>(null);
  private readonly freshIncomingSubject = new Subject<ChatMessage>();
  private readonly presence = new Map<number, boolean>();
  private readonly seenMessageIds = new Set<number>();

  readonly conversations$ = this.conversationsSubject.asObservable();
  readonly activeConversationId$ = this.activeIdSubject.asObservable();
  readonly messages$ = this.messagesSubject.asObservable();
  readonly typing$ = this.typingSubject.asObservable();
  readonly people$ = this.peopleSubject.asObservable();
  readonly subscription$ = this.subscriptionSubject.asObservable();
  readonly freshIncomingMessages$ = this.freshIncomingSubject.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly websocket: WebsocketService
  ) {
    this.websocket.messages$.subscribe((message) => this.onIncomingMessage(message));
    this.websocket.typing$.subscribe((event) => this.onTyping(event));
    this.websocket.presence$.subscribe((event) => this.onPresence(event));
    this.websocket.reactions$.subscribe((event) => this.onReaction(event));
  }

  bootstrap(): void {
    this.websocket.connect();
    this.refreshConversations().subscribe();
    this.searchPeople('').subscribe();
    this.loadSubscription().subscribe();
  }

  shutdown(): void {
    this.websocket.disconnect();
    this.conversationsSubject.next([]);
    this.messagesSubject.next([]);
    this.activeIdSubject.next(null);
    this.typingSubject.next([]);
    this.seenMessageIds.clear();
  }

  refreshConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${environment.apiUrl}/conversations`).pipe(
      map((items) => items.map((item) => this.withLivePresence(item))),
      tap((items) => {
        this.conversationsSubject.next(items);
        items.forEach((item) => this.websocket.watchConversation(item.id).subscribe());
      })
    );
  }

  searchPeople(query: string): Observable<UserProfile[]> {
    let params = new HttpParams();
    if (query.trim()) {
      params = params.set('q', query.trim());
    }
    return this.http.get<UserProfile[]>(`${environment.apiUrl}/users`, { params }).pipe(
      map((users) =>
        users.map((user) => ({
          ...user,
          online: this.presence.get(user.id) ?? user.online
        }))
      ),
      tap((users) => this.peopleSubject.next(users))
    );
  }

  openConversation(conversationId: number): void {
    this.activeIdSubject.next(conversationId);
    this.typingSubject.next([]);
    this.messagesSubject.next([]);
    this.websocket.watchConversation(conversationId).subscribe();
    this.http
      .get<PageResponse<ChatMessage>>(`${environment.apiUrl}/conversations/${conversationId}/messages`, {
        params: { page: 0, size: 50 }
      })
      .subscribe((page) => {
        if (this.activeIdSubject.value !== conversationId) return;
        page.content.forEach((message) => this.seenMessageIds.add(message.id));
        const messages = new Map<number, ChatMessage>(
          [...page.content, ...this.messagesSubject.value].map((message) => [message.id, message])
        );
        this.messagesSubject.next(
          [...messages.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        );
      });
    this.http.put<Conversation>(`${environment.apiUrl}/conversations/${conversationId}/read`, {}).subscribe((updated) => {
      this.upsertConversation(this.withLivePresence({ ...updated, unreadCount: 0 }));
    });
  }

  startDirectChat(userId: number): void {
    this.http.post<Conversation>(`${environment.apiUrl}/conversations`, { userId }).subscribe((conversation) => {
      this.upsertConversation(this.withLivePresence(conversation));
      this.websocket.watchConversation(conversation.id).subscribe();
      this.openConversation(conversation.id);
    });
  }

  /** Spawn a multi-user group chat via POST /api/conversations, then open it. */
  createGroup(title: string, userIds: number[]): Observable<Conversation> {
    return this.http
      .post<Conversation>(`${environment.apiUrl}/conversations`, { title, userIds })
      .pipe(
        tap((conversation) => {
          this.upsertConversation(this.withLivePresence(conversation));
          this.websocket.watchConversation(conversation.id).subscribe();
          this.openConversation(conversation.id);
        })
      );
  }

  /** Authoritative game-state stream for the active room. */
  get game$(): Observable<GameStateEvent> {
    return this.websocket.game$;
  }

  latestGameState(conversationId: number): GameStateEvent | null {
    return this.websocket.latestGameState(conversationId);
  }

  /** Publish a Tic-Tac-Toe move for the active conversation. */
  sendGameMove(payload: GameMovePayload): void {
    this.websocket.sendGameMove(payload);
  }

  currentUserId(): number | null {
    return this.auth.currentUser()?.id ?? null;
  }

  send(payload: SendMessagePayload): void {
    const conversationId = this.activeIdSubject.value;
    if (!conversationId || conversationId !== payload.conversationId) {
      return;
    }
    if (payload.messageType === 'TEXT' && !payload.content?.trim()) {
      return;
    }
    this.websocket.sendMessage(payload);
    this.websocket.sendTyping(conversationId, false);
  }

  /** Optimistically toggle a reaction locally, then confirm via WebSocket. */
  react(messageId: number, reactionType: string): void {
    this.websocket.sendReaction(messageId, reactionType);
  }

  loadSubscription(): Observable<SubscriptionStatus> {
    return this.http
      .get<SubscriptionStatus>(`${environment.apiUrl}/subscriptions/me`)
      .pipe(tap((status) => this.subscriptionSubject.next(status)));
  }

  upgrade(): Observable<SubscriptionStatus> {
    return this.http
      .post<SubscriptionStatus>(`${environment.apiUrl}/subscriptions/upgrade`, {})
      .pipe(tap((status) => this.subscriptionSubject.next(status)));
  }

  uploadMedia(file: File): Observable<MediaUploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<MediaUploadResponse>(`${environment.apiUrl}/media`, form);
  }

  subscriptionStatus(): SubscriptionStatus | null {
    return this.subscriptionSubject.value;
  }

  notifyTyping(typing: boolean): void {
    const conversationId = this.activeIdSubject.value;
    if (conversationId) {
      this.websocket.sendTyping(conversationId, typing);
    }
  }

  activeConversation(): Conversation | null {
    const id = this.activeIdSubject.value;
    return this.conversationsSubject.value.find((item) => item.id === id) ?? null;
  }

  /** Synchronous snapshot of the active thread's messages (for non-reactive reads). */
  currentMessages(): ChatMessage[] {
    return this.messagesSubject.value;
  }

  private onIncomingMessage(message: ChatMessage): void {
    if (this.seenMessageIds.has(message.id)) {
      return;
    }
    this.seenMessageIds.add(message.id);

    const activeId = this.activeIdSubject.value;
    if (activeId === message.conversationId) {
      const existing = this.messagesSubject.value;
      this.messagesSubject.next([...existing, message]);
      this.http.put(`${environment.apiUrl}/conversations/${message.conversationId}/read`, {}).subscribe();
    }
    if (message.senderId !== this.auth.currentUser()?.id) {
      this.freshIncomingSubject.next(message);
    }

    const conversations = [...this.conversationsSubject.value];
    const index = conversations.findIndex((item) => item.id === message.conversationId);
    if (index >= 0) {
      const current = conversations[index];
      const mine = message.senderId === this.auth.currentUser()?.id;
      const unread = activeId === message.conversationId || mine ? 0 : current.unreadCount + 1;
      conversations.splice(index, 1);
      conversations.unshift({
        ...current,
        lastMessagePreview: this.previewFor(message),
        lastMessageAt: message.createdAt,
        lastMessageSenderId: message.senderId,
        unreadCount: unread
      });
      this.conversationsSubject.next(conversations);
    } else {
      this.refreshConversations().subscribe();
    }
  }

  private onReaction(event: ReactionEvent): void {
    const messages = this.messagesSubject.value.map((message) =>
      message.id === event.messageId ? { ...message, reactions: event.reactions } : message
    );
    this.messagesSubject.next(messages);
  }

  private previewFor(message: ChatMessage): string {
    if (message.sealed || (message.locked && !message.content)) {
      return '🔒 Locked capsule';
    }
    if (message.messageType === 'PHOTO') {
      return message.content ? `📷 ${message.content}` : '📷 Photo';
    }
    if (message.messageType === 'VIDEO') {
      return message.content ? `🎬 ${message.content}` : '🎬 Video';
    }
    return message.content ?? '';
  }

  private onTyping(event: TypingEvent): void {
    const me = this.auth.currentUser();
    if (!me || event.userId === me.id || this.activeIdSubject.value !== event.conversationId) {
      return;
    }
    const others = this.typingSubject.value.filter((item) => item.userId !== event.userId);
    this.typingSubject.next(event.typing ? [...others, event] : others);
  }

  private onPresence(event: PresenceEvent): void {
    this.presence.set(event.userId, event.online);
    this.conversationsSubject.next(
      this.conversationsSubject.value.map((conversation) => this.withLivePresence(conversation))
    );
    this.peopleSubject.next(
      this.peopleSubject.value.map((user) =>
        user.id === event.userId ? { ...user, online: event.online } : user
      )
    );
  }

  private upsertConversation(conversation: Conversation): void {
    const items = this.conversationsSubject.value.filter((item) => item.id !== conversation.id);
    this.conversationsSubject.next([conversation, ...items]);
  }

  private withLivePresence(conversation: Conversation): Conversation {
    return {
      ...conversation,
      participants: conversation.participants.map((user) => ({
        ...user,
        online: this.presence.get(user.id) ?? user.online
      }))
    };
  }
}
