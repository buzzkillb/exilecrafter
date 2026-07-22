// src/lib/i18n.ts
// Translation keys. Languages are loaded as static JSON (matches Astro's
// no-runtime import model). Use the t() helper in .astro frontmatter to
// render translated strings into the static HTML.
//
// Add a new language by:
//   1. Drop a new JSON file into src/i18n/<lang>.json with the same keys.
//   2. Add the locale code to the LOCALES const below.
//   3. (optional) Wire a per-page language override via Astro.locals.

import en from '../i18n/en.json';
import pt from '../i18n/pt.json';

export type Locale = 'en' | 'pt';

export const LOCALES: Locale[] = ['en', 'pt'];
export const DEFAULT_LOCALE: Locale = 'en';

const dicts: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  pt: pt as Record<string, string>,
};

/**
 * Resolve a translation key to its rendered string in the chosen locale.
 * Falls back to English, then to the key itself, so missing translations
 * still produce a readable string (no broken UI).
 */
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const raw = dicts[locale]?.[key] ?? dicts[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

/**
 * Bind `t` to a specific locale, so .astro frontmatter can write:
 *   const t = useT(Astro.locals.locale);
 *   <h1>{t('home.title')}</h1>
 */
export function useT(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
}

/**
 * Convenience: resolve locale from a cookie or accept an override.
 * Pages can call this in their frontmatter to render static strings.
 */
export function localeFromCookies(cookieHeader: string | null | undefined): Locale {
  if (!cookieHeader) return DEFAULT_LOCALE;
  const m = /(?:^|;\s*)cc_locale=([a-z]{2})/i.exec(cookieHeader);
  const candidate = m?.[1]?.toLowerCase() as Locale | undefined;
  if (candidate && LOCALES.includes(candidate)) return candidate;
  return DEFAULT_LOCALE;
}
