import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  SpinVaultIdentity,
  SpinVaultGame,
  SpinVaultMessage,
  SpinVaultPaymentMethod,
  SpinVaultService
} from '../../core/services/spinvault.service';

@Component({
  selector: 'app-chat-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (open) {
      <div class="chat-backdrop" (click)="close()">
        <section class="chat-panel" role="dialog" aria-modal="true" aria-labelledby="chat-heading" (click)="$event.stopPropagation()">
          <header class="chat-header">
            <div class="chat-avatar">S<span></span></div>
            <div class="chat-heading"><h2 id="chat-heading">{{ identity ? 'SpinVault support' : 'Welcome to SpinVault' }}</h2><p>{{ identity ? 'We’re here and ready to help' : 'Sign in to start a private chat' }}</p></div>
            <button class="chat-close" type="button" aria-label="Close chat" (click)="close()">×</button>
          </header>

          @if (!identity) {
            <div class="auth-content">
              <p class="auth-intro">Sign in with the username and PIN provided by your SpinVault admin.</p>
              <label>Username<input [(ngModel)]="username" name="username" autocomplete="username" autocapitalize="none" placeholder="Your player username" /></label>
              <label>PIN<input [(ngModel)]="pin" name="pin" type="password" autocomplete="current-password" inputmode="text" placeholder="Your 6-32 character PIN" /></label>
              @if (error) { <p class="chat-error" role="alert">{{ error }}</p> }
              <button class="chat-submit" type="button" [disabled]="busy" (click)="submitAuth()">{{ busy ? 'Please wait…' : 'Log in and chat' }} <span>→</span></button>
              <p class="auth-note">Need an account or a PIN reset? Contact the SpinVault team. <a routerLink="/pin-login" (click)="close()">Open full login</a></p>
              <p class="auth-note">Your conversation is private and only visible to you and the SpinVault team.</p>
            </div>
          } @else if (identity.role === 'admin' || identity.is_super_admin) {
            <div class="chat-state"><span class="state-icon">✦</span><h3>You’re signed in as an admin.</h3><p>Open the admin dashboard to manage player conversations.</p><a routerLink="/admin">Go to admin dashboard →</a></div>
          } @else {
            <div class="chat-body">
              @if (announcement) { <aside class="pinned-announcement" role="status">📌 {{ announcement.body }}</aside> }
              @if (!online) { <p class="network-banner" role="status">You’re offline. Messages will send when the connection returns.</p> }
              @if (error) { <p class="chat-error chat-inline-error" role="alert">{{ error }}</p> }
              <label class="message-search">Search messages<input [(ngModel)]="searchQuery" name="messageSearch" placeholder="Keyword, amount, load, cash-out…" /></label>
              <div class="chat-messages" aria-live="polite">
                @if (!messages.length && !busy) {
                  <div class="chat-empty"><span>✦</span><p>Hey {{ identity.username }}! What can we help you with?</p><small>Only you and our support team can see this chat.</small></div>
                }
                @if (messages.length && !filteredMessages.length) { <p class="chat-loading">No messages match your search.</p> }
                @for (message of filteredMessages; track message.id) {
                  <article class="message-row" [class.message-mine]="message.sender_id === identity.id">
                    <div class="message-bubble">
                      @if (message.request_type) { <span class="request-tag">{{ message.request_type === 'load' ? 'LOAD REQUEST' : 'CASH-OUT REQUEST' }}</span> }
                      <p>{{ message.content }}</p>
                      @if (message.attachment_url) { <a class="chat-image-link" [href]="message.attachment_url" target="_blank" rel="noopener noreferrer"><img class="chat-image" [src]="message.attachment_url" [alt]="message.attachment_name || 'Chat image'" loading="lazy" /></a> }
                      @if (message.request_status) { <span class="request-status">Status: {{ message.request_status.replace('_', ' ') }}</span> }
                      @if (message.delivery_status === 'pending') { <span class="request-status">Sending…</span> }
                      @if (message.delivery_status === 'failed') { <span class="request-status delivery-failed">Not sent · try again</span> }
                      <time>{{ message.created_at | date:'shortTime' }}</time>
                    </div>
                  </article>
                }
                @if (busy && !messages.length) { <p class="chat-loading">Connecting to your private chat…</p> }
              </div>
              @if (otherTyping) { <p class="typing-indicator">SpinVault support is typing<span>…</span></p> }
              <div class="quick-actions">
                <button type="button" [class.selected]="requestType === 'load'" (click)="toggleRequest('load')">＋ Request load</button>
                <button type="button" [class.selected]="requestType === 'cashout'" (click)="toggleRequest('cashout')">↗ Request cash-out</button>
              </div>
              @if (paymentMethods.length) {
                <details class="payment-details">
                  <summary>Available payment options <span>⌄</span></summary>
                  @for (method of paymentMethods; track method.id) {
                    <article class="payment-option">
                      <div><strong>{{ method.name }}</strong><p>{{ method.instructions }}</p></div>
                      @if (method.qr_code_url) { <a [href]="method.qr_code_url" target="_blank" rel="noopener noreferrer"><img [src]="method.qr_code_url" [alt]="method.name + ' QR code'" loading="lazy" /></a> }
                    </article>
                  }
                </details>
              }
              @if (requestType) {
                <form class="request-form" (ngSubmit)="sendRequest()">
                  <div class="amount-presets" aria-label="Suggested amounts">
                    @for (amount of amountPresets; track amount) { <button type="button" [class.selected]="requestAmount === amount.toString()" (click)="requestAmount = amount.toString()">&#36;{{ amount }}</button> }
                  </div>
                  @if (games.length) {
                    <label class="game-select">Game (optional)<select name="requestGame" [(ngModel)]="selectedGameId"><option value="">Choose a game</option>@for (game of games; track game.id) { <option [value]="game.id">{{ game.title }}</option> }</select></label>
                  }
                  <label>Amount ($)<input name="amount" [(ngModel)]="requestAmount" inputmode="decimal" type="number" min="0.01" step="0.01" /></label>
                  <button type="submit" [disabled]="busy || !online">Send {{ requestType === 'load' ? 'load' : 'cash-out' }} request</button>
                </form>
              } @else {
                @if (previewUrl) {
                  <div class="image-preview"><img [src]="previewUrl" alt="Selected image preview" [style.transform]="'scale(' + imageZoom + ')'" /><label>Crop zoom <input type="range" min="1" max="1.5" step="0.05" [(ngModel)]="imageZoom" name="imageZoom" /></label><button type="button" (click)="cancelImagePreview()">Remove</button><button type="button" [disabled]="uploading || !online" (click)="uploadPreview()">{{ uploading ? 'Uploading…' : 'Send image' }}</button></div>
                }
                <form class="chat-composer" (ngSubmit)="sendText()">
                  <input name="draft" [(ngModel)]="draft" (input)="onTyping()" placeholder="Write a message…" aria-label="Write a message" autocomplete="off" />
                  <label class="chat-image-button" [class.uploading]="uploading" title="Attach an image">
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="selectImage($event)" [disabled]="busy || uploading" />
                    {{ uploading ? '…' : '▧' }}
                  </label>
                  <button type="submit" [disabled]="busy || !draft.trim()" aria-label="Send message">↑</button>
                </form>
              }
            </div>
          }
        </section>
      </div>
    }
  `,
  styles: [`
    :host{font-family:Inter,ui-sans-serif,system-ui,sans-serif}.chat-backdrop{position:fixed;inset:0;z-index:50;background:rgba(4,5,16,.78);backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;padding:0}.chat-panel{width:100%;height:min(720px,94dvh);border:1px solid rgba(0,243,255,.24);border-bottom:0;border-radius:20px 20px 0 0;background:#111226;color:#f8f7ff;box-shadow:0 0 60px rgba(0,243,255,.08);display:flex;flex-direction:column;overflow:hidden}
    .chat-header{height:76px;flex:none;padding:0 19px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(100deg,rgba(255,0,127,.08),rgba(0,243,255,.025))}
    .chat-avatar{width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,#ff007f,#8632c5);font-size:17px;font-weight:850;position:relative}.chat-avatar span{position:absolute;width:9px;height:9px;bottom:-2px;right:-2px;border:2px solid #111226;border-radius:50%;background:#2de6a3}
    .chat-heading{flex:1}.chat-heading h2{font-size:14px;margin:0}.chat-heading p{font-size:10px;color:#9291a9;margin:5px 0 0}.chat-close{width:31px;height:31px;border-radius:50%;border:1px solid rgba(255,255,255,.11);background:#1a1b31;color:#b9b8ca;font-size:23px;line-height:22px;cursor:pointer}
    .auth-content{padding:22px 21px 24px;overflow:auto}.auth-tabs{display:grid;grid-template-columns:1fr 1fr;padding:4px;border-radius:9px;background:#1a1b31}.auth-tabs button{height:35px;border:0;background:transparent;border-radius:7px;color:#9291a9;font-size:11px;font-weight:700;cursor:pointer}.auth-tabs button.active{background:#292a45;color:#fff;box-shadow:0 2px 9px #0a0b18}
    .auth-intro{color:#a3a2b7;font-size:11px;margin:18px 0}.auth-content label{display:block;color:#c6c5d6;font-size:10px;font-weight:650;margin-top:13px}.auth-content input{display:block;width:100%;height:43px;margin-top:7px;padding:0 12px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#17182d;color:#fff;font:inherit;font-size:12px;outline:none}.auth-content input:focus{border-color:#00cbd8}
    .chat-submit{width:100%;height:44px;margin-top:19px;display:flex;justify-content:space-between;align-items:center;padding:0 14px;border:0;border-radius:8px;background:linear-gradient(100deg,#ff007f,#cc079c);color:#fff;font-size:11px;font-weight:800;cursor:pointer}.chat-submit:disabled{opacity:.6}.auth-note{text-align:center;color:#77768d;font-size:9px;line-height:1.6;margin:14px 8px 0}
    .chat-error{padding:10px;border:1px solid rgba(255,100,120,.2);border-radius:7px;background:rgba(255,60,90,.07);color:#ff9baa;font-size:10px;line-height:1.5}.chat-state{margin:auto;padding:25px;text-align:center}.state-icon{font-size:30px;color:#00f3ff}.chat-state h3{font-size:16px}.chat-state p{color:#9a99ae;font-size:12px;line-height:1.6}.chat-state a{color:#00e7ef;font-size:12px;text-decoration:none}
    .chat-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 14px 12px}.chat-inline-error{margin:10px 0 0}.chat-messages{flex:1;overflow-y:auto;padding:15px 3px}.chat-empty{margin:58px auto 0;max-width:240px;text-align:center}.chat-empty>span{font-size:27px;color:#ff399e}.chat-empty p{font-size:13px;line-height:1.6}.chat-empty small{font-size:10px;color:#75748b;line-height:1.5}.chat-loading{text-align:center;color:#8f8ea4;font-size:10px;margin:25px 0}
    .message-row{display:flex;justify-content:flex-start;margin:9px 0}.message-row.message-mine{justify-content:flex-end}.message-bubble{max-width:84%;padding:10px 12px;border:1px solid rgba(255,255,255,.07);border-radius:12px 12px 12px 3px;background:#1b1d35}.message-mine .message-bubble{border-color:rgba(255,0,127,.22);border-radius:12px 12px 3px 12px;background:linear-gradient(130deg,rgba(255,0,127,.15),rgba(107,30,117,.2))}.message-bubble p{margin:0;font-size:11px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.message-bubble time{display:block;color:#818098;text-align:right;font-size:8px;margin-top:5px}.request-tag{display:inline-block;color:#00e1e9;font-size:8px;font-weight:850;letter-spacing:.8px;margin-bottom:6px}.request-status{display:block;margin-top:6px;color:#b8b5cd;font-size:8px;text-transform:capitalize}
    .quick-actions{display:flex;gap:7px;margin-bottom:9px}.quick-actions button{height:34px;flex:1;border:1px solid rgba(0,243,255,.2);border-radius:7px;background:rgba(0,243,255,.045);color:#83edf1;font-size:9px;font-weight:700;cursor:pointer}.quick-actions button.selected{border-color:#ff2c93;background:rgba(255,0,127,.1);color:#ff85c1}
    .chat-composer{display:flex;gap:8px;padding:7px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#18192e}.chat-composer input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;padding:0 5px;font:inherit;font-size:11px}.chat-composer input::placeholder{color:#77768c}.chat-composer button{height:33px;width:36px;border:0;border-radius:7px;background:#ff168b;color:white;font-size:17px;font-weight:800;cursor:pointer}.chat-composer button:disabled{opacity:.4}
    .chat-image-link{display:block;margin-top:7px}.chat-image{display:block;max-width:210px;max-height:180px;border-radius:7px;object-fit:contain}.chat-image-button{height:33px;width:34px;flex:none;display:grid;place-items:center;border:1px solid rgba(0,243,255,.16);border-radius:7px;color:#7cebf0;font-size:16px;cursor:pointer}.chat-image-button input{display:none}.chat-image-button.uploading{opacity:.55}
    .payment-details{flex:none;max-height:115px;overflow:auto;margin:0 0 9px;border:1px solid rgba(255,255,255,.075);border-radius:8px;background:rgba(255,255,255,.02)}.payment-details summary{display:flex;justify-content:space-between;padding:9px 10px;color:#00e1e9;font-size:9px;font-weight:700;cursor:pointer;list-style:none}.payment-details summary::-webkit-details-marker{display:none}.payment-option{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.06)}.payment-option strong{font-size:9px}.payment-option p{margin:4px 0 0;color:#9796aa;font-size:8px;white-space:pre-wrap}.payment-option img{width:42px;height:42px;border-radius:5px;object-fit:cover}
    .request-form{display:flex;align-items:flex-end;gap:8px}.request-form label{flex:1;color:#aaa9bb;font-size:9px}.request-form input{height:37px;width:100%;margin-top:5px;padding:0 9px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#18192e;color:#fff}.request-form button{height:37px;padding:0 10px;border:0;border-radius:7px;background:#ff168b;color:white;font-size:9px;font-weight:750;cursor:pointer}    .request-form button:disabled{opacity:.5}.pinned-announcement,.network-banner{flex:none;margin:9px 0 0;padding:8px 10px;border:1px solid rgba(0,243,255,.2);border-radius:7px;background:rgba(0,243,255,.06);color:#b4f9fa;font-size:9px;line-height:1.5}.network-banner{border-color:rgba(255,175,60,.28);background:rgba(255,175,60,.08);color:#ffd39b}.message-search{display:block;flex:none;margin-top:8px}.message-search input,.game-select select{width:100%;height:32px;padding:0 9px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#18192e;color:#e9e8f3;font:inherit;font-size:9px}.typing-indicator{flex:none;margin:0 0 7px;color:#80e9ed;font-size:9px}.typing-indicator span{animation:typingPulse 1s infinite}@keyframes typingPulse{50%{opacity:.2}}.delivery-failed{color:#ff9cab}.amount-presets{display:flex;gap:5px;width:100%;margin:0 0 5px}.amount-presets button{flex:1;height:27px;border:1px solid rgba(0,243,255,.16);border-radius:6px;background:#18192e;color:#9ef1f3;font-size:9px}.amount-presets button.selected{border-color:#ff2c93;color:#ff8ac4}.game-select{flex:1;min-width:100%;color:#a3a2b4;font-size:9px}.request-form{flex-wrap:wrap}.image-preview{flex:none;display:grid;grid-template-columns:64px 1fr auto auto;align-items:center;gap:8px;margin:0 0 8px;padding:7px;border:1px solid rgba(0,243,255,.16);border-radius:8px;background:#18192e;overflow:hidden}.image-preview img{width:58px;height:48px;object-fit:cover;border-radius:5px}.image-preview label{color:#aaa9bb;font-size:8px}.image-preview label input{display:block;width:100%}.image-preview button{border:0;background:transparent;color:#8cecf0;font-size:8px;cursor:pointer}
    .pinned-announcement,.network-banner{flex:none;margin:9px 0 0;padding:8px 10px;border:1px solid rgba(0,243,255,.2);border-radius:7px;background:rgba(0,243,255,.06);color:#b4f9fa;font-size:9px;line-height:1.5}.network-banner{border-color:rgba(255,175,60,.28);background:rgba(255,175,60,.08);color:#ffd39b}.message-search{display:block;flex:none;margin-top:8px}.message-search input,.game-select select{width:100%;height:32px;padding:0 9px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#18192e;color:#e9e8f3;font:inherit;font-size:9px}.typing-indicator{flex:none;margin:0 0 7px;color:#80e9ed;font-size:9px}.typing-indicator span{animation:typingPulse 1s infinite}@keyframes typingPulse{50%{opacity:.2}}.delivery-failed{color:#ff9cab}.amount-presets{display:flex;gap:5px;width:100%;margin:0 0 5px}.amount-presets button{flex:1;height:27px;border:1px solid rgba(0,243,255,.16);border-radius:6px;background:#18192e;color:#9ef1f3;font-size:9px}.amount-presets button.selected{border-color:#ff2c93;color:#ff8ac4}.game-select{flex:1;min-width:100%;color:#a3a2b4;font-size:9px}.request-form{flex-wrap:wrap}.image-preview{flex:none;display:grid;grid-template-columns:64px 1fr auto auto;align-items:center;gap:8px;margin:0 0 8px;padding:7px;border:1px solid rgba(0,243,255,.16);border-radius:8px;background:#18192e}.image-preview img{width:58px;height:48px;object-fit:cover;border-radius:5px}.image-preview label{color:#aaa9bb;font-size:8px}.image-preview label input{display:block;width:100%}.image-preview button{border:0;background:transparent;color:#8cecf0;font-size:8px;cursor:pointer}
    @media(min-width:620px){.chat-backdrop{align-items:center;padding:20px}.chat-panel{height:min(700px,calc(100dvh - 40px));max-width:430px;border:1px solid rgba(0,243,255,.24);border-radius:18px}.chat-body{padding:0 17px 14px}.auth-content{padding:25px}}
  `]
})
export class ChatModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Output() readonly closed = new EventEmitter<void>();

  identity: SpinVaultIdentity | null = this.spinVault.currentIdentity;
  username = '';
  pin = '';
  draft = '';
  requestAmount = '25';
  requestType: 'load' | 'cashout' | null = null;
  paymentMethods: SpinVaultPaymentMethod[] = [];
  messages: SpinVaultMessage[] = [];
  games: SpinVaultGame[] = [];
  announcement: { body: string } | null = null;
  searchQuery = '';
  selectedGameId = '';
  readonly amountPresets = [25, 50, 100, 250];
  imageZoom = 1;
  previewUrl: string | null = null;
  online = navigator.onLine;
  otherTyping = false;
  error = '';
  busy = false;
  uploading = false;
  private imageFile: File | null = null;
  private adminId: string | null = null;
  private chatStarted = false;
  private unsubscribeMessages: (() => void) | null = null;
  private unsubscribeAnnouncement: (() => void) | null = null;
  private typingChannel: { setTyping: (typing: boolean) => void; unsubscribe: () => void } | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingBroadcastActive = false;
  private otherTypingTimeout: ReturnType<typeof setTimeout> | null = null;
  private identitySubscription: Subscription;
  private readonly onlineHandler = (): void => { this.online = true; };
  private readonly offlineHandler = (): void => { this.online = false; };

  constructor(private readonly spinVault: SpinVaultService, private readonly router: Router) {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
    this.identitySubscription = this.spinVault.identity$.subscribe((identity) => {
      this.identity = identity;
      if (this.open && identity) void this.startChat();
      if (!identity) this.resetChat();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) {
      this.error = '';
      if (this.identity) void this.startChat();
    } else {
      this.resetChat();
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeAnnouncement?.();
    this.typingChannel?.unsubscribe();
    this.clearTypingTimers();
    this.clearPreview();
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
    this.identitySubscription.unsubscribe();
  }

  get filteredMessages(): SpinVaultMessage[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.messages;
    return this.messages.filter((message) =>
      [message.content, message.request_type ?? '', message.amount?.toString() ?? '', message.request_status ?? '']
        .some((value) => value.toLowerCase().includes(query))
    );
  }

  async submitAuth(): Promise<void> {
    if (!this.username.trim() || !this.pin) {
      this.error = 'Enter your username and PIN to continue.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      await this.spinVault.signInWithPin(this.username, this.pin);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.busy = false;
    }
  }

  toggleRequest(type: 'load' | 'cashout'): void {
    this.requestType = this.requestType === type ? null : type;
  }

  async sendText(): Promise<void> {
    const content = this.draft.trim();
    if (!content || !this.adminId || !this.online) return;
    this.busy = true;
    this.error = '';
    const optimistic = this.optimisticMessage(content);
    this.upsertMessage(optimistic);
    try {
      const message = await this.spinVault.sendMessage(this.adminId, content);
      this.messages = this.messages.filter((item) => item.id !== optimistic.id);
      this.upsertMessage(message);
      this.draft = '';
    } catch (error) {
      this.messages = this.messages.map((item) =>
        item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item
      );
      this.reportError(error);
    } finally {
      this.stopTyping();
      this.busy = false;
    }
  }

  async sendRequest(): Promise<void> {
    const amount = Number(this.requestAmount);
    if (!this.requestType || !this.adminId || !this.online || !Number.isFinite(amount) || amount <= 0) {
      this.error = 'Enter an amount greater than $0.';
      return;
    }
    const type = this.requestType;
    const gameTitle = this.games.find((game) => game.id === this.selectedGameId)?.title;
    const content = `${type === 'load' ? 'Load' : 'Cash-out'} request — $${amount.toFixed(2)}${gameTitle ? ` · ${gameTitle}` : ''}`;
    this.busy = true;
    this.error = '';
    const optimistic = this.optimisticMessage(content, type, amount);
    this.upsertMessage(optimistic);
    try {
      const message = await this.spinVault.sendMessage(this.adminId, content, type, amount);
      this.messages = this.messages.filter((item) => item.id !== optimistic.id);
      this.upsertMessage(message);
      this.requestType = null;
      this.selectedGameId = '';
    } catch (error) {
      this.messages = this.messages.map((item) =>
        item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item
      );
      this.reportError(error);
    } finally {
      this.busy = false;
    }
  }

  close(): void {
    this.closed.emit();
  }

  selectImage(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    this.clearPreview();
    this.imageFile = input.files[0];
    this.previewUrl = URL.createObjectURL(this.imageFile);
    this.imageZoom = 1;
    input.value = '';
  }

  async uploadPreview(): Promise<void> {
    if (!this.imageFile || !this.adminId || !this.online) return;
    this.uploading = true;
    this.error = '';
    try {
      this.upsertMessage(await this.spinVault.uploadChatImage(this.adminId, this.imageFile, this.imageZoom));
      this.clearPreview();
    } catch (error) {
      this.reportError(error);
    } finally {
      this.uploading = false;
    }
  }

  cancelImagePreview(): void { this.clearPreview(); }

  onTyping(): void {
    if (!this.typingChannel) return;
    if (!this.typingBroadcastActive) {
      this.typingChannel.setTyping(true);
      this.typingBroadcastActive = true;
    }
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => this.stopTyping(), 1800);
  }

  private stopTyping(): void {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = null;
    if (this.typingBroadcastActive) this.typingChannel?.setTyping(false);
    this.typingBroadcastActive = false;
  }

  private clearTypingTimers(): void {
    this.stopTyping();
    if (this.otherTypingTimeout) clearTimeout(this.otherTypingTimeout);
    this.otherTypingTimeout = null;
  }

  private setOtherTyping(typing: boolean): void {
    this.otherTyping = typing;
    if (this.otherTypingTimeout) clearTimeout(this.otherTypingTimeout);
    this.otherTypingTimeout = typing ? setTimeout(() => this.otherTyping = false, 2500) : null;
  }

  private optimisticMessage(content: string, type: 'load' | 'cashout' | null = null, amount: number | null = null): SpinVaultMessage {
    const identity = this.identity;
    if (!identity || !this.adminId) throw new Error('Your chat session is not ready.');
    return {
      id: `pending-${crypto.randomUUID()}`,
      sender_id: identity.id,
      receiver_id: this.adminId,
      content,
      request_type: type,
      amount,
      request_status: type ? 'pending' : null,
      attachment_path: null,
      attachment_name: null,
      created_at: new Date().toISOString(),
      delivery_status: 'pending'
    };
  }

  private clearPreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.imageFile = null;
  }

  private async startChat(): Promise<void> {
    const identity = this.identity;
    if (!identity || this.chatStarted) return;
    if (identity.role === 'admin' || identity.is_super_admin) {
      this.close();
      void this.router.navigateByUrl('/admin');
      return;
    }
    this.chatStarted = true;
    this.busy = true;
    this.error = '';
    try {
      const admin = await this.spinVault.findAdmin();
      this.adminId = admin.id;
      this.messages = await this.spinVault.loadConversation(admin.id);
      this.paymentMethods = await this.spinVault.loadPaymentMethods();
      this.games = await this.spinVault.loadGames();
      this.announcement = await this.spinVault.loadPinnedAnnouncement();
      if (!this.open || this.identity?.id !== identity.id) return;
      this.unsubscribeAnnouncement = this.spinVault.subscribeToPinnedAnnouncement(
        (announcement) => this.announcement = announcement,
        (message) => this.reportError(new Error(message))
      );
      this.typingChannel = this.spinVault.subscribeToTyping(
        admin.id,
        (typing) => this.setOtherTyping(typing),
        (message) => this.reportError(new Error(message))
      );
      this.unsubscribeMessages = this.spinVault.subscribeToMessages(async (message) => {
        if (
          (message.sender_id === admin.id && message.receiver_id === this.identity?.id) ||
          (message.sender_id === this.identity?.id && message.receiver_id === admin.id)
        ) {
          try {
            this.upsertMessage(await this.spinVault.resolveMessageAttachment(message));
          } catch (error) {
            this.reportError(error);
          }
        }
      }, (message) => this.reportError(new Error(message)));
    } catch (error) {
      this.chatStarted = false;
      this.reportError(error);
    } finally {
      this.busy = false;
    }
  }

  private upsertMessage(message: SpinVaultMessage): void {
    const byId = new Map(this.messages.map((item) => [item.id, item]));
    byId.set(message.id, { ...byId.get(message.id), ...message });
    this.messages = [...byId.values()].sort(
      (first, second) => Date.parse(first.created_at) - Date.parse(second.created_at)
    );
  }

  private resetChat(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeAnnouncement?.();
    this.typingChannel?.unsubscribe();
    this.unsubscribeAnnouncement = null;
    this.typingChannel = null;
    this.clearTypingTimers();
    this.unsubscribeMessages = null;
    this.adminId = null;
    this.chatStarted = false;
    this.messages = [];
    this.paymentMethods = [];
    this.games = [];
    this.announcement = null;
    this.otherTyping = false;
    this.clearPreview();
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to complete this request.';
  }

  private reportError(error: unknown): void {
    this.error = this.message(error);
    void this.spinVault.logSystemError(error).catch((loggingError: unknown) => {
      this.error = `${this.error} (Could not record this issue: ${this.message(loggingError)})`;
    });
  }
}
