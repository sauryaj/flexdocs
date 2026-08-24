'use client';

import { useEffect, useRef, useState } from 'react';

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
const rendered = new Set<string>();
let counter = 0;

async function loadMermaid(dark: boolean) {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'default',
    fontFamily: 'inherit',
  });
  return mermaid;
}

export function MermaidDiagram({ code, dark }: { code: string; dark: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const idRef = useRef(`mmd-${++counter}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    let cancelled = false;
    const key = `${dark}:${idRef.current}`;
    (async () => {
      try {
        const mermaid = await loadMermaid(dark);
        // Re-render on theme change even for the same id
        if (rendered.has(key)) rendered.delete(key);
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled) {
          rendered.add(key);
          setSvg(svg);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setSvg(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  if (error) {
    return (
      <pre className="md-preview overflow-x-auto text-xs p-3 rounded-lg" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--muted)' }}>
        {code}
      </pre>
    );
  }

  return (
    <div
      className="my-3 p-3 rounded-lg overflow-x-auto"
      style={{ backgroundColor: 'var(--surface-2)' }}
      // Diagram SVG is generated locally by mermaid from the block's own content
      dangerouslySetInnerHTML={{ __html: svg ?? '<div style="padding:2rem;text-align:center;font-size:12px;opacity:.6">Rendering diagram…</div>' }}
    />
  );
}
