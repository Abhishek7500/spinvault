import { Component, input, output, signal } from '@angular/core';
import { MarketsWidgetComponent } from './markets-widget.component';
import { DealsWidgetComponent } from './deals-widget.component';
import { ArcadeWidgetComponent } from './arcade-widget.component';

type Tab = 'markets' | 'deals' | 'arcade';

interface TabDef {
  id: Tab;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'markets', label: 'Markets', icon: '📈' },
  { id: 'deals', label: 'Deals', icon: '🛍️' },
  { id: 'arcade', label: 'Arcade', icon: '🕹️' }
];

/**
 * The right-hand "Chat Utility Hub" — a collapsible panel with a tabbed set of
 * productivity & entertainment widgets (markets, deals, arcade) so users stay
 * engaged inside the app while waiting for replies. Visibility is controlled by
 * the parent shell; the toggle button lives in the panel header.
 */
@Component({
  selector: 'app-utility-hub',
  standalone: true,
  imports: [MarketsWidgetComponent, DealsWidgetComponent, ArcadeWidgetComponent],
  template: `
    <aside
      class="flex h-full shrink-0 flex-col border-l border-gray-200 bg-white transition-all duration-300"
      [class.w-[340px]]="open()"
      [class.w-14]="!open()"
    >
      @if (open()) {
        <!-- Expanded header -->
        <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-messenger-blue to-indigo-600 text-xs text-white">✦</span>
            <h2 class="text-sm font-bold text-messenger-ink">Utility Hub</h2>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-messenger-muted transition-all duration-300 hover:bg-gray-100"
            (click)="toggle.emit()"
            aria-label="Collapse utility hub"
            title="Collapse"
          >
            »
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 border-b border-gray-100 px-2 py-2">
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              class="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold transition-all duration-300"
              [class.bg-messenger-blue]="active() === tab.id"
              [class.text-white]="active() === tab.id"
              [class.shadow-sm]="active() === tab.id"
              [class.text-messenger-muted]="active() !== tab.id"
              [class.hover:bg-gray-50]="active() !== tab.id"
              (click)="active.set(tab.id)"
            >
              <span class="text-base">{{ tab.icon }}</span>
              {{ tab.label }}
            </button>
          }
        </div>

        <!-- Widget body -->
        <div class="flex-1 space-y-4 overflow-y-auto bg-[#f7f9fc] p-4">
          @switch (active()) {
            @case ('markets') { <app-markets-widget /> }
            @case ('deals') { <app-deals-widget /> }
            @case ('arcade') { <app-arcade-widget /> }
          }
        </div>
      } @else {
        <!-- Collapsed rail -->
        <div class="flex flex-col items-center gap-4 py-4">
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-messenger-blue to-indigo-600 text-sm text-white shadow-sm transition-all duration-300 hover:scale-105"
            (click)="toggle.emit()"
            aria-label="Expand utility hub"
            title="Utility Hub"
          >
            «
          </button>
          @for (tab of tabs; track tab.id) {
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-all duration-300 hover:bg-gray-100"
              [class.bg-blue-50]="active() === tab.id"
              (click)="openRail(tab.id)"
              [attr.aria-label]="tab.label"
              [title]="tab.label"
            >
              {{ tab.icon }}
            </button>
          }
        </div>
      }
    </aside>
  `
})
export class UtilityHubComponent {
  /** Whether the hub is expanded (true) or collapsed to an icon rail (false). */
  readonly open = input<boolean>(true);
  /** Emitted when the user requests to toggle open/collapsed. */
  readonly toggle = output<void>();

  readonly tabs = TABS;
  readonly active = signal<Tab>('markets');

  /** Clicking a rail icon opens the hub and jumps to that tab. */
  openRail(tab: Tab): void {
    this.active.set(tab);
    this.toggle.emit();
  }
}
