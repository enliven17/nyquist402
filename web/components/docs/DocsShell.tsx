import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { searchDocs } from '@/lib/docs/search';
import type { SearchEntry } from '@/lib/docs/navigation';

function SearchIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>;
}

export default function DocsShell({ entries, children }: { entries: SearchEntry[]; children: ReactNode }) {
  const path = window.location.pathname;
  const basic = path.startsWith('/docs/basic');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const resultList = useRef<HTMLDivElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => searchDocs(entries, query), [entries, query]);
  function openSearch() { setQuery(''); setSelected(0); if (!dialog.current?.open) dialog.current?.showModal(); }
  function closeSearch() { dialog.current?.close(); }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (dialog.current?.open) closeSearch(); else openSearch();
      }
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  useEffect(() => { resultList.current?.querySelector(`[data-result="${selected}"]`)?.scrollIntoView({ block: 'nearest' }); }, [selected]);

  return <div className="docs-site">
    <a className="docs-skip" href="#docs-content">Skip to content</a>
    <header className="docs-topbar">
      <div className="docs-topbar-main">
        <nav className="docs-top-tabs" aria-label="Documentation sections"><a className={!path.includes('/reference/') ? 'active' : ''} href="/docs">Guides</a><a className={path.includes('/reference/') ? 'active' : ''} href="/docs/reference/contract">Reference</a></nav>
        <div className="docs-top-actions"><button ref={searchTrigger} className="docs-search-trigger" onClick={openSearch} aria-label="Search documentation"><SearchIcon /><span>Search documentation</span><kbd>⌘ K</kbd></button><a className="docs-demo-link" href={basic ? '/demo' : '/demo/protected'}>Testnet {basic ? 'basic' : 'protected'} demo <span aria-hidden="true">↗</span></a></div>
      </div>
    </header>
    <div className="docs-body">{children}</div>
    <dialog ref={dialog} className="docs-search-dialog" aria-label="Search documentation" onClose={() => searchTrigger.current?.focus({ preventScroll: true })} onClick={event => { if (event.target === event.currentTarget) closeSearch(); }} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(value => Math.max(0, Math.min(value + 1, results.length - 1))); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(value => Math.max(value - 1, 0)); }
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && results[selected]) { event.preventDefault(); closeSearch(); window.location.assign(results[selected].url); }
    }}>
      <div className="docs-search-field"><SearchIcon /><input autoFocus type="search" placeholder="Search guides, methods, and concepts…" aria-label="Search guides, methods, and concepts" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="docs-search-results" aria-activedescendant={results.length ? `docs-result-${selected}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} /><button onClick={closeSearch} aria-label="Close search"><kbd>Esc</kbd></button></div>
      <p className="docs-search-caption" aria-live="polite">{query.trim() ? `${results.length} results` : 'DOCUMENTATION'}</p>
      <div id="docs-search-results" className="docs-search-results" role="listbox" aria-label="Search results" ref={resultList}>{results.length ? results.map((result, index) => <a id={`docs-result-${index}`} role="option" aria-selected={selected === index} href={result.url} key={result.url} data-result={index} className={selected === index ? 'selected' : ''} onMouseEnter={() => setSelected(index)} onClick={closeSearch}><span aria-hidden="true">{result.url.includes('#') ? '#' : '↗'}</span><span><small>{result.group}</small><strong>{result.title}</strong><p>{result.text.slice(0, 145)}{result.text.length > 145 ? '…' : ''}</p></span><span aria-hidden="true">↵</span></a>) : <div className="docs-search-empty">No results for “{query}”.<br /><span>Try “reclaim”, “signing”, or “arbitration”.</span></div>}</div>
      <div className="docs-search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>↵</kbd> to open</span><span>Nyquist402 docs</span></div>
    </dialog>
  </div>;
}
