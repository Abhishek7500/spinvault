import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SpinVaultService } from '../../core/services/spinvault.service';

@Component({
  selector: 'app-spinvault-pin-recovery',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="recovery-page">
      <a routerLink="/" class="brand"><span>✦</span> SpinVault</a>
      <section class="recovery-card">
        @if (loading) {
          <p class="intro">Checking your secure session…</p>
        } @else if (isSignedIn) {
          <p class="eyebrow">ACCOUNT SECURITY</p>
          <h1>Recovery <em>code</em></h1>
          <p class="intro">Set a separate recovery code now, so you can reset your login PIN without an email or admin.</p>
          <form (ngSubmit)="saveRecoveryCode()">
            <label>New recovery code<input [(ngModel)]="recoveryCode" name="recoveryCode" required minlength="8" maxlength="32" pattern="[A-Za-z0-9]+" autocomplete="new-password" type="password" /></label>
            <label>Confirm recovery code<input [(ngModel)]="confirmRecoveryCode" name="confirmRecoveryCode" required minlength="8" maxlength="32" autocomplete="new-password" type="password" /></label>
            @if (error) { <p class="error" role="alert">{{ error }}</p> }
            @if (notice) { <p class="success" role="status">{{ notice }}</p> }
            <button type="submit" [disabled]="saving">{{ saving ? 'Saving securely…' : 'Save recovery code' }}</button>
          </form>
          <p class="help">Choose a code different from your login PIN. Store it somewhere safe; support staff cannot read or recover it.</p>
        } @else {
          <p class="eyebrow">SECURE ACCOUNT RECOVERY</p>
          <h1>Reset your <em>login PIN</em></h1>
          <p class="intro">Verify your username and separately saved recovery code, then choose a new login PIN.</p>
          <form (ngSubmit)="recover()">
            <label>Username<input [(ngModel)]="username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_-]+" autocomplete="username" autocapitalize="none" /></label>
            <label>Recovery code<input [(ngModel)]="recoveryCode" name="recoveryCode" required minlength="8" maxlength="32" pattern="[A-Za-z0-9]+" autocomplete="off" type="password" /></label>
            <label>New login PIN<input [(ngModel)]="newPin" name="newPin" required minlength="6" maxlength="32" pattern="[A-Za-z0-9]+" autocomplete="new-password" type="password" /></label>
            <label>Confirm new login PIN<input [(ngModel)]="confirmPin" name="confirmPin" required minlength="6" maxlength="32" autocomplete="new-password" type="password" /></label>
            @if (error) { <p class="error" role="alert">{{ error }}</p> }
            @if (notice) { <p class="success" role="status">{{ notice }}</p> }
            <button type="submit" [disabled]="saving">{{ saving ? 'Verifying…' : 'Verify and reset PIN' }}</button>
          </form>
          <p class="help">Recovery is limited to three attempts per username and network address every 15 minutes.</p>
        }
        <a class="back-link" routerLink="/pin-login">← Back to login</a>
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#0b0c1b;color:#f8f7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.recovery-page{min-height:100vh;padding:25px 18px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 15%,rgba(119,30,110,.22),transparent 40%),#0b0c1b}.brand{position:absolute;top:25px;left:max(20px,calc((100% - 980px)/2));display:flex;gap:8px;align-items:center;color:#fff;text-decoration:none;font-weight:850;font-size:18px}.brand span{color:#ff2c93;text-shadow:0 0 16px #ff007f}.recovery-card{width:min(100%,440px);padding:30px;border:1px solid rgba(0,243,255,.19);border-radius:16px;background:rgba(17,18,37,.94);box-shadow:0 20px 65px rgba(0,0,0,.25)}.eyebrow{color:#00e2eb;font-size:9px;font-weight:800;letter-spacing:1.8px}.recovery-card h1{margin:9px 0;font-size:28px}.recovery-card h1 em{font-style:normal;color:#ff2c93}.intro,.help{color:#a3a2b4;font-size:11px;line-height:1.6}.recovery-card form{display:grid;gap:12px;margin-top:20px}.recovery-card label{display:grid;gap:6px;color:#dad9e4;font-size:10px;font-weight:700}.recovery-card input{height:40px;padding:0 11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#101126;color:#fff;font:inherit;outline:none}.recovery-card input:focus{border-color:rgba(0,243,255,.6)}.recovery-card button{height:42px;border:0;border-radius:8px;background:linear-gradient(100deg,#ff007f,#bd21b2);color:#fff;font-size:11px;font-weight:800;cursor:pointer}.recovery-card button:disabled{opacity:.5}.error,.success{margin:0;font-size:10px;line-height:1.5}.error{color:#ff9cab}.success{color:#8ce6c2}.help{font-size:9px}.back-link{display:inline-block;margin-top:15px;color:#83edf1;font-size:10px;text-decoration:none}
  `]
})
export class PinRecoveryComponent implements OnInit {
  loading = true;
  saving = false;
  isSignedIn = false;
  username = '';
  recoveryCode = '';
  confirmRecoveryCode = '';
  newPin = '';
  confirmPin = '';
  error = '';
  notice = '';

  constructor(private readonly spinVault: SpinVaultService, private readonly router: Router) {}

  async ngOnInit(): Promise<void> {
    try {
      await this.spinVault.initialize();
      this.isSignedIn = Boolean(this.spinVault.currentIdentity);
      this.username = this.spinVault.currentIdentity?.custom_username ?? '';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.loading = false;
    }
  }

  async saveRecoveryCode(): Promise<void> {
    this.error = '';
    this.notice = '';
    if (this.recoveryCode !== this.confirmRecoveryCode) {
      this.error = 'The recovery code entries do not match.';
      return;
    }
    this.saving = true;
    try {
      await this.spinVault.setRecoveryPin(this.recoveryCode);
      this.recoveryCode = '';
      this.confirmRecoveryCode = '';
      this.notice = 'Recovery code saved. Keep it separate from your login PIN.';
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.saving = false;
    }
  }

  async recover(): Promise<void> {
    this.error = '';
    this.notice = '';
    if (this.newPin !== this.confirmPin) {
      this.error = 'The new PIN entries do not match.';
      return;
    }
    this.saving = true;
    try {
      await this.spinVault.recoverLoginPin(this.username, this.recoveryCode, this.newPin);
      await this.router.navigateByUrl('/pin-login?recovered=1');
    } catch (error) {
      this.error = this.message(error);
    } finally {
      this.saving = false;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to complete secure account recovery.';
  }
}
