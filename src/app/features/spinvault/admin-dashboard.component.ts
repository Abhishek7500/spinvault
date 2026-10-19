import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import {
  SpinVaultAuditLog,
  SpinVaultAnnouncement,
  SpinVaultIdentity,
  SpinVaultMessage,
  SpinVaultPaymentMethod,
  SpinVaultProfile,
  SpinVaultThread,
  SpinVaultService
} from '../../core/services/spinvault.service';

type RequestAction = 'approve' | 'deny' | 'loaded' | 'cashout_sent' | 'verification_required';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  template: `
    <main class="admin-page">
      <header class="admin-topbar">
        <a class="admin-brand" routerLink="/"><span class="brand-mark">S</span> Spin<span>Vault</span><b>ADMIN</b></a>
        <a routerLink="/">← Back to site</a>
      </header>
      <section class="admin-heading">
        <div><div class="eyebrow"><span></span> SUPPORT CONSOLE</div><h1>Player <em>inbox</em></h1><p>Private conversations, live and in one place.</p></div>
        <div class="admin-status"><span></span> LIVE SUPPORT</div>
      </section>
      @if (error) { <p class="admin-error" role="alert">{{ error }}</p> }
      <nav class="admin-tabs" aria-label="Admin sections">
        <button type="button" [class.active]="activeTab === 'inbox'" (click)="activeTab = 'inbox'">Player inbox</button>
        <button type="button" [class.active]="activeTab === 'players'" (click)="openPlayers()">Player access</button>
        @if (identity?.is_super_admin) {
          <button type="button" [class.active]="activeTab === 'approvals'" (click)="openApprovals()">Admin approvals</button>
          <button type="button" [class.active]="activeTab === 'telemetry'" (click)="openTelemetry()">Live users</button>
        }
        <button type="button" [class.active]="activeTab === 'audit'" (click)="openAudit()">Audit stream</button>
        <button type="button" [class.active]="activeTab === 'payments'" (click)="openPayments()">Payment methods</button>
        <button type="button" [class.active]="activeTab === 'announcements'" (click)="openAnnouncements()">Pinned notice</button>
      </nav>
      @if (activeTab === 'inbox') {
      <section class="admin-layout" [class.thread-open]="selectedThread">
        <aside class="inbox-panel">
          <header class="inbox-heading"><div><h2>Conversations</h2><p>{{ threads.length }} player{{ threads.length === 1 ? '' : 's' }} in your inbox</p></div><span class="inbox-count">{{ threads.length }}</span></header>
          @if (loadingInbox && !threads.length) {
            <p class="inbox-empty">Loading conversations…</p>
          } @else if (!threads.length) {
            <div class="inbox-empty"><span>⌁</span><strong>No messages yet</strong><p>New player conversations will appear here.</p></div>
          } @else {
            <div class="inbox-list">
              @for (thread of threads; track thread.profile.id) {
                <button type="button" class="inbox-item" [class.active]="selectedThread?.profile?.id === thread.profile.id" (click)="openThread(thread)">
                  <span class="player-avatar">{{ initials(thread.profile.username) }}<i></i></span>
                  <span class="player-details"><strong>{{ thread.profile.username }}</strong><small>{{ thread.latestMessage.content }}</small></span>
                  <time>{{ thread.latestMessage.created_at | date:'shortTime' }}</time>
                </button>
              }
            </div>
          }
        </aside>
        <section class="conversation-panel">
          @if (selectedThread; as active) {
            <header class="conversation-heading">
              <button class="mobile-back" type="button" (click)="selectedThread = null">← Inbox</button>
              <span class="player-avatar active-avatar">{{ initials(active.profile.username) }}<i></i></span>
              <div><h2>{{ active.profile.username }}</h2><p><span></span> Private conversation</p></div>
              <span class="private-label">1-ON-1 PRIVATE CHAT</span>
            </header>
            @if (announcement) { <aside class="admin-pinned" role="status">📌 {{ announcement.body }}</aside> }
            @if (!online) { <p class="admin-offline" role="status">Offline — reconnect to send messages or update requests.</p> }
            <label class="admin-search">Search messages<input name="messageSearch" [(ngModel)]="searchQuery" placeholder="Keyword, amount, load, cash-out…" /></label>
            <div class="admin-messages" aria-live="polite">
              @if (!messages.length) { <div class="admin-no-messages">No messages in this conversation yet.</div> }
              @if (messages.length && !filteredMessages.length) { <div class="admin-no-messages">No messages match your search.</div> }
              @for (message of filteredMessages; track message.id) {
                <article class="admin-message" [class.admin-message-mine]="message.sender_id === identity?.id">
                  <div class="admin-bubble">
                    @if (message.request_type) {
                      <div class="payload-chip">{{ message.request_type === 'load' ? '↙ LOAD REQUEST' : '↗ CASH-OUT REQUEST' }} <strong>&#36;{{ message.amount | number:'1.2-2' }}</strong></div>
                      <div class="request-action-row">
                        <span class="request-state">{{ message.request_status?.replace('_', ' ') || 'pending' }}</span>
                        <div>
                          <button type="button" [disabled]="requestActionDisabled(message, 'approve')" (click)="processRequest(message, 'approve')">Approve</button>
                          <button type="button" [disabled]="requestActionDisabled(message, 'deny')" (click)="processRequest(message, 'deny')">Deny</button>
                          <button type="button" [disabled]="requestActionDisabled(message, 'loaded')" (click)="processRequest(message, 'loaded')">Loaded!! Goodluck 🍀</button>
                          <button type="button" [disabled]="requestActionDisabled(message, 'cashout_sent')" (click)="processRequest(message, 'cashout_sent')">Cash out Completed 💸</button>
                          <button type="button" [disabled]="requestActionDisabled(message, 'verification_required')" (click)="processRequest(message, 'verification_required')">Verification Required ⚠️</button>
                        </div>
                      </div>
                    }
                    <p>{{ message.content }}</p>
                    @if (message.attachment_url) { <a class="admin-image-link" [href]="message.attachment_url" target="_blank" rel="noopener noreferrer"><img [src]="message.attachment_url" [alt]="message.attachment_name || 'Chat image'" loading="lazy" /></a> }
                    @if (message.delivery_status === 'pending') { <small class="message-delivery">Sending…</small> }
                    @if (message.delivery_status === 'failed') { <small class="message-delivery failed">Not sent · reconnect and retry</small> }
                    <time>{{ message.created_at | date:'medium' }}</time>
                  </div>
                </article>
              }
            </div>
            @if (otherTyping) { <p class="admin-typing">{{ active.profile.username }} is typing…</p> }
            @if (previewUrl) {
              <div class="admin-image-preview"><img [src]="previewUrl" alt="Selected image preview" [style.transform]="'scale(' + imageZoom + ')'" /><label>Crop zoom<input type="range" min="1" max="1.5" step="0.05" [(ngModel)]="imageZoom" name="imageZoom" /></label><button type="button" (click)="cancelImagePreview()">Remove</button><button type="button" [disabled]="uploading || !online" (click)="uploadPreview()">Send image</button></div>
            }
            <form class="admin-composer" (ngSubmit)="sendReply()">
              <input name="reply" [(ngModel)]="reply" (input)="onTyping()" placeholder="Write a reply to {{ active.profile.username }}…" aria-label="Reply to player" autocomplete="off" />
              <label class="admin-attach" title="Attach an image"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="selectImage($event)" [disabled]="sending || uploading" />{{ uploading ? '…' : '▧' }}</label>
              <button type="submit" [disabled]="sending || !online || !reply.trim()">{{ sending ? 'Sending…' : 'Send reply' }} <span>↑</span></button>
            </form>
            <div class="canned-replies"><button type="button" (click)="sendCannedReply('Loaded!! Goodluck 🍀')">Loaded!! Goodluck 🍀</button><button type="button" (click)="sendCannedReply('Cash out Completed 💸')">Cash out Completed 💸</button><button type="button" (click)="sendCannedReply('Verification Required ⚠️')">Verification Required ⚠️</button></div>
          } @else {
            <div class="conversation-placeholder"><div class="placeholder-orb">⌁</div><h2>Your support, <em>in sync.</em></h2><p>Select a player from the inbox to open their private conversation.</p><span>Messages update automatically in real time.</span></div>
          }
        </section>
      </section>
      } @else if (activeTab === 'payments') {
          <section class="payments-panel">
            <header class="payments-title"><div><div class="eyebrow"><span></span> PLAYER CHECKOUT DETAILS</div><h2>Payment <em>methods</em></h2><p>Manage instructions and private QR images displayed in player chat.</p></div></header>
            <div class="payments-layout">
              <form class="payment-editor" (ngSubmit)="savePaymentMethod()">
                <h3>{{ editingPaymentId ? 'Edit payment option' : 'Add payment option' }}</h3>
                <label>Payment provider<input name="paymentName" [(ngModel)]="paymentName" required maxlength="60" placeholder="Cash App, Zelle, Venmo…" /></label>
                <label>Instructions<textarea name="paymentInstructions" [(ngModel)]="paymentInstructions" rows="4" maxlength="1000" placeholder="Add payment handle or instructions for players"></textarea></label>
                <label class="payment-file">QR code image<input type="file" accept="image/jpeg,image/png,image/webp" (change)="selectQr($event)" /><small>{{ qrFile?.name || 'Optional image, up to 5 MB' }}</small></label>
                <label class="payment-enabled"><input type="checkbox" name="paymentEnabled" [(ngModel)]="paymentEnabled" /> Show this option to players</label>
                <div class="payment-editor-actions"><button type="submit" [disabled]="savingPayment">{{ savingPayment ? 'Saving…' : 'Save payment method' }}</button>@if (editingPaymentId) { <button type="button" (click)="resetPaymentForm()">Cancel edit</button> }</div>
              </form>
              <section class="payment-list"><header><h3>Configured options</h3><span>{{ paymentMethods.length }}</span></header>
                @if (!paymentMethods.length) { <p class="payment-empty">No payment methods yet. Add one to show details in player chat.</p> }
                @for (method of paymentMethods; track method.id) {
                  <article class="payment-item">
                    @if (method.qr_code_url) { <img [src]="method.qr_code_url" [alt]="method.name + ' QR code'" loading="lazy" /> } @else { <span class="qr-placeholder">QR</span> }
                    <div><strong>{{ method.name }}</strong><p>{{ method.instructions || 'No instructions provided.' }}</p><small [class.method-off]="!method.enabled">{{ method.enabled ? 'Visible to players' : 'Hidden from players' }}</small></div>
                    <button type="button" (click)="editPayment(method)">Edit</button>
                  </article>
                }
              </section>
            </div>
          </section>
        } @else if (activeTab === 'announcements') {
          <section class="management-panel">
            <header class="management-title"><div><div class="eyebrow"><span></span> PLAYER CHAT</div><h2>Pinned <em>announcement</em></h2><p>This notice appears at the top of every player support conversation.</p></div></header>
            <form class="announcement-editor" (ngSubmit)="saveAnnouncement()"><label>Notice<textarea name="announcementBody" [(ngModel)]="announcementDraft" maxlength="500" rows="4" placeholder="Share rules, service updates, or bonus information."></textarea></label><small>{{ announcementDraft.length }}/500 characters</small><div><button type="submit" [disabled]="savingAnnouncement">{{ savingAnnouncement ? 'Saving…' : 'Pin announcement' }}</button><button type="button" (click)="clearAnnouncement()" [disabled]="savingAnnouncement || !announcement">Remove announcement</button></div></form>
            @if (announcement) { <aside class="admin-pinned announcement-current">📌 {{ announcement.body }}</aside> }
          </section>
        } @else if (activeTab === 'players') {
          <section class="management-panel">
            <header class="management-title"><div><div class="eyebrow"><span></span> ACCOUNT ACCESS</div><h2>Player <em>credentials</em></h2><p>Create username/PIN access or reset an existing player account.</p></div></header>
            @if (notice) { <p class="management-notice" role="status">{{ notice }}</p> }
            <div class="management-grid">
              <form class="management-card" (ngSubmit)="savePlayerCredentials()">
                <h3>{{ targetUserId ? 'Reset player access' : 'Create player access' }}</h3>
                <label>Account
                  <select name="targetUserId" [(ngModel)]="targetUserId" (ngModelChange)="selectPlayer($event)">
                    <option [ngValue]="null">Create a new player</option>
                    @for (player of players; track player.id) {
                      <option [ngValue]="player.id">{{ player.custom_username || player.username }}</option>
                    }
                  </select>
                </label>
                <label>Username<input name="newUsername" [(ngModel)]="newUsername" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]+" autocomplete="off" /></label>
                <label>New PIN<input name="newPin" [(ngModel)]="newPin" required minlength="6" maxlength="32" pattern="[A-Za-z0-9]+" autocomplete="new-password" type="password" /></label>
                <small>Use 6–32 letters or numbers. PINs are never displayed after saving.</small>
                <button type="submit" [disabled]="savingCredentials">{{ savingCredentials ? 'Saving…' : targetUserId ? 'Reset username and PIN' : 'Create player' }}</button>
              </form>
              <section class="management-card player-list-card">
                <header><h3>Player accounts</h3><button type="button" (click)="openPlayers()">Refresh</button></header>
                @if (!players.length) { <p class="management-empty">No player accounts found.</p> }
                @for (player of players; track player.id) {
                  <article class="player-access-item"><span><strong>{{ player.custom_username || player.username }}</strong><small>{{ player.admin_status || 'none' }} · {{ player.id }}</small></span><button type="button" (click)="editPlayer(player)">Reset access</button></article>
                }
              </section>
            </div>
          </section>
        } @else if (activeTab === 'approvals') {
          <section class="management-panel">
            <header class="management-title"><div><div class="eyebrow"><span></span> SUPER ADMIN</div><h2>Admin <em>approvals</em></h2><p>Review player requests for administrator access.</p></div><button type="button" (click)="openApprovals()">Refresh queue</button></header>
            @if (notice) { <p class="management-notice" role="status">{{ notice }}</p> }
            <div class="management-card queue-card">
              @if (!adminRequests.length) { <p class="management-empty">No pending admin requests.</p> }
              @for (request of adminRequests; track request.id) {
                <article class="approval-item"><div><strong>{{ request.custom_username || request.username }}</strong><small>Requested {{ request.admin_requested_at | date:'medium' }}</small></div><div><button type="button" (click)="reviewRequest(request, true)">Approve</button><button type="button" class="danger-action" (click)="reviewRequest(request, false)">Reject</button></div></article>
              }
            </div>
          </section>
        } @else if (activeTab === 'telemetry') {
          <section class="management-panel">
            <header class="management-title"><div><div class="eyebrow"><span></span> SUPER ADMIN</div><h2>Live <em>telemetry</em></h2><p>Authenticated users seen within the last five minutes. Refreshes automatically.</p></div><button type="button" (click)="openTelemetry()">Refresh</button></header>
            <div class="metric-card"><span class="metric-number">{{ activeUsers.length }}</span><span class="metric-label">ACTIVE NOW</span><small>Last updated {{ telemetryUpdatedAt | date:'shortTime' }}</small></div>
            <div class="management-card telemetry-list">
              @for (user of activeUsers; track user.id) {
                <article class="player-access-item"><span><strong>{{ user.custom_username || user.username }}</strong><small>Seen {{ user.last_seen | date:'mediumTime' }}</small></span><i>ONLINE</i></article>
              }
              @if (!activeUsers.length) { <p class="management-empty">No active sessions in the last five minutes.</p> }
            </div>
          </section>
        } @else if (activeTab === 'audit') {
          <section class="management-panel">
            <header class="management-title"><div><div class="eyebrow"><span></span> LIVE DIAGNOSTICS</div><h2>System <em>audit stream</em></h2><p>Recent failed PIN attempts and user-reported errors.</p></div><button type="button" (click)="openAudit()">Refresh</button></header>
            <div class="management-card audit-list">
              @for (entry of auditLogs; track entry.id) {
                <article class="audit-item"><div><strong>{{ entry.event_type.replace('_', ' ') }}</strong><small>{{ entry.username || 'Unknown username' }} · {{ entry.created_at | date:'medium' }}</small></div><p>{{ entry.error_message }}</p></article>
              }
              @if (!auditLogs.length) { <p class="management-empty">No recent audit events.</p> }
            </div>
          </section>
        }
      <footer class="admin-footer"><a routerLink="/">SpinVault</a><span>Support conversations are visible only to the player and authorized admins.</span></footer>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#0b0c1b;color:#f8f7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}
    .admin-page{min-height:100vh;padding:0 25px 24px;background:radial-gradient(ellipse at 50% 0,rgba(55,22,83,.19),transparent 40%),#0b0c1b}.admin-topbar{height:72px;max-width:1200px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.075)}.admin-topbar>a:last-child{font-size:11px;color:#9695aa;text-decoration:none}
    .admin-brand{display:flex;align-items:center;gap:7px;color:#fff;text-decoration:none;font-weight:850;font-size:17px}.admin-brand>span:nth-child(2){color:#ff2c93}.brand-mark{width:28px;height:28px;display:grid;place-items:center;border:1px solid #ff007f;border-radius:8px;box-shadow:0 0 12px rgba(255,0,127,.2)}.admin-brand b{font-size:8px;letter-spacing:1.3px;color:#00e8ef;background:rgba(0,243,255,.08);border:1px solid rgba(0,243,255,.17);border-radius:4px;padding:4px 5px;margin-left:5px}
    .admin-heading{max-width:1200px;margin:29px auto 19px;display:flex;align-items:flex-end;justify-content:space-between}.eyebrow{color:#00dce8;font-size:9px;letter-spacing:1.8px;font-weight:800;display:flex;gap:8px;align-items:center}.eyebrow span,.admin-status span{width:6px;height:6px;border-radius:50%;background:#00f3ff;box-shadow:0 0 9px #00f3ff}.admin-heading h1{font-size:31px;letter-spacing:-1.3px;margin:8px 0 5px}.admin-heading h1 em,.conversation-placeholder h2 em{font-style:normal;color:#ff2c93}.admin-heading p{font-size:11px;color:#88879d;margin:0}.admin-status{display:flex;align-items:center;gap:8px;color:#67dbb8;font-size:8px;letter-spacing:1.3px;border:1px solid rgba(45,230,163,.17);background:rgba(45,230,163,.05);border-radius:20px;padding:8px 11px;margin-bottom:4px}
    .admin-error{max-width:1200px;margin:0 auto 13px;border:1px solid rgba(255,110,125,.2);border-radius:7px;background:rgba(255,70,90,.06);color:#ff9cab;padding:10px;font-size:11px}
    .admin-layout{max-width:1200px;height:min(670px,calc(100dvh - 190px));min-height:430px;margin:auto;display:grid;grid-template-columns:310px minmax(0,1fr);border:1px solid rgba(255,255,255,.09);border-radius:13px;overflow:hidden;background:rgba(17,18,37,.83);box-shadow:0 20px 70px rgba(0,0,0,.15)}
    .inbox-panel{min-width:0;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.08)}.inbox-heading{height:73px;padding:0 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.07)}.inbox-heading h2{font-size:13px;margin:0}.inbox-heading p{font-size:9px;color:#85849b;margin:5px 0 0}.inbox-count{min-width:22px;height:22px;padding:0 6px;border-radius:7px;display:grid;place-items:center;background:rgba(255,0,127,.1);color:#ff69af;font-size:10px;font-weight:800}
    .inbox-list{overflow:auto;padding:6px}.inbox-item{width:100%;height:68px;display:flex;align-items:center;gap:10px;padding:8px;border:0;border-radius:8px;text-align:left;background:transparent;color:#fff;cursor:pointer}.inbox-item:hover,.inbox-item.active{background:rgba(0,243,255,.055)}.inbox-item.active{box-shadow:inset 2px 0 #00e5ed}.player-avatar{width:35px;height:35px;flex:none;position:relative;display:grid;place-items:center;border:1px solid rgba(255,0,127,.18);border-radius:11px;background:linear-gradient(145deg,#4d254d,#25233f);color:#ffc2df;font-size:11px;font-weight:850}.player-avatar i{position:absolute;width:8px;height:8px;right:-2px;bottom:-2px;border:2px solid #111226;border-radius:50%;background:#36dda7}
    .player-details{flex:1;min-width:0}.player-details strong,.player-details small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.player-details strong{font-size:10px}.player-details small{font-size:9px;color:#89889e;margin-top:5px}.inbox-item time{align-self:flex-start;padding-top:4px;color:#77768b;font-size:8px}
    .inbox-empty{margin:auto;text-align:center;padding:20px;color:#8a899e;font-size:10px}.inbox-empty>span{display:block;font-size:24px;color:#00e5ed;margin-bottom:8px}.inbox-empty strong{display:block;color:#c7c6d4;font-size:11px}.inbox-empty p{font-size:9px;line-height:1.6}
    .conversation-panel{min-width:0;display:flex;flex-direction:column}.conversation-heading{height:73px;flex:none;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;gap:10px;padding:0 17px}.conversation-heading h2{font-size:12px;margin:0}.conversation-heading p{margin:5px 0 0;color:#78d9b2;font-size:9px}.conversation-heading p span{display:inline-block;width:5px;height:5px;border-radius:50%;background:#40e3a8;margin:0 4px 1px 0}.active-avatar{width:32px;height:32px}.private-label{margin-left:auto;color:#77768d;font-size:8px;letter-spacing:1px}
    .admin-messages{flex:1;overflow-y:auto;padding:18px}.admin-message{display:flex;margin:10px 0}.admin-message-mine{justify-content:flex-end}.admin-bubble{max-width:min(82%,500px);padding:10px 12px;background:#1d1e37;border:1px solid rgba(255,255,255,.06);border-radius:11px 11px 11px 3px}.admin-message-mine .admin-bubble{border-color:rgba(255,0,127,.19);background:linear-gradient(130deg,rgba(255,0,127,.12),rgba(98,29,104,.16));border-radius:11px 11px 3px 11px}.admin-bubble>p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.55}.admin-bubble time{display:block;margin-top:7px;color:#77768e;font-size:8px;text-align:right}.payload-chip{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:8px;padding:6px 7px;border-radius:5px;background:rgba(0,243,255,.07);color:#00e0e8;font-size:8px;font-weight:850;letter-spacing:.5px}.payload-chip strong{color:#f7f5ff;font-size:10px;letter-spacing:0}
    .admin-no-messages{margin:auto;color:#7f7e95;font-size:10px}.admin-composer{display:flex;gap:9px;padding:12px;border-top:1px solid rgba(255,255,255,.07)}.admin-composer input{flex:1;min-width:0;height:39px;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:0 12px;background:#17182e;color:#fff;outline:none;font:inherit;font-size:10px}.admin-composer input:focus{border-color:rgba(0,243,255,.45)}.admin-composer button{height:39px;border:0;border-radius:8px;padding:0 13px;background:linear-gradient(100deg,#ff007f,#ca0999);color:#fff;font-size:9px;font-weight:800;cursor:pointer}.admin-composer button span{margin-left:9px}.admin-composer button:disabled{opacity:.48}
    .admin-tabs{max-width:1200px;margin:0 auto 12px;display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.admin-tabs button{border:1px solid rgba(255,255,255,.09);border-radius:7px;padding:9px 12px;background:#15162b;color:#a6a5b9;font-size:10px;font-weight:700;cursor:pointer}.admin-tabs button.active{border-color:rgba(0,243,255,.3);background:rgba(0,243,255,.07);color:#8af5f7}
    .request-action-row{display:grid;gap:7px;margin:8px 0}.request-state{color:#bcbacf;font-size:8px;text-transform:capitalize}.request-action-row>div{display:flex;flex-wrap:wrap;gap:5px}.request-action-row button{border:1px solid rgba(0,243,255,.18);border-radius:5px;padding:5px 7px;background:rgba(0,243,255,.05);color:#a3eef0;font-size:8px;font-weight:700;cursor:pointer}.request-action-row button:nth-child(2){border-color:rgba(255,75,110,.2);background:rgba(255,75,110,.05);color:#ff9eaf}.request-action-row button:disabled{opacity:.35;cursor:not-allowed}
    .admin-image-link{display:block;margin-top:8px}.admin-image-link img{max-width:240px;max-height:200px;border-radius:7px;object-fit:contain}.admin-attach{width:36px;height:39px;flex:none;display:grid;place-items:center;border:1px solid rgba(0,243,255,.2);border-radius:8px;color:#7cebf0;font-size:15px;cursor:pointer}.admin-attach input{display:none}
    .admin-pinned,.admin-offline{flex:none;margin:9px 14px 0;padding:8px 10px;border:1px solid rgba(0,243,255,.2);border-radius:7px;background:rgba(0,243,255,.06);color:#b4f9fa;font-size:9px;line-height:1.5}.admin-offline{border-color:rgba(255,175,60,.28);background:rgba(255,175,60,.08);color:#ffd39b}.admin-search{flex:none;padding:8px 14px 0;color:#a4a3b6;font-size:9px}.admin-search input{display:block;width:100%;height:32px;margin-top:5px;padding:0 9px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#18192e;color:#e9e8f3;font:inherit}.admin-typing{flex:none;margin:0 17px 7px;color:#80e9ed;font-size:9px}.message-delivery{display:block;color:#91dadd;font-size:8px}.message-delivery.failed{color:#ff9cab}.admin-image-preview{display:grid;grid-template-columns:64px 1fr auto auto;align-items:center;gap:8px;margin:0 16px 8px;padding:7px;border:1px solid rgba(0,243,255,.16);border-radius:8px;background:#18192e}.admin-image-preview img{width:58px;height:48px;object-fit:cover;border-radius:5px}.admin-image-preview label{color:#aaa9bb;font-size:8px}.admin-image-preview label input{display:block;width:100%}.admin-image-preview button,.canned-replies button{border:0;background:transparent;color:#8cecf0;font-size:8px;cursor:pointer}.canned-replies{display:flex;flex-wrap:wrap;gap:5px;padding:0 16px 9px}.canned-replies button{padding:5px 7px;border:1px solid rgba(0,243,255,.15);border-radius:6px;background:rgba(0,243,255,.04)}.announcement-editor{max-width:700px;padding:19px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#121329}.announcement-editor label{display:grid;gap:8px;color:#d4d3e0;font-size:11px;font-weight:700}.announcement-editor textarea{padding:11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#0e0f20;color:#fff;font:inherit;font-size:12px;resize:vertical}.announcement-editor small{display:block;margin:7px 0;color:#88879a;font-size:9px}.announcement-editor>div{display:flex;gap:8px}.announcement-editor button{min-height:36px;padding:0 11px;border:0;border-radius:7px;background:#ff168b;color:#fff;font-size:9px;font-weight:750;cursor:pointer}.announcement-editor button+button{border:1px solid rgba(255,255,255,.13);background:transparent;color:#c1c0d0}.announcement-current{margin:16px 0;max-width:700px}
    .payments-panel{max-width:1200px;min-height:460px;margin:0 auto;border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:20px;background:rgba(17,18,37,.83)}.payments-title h2{font-size:24px;margin:10px 0 5px}.payments-title h2 em{font-style:normal;color:#ff2c93}.payments-title p{color:#9291a6;font-size:10px;margin:0}.payments-layout{display:grid;grid-template-columns:minmax(230px,.8fr) minmax(0,1.2fr);gap:18px;margin-top:20px}.payment-editor,.payment-list{border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02);padding:15px}.payment-editor h3,.payment-list h3{margin:0 0 13px;font-size:12px}.payment-editor>label{display:block;margin:11px 0;color:#bbb9cd;font-size:9px;font-weight:650}.payment-editor input:not([type=checkbox]),.payment-editor textarea{display:block;width:100%;margin-top:6px;border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:9px;background:#15162b;color:#fff;font:inherit;font-size:10px;outline:none}.payment-editor textarea{resize:vertical}.payment-file input{padding:7px!important}.payment-file small{display:block;margin-top:5px;color:#77768b;font-size:8px}.payment-enabled{display:flex!important;align-items:center;gap:7px}.payment-enabled input{accent-color:#ff168b}.payment-editor-actions{display:flex;gap:8px}.payment-editor-actions button,.payment-item>button{border:0;border-radius:6px;padding:9px 10px;background:#d70b91;color:white;font-size:9px;font-weight:750;cursor:pointer}.payment-editor-actions button:disabled{opacity:.5}.payment-editor-actions button+button,.payment-item>button{border:1px solid rgba(0,243,255,.2);background:rgba(0,243,255,.05);color:#9ceff1}.payment-list>header{display:flex;justify-content:space-between}.payment-list>header span{color:#00e5ed;font-size:9px}.payment-item{display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#17182d}.payment-item>img,.qr-placeholder{width:47px;height:47px;flex:none;border-radius:6px;object-fit:cover}.qr-placeholder{display:grid;place-items:center;background:rgba(0,243,255,.08);color:#00e5ed;font-size:9px}.payment-item>div{flex:1;min-width:0}.payment-item strong{font-size:10px}.payment-item p{margin:4px 0;color:#9998ad;font-size:9px;white-space:pre-wrap;overflow-wrap:anywhere}.payment-item small{color:#57d6a8;font-size:8px}.payment-item small.method-off{color:#ff9baa}.payment-empty{color:#89889d;font-size:10px;line-height:1.6}
    .conversation-placeholder{margin:auto;text-align:center;padding:20px}.placeholder-orb{height:58px;width:58px;margin:0 auto 18px;display:grid;place-items:center;border:1px solid rgba(0,243,255,.24);border-radius:19px;background:rgba(0,243,255,.06);color:#00e5ed;font-size:32px}.conversation-placeholder h2{font-size:19px;margin:0 0 9px}.conversation-placeholder>p{max-width:270px;color:#9392a7;font-size:11px;line-height:1.7}.conversation-placeholder>span{font-size:9px;color:#69687f}.mobile-back{display:none}
    .admin-footer{max-width:1200px;margin:15px auto 0;display:flex;justify-content:space-between;color:#69687e;font-size:9px}.admin-footer a{color:#a19fb3;text-decoration:none}
    .management-panel{max-width:1200px;min-height:430px;margin:0 auto;padding:20px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(17,18,37,.83)}.management-title{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}.management-title h2{margin:10px 0 5px;font-size:24px}.management-title h2 em{font-style:normal;color:#ff2c93}.management-title p{margin:0;color:#9291a6;font-size:10px}.management-title>button,.management-card button{border:1px solid rgba(0,243,255,.22);border-radius:6px;padding:8px 11px;background:rgba(0,243,255,.06);color:#9ceff1;font-size:9px;font-weight:750;cursor:pointer}
    .management-grid{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(0,1.2fr);gap:15px}.management-card{min-width:0;padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}.management-card h3,.management-card header h3{margin:0 0 12px;font-size:12px}.management-card>label{display:block;margin:12px 0;color:#bbb9cd;font-size:9px;font-weight:700}.management-card input,.management-card select{display:block;width:100%;height:38px;margin-top:6px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#15162b;color:#fff;font:inherit;font-size:10px}.management-card>small{display:block;color:#88879d;font-size:8px;line-height:1.5}.management-card>button{margin-top:12px;background:linear-gradient(100deg,#ff007f,#ca0999);border:0;color:#fff}.management-card header{display:flex;align-items:center;justify-content:space-between}.management-card header h3{margin:0}.player-list-card{max-height:410px;overflow:auto}.player-access-item,.approval-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}.player-access-item:last-child,.approval-item:last-child{border-bottom:0}.player-access-item>span,.approval-item>div:first-child{min-width:0}.player-access-item strong,.player-access-item small,.approval-item strong,.approval-item small{display:block;overflow-wrap:anywhere}.player-access-item strong,.approval-item strong{font-size:10px}.player-access-item small,.approval-item small{margin-top:4px;color:#85849a;font-size:8px}.player-access-item>button{flex:none;padding:6px 8px}.approval-item>div:last-child{display:flex;gap:6px}.approval-item .danger-action{border-color:rgba(255,75,110,.2);background:rgba(255,75,110,.06);color:#ff9eaf}.management-empty{color:#89889d;font-size:10px}.management-notice{margin:0 0 12px;padding:9px;border:1px solid rgba(45,230,163,.18);border-radius:7px;background:rgba(45,230,163,.05);color:#8ce6c2;font-size:10px}.queue-card{max-width:760px}.metric-card{width:min(100%,230px);min-height:110px;margin-bottom:14px;padding:15px;border:1px solid rgba(0,243,255,.17);border-radius:10px;background:linear-gradient(145deg,rgba(0,243,255,.07),rgba(255,0,127,.04))}.metric-number,.metric-label,.metric-card small{display:block}.metric-number{color:#00f3ff;font-size:39px;font-weight:850;line-height:1}.metric-label{margin-top:6px;color:#bcbacf;font-size:8px;font-weight:800;letter-spacing:1.3px}.metric-card small{margin-top:9px;color:#85849a;font-size:8px}.telemetry-list{max-width:760px}.player-access-item i{color:#52dfaf;font-size:8px;font-style:normal;font-weight:800;letter-spacing:1px}.audit-list{max-width:900px;max-height:510px;overflow:auto}.audit-item{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}.audit-item:last-child{border-bottom:0}.audit-item>div{display:flex;justify-content:space-between;gap:10px}.audit-item strong{color:#ff9eaf;font-size:9px;text-transform:capitalize}.audit-item small{color:#85849a;font-size:8px}.audit-item p{margin:6px 0 0;color:#cfceda;font-size:10px;line-height:1.5;overflow-wrap:anywhere}
    @media(max-width:700px){.admin-page{padding:0 12px 16px}.admin-topbar{height:62px}.admin-heading{margin:22px auto 14px}.admin-heading h1{font-size:27px}.admin-status{font-size:7px;padding:7px}.admin-layout{height:calc(100dvh - 160px);min-height:420px;grid-template-columns:1fr}.inbox-panel{border-right:0}.conversation-panel{display:none}.admin-layout.thread-open .inbox-panel{display:none}.admin-layout.thread-open .conversation-panel{display:flex}.mobile-back{display:block;border:0;background:none;color:#00e5ed;font-size:10px;padding:8px 4px 8px 0}.conversation-heading{gap:7px;padding:0 10px}.conversation-heading .active-avatar{width:30px;height:30px}.private-label{font-size:7px}.admin-messages{padding:12px}.admin-footer{gap:12px;line-height:1.5}.admin-footer span{text-align:right}.payments-layout{grid-template-columns:1fr}.payments-panel{padding:13px}.payment-item{gap:7px}.payment-item>button{padding:7px}}
  `]
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  identity: SpinVaultIdentity | null = null;
  activeTab: 'inbox' | 'payments' | 'players' | 'approvals' | 'telemetry' | 'audit' | 'announcements' = 'inbox';
  threads: SpinVaultThread[] = [];
  selectedThread: SpinVaultThread | null = null;
  messages: SpinVaultMessage[] = [];
  reply = '';
  searchQuery = '';
  announcement: SpinVaultAnnouncement | null = null;
  announcementDraft = '';
  savingAnnouncement = false;
  online = navigator.onLine;
  otherTyping = false;
  previewUrl: string | null = null;
  imageZoom = 1;
  error = '';
  loadingInbox = true;
  sending = false;
  uploading = false;
  paymentMethods: SpinVaultPaymentMethod[] = [];
  paymentName = '';
  paymentInstructions = '';
  paymentEnabled = true;
  paymentSortOrder = 0;
  editingPaymentId: string | null = null;
  qrFile: File | null = null;
  savingPayment = false;
  processingRequestId: string | null = null;
  players: SpinVaultProfile[] = [];
  adminRequests: SpinVaultProfile[] = [];
  activeUsers: SpinVaultProfile[] = [];
  auditLogs: SpinVaultAuditLog[] = [];
  targetUserId: string | null = null;
  newUsername = '';
  newPin = '';
  notice = '';
  savingCredentials = false;
  telemetryUpdatedAt: Date | null = null;
  private unsubscribeMessages: (() => void) | null = null;
  private unsubscribeAdminSignals: (() => void) | null = null;
  private telemetrySubscription: Subscription | null = null;
  private typingChannel: { setTyping: (typing: boolean) => void; unsubscribe: () => void } | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingBroadcastActive = false;
  private otherTypingTimeout: ReturnType<typeof setTimeout> | null = null;
  private imageFile: File | null = null;
  private readonly onlineHandler = (): void => { this.online = true; };
  private readonly offlineHandler = (): void => { this.online = false; };

  constructor(private readonly spinVault: SpinVaultService) {
    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.spinVault.initialize();
      this.identity = this.spinVault.currentIdentity;
      if (this.identity?.role !== 'admin' && !this.identity?.is_super_admin) {
        this.error = 'This account does not have admin access.';
        return;
      }
      await this.refreshInbox();
      this.unsubscribeMessages = this.spinVault.subscribeToMessages((message) => {
        void this.onLiveMessage(message);
      }, (message) => (this.error = message));
      this.paymentMethods = await this.spinVault.loadPaymentMethods(true);
      this.announcement = await this.spinVault.loadPinnedAnnouncement();
      this.announcementDraft = this.announcement?.body ?? '';
      await this.refreshAdminSignals();
      this.unsubscribeAdminSignals = this.spinVault.subscribeToAdminSignals(() => {
        void this.refreshAdminSignals();
      }, (message) => (this.error = message));
      this.telemetrySubscription = interval(60_000).subscribe(() => {
        if (this.activeTab === 'telemetry' && this.identity?.is_super_admin) void this.openTelemetry();
      });
    } catch (error) {
      this.error = this.message(error);
      this.loadingInbox = false;
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeAdminSignals?.();
    this.telemetrySubscription?.unsubscribe();
    this.typingChannel?.unsubscribe();
    this.clearTypingTimers();
    this.clearPreview();
    window.removeEventListener('online', this.onlineHandler);
    window.removeEventListener('offline', this.offlineHandler);
  }

  get filteredMessages(): SpinVaultMessage[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.messages;
    return this.messages.filter((message) =>
      [message.content, message.request_type ?? '', message.amount?.toString() ?? '', message.request_status ?? '']
        .some((value) => value.toLowerCase().includes(query))
    );
  }

  async openPlayers(): Promise<void> {
    this.activeTab = 'players';
    this.notice = '';
    try {
      this.players = await this.spinVault.loadPlayerProfiles();
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async openApprovals(): Promise<void> {
    if (!this.identity?.is_super_admin) return;
    this.activeTab = 'approvals';
    try {
      this.adminRequests = await this.spinVault.loadAdminRequests();
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async openTelemetry(): Promise<void> {
    if (!this.identity?.is_super_admin) return;
    this.activeTab = 'telemetry';
    try {
      this.activeUsers = await this.spinVault.loadActiveUsers();
      this.telemetryUpdatedAt = new Date();
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async openAudit(): Promise<void> {
    this.activeTab = 'audit';
    try {
      this.auditLogs = await this.spinVault.loadAuditLogs();
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async openAnnouncements(): Promise<void> {
    this.activeTab = 'announcements';
    try {
      this.announcement = await this.spinVault.loadPinnedAnnouncement();
      this.announcementDraft = this.announcement?.body ?? '';
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async saveAnnouncement(): Promise<void> {
    this.savingAnnouncement = true;
    this.error = '';
    try {
      await this.spinVault.setPinnedAnnouncement(this.announcementDraft);
      this.announcement = await this.spinVault.loadPinnedAnnouncement();
      this.notice = 'Announcement pinned for player chats.';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.savingAnnouncement = false;
    }
  }

  async clearAnnouncement(): Promise<void> {
    this.savingAnnouncement = true;
    this.error = '';
    try {
      await this.spinVault.clearPinnedAnnouncement();
      this.announcement = null;
      this.announcementDraft = '';
      this.notice = 'Pinned announcement removed.';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.savingAnnouncement = false;
    }
  }

  selectPlayer(userId: string | null): void {
    this.targetUserId = userId;
    const player = this.players.find((profile) => profile.id === userId);
    this.newUsername = player?.custom_username ?? player?.username ?? '';
    this.newPin = '';
    this.notice = '';
  }

  editPlayer(profile: SpinVaultProfile): void {
    this.targetUserId = profile.id;
    this.newUsername = profile.custom_username ?? profile.username;
    this.newPin = '';
    this.notice = '';
  }

  async savePlayerCredentials(): Promise<void> {
    if (this.savingCredentials) return;
    this.savingCredentials = true;
    this.error = '';
    this.notice = '';
    try {
      const result = await this.spinVault.upsertPlayerCredentials(
        this.targetUserId,
        this.newUsername,
        this.newPin
      );
      this.notice = `Access saved for ${result.username}. Share the username and new PIN with the player securely.`;
      this.targetUserId = null;
      this.newUsername = '';
      this.newPin = '';
      this.players = await this.spinVault.loadPlayerProfiles();
    } catch (error) {
      this.reportError(error);
    } finally {
      this.savingCredentials = false;
    }
  }

  async reviewRequest(profile: SpinVaultProfile, approve: boolean): Promise<void> {
    if (!this.identity?.is_super_admin) return;
    try {
      await this.spinVault.reviewAdminRequest(profile.id, approve);
      this.adminRequests = this.adminRequests.filter((request) => request.id !== profile.id);
      this.notice = `${profile.custom_username || profile.username}'s request was ${approve ? 'approved' : 'rejected'}.`;
    } catch (error) {
      this.error = this.message(error);
    }
  }

  private async refreshAdminSignals(): Promise<void> {
    try {
      this.auditLogs = await this.spinVault.loadAuditLogs();
      if (this.identity?.is_super_admin) {
        [this.adminRequests, this.activeUsers] = await Promise.all([
          this.spinVault.loadAdminRequests(),
          this.spinVault.loadActiveUsers()
        ]);
        this.telemetryUpdatedAt = new Date();
      }
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async refreshInbox(): Promise<void> {
    this.loadingInbox = true;
    try {
      this.threads = await this.spinVault.loadAdminInbox();
      if (this.selectedThread) {
        this.selectedThread =
          this.threads.find((thread) => thread.profile.id === this.selectedThread?.profile.id) ??
          this.selectedThread;
      }
      this.error = '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loadingInbox = false;
    }
  }

  async openThread(thread: SpinVaultThread): Promise<void> {
    this.typingChannel?.unsubscribe();
    this.typingChannel = null;
    this.clearTypingTimers();
    this.selectedThread = thread;
    this.messages = [];
    this.searchQuery = '';
    this.error = '';
    this.typingChannel = this.spinVault.subscribeToTyping(
      thread.profile.id,
      (typing) => this.setOtherTyping(typing),
      (message) => this.error = message
    );
    try {
      const messages = await this.spinVault.loadConversation(thread.profile.id);
      if (this.selectedThread?.profile.id === thread.profile.id) this.messages = messages;
    } catch (error) {
      this.error = this.message(error);
    }
  }

  async sendReply(): Promise<void> {
    const content = this.reply.trim();
    if (!content || !this.selectedThread || !this.online) return;
    this.sending = true;
    this.error = '';
    const optimistic = this.optimisticMessage(content);
    this.upsertMessage(optimistic);
    try {
      const message = await this.spinVault.sendMessage(this.selectedThread.profile.id, content);
      this.messages = this.messages.filter((item) => item.id !== optimistic.id);
      this.upsertMessage(message);
      this.reply = '';
      await this.refreshInbox();
    } catch (error) {
      this.messages = this.messages.map((item) =>
        item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item
      );
      this.error = this.message(error);
    } finally {
      this.stopTyping();
      this.sending = false;
    }
  }

  async sendCannedReply(content: string): Promise<void> {
    this.reply = content;
    await this.sendReply();
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
    if (!this.imageFile || !this.selectedThread || !this.online) return;
    this.uploading = true;
    this.error = '';
    try {
      this.upsertMessage(await this.spinVault.uploadChatImage(this.selectedThread.profile.id, this.imageFile, this.imageZoom));
      this.clearPreview();
    } catch (error) {
      this.error = this.message(error);
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

  private optimisticMessage(content: string): SpinVaultMessage {
    const identity = this.identity;
    const thread = this.selectedThread;
    if (!identity || !thread) throw new Error('Select a player conversation before sending.');
    return {
      id: `pending-${crypto.randomUUID()}`,
      sender_id: identity.id,
      receiver_id: thread.profile.id,
      content,
      request_type: null,
      amount: null,
      request_status: null,
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

  requestActionDisabled(message: SpinVaultMessage, action: RequestAction): boolean {
    if (this.processingRequestId === message.id || message.sender_id === this.identity?.id) return true;
    const status = message.request_status ?? 'pending';
    if ((action === 'approve' || action === 'deny') && status !== 'pending' && status !== 'verification_required') return true;
    if (action === 'verification_required' && status !== 'pending' && status !== 'approved') return true;
    if (action === 'loaded' && (message.request_type !== 'load' || status !== 'approved')) return true;
    if (action === 'cashout_sent' && (message.request_type !== 'cashout' || status !== 'approved')) return true;
    return false;
  }

  async processRequest(message: SpinVaultMessage, action: RequestAction): Promise<void> {
    if (this.requestActionDisabled(message, action)) return;
    if (!this.online) return;
    this.processingRequestId = message.id;
    this.error = '';
    try {
      const updated = await this.spinVault.processRequest(message.id, action);
      this.upsertMessage(updated);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.processingRequestId = null;
    }
  }

  async openPayments(): Promise<void> {
    this.activeTab = 'payments';
    try {
      this.paymentMethods = await this.spinVault.loadPaymentMethods(true);
    } catch (error) {
      this.error = this.message(error);
    }
  }

  selectQr(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) this.qrFile = input.files?.[0] ?? null;
  }

  editPayment(method: SpinVaultPaymentMethod): void {
    this.editingPaymentId = method.id;
    this.paymentName = method.name;
    this.paymentInstructions = method.instructions;
    this.paymentEnabled = method.enabled;
    this.paymentSortOrder = method.sort_order;
    this.qrFile = null;
  }

  async savePaymentMethod(): Promise<void> {
    if (!this.paymentName.trim()) {
      this.error = 'Enter a payment provider name.';
      return;
    }
    this.savingPayment = true;
    this.error = '';
    try {
      await this.spinVault.savePaymentMethod({
        ...(this.editingPaymentId ? { id: this.editingPaymentId } : {}),
        name: this.paymentName,
        instructions: this.paymentInstructions,
        enabled: this.paymentEnabled,
        sort_order: this.paymentSortOrder,
        qrFile: this.qrFile
      });
      this.resetPaymentForm();
      this.paymentMethods = await this.spinVault.loadPaymentMethods(true);
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.savingPayment = false;
    }
  }

  resetPaymentForm(): void {
    this.editingPaymentId = null;
    this.paymentName = '';
    this.paymentInstructions = '';
    this.paymentEnabled = true;
    this.paymentSortOrder = this.paymentMethods.length;
    this.qrFile = null;
  }

  initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
  }

  private async onLiveMessage(message: SpinVaultMessage): Promise<void> {
    const identity = this.identity;
    if (!identity) return;
    const otherId = message.sender_id === identity.id ? message.receiver_id : message.sender_id;
    await this.refreshInbox();
    if (this.selectedThread?.profile.id !== otherId) return;
    try {
      this.upsertMessage(await this.spinVault.resolveMessageAttachment(message));
    } catch (error) {
      this.error = this.message(error);
    }
  }

  private upsertMessage(message: SpinVaultMessage): void {
    const byId = new Map(this.messages.map((item) => [item.id, item]));
    byId.set(message.id, { ...byId.get(message.id), ...message });
    this.messages = [...byId.values()].sort(
      (first, second) => Date.parse(first.created_at) - Date.parse(second.created_at)
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to load the support inbox.';
  }

  private reportError(error: unknown): void {
    this.error = this.message(error);
    void this.spinVault.logSystemError(error).catch((loggingError: unknown) => {
      this.error = `${this.error} (Could not record this error: ${this.message(loggingError)})`;
    });
  }
}
