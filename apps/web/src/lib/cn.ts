import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must know the custom theme values from app.css (@theme). Otherwise it reads
// the `text-ui` font size as a text colour and drops the real colour class next to it, and it
// keeps a component's default animation next to the one a caller passes instead of replacing it.
const ANIMATIONS = [
  'fade-in',
  'fade-out',
  'pop-in',
  'pop-out',
  'rise-in',
  'message-in',
  'message-out',
  'drawer-in-left',
  'drawer-out-left',
  'drawer-in-right',
  'drawer-out-right',
  'sheet-in',
  'sheet-out',
  'shimmer',
  'typing',
  'highlight',
  'reaction-pop',
  'count-roll',
  'badge-pop',
  'send-fly',
];
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['ui'], shadow: ['glow'], ease: ['spring'], radius: ['avatar'], animate: ANIMATIONS } },
});

/** Merges class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
