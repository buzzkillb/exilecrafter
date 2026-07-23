const DEFAULT_SITE_URL = new URL('https://exilecrafter.com/');

function truncateAtWord(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const candidate = normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd();
  const wordBoundary = candidate.lastIndexOf(' ');
  const shortened = wordBoundary >= Math.floor(maxLength * 0.6)
    ? candidate.slice(0, wordBoundary)
    : candidate;

  return `${shortened.trimEnd()}…`;
}

export function seoDescription(value: string): string {
  return truncateAtWord(value, 160);
}

export function canonicalPath(pathname: string): string {
  const withoutIndex = pathname.replace(/\/index\.html$/, '/');
  if (withoutIndex === '/') return '/';
  return `${withoutIndex.replace(/\/+$/, '')}/`;
}

export function canonicalUrl(
  pathname: string,
  site: URL = DEFAULT_SITE_URL,
): string {
  return new URL(canonicalPath(pathname), site).toString();
}
