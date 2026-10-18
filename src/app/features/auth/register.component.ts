import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#eaf3ff] via-white to-[#f7f8fa] px-4">
      <div class="w-full max-w-lg rounded-3xl bg-white p-8 shadow-pane md:p-12">
        <h2 class="text-2xl font-semibold">Create your account</h2>
        <p class="mt-1 text-sm text-messenger-muted">Join the demo messenger in a few seconds.</p>

        <form class="mt-8 space-y-4" [formGroup]="form" (ngSubmit)="submit()">
          <label class="block text-sm font-medium">
            Display name
            <input class="mt-1 w-full rounded-xl border border-gray-200 bg-messenger-wash px-4 py-3 outline-none ring-messenger-blue focus:bg-white focus:ring-2" formControlName="displayName" />
          </label>
          <label class="block text-sm font-medium">
            Username
            <input class="mt-1 w-full rounded-xl border border-gray-200 bg-messenger-wash px-4 py-3 outline-none ring-messenger-blue focus:bg-white focus:ring-2" formControlName="username" />
          </label>
          <label class="block text-sm font-medium">
            Email
            <input type="email" class="mt-1 w-full rounded-xl border border-gray-200 bg-messenger-wash px-4 py-3 outline-none ring-messenger-blue focus:bg-white focus:ring-2" formControlName="email" />
          </label>
          <label class="block text-sm font-medium">
            Password
            <input type="password" class="mt-1 w-full rounded-xl border border-gray-200 bg-messenger-wash px-4 py-3 outline-none ring-messenger-blue focus:bg-white focus:ring-2" formControlName="password" />
          </label>
          @if (error) {
            <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{{ error }}</p>
          }
          <button class="w-full rounded-full bg-messenger-blue py-3 font-semibold text-white hover:bg-messenger-blue-dark disabled:opacity-60" [disabled]="form.invalid || loading">
            {{ loading ? 'Creating…' : 'Sign up' }}
          </button>
        </form>
        <p class="mt-6 text-sm text-messenger-muted">
          Already have an account?
          <a routerLink="/login" class="font-semibold text-messenger-blue">Log in</a>
        </p>
      </div>
    </div>
  `
})
export class RegisterComponent {
  loading = false;
  error = '';
  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(1)]],
    username: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
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
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => {
        this.loading = false;
        void this.router.navigateByUrl('/chat');
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message ?? 'Unable to register.';
      }
    });
  }
}
