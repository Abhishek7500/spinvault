import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { SpinVaultService } from '../services/spinvault.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) {
    return true;
  }
  return router.createUrlTree(['/chat']);
};

export const adminGuard: CanActivateFn = async () => {
  const spinVault = inject(SpinVaultService);
  const router = inject(Router);
  try {
    await spinVault.initialize();
    return spinVault.currentIdentity?.role === 'admin'
      ? true
      : router.createUrlTree(['/']);
  } catch {
    return router.createUrlTree(['/']);
  }
};
