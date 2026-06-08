import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The shadcn `cn` helper.
 * Combines clsx (conditional classes) with tailwind-merge (de-duplicates
 * conflicting tailwind classes — e.g. `cn("p-2", "p-4")` returns `"p-4"`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
