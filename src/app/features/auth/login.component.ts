import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#eaf3ff] via-white to-[#f7f8fa] px-4">
      <div class="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-pane md:grid-cols-2">
        <section class="hidden flex-col justify-between bg-[#0084FF] p-10 text-white md:flex">
          <div>
            <p class="text-sm uppercase tracking-[0.3em] text-white/80">Realtime</p>
            <h1 class="mt-3 text-4xl font-semibold leading-tight">Messenger for teams that move fast.</h1>
            <p class="mt-4 text-white/85">Live delivery, typing indicators, and presence — the same split-pane feel as Facebook Messenger.</p>
          </div>
          <p class="text-sm text-white/75">Demo accounts: alice / bob / charlie / dana — password <strong>Password123!</strong></p>
        </section>

        <section class="p-8 md:p-12">
          <h2 class="text-2xl font-semibold">Welcome back</h2>
          <p class="mt-1 text-sm text-messenger-muted">Sign in to continue your conversations.</p>

          <form class="mt-8 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
            <label class="block text-sm font-medium">
              Username
              <input
                class="mt-1 w-full rounded-xl border border-gray-200 bg-messenger-wash px-4 py-3 outline-none ring-messenger-blue focus:bg-white focus:ring-2"
                formControlName="username"
                autocomplete="username"
              />
            </label>
            <label class="block text-sm font-medium">
              Password
              <input
                type="password"
                class="mt-1 w-full rounded-xl border border-gray-200 bg-messenger-wash px-4 py-3 outline-none ring-messenger-blue focus:bg-white focus:ring-2"
                formControlName="password"
                autocomplete="current-password"
              />
            </label>
            @if (error) {
              <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
            }
            <button
              class="w-full rounded-full bg-messenger-blue py-3 font-semibold text-white transition hover:bg-messenger-blue-dark disabled:opacity-60"
              [disabled]="form.invalid || loading"
            >
              {{ loading ? 'Signing in…' : 'Log in' }}
            </button>
          </form>

          <p class="mt-6 text-sm text-messenger-muted">
            New here?
            <a routerLink="/register" class="font-semibold text-messenger-blue">Create an account</a>
          </p>
        </section>
      </div>
    </div>
  `
})
export class LoginComponent {
  loading = false;
  error = '';
  readonly form = this.fb.nonNullable.group({
    username: ['alice', Validators.required],
    password: ['Password123!', Validators.required]
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  submit(): void {
    if (this.form.invalid) {
      return;
    }
    this.loading = true;
    this.error = '';
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: () => {
        this.loading = false;
        void this.router.navigateByUrl('/chat');
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message ?? 'Unable to sign in. Check the backend is running on port 8080.';
      }
    });
  }
}
