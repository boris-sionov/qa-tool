import {Component, HostBinding, Input} from '@angular/core';

/**
 * The one loading indicator: a ring with a gliding arc and a soft glow.
 *
 * - `size`: `sm` sits inline in a line of text or a button, `md` in a card or dialog header, `lg`
 *   is the page-level one.
 * - `center`: fills its container and centres the ring with the label under it — for "loading this
 *   page". Without it the spinner is inline and the label sits beside it.
 * - `tone="inherit"`: the ring takes the text colour — for buttons, where the accent would vanish.
 */
@Component({
    selector: 'app-spinner',
    standalone: true,
    template: `
      <span class="ring" role="status" [attr.aria-label]="label || 'Loading'">
        <svg viewBox="0 0 50 50" aria-hidden="true">
          <circle class="track" cx="25" cy="25" r="20"/>
          <circle class="arc" cx="25" cy="25" r="20"/>
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
