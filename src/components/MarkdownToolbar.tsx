'use client';

import { Bold, Italic, Heading, List, Code, Table, AlertCircle, Link as LinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface MarkdownToolbarProps {
  onFormat: (prefix: string, suffix?: string, defaultText?: string) => void;
  children?: ReactNode;
}

export function MarkdownToolbar({ onFormat, children }: MarkdownToolbarProps) {
  const btn =
    'p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors';
  const divider = <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />;

  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting">
      <button type="button" onClick={() => onFormat('**', '**', 'bold text')} title="Bold" aria-label="Bold" className={btn}>
        <Bold className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => onFormat('*', '*', 'italic text')} title="Italic" aria-label="Italic" className={btn}>
        <Italic className="w-4 h-4" />
      </button>
      {divider}
      <button type="button" onClick={() => onFormat('## ', '', 'Heading 2')} title="Heading" aria-label="Heading" className={btn}>
        <Heading className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => onFormat('- ', '', 'List item')} title="Bullet List" aria-label="Bullet List" className={btn}>
        <List className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat('[', '](https://example.com)', 'link text')}
        title="Link"
        aria-label="Insert Link"
        className={btn}
      >
        <LinkIcon className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat('```bash\n', '\n```', '# bash commands here')}
        title="Code Block"
        aria-label="Code Block"
        className={btn}
      >
        <Code className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() =>
          onFormat('\n| Feature | Status | Notes |\n| :--- | :--- | :--- |\n| Service A | Active | Primary |\n')
        }
        title="Insert Table"
        aria-label="Insert Table"
        className={btn}
      >
        <Table className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => onFormat('> [!NOTE]\n> ', '', 'Important note details…')}
        title="Callout Box"
        aria-label="Callout Box"
        className={btn}
      >
        <AlertCircle className="w-4 h-4" />
      </button>
      {(children || null) && (
        <>
          {divider}
          {children}
        </>
      )}
    </div>
  );
}
