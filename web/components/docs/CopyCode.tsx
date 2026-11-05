import { useEffect, useRef, useState } from 'react';

export default function CopyCode() {
  const [status, setStatus] = useState('Copy');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <button type="button" aria-label="Copy code" onClick={async event => {
    const code = event.currentTarget.closest('.docs-code')?.querySelector('pre')?.textContent ?? '';
    try { await navigator.clipboard.writeText(code); setStatus('Copied'); } catch { setStatus('Select to copy'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('Copy'), 1800);
  }}><span aria-live="polite">{status}</span><span aria-hidden="true">⧉</span></button>;
}
