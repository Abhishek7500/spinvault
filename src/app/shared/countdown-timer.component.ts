import { Component, OnDestroy, OnInit, computed, input, output, signal } from '@angular/core';

/**
 * Real-time countdown to an ISO timestamp. Uses a Signal recomputed every
 * second so the template re-renders reactively without zone-based bindings.
 * Emits {@link unlocked} once when the target time is reached so the parent can
 * refresh the (now-readable) message.
 */
@Component({
  selector: 'app-countdown-timer',
  standalone: true,
  template: `
    @if (done()) {
      <span class="text-emerald-600">Unlocked 🎉</span>
    } @else {
      <span class="tabular-nums font-semibold text-amber-700">{{ remaining() }}</span>
    }
  `
})
export class CountdownTimerComponent implements OnInit, OnDestroy {
  /** Target unlock time as an ISO string or epoch millis. */
  readonly target = input<string | number | null>(null);
  /** Fired once when the countdown reaches zero. */
  readonly unlocked = output<null>();

  private readonly now = signal<number>(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  private fired = false;

  readonly done = computed(() => {
    const t = this.toMillis(this.target());
    return t !== null && t - this.now() <= 0;
  });

  readonly remaining = computed(() => this.format(this.toMillis(this.target())! - this.now()));

  ngOnInit(): void {
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.done() && !this.fired) {
        this.fired = true;
        this.unlocked.emit(null);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private toMillis(value: string | number | null): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return typeof value === 'number' ? value : new Date(value).getTime();
  }

  private format(ms: number): string {
    if (ms <= 0) {
      return '00:00:00';
    }
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return days > 0
      ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
}
