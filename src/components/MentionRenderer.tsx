'use client';

import Link from 'next/link';
import { FileText, Key, Globe, HardDrive, Server, ExternalLink } from 'lucide-react';

interface MentionRendererProps {
  content: string;
}

export function MentionRenderer({ content }: MentionRendererProps) {
  // Regex to match @[Name](type:id) or @asset[Name](type:id)
  const regex = /@(?:asset)?\[([^\]]+)\]\(([a-z]+):([^)]+)\)/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(<span key={`text-${lastIndex}`}>{textBefore}</span>);
    }

    const name = match[1];
    const type = match[2];
    const id = match[3];

    let href = '#';
    let icon = <FileText className="w-3 h-3 text-blue-500 inline" />;

    switch (type) {
      case 'document':
        href = `/dashboard/documents/${id}`;
        icon = <FileText className="w-3 h-3 text-blue-500 inline" />;
        break;
      case 'password':
        href = `/dashboard/passwords/${id}`;
        icon = <Key className="w-3 h-3 text-emerald-500 inline" />;
        break;
      case 'domain':
        href = `/dashboard/domains/${id}`;
        icon = <Globe className="w-3 h-3 text-purple-500 inline" />;
        break;
      case 'asset':
        href = `/dashboard/assets/${id}`;
        icon = <HardDrive className="w-3 h-3 text-amber-500 inline" />;
        break;
      case 'server':
        href = `/dashboard/servers/${id}`;
        icon = <Server className="w-3 h-3 text-indigo-500 inline" />;
        break;
    }

    parts.push(
      <Link
        key={`mention-${match.index}`}
        href={href}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:underline transition-all shadow-2xs"
      >
        {icon}
        <span>{name}</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
      </Link>
    );

    lastIndex = match.index + match[0].length;
  }

  const remainingText = content.substring(lastIndex);
  if (remainingText) {
    parts.push(<span key={`text-${lastIndex}`}>{remainingText}</span>);
  }

  return <div className="whitespace-pre-wrap leading-relaxed">{parts}</div>;
}
