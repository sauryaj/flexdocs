import { diffChars, diffLines, diffWords } from 'diff';

export type DiffType = 'chars' | 'lines' | 'words';

export interface DiffResult {
  type: string;
  value: string;
  added: boolean;
  removed: boolean;
}

export function computeDiff(
  oldText: string,
  newText: string,
  type: DiffType = 'lines'
): DiffResult[] {
  let differences;

  switch (type) {
    case 'chars':
      differences = diffChars(oldText, newText);
      break;
    case 'words':
      differences = diffWords(oldText, newText);
      break;
    case 'lines':
    default:
      differences = diffLines(oldText, newText);
      break;
  }

  return differences.map((part) => ({
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
    value: part.value,
    added: !!part.added,
    removed: !!part.removed,
  }));
}

export function getDiffStats(diffs: DiffResult[]) {
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (const d of diffs) {
    const lines = d.value.split('\n').length - 1 || 1;
    if (d.added) added += lines;
    else if (d.removed) removed += lines;
    else unchanged += lines;
  }

  return { added, removed, unchanged, total: added + removed + unchanged };
}

export function diffToHtml(diffs: DiffResult[]): string {
  const parts: string[] = [];
  for (const d of diffs) {
    const escaped = d.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    if (d.added) {
      parts.push(`<span class="diff-added">${escaped}</span>`);
    } else if (d.removed) {
      parts.push(`<span class="diff-removed">${escaped}</span>`);
    } else {
      parts.push(`<span class="diff-unchanged">${escaped}</span>`);
    }
  }
  return parts.join('');
}
