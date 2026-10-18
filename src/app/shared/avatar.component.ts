import { Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="relative shrink-0">
      <div
        class="flex items-center justify-center rounded-full font-semibold text-white shadow-sm"
        [ngClass]="sizeClass"
        [style.background]="color"
      >
        {{ initials }}
      </div>
      @if (showStatus) {
        <span
          class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white"
          [class.bg-emerald-500]="online"
          [class.bg-gray-300]="!online"
        ></span>
      }
    </div>
  `
})
export class AvatarComponent {
  @Input({ required: true }) name = '';
  @Input() color = '#0084FF';
  @Input() online = false;
  @Input() showStatus = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  get initials(): string {
    return this.name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  get sizeClass(): string {
    if (this.size === 'sm') {
      return 'h-9 w-9 text-xs';
    }
    if (this.size === 'lg') {
      return 'h-14 w-14 text-lg';
    }
    return 'h-12 w-12 text-sm';
  }
}
