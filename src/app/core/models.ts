export interface UserProfile {
  id: number;
  username: string;
  email: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
  online: boolean;
}

export interface AuthResponse {
  token: string;
  tokenType: string;
  user: UserProfile;
}

export interface Conversation {
  id: number;
  type: 'DIRECT' | 'GROUP';
  title: string;
  participants: UserProfile[];
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastMessageSenderId: number | null;
  unreadCount: number;
  createdAt: string;
}

/** Mirrors backend MessageType enum. */
export type MessageType = 'TEXT' | 'PHOTO' | 'VIDEO' | 'CAPSULE';

/** Compact emoji tally for a message. */
export interface ReactionSummary {
  reactionType: string;
  count: number;
  reactedByMe: boolean;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderAvatarColor: string;
  messageType: MessageType;
  /** Null while a capsule is sealed. */
  content: string | null;
  /** Null while a capsule is sealed or for text. */
  mediaUrl: string | null;
  /** True when the message is a time capsule. */
  locked: boolean;
  /** True when the capsule is still sealed (locked && unlockAt in the future). */
  sealed: boolean;
  /** ISO timestamp when a capsule unlocks. */
  unlockAt: string | null;
  reactions: ReactionSummary[];
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  last: boolean;
}

export interface TypingEvent {
  conversationId: number;
  userId: number;
  displayName: string;
  typing: boolean;
}

export interface PresenceEvent {
  userId: number;
  username: string;
  online: boolean;
}

/** Broadcast tally update for a single message. */
export interface ReactionEvent {
  messageId: number;
  conversationId: number;
  reactions: ReactionSummary[];
  updatedAt: string;
}

export type TierType = 'FREE_PERSONAL' | 'PAID_FAMILY';

export interface SubscriptionStatus {
  tier: TierType;
  premium: boolean;
  expiresAt: string | null;
  freeCapsuleMaxDays: number;
}

export interface MediaUploadResponse {
  url: string;
  contentType: string;
  sizeBytes: number;
}

/** Payload for sending a rich message (text, media, or capsule). */
export interface SendMessagePayload {
  conversationId: number;
  content: string | null;
  messageType: MessageType;
  mediaUrl?: string | null;
  unlockAt?: string | null;
}

/** 403 premium-gate error body from the backend. */
export interface PremiumError {
  status: number;
  error: string;
  message: string;
  feature?: string;
}

/** A single Tic-Tac-Toe move published to {@code /app/chat.gamemove}. */
export interface GameMovePayload {
  conversationId: number;
  /** Board coordinates; row/column -1 resets the board. */
  row: number;
  column: number;
}

/** Authoritative shared game state broadcast to {@code /topic/conversations/{id}/game}. */
export interface GameStateEvent {
  conversationId: number;
  board: (string | null)[][];
  xIsNext: boolean;
  winner: string | null;
  winLine: number[];
  lastMoveBy: number | null;
  playerXId: number | null;
  playerOId: number | null;
  updatedAt: string;
}

/** Request body for {@code POST /api/conversations} (group creation). */
export interface CreateGroupRequest {
  title: string;
  userIds: number[];
}

