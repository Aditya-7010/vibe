/**
 * Appearance preferences that live on the user record — theme, accent colour,
 * font size and reduced animation — applied by overriding the CSS variables
 * the whole app reads from.
 */

import { Theme } from '../types';

export const THEMES: { id: Theme; label: string; blurb: string }[] = [
  { id: 'dark', label: 'Dark', blurb: 'Low light, high contrast. The default.' },
  { id: 'light', label: 'Light', blurb: 'Clean and paper-bright for daytime.' },
  {
    id: 'skeu',
    label: 'Skeuomorphic',
    blurb: 'Brushed metal, real buttons and soft shadows, like old hi-fi gear.',
  },
];

export const ACCENTS: Record<
  string,
  { light: string; dark: string; skeu: string; label: string }
> = {
  purple: { dark: '#8b5cf6', light: '#6d28d9', skeu: '#6b4fa8', label: 'Violet' },
  cyan: { dark: '#22d3ee', light: '#0891b2', skeu: '#2b7f96', label: 'Cyan' },
  pink: { dark: '#f472b6', light: '#db2777', skeu: '#b8557f', label: 'Rose' },
  orange: { dark: '#fb923c', light: '#ea580c', skeu: '#b4612c', label: 'Amber' },
  green: { dark: '#4ade80', light: '#16a34a', skeu: '#4a7c52', label: 'Fern' },
  gold: { dark: '#facc15', light: '#ca8a04', skeu: '#a07c2c', label: 'Brass' },
};

const FONT_SIZES: Record<string, string> = {
  small: '15px',
  medium: '16px',
  large: '18px',
};

export function readThemeClass(): Theme {
  if (typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  if (root.classList.contains('skeu')) return 'skeu';
  if (root.classList.contains('light')) return 'light';
  return 'dark';
}

/** Puts exactly one theme class on <html>. */
export function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'skeu');
  if (theme === 'light') root.classList.add('light');
  if (theme === 'skeu') root.classList.add('skeu');
}

export interface AppearancePrefs {
  accentColor?: string;
  fontSize?: string;
  animationsEnabled?: boolean;
  theme?: Theme;
}

export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const accent = ACCENTS[prefs.accentColor || 'purple'] || ACCENTS.purple;
  const theme = prefs.theme || readThemeClass();
  const color = accent[theme] || accent.dark;
  root.style.setProperty('--primary', color);
  root.style.setProperty('--ring', color);

  root.style.setProperty('font-size', FONT_SIZES[prefs.fontSize || 'medium'] || '16px');
  root.classList.toggle('no-animations', prefs.animationsEnabled === false);
}
