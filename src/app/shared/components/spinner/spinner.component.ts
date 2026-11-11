import {Component, HostBinding, Input} from '@angular/core';

/**
 * The one loading indicator. Its shape is the app's own: the rounded square of the platform logos,
 * with a light chasing round its edge, a second one turning the other way inside it and a pulsing
 * core.
 *
 * - `size`: `sm` sits inline in a line of text or a button (just the chasing edge), `md` in a card
 *   or a dialog header, `lg` is the page-level one.
 * - `center`: a page is loading — the spinner sits in the middle of the app window, over the page,
 *   with the label under it. It never blocks a click.
 * - `tone="inherit"`: takes the text colour — for buttons, where the accent would vanish.
 */
@Component({
    selector: 'app-spinner',
    standalone: true,
    template: `
      <span class="mark" role="status" [attr.aria-label]="label || 'Loading'">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <rect class="track" x="10" y="10" width="80" height="80" rx="26"/>
          <rect class="chase outer" x="10" y="10" width="80" height="80" rx="26"/>
          <rect class="chase inner" x="26" y="26" width="48" height="48" rx="16"/>
          <rect class="core" x="41" y="41" width="18" height="18" rx="6"/>
        </svg>
      </span>
      @if (label) { <span class="label">{{ label }}</span> }
    `,
    styleUrls: ['./spinner.component.scss'],
})
export class SpinnerComponent {
    @Input() size: 'sm' | 'md' | 'lg' = 'md';
    @Input() label = '';
    @Input() center = false;
    @Input() tone: 'accent' | 'inherit' = 'accent';

    @HostBinding('class') get classes(): string {
        return `${this.size} ${this.tone}${this.center ? ' center' : ''}`;
    }
}
