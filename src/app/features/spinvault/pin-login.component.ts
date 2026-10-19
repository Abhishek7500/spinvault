import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SpinVaultService } from '../../core/services/spinvault.service';

@Component({
  selector: 'app-spinvault-pin-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
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
            <input type="password" formControlName="pin" autocomplete="current-password" inputmode="text" />
          </label>
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
          <button type="submit" [disabled]="form.invalid || loading">
            {{ loading ? 'Signing in…' : 'Log in securely' }} <span>→</span>
          </button>
        </form>
        <p class="help">Need access or a PIN reset? Contact the SpinVault team.</p>
      </section>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#0b0c1b;color:#f8f7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    .pin-login-page{min-height:100vh;padding:25px 18px;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 15%,rgba(119,30,110,.22),transparent 40%),#0b0c1b}
    .brand{position:absolute;top:25px;left:max(20px,calc((100% - 980px)/2));display:flex;gap:8px;align-items:center;color:#fff;text-decoration:none;font-weight:850;font-size:18px}.brand span{color:#ff2c93;text-shadow:0 0 16px #ff007f}
    .login-card{width:min(100%,410px);padding:30px;border:1px solid rgba(0,243,255,.19);border-radius:16px;background:rgba(17,18,37,.9);box-shadow:0 20px 65px rgba(0,0,0,.25)}
    .eyebrow{color:#00e2eb;font-size:9px;font-weight:800;letter-spacing:1.8px}.login-card h1{margin:9px 0;font-size:30px;letter-spacing:-1px}.login-card h1 em{font-style:normal;color:#ff2c93}.intro,.help{color:#a3a2b4;font-size:12px;line-height:1.6}.login-card form{display:grid;gap:15px;margin-top:23px}.login-card label{display:grid;gap:7px;color:#dad9e4;font-size:11px;font-weight:700}.login-card input{height:43px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#101126;color:#fff;font:inherit;outline:none}.login-card input:focus{border-color:rgba(0,243,255,.6);box-shadow:0 0 0 2px rgba(0,243,255,.08)}.login-card button{height:44px;border:0;border-radius:8px;background:linear-gradient(100deg,#ff007f,#bd21b2);color:#fff;font-size:12px;font-weight:800;cursor:pointer}.login-card button:disabled{opacity:.5;cursor:not-allowed}.login-card button span{margin-left:8px}.error{margin:0;color:#ff9cab;font-size:11px}.help{margin:18px 0 0;font-size:10px}
  `]
})
export class PinLoginComponent {
  loading = false;
  error = '';
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
    if (this.form.invalid || this.loading) return;
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
      this.error = error instanceof Error ? error.message : 'Unable to sign in. Please check your details and try again.';
    } finally {
      this.loading = false;
    }
  }
}
