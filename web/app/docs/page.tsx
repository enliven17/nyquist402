import { useEffect } from 'react';
import { source } from '@/lib/docs/source';
import { docPages, isReleaseGuide, type SearchEntry } from '@/lib/docs/navigation';
import { resolveDocSlug } from '@/lib/docs/search';
import DocsShell from '@/components/docs/DocsShell';
import { DocCard, DocCards, Note, Steps, CodeBlock, DocLink } from '@/components/docs/Content';
import SystemArchitecture from '@/components/docs/SystemArchitecture';
import PageOutline from '@/components/docs/PageOutline';
import * as Diagrams from '@/components/docs/Diagrams';
import './docs.css';

const diagramComponents = Object.fromEntries(Object.entries(Diagrams).map(([name, Diagram]) => [name, () => <div className="docs-diagram" role="region" tabIndex={0} aria-label={`${name.replace('Diagram', '')} diagram; scroll horizontally to explore`}><Diagram /></div>]));

const orderedPages = [...source.getPages()].sort((a, b) => docPages.findIndex(item => item.url === a.url) - docPages.findIndex(item => item.url === b.url));
const entries: SearchEntry[] = orderedPages.flatMap(page => {
  const group = docPages.find(item => item.url === page.url)?.group ?? 'Documentation';
  const data = page.data.structuredData;
  return [
    { url: page.url, title: page.data.title, group, text: `${page.data.description ?? ''} ${data.contents.map(item => item.content).join(' ')}` },
    ...data.headings.map(heading => ({ url: `${page.url}#${heading.id}`, title: heading.content, group: `${page.data.title} / ${group}`, text: data.contents.filter(item => item.heading === heading.id).map(item => item.content).join(' ') })),
  ];
});

export default function Docs() {
  const slug = resolveDocSlug(window.location.pathname) ?? '';
  const page = source.getPage(slug ? slug.split('/') : []);
  useEffect(() => {
    document.title = `${page?.data.title ?? 'Page not found'} · Nyquist402 Docs`;
    if (window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    }
  }, [page]);
  if (!page) return <DocsShell entries={entries}><main className="docs-not-found"><h1>Page not found.</h1><p>This documentation page does not exist. <a href="/docs">Go to the introduction →</a></p></main></DocsShell>;
  const index = docPages.findIndex(item => item.url === page.url);
  const current = docPages[index];
  const previous = docPages[index - 1];
  const next = docPages[index + 1];
  const Body = page.data.body;
  const releaseGuide = isReleaseGuide(slug);
  return <DocsShell entries={entries}><div className={`docs-page${!slug ? ' docs-introduction' : ''}`}>
    <main id="docs-content" className="docs-article" tabIndex={-1}>
      <div className="docs-breadcrumb"><span>{current?.group}</span><span aria-hidden="true">/</span><span>{current?.title}</span></div>
      <header className="docs-page-heading"><h1>{page.data.title}</h1><p>{page.data.description}</p></header>
      <div className="docs-scope-note">{releaseGuide ? <>Current testnet documentation. These instructions describe the existing contract and local integration.</> : <>Technical design. This section describes the intended system; <a href="/docs/roadmap">implementation status</a> identifies what is available today.</>}</div>
      <div className="docs-prose"><Body components={{ a: DocLink, pre: CodeBlock, DocCard, DocCards, Note, Steps, SystemArchitecture, ...diagramComponents }} /></div>
      <nav className="docs-pagination" aria-label="Adjacent pages">{previous ? <a href={previous.url}><span>← Previous</span><strong>{previous.title}</strong></a> : <div />}{next && <a href={next.url}><span>Next →</span><strong>{next.title}</strong></a>}</nav>
      <div className="docs-article-foot"><span>Nyquist402 technical documentation · MIT</span><a href="https://github.com/enliven17/nyquist402">Source repository ↗</a></div>
    </main>
    <PageOutline items={page.data.toc.map(item => ({ title: item.title, url: item.url, depth: item.depth }))} />
  </div></DocsShell>;
}
