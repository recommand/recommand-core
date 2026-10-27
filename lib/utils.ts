import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's own type scale. Without these entries
 * it reads the theme contract's type roles (THEMING.md) as text colours and
 * drops the real colour class next to them.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['button-sm', 'micro', 'table-head', 'page-title', 'kpi'] }],
      'font-weight': [{ font: ['button', 'title'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
