import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/spinvault/home.component').then((m) => m.HomeComponent)
  },
  {
    path: 'how-to-play',
    loadComponent: () => import('./features/spinvault/how-to-play.component').then((m) => m.HowToPlayComponent)
  },
  {
    path: 'pin-login',
    loadComponent: () => import('./features/spinvault/pin-login.component').then((m) => m.PinLoginComponent)
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/spinvault/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () => import('./features/chat/chat-shell.component').then((m) => m.ChatShellComponent)
  },
  { path: '**', redirectTo: '' }
];
