import type { SearchEntry } from './navigation.ts';

export function resolveDocSlug(path: string): string | undefined {
  const normalized = path.replace(/\/+$/, '');
  if (normalized === '/docs') return '';
  if (normalized.startsWith('/docs/')) return normalized.slice(6);
  return undefined;
}

export function searchDocs(entries: SearchEntry[], query: string): SearchEntry[] {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return entries.filter(entry => !entry.url.includes('#')).slice(0, 6);
  const terms = normalized.split(' ');
  return entries.map(entry => {
    const title = entry.title.toLowerCase();
    const haystack = `${title} ${entry.group} ${entry.text}`.toLowerCase();
    const score = terms.every(term => haystack.includes(term))
      ? terms.reduce((total, term) => total + (title.includes(term) ? 10 : 1), 0) + (title.includes(normalized) ? 20 : 0)
      : 0;
    return { entry, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 10).map(item => item.entry);
}
