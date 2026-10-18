import { Component, OnInit, inject, signal } from '@angular/core';
import { AsyncPipe, DatePipe } from '@angular/common';
import { combineLatest, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { SubscriptionStatus } from '../../core/models';

/**
 * ⚙️ Vault Billing — the account / group tier management panel shown in the
 * mobile "Vault Billing" tab. Displays the signed-in user's active subscription
 * tier and provides an explicit "Upgrade to Premium" action that calls
 * {@code POST /api/subscriptions/upgrade} and reflects the new tier instantly.
 */
@Component({
  selector: 'app-vault-billing',
  standalone: true,
  imports: [AsyncPipe, DatePipe],
  template: `
    <div class="rise-in space-y-4">
      @if (vm$ | async; as vm) {
        <!-- Current plan card -->
        <div
          class="overflow-hidden rounded-2xl p-5 text-white shadow-pane transition-all duration-300"
          [class.bg-gradient-to-br]="true"
          [class.from-emerald-500]="vm.sub?.premium"
          [class.to-teal-600]="vm.sub?.premium"
          [class.from-amber-400]="!vm.sub?.premium"
          [class.to-orange-500]="!vm.sub?.premium"
        >
          <div class="flex items-center justify-between">
            <span class="text-3xl">{{ vm.sub?.premium ? '⭐' : '🔓' }}</span>
            <span class="rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold">
              {{ vm.sub?.premium ? 'ACTIVE' : 'FREE PLAN' }}
            </span>
          </div>
          <h2 class="mt-3 text-xl font-bold">
            {{ vm.sub?.premium ? 'Paid Family' : 'Free Personal' }}
          </h2>
          <p class="mt-1 text-sm text-white/90">
            @if (vm.sub?.premium) {
              Unlock capsules beyond {{ vm.sub?.freeCapsuleMaxDays }} days, group media & more.
            } @else {
              Capsules limited to {{ vm.sub?.freeCapsuleMaxDays ?? 30 }} days. Upgrade for unlimited locks & group media.
            }
          </p>
          @if (vm.sub?.expiresAt) {
            <p class="mt-3 text-[11px] text-white/80">Renews {{ vm.sub?.expiresAt | date: 'mediumDate' }}</p>
          }
        </div>

        <!-- Upgrade CTA -->
        @if (!vm.sub?.premium) {
          @if (upgradeError()) {
            <p class="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{{ upgradeError() }}</p>
          }
          <button
            type="button"
            class="w-full rounded-2xl bg-gradient-to-r from-messenger-blue to-indigo-600 py-3.5 text-sm font-bold text-white shadow-pane transition-all duration-300 hover:scale-[1.02] disabled:opacity-60"
            [disabled]="processing()"
            (click)="upgrade()"
          >
            {{ processing() ? 'Processing…' : '✨ Upgrade to Premium — $4.99/mo' }}
          </button>
        }

        <!-- Feature list -->
        <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-messenger-ink">What's included</h3>
          <ul class="space-y-2.5 text-sm text-messenger-muted">
            <li class="flex items-start gap-3"><span class="text-messenger-blue">⏳</span> Unlimited time-capsule lock windows</li>
            <li class="flex items-start gap-3"><span class="text-messenger-blue">🖼️</span> Photos & videos in Family/Community groups</li>
            <li class="flex items-start gap-3"><span class="text-messenger-blue">👨‍👩‍👧</span> Shared tier for your whole circle</li>
          </ul>
        </div>

        <!-- Account summary -->
        <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 class="mb-3 text-sm font-semibold text-messenger-ink">Account</h3>
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold text-white" [style.background]="vm.me?.avatarColor">
              {{ initials(vm.me?.displayName) }}
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-messenger-ink">{{ vm.me?.displayName }}</p>
              <p class="truncate text-xs text-messenger-muted">{{ vm.me?.email }}</p>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class VaultBillingComponent implements OnInit {
  private readonly chat = inject(ChatService);
  private readonly auth = inject(AuthService);

  readonly processing = signal(false);
  readonly upgradeError = signal('');

  readonly vm$ = combineLatest([this.chat.subscription$, this.auth.user$]).pipe(
    map(([sub, me]) => ({ sub, me }))
  );

  ngOnInit(): void {
    this.chat.loadSubscription().subscribe();
  }

  upgrade(): void {
    this.upgradeError.set('');
    this.processing.set(true);
    this.chat.upgrade().subscribe({
      next: () => this.processing.set(false),
      error: (error: unknown) => {
        this.processing.set(false);
        this.upgradeError.set(error instanceof Error ? error.message : 'Unable to complete the upgrade. Please try again.');
        console.error('Unable to upgrade subscription from billing panel.', error);
      }
    });
  }

  initials(name: string | undefined): string {
    if (!name) {
      return '?';
    }
    return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }
}
