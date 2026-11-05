import { useEffect, useState, type ReactNode } from 'react';


export default function PageOutline({ items }: { items: { title: ReactNode; url: string; depth: number }[] }) {
  const [active, setActive] = useState('');
  useEffect(() => {
    setActive('');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(`#${entry.target.id}`);
    }, { rootMargin: '-80px 0px -65% 0px' });
    items.forEach(item => { const element = document.getElementById(decodeURIComponent(item.url.slice(1))); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [items]);
  return <aside className="docs-outline"><div className="docs-outline-inner"><p>ON THIS PAGE</p><nav aria-label="On this page">{items.map(item => <a key={item.url} href={item.url} className={`${active === item.url ? 'active' : ''}${item.depth > 2 ? ' nested' : ''}`}>{item.title}</a>)}</nav><div className="docs-outline-help"><strong>Implementation status</strong><p>Contract versions, available integrations and testnet instructions.</p><a href="/docs/roadmap">Release availability →</a></div></div></aside>;
}
