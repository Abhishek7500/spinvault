import { Injectable } from '@angular/core';
import { BehaviorSubject, EMPTY, Subscription, auditTime, combineLatest, fromEvent, merge, startWith, switchMap, timer } from 'rxjs';
import { SpinVaultService } from './spinvault.service';

const IDLE_LOCK_MS = 15 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class VaultSecurityService {
  private readonly lockedSubject = new BehaviorSubject(false);
  private readonly lockErrorSubject = new BehaviorSubject<string | null>(null);
  private readonly sessionSubscription: Subscription;
  private rememberedUsername = '';

  readonly locked$ = this.lockedSubject.asObservable();
  readonly lockError$ = this.lockErrorSubject.asObservable();

  get isLocked(): boolean {
    return this.lockedSubject.value;
  }

  get username(): string {
    return this.rememberedUsername;
  }

  constructor(private readonly spinVault: SpinVaultService) {
    const activity$ = merge(
      fromEvent(document, 'pointermove'),
      fromEvent(document, 'keydown'),
      fromEvent(document, 'touchstart')
    ).pipe(auditTime(1000));
    this.sessionSubscription = combineLatest([this.spinVault.identity$, this.locked$])
      .pipe(
        switchMap(([identity, isLocked]) => {
          if (!identity || isLocked) return EMPTY;
          return activity$.pipe(
            startWith(null),
            switchMap(() => timer(IDLE_LOCK_MS))
          );
        })
      )
      .subscribe(() => {
        void this.lock().catch((error: unknown) => this.lockErrorSubject.next(
          error instanceof Error ? error.message : 'The session could not be signed out cleanly.'
        ));
      });
  }

  async lock(): Promise<void> {
    const identity = this.spinVault.currentIdentity;
    if (this.isLocked || !identity) return;
    this.rememberedUsername = identity.custom_username ?? identity.username;
    this.lockErrorSubject.next(null);
    this.lockedSubject.next(true);
    await this.spinVault.signOut();
  }

  async unlock(pin: string): Promise<void> {
    if (!this.isLocked) return;
    await this.spinVault.signInWithPin(this.rememberedUsername, pin);
    this.rememberedUsername = '';
    this.lockErrorSubject.next(null);
    this.lockedSubject.next(false);
  }

  ngOnDestroy(): void {
    this.sessionSubscription.unsubscribe();
    this.lockedSubject.complete();
    this.lockErrorSubject.complete();
  }
}
