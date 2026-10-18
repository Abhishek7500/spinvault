import { Component, input, output, signal } from '@angular/core';
import { SubscriptionStatus } from '../core/models';

type ModalReason = 'extended_capsule' | 'group_media' | 'tier_paid_family' | 'general';

/**
 * Clean, focused modal that appears whenever a user hits a premium gate — e.g.
 * locking a capsule beyond the free window or sharing media in a FREE group.
 * Offers a mock upgrade workflow (no real payment provider wired).
 */
@Component({
  selector: 'app-premium-upgrade-modal',
  standalone: true,
  imports: [],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="dismiss()"></div>

        <!-- Dialog -->
        <div class="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-pane">
          <div class="bg-gradient-to-br from-messenger-blue to-indigo-600 px-6 py-8 text-center text-white">
            <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-3xl">
              ✨
            </div>
            <h2 class="text-xl font-bold">Unlock TimeCapsule Premium</h2>
            <p class="mt-1 text-sm text-white/90">{{ headline() }}</p>
          </div>

          <div class="px-6 py-6">
            <ul class="space-y-3 text-sm text-messenger-ink">
              <li class="flex items-start gap-3">
                <span class="mt-0.5 text-messenger-blue">⏳</span>
                <span>Lock time capsules <b>beyond 30 days</b> — perfect for anniversaries & milestones.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="mt-0.5 text-messenger-blue">🖼️</span>
                <span>Share <b>photos & videos</b> in Family & Community group chats.</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="mt-0.5 text-messenger-blue">👨‍👩‍👧</span>
                <span>Bring your whole circle along with the <b>Paid Family</b> tier.</span>
              </li>
            </ul>

            @if (failed()) {
              <p class="mt-4 text-center text-sm text-rose-600" role="alert">The upgrade could not be completed. Please try again.</p>
            }

            @if (processing() && !failed()) {
              <p class="mt-6 text-center text-sm text-messenger-muted">Processing your mock payment…</p>
            } @else {
              <button
                class="mt-6 w-full rounded-full bg-messenger-blue py-3 text-sm font-semibold text-white transition hover:bg-messenger-blue-dark"
                (click)="confirmUpgrade()"
              >
                Upgrade — $4.99/mo
              </button>
            }

            <button class="mt-3 w-full rounded-full py-2 text-sm font-medium text-messenger-muted hover:bg-gray-50" (click)="dismiss()">
              Maybe later
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class PremiumUpgradeModalComponent {
  /** Whether the modal is visible. */
  readonly open = input<boolean>(false);
  readonly failed = input<boolean>(false);
  /** Current tier, used to tailor copy. */
  readonly status = input<SubscriptionStatus | null>(null);
  /** Machine-readable reason from the backend 403 (optional). */
  readonly reason = input<string>('general');
  /** Emitted when the user confirms the mock upgrade. */
  readonly upgraded = output<void>();
  /** Emitted when the modal is dismissed without upgrading. */
  readonly closed = output<void>();

  readonly processing = signal(false);

  headline(): string {
    switch (this.reason() as ModalReason) {
      case 'extended_capsule':
        return 'This capsule locks further out than the free 30-day window.';
      case 'group_media':
        return 'Sharing media in a group chat is a Paid Family feature.';
      case 'tier_paid_family':
        return 'This feature is reserved for the Paid Family tier.';
      default:
        return 'Go premium to unlock every TimeCapsule feature.';
    }
  }

  confirmUpgrade(): void {
    this.processing.set(true);
    this.upgraded.emit();
  }

  dismiss(): void {
    this.processing.set(false);
    this.closed.emit();
  }
}
