import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's own type scale. Without these entries
 * it reads the theme contract's type roles (THEMING.md) and the brand's app
 * type roles as text colours, and drops one of them and the colour class next to it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'button-sm',
            'micro',
            'table-head',
            'page-title',
            'kpi',
            'app-amount',
            'app-badge',
            'app-body',
            'app-button',
            'app-button-sm',
            'app-caption',
            'app-eyebrow',
            'app-kpi',
            'app-kpi-hero',
            'app-micro',
            'app-nav',
            'app-page-title',
            'app-panel-title',
            'app-section-title',
            'app-small',
            'app-table-head',
          ],
        },
      ],
      'font-weight': [{ font: ['button', 'title'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
