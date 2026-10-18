import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { SportsService, SportGame } from './sports.service';

/**
 * 📈 Markets & Scores widget — streams **real** institutional-grade market data
 * with **zero API keys**. A TradingView public widget is embedded in a sandboxed
 * iframe (client-side only, no backend round-trips). Live sports scores come
 * from {@link SportsService}, which is key-ready but falls back to a local
 * mock array when no provider key is configured.
 */
@Component({
  selector: 'app-markets-widget',
  standalone: true,
  template: `
    <div class="rise-in space-y-4">
      <!-- Real TradingView ticker tape (BTC, ETH, AAPL, TSLA, NVDA) — no key -->
      <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base">📈</span>
            <h3 class="text-sm font-semibold text-messenger-ink">Live Markets</h3>
          </div>
          <span class="flex items-center gap-1.5 text-[11px] text-emerald-600">
            <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
            TradingView
          </span>
        </div>
        <div class="tradingview-widget-container" style="height: 78px">
          <iframe
            [src]="tickerUrl"
            title="Live market ticker"
            class="block h-full w-full border-0"
            loading="lazy"
            scrolling="no"
            sandbox="allow-scripts allow-same-origin"
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        </div>
      </div>

      <!-- Live scores marquee (zero-key mock, key-ready for a real provider) -->
      <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-base">🏆</span>
            <h3 class="text-sm font-semibold text-messenger-ink">Live Scores</h3>
          </div>
          <span class="rounded-full bg-messenger-blue/10 px-2 py-0.5 text-[10px] font-semibold text-messenger-blue">
            {{ sports.mode() }}
          </span>
        </div>
        <div class="marquee-wrap relative overflow-hidden py-3">
          <div class="marquee-track gap-3 px-3">
            @for (game of ticker(); track $index) {
              <div class="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl border border-gray-100 bg-messenger-wash px-3 py-2">
                <span class="rounded-md bg-messenger-blue/10 px-1.5 py-0.5 text-[10px] font-bold text-messenger-blue">
                  {{ game.league }}
                </span>
                <span class="text-xs font-medium text-messenger-ink">{{ game.home }} {{ game.homeScore }}</span>
                <span class="text-[11px] text-messenger-muted">–</span>
                <span class="text-xs font-medium text-messenger-ink">{{ game.awayScore }} {{ game.away }}</span>
                <span class="text-[10px] text-messenger-muted">{{ game.status }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class MarketsWidgetComponent implements OnInit, OnDestroy {
  /** Doubled list so the marquee loops seamlessly (translateX -50%). */
  readonly ticker = signal<SportGame[]>([]);
  readonly tickerUrl: SafeResourceUrl;
  private gamesSubscription?: Subscription;

  constructor(readonly sports: SportsService, sanitizer: DomSanitizer) {
    const config = {
      symbols: [
        { proName: 'BITSTAMP:BTCUSD', title: 'BTC' },
        { proName: 'BITSTAMP:ETHUSD', title: 'ETH' },
        { proName: 'NASDAQ:AAPL', title: 'AAPL' },
        { proName: 'NASDAQ:TSLA', title: 'TSLA' },
        { proName: 'NASDAQ:NVDA', title: 'NVDA' }
      ],
      showSymbolLogo: true,
      colorTheme: 'light',
      isTransparent: false,
      displayMode: 'adaptive',
      locale: 'en'
    };
    const src = `https://s.tradingview.com/embed-widget/ticker-tape/?locale=en#${encodeURIComponent(JSON.stringify(config))}`;
    this.tickerUrl = sanitizer.bypassSecurityTrustResourceUrl(src);
  }

  ngOnInit(): void {
    this.gamesSubscription = this.sports.games$.subscribe((games) => {
      // Duplicate for a seamless infinite marquee scroll.
      this.ticker.set([...games, ...games]);
    });
  }

  ngOnDestroy(): void {
    this.gamesSubscription?.unsubscribe();
  }
}
