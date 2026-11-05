
import type { ComponentProps, ReactNode } from 'react';
import CopyCode from './CopyCode';

export function DocLink({ href = '', children, ...props }: ComponentProps<'a'>) {
  return <a href={href} {...props}>{children}</a>;
}

export function DocCards({ children }: { children: ReactNode }) { return <div className="docs-link-grid">{children}</div>; }

export function DocCard({ href, title, label, children }: { href: string; title: string; label: string; children: ReactNode }) {
  return <a className="docs-link-card" href={href}><span className="docs-card-label">{label}<span aria-hidden="true">↗</span></span><strong>{title}</strong><span className="docs-card-description">{children}</span></a>;
}

export function Note({ children, title = 'Good to know' }: { children: ReactNode; title?: string }) {
  return <aside className="docs-note"><span className="docs-note-symbol" aria-hidden="true">i</span><div><strong>{title}</strong><div>{children}</div></div></aside>;
}

export function Steps({ children }: { children: ReactNode }) { return <div className="docs-steps">{children}</div>; }

export function CodeBlock(props: ComponentProps<'pre'> & { 'data-language'?: string }) {
  return <div className="docs-code"><div className="docs-code-head"><span>{props['data-language'] ?? 'Code'}</span><CopyCode /></div><pre {...props} /></div>;
}
