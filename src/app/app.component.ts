import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { VaultSecurityService } from './core/services/vault-security.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterOutlet],
  template: `
    <div class="vault-content" [class.vault-blurred]="security.isLocked" [attr.inert]="security.isLocked ? '' : null">
      <router-outlet />
    </div>
    @if (security.isLocked) {
      <div class="vault-lock-screen">
        <section class="vault-lock-card" role="dialog" aria-modal="true" aria-labelledby="vault-lock-title">
          <span class="vault-lock-icon">◆</span>
          <p class="vault-lock-eyebrow">SESSION PAUSED</p>
          <h1 id="vault-lock-title">Vault <em>locked</em></h1>
          <p>For your privacy, this session locked after inactivity. Enter your login PIN to continue.</p>
          @if (lockError) { <p class="vault-lock-error" role="alert">The session could not be signed out cleanly: {{ lockError }} Your screen remains locked.</p> }
          <form (ngSubmit)="unlock()">
            <label>Username<input [ngModel]="security.username" name="username" readonly autocomplete="username" /></label>
            <label>Login PIN<input [(ngModel)]="pin" name="pin" type="password" inputmode="text" autocomplete="current-password" /></label>
            @if (error) { <p class="vault-lock-error" role="alert">{{ error }}</p> }
            <button type="submit" [disabled]="loading || pin.length < 6">{{ loading ? 'Unlocking…' : 'Unlock SpinVault' }}</button>
          </form>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;min-height:100vh}.vault-content{min-height:100vh;transition:filter .2s}.vault-blurred{filter:blur(12px);pointer-events:none;user-select:none}.vault-lock-screen{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(5,6,18,.78);backdrop-filter:blur(8px);font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#f8f7ff}.vault-lock-card{width:min(100%,390px);padding:27px;border:1px solid rgba(0,243,255,.24);border-radius:16px;background:#111226;box-shadow:0 0 60px rgba(0,243,255,.1)}.vault-lock-icon{color:#00f3ff;font-size:25px}.vault-lock-eyebrow{margin:13px 0 6px;color:#00e2eb;font-size:9px;font-weight:800;letter-spacing:1.6px}.vault-lock-card h1{margin:0;font-size:28px}.vault-lock-card h1 em{color:#ff2c93;font-style:normal}.vault-lock-card>p:not(.vault-lock-eyebrow){color:#a3a2b4;font-size:11px;line-height:1.6}.vault-lock-card form{display:grid;gap:12px;margin-top:18px}.vault-lock-card label{display:grid;gap:6px;color:#dad9e4;font-size:10px;font-weight:700}.vault-lock-card input{height:40px;padding:0 11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#101126;color:#fff;font:inherit}.vault-lock-card button{height:42px;border:0;border-radius:8px;background:linear-gradient(100deg,#ff007f,#bd21b2);color:#fff;font-weight:800}.vault-lock-card button:disabled{opacity:.5}.vault-lock-error{margin:0;color:#ff9cab;font-size:10px}
  `]
})
export class AppComponent implements OnDestroy {
  pin = '';
  error = '';
  loading = false;
  lockError: string | null = null;
  private readonly lockSubscription: Subscription;
  private readonly lockErrorSubscription: Subscription;

  constructor(readonly security: VaultSecurityService) {
    this.lockSubscription = security.locked$.subscribe(() => {
      this.pin = '';
      this.error = '';
    });
    this.lockErrorSubscription = security.lockError$.subscribe((message) => this.lockError = message);
  }

  async unlock(): Promise<void> {
    if (this.loading || this.pin.length < 6) return;
    this.loading = true;
    this.error = '';
    try {
      await this.security.unlock(this.pin);
      this.pin = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to unlock this session.';
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.lockSubscription.unsubscribe();
    this.lockErrorSubscription.unsubscribe();
  }
}
