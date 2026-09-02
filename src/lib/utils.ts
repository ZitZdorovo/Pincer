import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
const merge = extendTailwindMerge({ extend: { classGroups: { 'font-size': [{ text: ['2xs', 'tiny', 'meta', 'subtitle', 'stat'] }] } } });
export function cn(...values: ClassValue[]): string { return merge(clsx(values)); }
