import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { PinAuthError, SpinVaultService } from '../../core/services/spinvault.service';

@Component({
  selector: 'app-spinvault-pin-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <main class="pin-login-page">
      <a routerLink="/" class="brand"><span>✦</span> SpinVault</a>
      <section class="login-card">
        <p class="eyebrow">PLAYER ACCESS</p>
        <h1>Welcome <em>back.</em></h1>
        <p class="intro">Use the username and PIN provided by the SpinVault team.</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Username
            <input formControlName="username" autocomplete="username" autocapitalize="none" spellcheck="false" />
          </label>
          <label>PIN
            <input type="password" formControlName="pin" autocomplete="current-password" [attr.inputmode]="keypadEnabled ? 'numeric' : 'text'" />
          </label>
          <button class="keypad-toggle" type="button" (click)="toggleKeypad()">{{ keypadEnabled ? 'Use text PIN entry' : 'Use secure numeric keypad' }}</button>
          @if (keypadEnabled) {
            <div class="keypad" aria-label="PIN keypad">
              @for (digit of keypadDigits; track digit) {
                <button type="button" [disabled]="form.controls.pin.value.length >= 6 || loading || lockSeconds > 0" (click)="appendDigit(digit)">{{ digit }}</button>
              }
              <button type="button" class="keypad-clear" [disabled]="loading || lockSeconds > 0" (click)="clearPin()">Clear</button>
              <button type="button" class="keypad-delete" [disabled]="loading || lockSeconds > 0" (click)="deleteDigit()" aria-label="Delete last digit">⌫</button>
            </div>
          }
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
          @if (lockSeconds > 0) { <p class="warning" role="status">Login paused for {{ lockSeconds }} seconds. Try again when the timer ends.</p> }
          <button type="submit" [disabled]="form.invalid || loading">
            {{ loading ? 'Signing in…' : 'Log in securely' }} <span>→</span>
          </button>
        </form>
        <p class="help"><a routerLink="/pin-recovery">Forgot your PIN? Recover with your saved recovery code.</a></p>
        <p class="help">Need access? Contact the SpinVault team.</p>
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#0b0c1b;color:#f8f7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    .pin-login-page{min-height:100vh;padding:25px 18px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 15%,rgba(119,30,110,.22),transparent 40%),#0b0c1b}
    .brand{position:absolute;top:25px;left:max(20px,calc((100% - 980px)/2));display:flex;gap:8px;align-items:center;color:#fff;text-decoration:none;font-weight:850;font-size:18px}.brand span{color:#ff2c93;text-shadow:0 0 16px #ff007f}
    .login-card{width:min(100%,410px);padding:30px;border:1px solid rgba(0,243,255,.19);border-radius:16px;background:rgba(17,18,37,.9);box-shadow:0 20px 65px rgba(0,0,0,.25)}
    .eyebrow{color:#00e2eb;font-size:9px;font-weight:800;letter-spacing:1.8px}.login-card h1{margin:9px 0;font-size:30px;letter-spacing:-1px}.login-card h1 em{font-style:normal;color:#ff2c93}.intro,.help{color:#a3a2b4;font-size:12px;line-height:1.6}.login-card form{display:grid;gap:15px;margin-top:23px}.login-card label{display:grid;gap:7px;color:#dad9e4;font-size:11px;font-weight:700}.login-card input{height:43px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#101126;color:#fff;font:inherit;outline:none}.login-card input:focus{border-color:rgba(0,243,255,.6);box-shadow:0 0 0 2px rgba(0,243,255,.08)}.login-card form>button:not(.keypad-toggle){height:44px;border:0;border-radius:8px;background:linear-gradient(100deg,#ff007f,#bd21b2);color:#fff;font-size:12px;font-weight:800;cursor:pointer}.login-card button:disabled{opacity:.5;cursor:not-allowed}.login-card button span{margin-left:8px}.error,.warning{margin:0;padding:9px;border-radius:7px;font-size:10px;line-height:1.5}.error{border:1px solid rgba(255,100,120,.2);background:rgba(255,60,90,.07);color:#ff9cab}.warning{background:rgba(255,165,0,.08);border:1px solid rgba(255,165,0,.2);color:#ffd38a}.help{margin:12px 0 0;font-size:10px}.help a{color:#83edf1;text-decoration:none}.keypad-toggle{justify-self:start;padding:0;border:0;background:transparent;color:#7cebf0;font-size:10px;cursor:pointer}.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.keypad button{height:42px;border:1px solid rgba(0,243,255,.15);border-radius:8px;background:#191a31;color:#fff;font-size:15px;font-weight:750;cursor:pointer}.keypad .keypad-clear,.keypad .keypad-delete{font-size:10px}
  `]
})
export class PinLoginComponent implements OnDestroy {
  loading = false;
  error = '';
  remainingAttempts: number | null = null;
  lockSeconds = 0;
  keypadEnabled = false;
  readonly keypadDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  private lockSubscription: Subscription | null = null;
  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(32)]],
    pin: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(32)]]
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly spinVault: SpinVaultService,
    private readonly router: Router
  ) {}

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading || this.lockSeconds > 0) return;
    this.loading = true;
    this.error = '';
    const { username, pin } = this.form.getRawValue();
    try {
      await this.spinVault.signInWithPin(username, pin);
      await this.router.navigateByUrl(
        this.spinVault.currentIdentity?.role === 'admin' || this.spinVault.currentIdentity?.is_super_admin
          ? '/admin'
          : '/'
      );
    } catch (error) {
      if (error instanceof PinAuthError) {
        this.error = error.message;
        this.remainingAttempts = error.remainingAttempts;
        this.lockSeconds = error.retryAfterSeconds;
        if (this.lockSeconds > 0) {
          this.lockSubscription?.unsubscribe();
          this.lockSubscription = interval(1000).subscribe(() => {
            this.lockSeconds = Math.max(0, this.lockSeconds - 1);
            if (!this.lockSeconds) this.lockSubscription?.unsubscribe();
          });
        }
      } else {
        this.error = error instanceof Error ? error.message : 'Unable to sign in. Please check your details and try again.';
      }
    } finally {
      this.loading = false;
    }
  }

  toggleKeypad(): void {
    this.keypadEnabled = !this.keypadEnabled;
    if (this.keypadEnabled && !/^\d*$/.test(this.form.controls.pin.value)) {
      this.form.controls.pin.setValue('');
    }
  }

  appendDigit(digit: string): void {
    const control = this.form.controls.pin;
    if (control.value.length < 6) control.setValue(`${control.value}${digit}`);
  }

  deleteDigit(): void {
    const control = this.form.controls.pin;
    control.setValue(control.value.slice(0, -1));
  }

  clearPin(): void {
    this.form.controls.pin.setValue('');
  }

  ngOnDestroy(): void {
    this.lockSubscription?.unsubscribe();
  }
}
