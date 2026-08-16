'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { FileText, Key, Globe, HardDrive, Server } from 'lucide-react';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

const MENTION_REGEX = /^@(?:asset)?\[([^\]]+)\]\(([a-z]+):([^)]+)\)$/;

function MentionLink({ href, children }: { href: string; children: React.ReactNode }) {
  const match = MENTION_REGEX.exec(href);

  if (match) {
    const name = match[1];
    const type = match[2];
    const id = match[3];

    let target = '#';
    let icon = <FileText className="w-3 h-3 text-blue-500 inline" />;

    switch (type) {
      case 'document':
        target = `/dashboard/documents/${id}`;
        icon = <FileText className="w-3 h-3 text-blue-500 inline" />;
        break;
      case 'password':
        target = `/dashboard/passwords/${id}`;
        icon = <Key className="w-3 h-3 text-emerald-500 inline" />;
        break;
      case 'domain':
        target = `/dashboard/domains/${id}`;
        icon = <Globe className="w-3 h-3 text-purple-500 inline" />;
        break;
      case 'asset':
        target = `/dashboard/assets/${id}`;
        icon = <HardDrive className="w-3 h-3 text-amber-500 inline" />;
        break;
      case 'server':
        target = `/dashboard/servers/${id}`;
        icon = <Server className="w-3 h-3 text-indigo-500 inline" />;
        break;
    }

    return (
      <Link
        href={target}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:underline transition-all align-middle"
      >
        {icon}
        <span>{name}</span>
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
      {children}
    </a>
  );
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  return (
    <div className={`md-preview ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = '', children }) => <MentionLink href={href}>{children}</MentionLink>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}