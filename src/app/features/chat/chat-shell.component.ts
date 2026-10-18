import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ChatService } from '../../core/services/chat.service';
import { ConversationListComponent } from './conversation-list.component';
import { ChatWindowComponent } from './chat-window.component';
import { UtilityHubComponent } from './utility-hub/utility-hub.component';
import { AiCompanionComponent } from './ai-companion.component';
import { VaultBillingComponent } from './vault-billing.component';
import { DealsWidgetComponent } from './utility-hub/deals-widget.component';
import { ArcadeWidgetComponent } from './utility-hub/arcade-widget.component';
import { MarketsWidgetComponent } from './utility-hub/markets-widget.component';

type MobileTab = 'chats' | 'markets' | 'arcade' | 'vault';

interface MobileTabDef {
  id: MobileTab;
  label: string;
  icon: string;
}

const MOBILE_TABS: MobileTabDef[] = [
  { id: 'chats', label: 'Chats', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z' },
  { id: 'markets', label: 'Markets & Deals', icon: 'M3.5 18.5l6-6 4 4L22 6.92 20.6 6l-7.1 8-4-4L2 17.5l1.5 1z' },
  { id: 'arcade', label: 'Arcade', icon: 'M7 6h10a5 5 0 015 5v2a5 5 0 01-5 5h-1v3h-2v-3h-2v3H9v-3H7a5 5 0 01-5-5v-2a5 5 0 015-5z' },
  { id: 'vault', label: 'Vault Billing', icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z' }
];

@Component({
  selector: 'app-chat-shell',
  standalone: true,
  imports: [
    ConversationListComponent,
    ChatWindowComponent,
    UtilityHubComponent,
    AiCompanionComponent,
    VaultBillingComponent,
    MarketsWidgetComponent,
    DealsWidgetComponent,
    ArcadeWidgetComponent
  ],
  template: `
    <div class="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-100 via-[#f7f9fc] to-blue-50">
      <header class="flex shrink-0 items-center gap-2 border-b border-gray-200/80 bg-white/90 px-4 py-2.5 shadow-sm backdrop-blur">
        <svg class="h-7 w-7 text-messenger-blue" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M16 9 L22 12.5 V19.5 L16 23 L10 19.5 V12.5 Z" fill="currentColor"/>
        </svg>
        <h1 class="text-lg font-extrabold tracking-tight text-messenger-ink">Vibe<span class="text-messenger-blue">Vault</span></h1>
      </header>

      <!-- ================= DESKTOP (>=768px): three columns ================= -->
      <div class="hidden flex-1 overflow-hidden md:flex">
        <!-- Column 1: conversation list -->
        <app-conversation-list class="flex" />

        <!-- Column 2: active chat -->
        <app-chat-window class="min-w-0 flex-1" />

        <!-- Column 3: collapsible Utility Hub -->
        <app-utility-hub
          class="hidden md:flex"
          [open]="hubOpen()"
          (toggle)="hubOpen.set(!hubOpen())"
        />
      </div>

      <!-- ================= MOBILE (<768px): single pane + bottom nav ================= -->
      <div class="flex flex-1 flex-col overflow-hidden md:hidden">
        <!-- Active mobile pane -->
        <div class="flex-1 overflow-hidden">
          @switch (mobileTab()) {
            @case ('chats') {
              @if (mobileChatOpen()) {
                <app-chat-window class="block h-full" [mobile]="true" (back)="mobileChatOpen.set(false)" />
              } @else {
                <app-conversation-list class="block h-full" (conversationOpened)="mobileChatOpen.set(true)" />
              }
            }
            @case ('markets') {
              <div class="h-full space-y-4 overflow-y-auto bg-[#f7f9fc] p-4">
                <app-markets-widget />
                <app-deals-widget />
              </div>
            }
            @case ('arcade') {
              <div class="h-full overflow-y-auto bg-[#f7f9fc] p-4">
                <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <app-arcade-widget />
                </div>
              </div>
            }
            @case ('vault') {
              <div class="h-full overflow-y-auto bg-[#f7f9fc] p-4">
                <app-vault-billing />
              </div>
            }
          }
        </div>

        <!-- Bottom navigation -->
        <nav class="sticky bottom-0 z-30 flex items-stretch justify-around border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-lg">
          @for (tab of mobileTabs; track tab.id) {
            <button
              type="button"
              class="relative flex flex-1 flex-col items-center gap-1 py-2.5 transition-all duration-300"
              [class.text-messenger-blue]="mobileTab() === tab.id"
              [class.text-messenger-muted]="mobileTab() !== tab.id"
              (click)="mobileTab.set(tab.id)"
              [attr.aria-label]="tab.label"
              [attr.aria-current]="mobileTab() === tab.id ? 'page' : null"
            >
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path [attr.d]="tab.icon" />
              </svg>
              <span class="whitespace-nowrap text-[9px] font-semibold">{{ tab.label }}</span>
              @if (mobileTab() === tab.id) {
                <span class="absolute top-0 h-0.5 w-10 rounded-full bg-messenger-blue"></span>
              }
            </button>
          }
        </nav>
      </div>

      <!-- Floating AI Workspace Companion (all viewports) -->
      <app-ai-companion />
    </div>
  `
})
export class ChatShellComponent implements OnInit, OnDestroy {
  readonly hubOpen = signal(true);
  readonly mobileTab = signal<MobileTab>('chats');
  readonly mobileChatOpen = signal(false);
  readonly mobileTabs = MOBILE_TABS;

  constructor(private readonly chat: ChatService) {}

  ngOnInit(): void {
    this.chat.bootstrap();
  }

  ngOnDestroy(): void {
    this.chat.shutdown();
  }
}
