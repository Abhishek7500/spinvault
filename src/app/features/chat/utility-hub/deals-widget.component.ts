import { Component } from '@angular/core';
import { NgClass } from '@angular/common';

interface Deal {
  id: number;
  title: string;
  store: string;
  price: string;
  was: string;
  off: string;
  emoji: string;
  gradient: string;
  tag: 'Tech' | 'Fashion';
  url: string;
}

const DEALS: Deal[] = [
  {
    id: 1,
    title: 'Noise-Cancelling Headphones',
    store: 'SoundLab',
    price: '$149',
    was: '$299',
    off: '50% OFF',
    emoji: '🎧',
    gradient: 'from-indigo-500 to-purple-600',
    tag: 'Tech',
    url: 'https://www.amazon.com/s?k=noise+cancelling+headphones'
  },
  {
    id: 2,
    title: 'Minimalist Leather Jacket',
    store: 'Urban Thread',
    price: '$89',
    was: '$180',
    off: '51% OFF',
    emoji: '🧥',
    gradient: 'from-amber-500 to-rose-500',
    tag: 'Fashion',
    url: 'https://www.amazon.com/s?k=leather+jacket+men'
  },
  {
    id: 3,
    title: '4K Action Camera',
    store: 'GoPeak',
    price: '$199',
    was: '$349',
    off: '43% OFF',
    emoji: '📷',
    gradient: 'from-sky-500 to-cyan-500',
    tag: 'Tech',
    url: 'https://www.amazon.com/s?k=4k+action+camera'
  },
  {
    id: 4,
    title: 'Retro Runner Sneakers',
    store: 'KickLab',
    price: '$64',
    was: '$120',
    off: '47% OFF',
    emoji: '👟',
    gradient: 'from-emerald-500 to-teal-600',
    tag: 'Fashion',
    url: 'https://www.amazon.com/s?k=retro+runner+sneakers'
  },
  {
    id: 5,
    title: 'Smart Fitness Watch',
    store: 'PulseTech',
    price: '$79',
    was: '$159',
    off: '50% OFF',
    emoji: '⌚',
    gradient: 'from-fuchsia-500 to-pink-600',
    tag: 'Tech',
    url: 'https://www.amazon.com/s?k=smart+fitness+watch'
  }
];

/**
 * 🛍️ Smart Deals widget — a curated, mock feed of "On Sale Clothes & Tech
 * Deals". Each card links out to a real shopping search so the workflow feels
 * complete; swapping the data source for an affiliate API is a drop-in change.
 */
@Component({
  selector: 'app-deals-widget',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="rise-in space-y-3">
      <div class="flex items-center justify-between px-1">
        <h3 class="text-sm font-semibold text-messenger-ink">Curated for you</h3>
        <span class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-600">🔥 Hot deals</span>
      </div>

      @for (deal of deals; track deal.id) {
        <a
          [href]="deal.url"
          target="_blank"
          rel="noopener noreferrer"
          class="group flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-pane"
        >
          <div
            class="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br text-2xl shadow-inner"
            [ngClass]="deal.gradient"
          >
            <span class="transition-transform duration-300 group-hover:scale-110">{{ deal.emoji }}</span>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span
                class="rounded px-1.5 py-0.5 text-[10px] font-bold"
                [class.bg-sky-100]="deal.tag === 'Tech'"
                [class.text-sky-600]="deal.tag === 'Tech'"
                [class.bg-amber-100]="deal.tag === 'Fashion'"
                [class.text-amber-600]="deal.tag === 'Fashion'"
              >
                {{ deal.tag }}
              </span>
              <span class="truncate text-[11px] text-messenger-muted">{{ deal.store }}</span>
            </div>
            <p class="truncate text-sm font-semibold text-messenger-ink">{{ deal.title }}</p>
            <div class="mt-0.5 flex items-center gap-2">
              <span class="text-sm font-bold text-messenger-ink">{{ deal.price }}</span>
              <span class="text-[11px] text-messenger-muted line-through">{{ deal.was }}</span>
              <span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">{{ deal.off }}</span>
            </div>
          </div>

          <span class="shrink-0 text-messenger-muted transition-transform duration-300 group-hover:translate-x-1">›</span>
        </a>
      }
    </div>
  `
})
export class DealsWidgetComponent {
  readonly deals = DEALS;
}
