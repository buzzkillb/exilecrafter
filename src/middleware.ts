// src/middleware.ts
// Resolves the visitor's preferred language from a cookie or the Accept-Language
// header, then attaches it to Astro.locals.locale so any page can do:
//   import { t, localeFromRequest } from '~/lib/i18n';
//   const t = (key, vars?) => i18n.t(Astro.locals.locale, key, vars);
// and render translated strings at build time.

import { defineMiddleware } from 'astro:middleware';
import { type Locale } from './lib/i18n';

const HEADER_LOCALE_RE = /([a-z]{2})(?:-[A-Z]{2})?(?=\s*;|,|$)/g;

function acceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const codes: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = HEADER_LOCALE_RE.exec(header))) {
    if (m[1] && !codes.includes(m[1].toLowerCase())) {
      codes.push(m[1].toLowerCase());
    }
  }
  return (codes.find((c) => c === 'en' || c === 'pt') as Locale | undefined) ?? null;
}

/** Read a cookie by name from a raw cookie header value */
function readCookie(raw: string | null, name: string): string | undefined {
  if (!raw) return undefined;
  const m = new RegExp(`(?:^|;\\s*)${name}=([a-z]{2})`, 'i').exec(raw);
  return m?.[1]?.toLowerCase();
}

export const onRequest = defineMiddleware(async (context, next) => {
  // During prerendering Astro 7 does not have request headers — silently default to 'en'.
  // On the dev server or a server-rendered page, read the cookie + Accept-Language.
  if (context.route !== undefined && (context.route as Record<string, unknown>).prerender !== false) {
    context.locals.locale = 'en';
    return next();
  }

  const cookie = context.request.headers.get('cookie');
  const accept = context.request.headers.get('accept-language');
  const cookieLocale = readCookie(cookie, 'cc_locale') as Locale | undefined;
  const headerLocale = acceptLanguage(accept);
  context.locals.locale = cookieLocale ?? headerLocale ?? 'en';
  return next();
});
