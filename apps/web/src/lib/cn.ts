import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must know the custom theme values from app.css (@theme). Otherwise it reads
// the `text-ui` font size as a text colour and drops the real colour class next to it.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['ui'], shadow: ['glow'], ease: ['spring'], radius: ['avatar'] } },
});

/** Merges class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
