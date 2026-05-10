import type { SourceRepo } from './types.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureFinalNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function yamlList(items: string[]): string {
  return items.map((item) => `  - ${item}`).join('\n');
}

function renderSourceRepoBlock(repo: Pick<SourceRepo, 'path' | 'addons'>): string {
  return `private/${repo.path}:\n${yamlList(repo.addons)}\n`;
}

export function addSourceRepoToAddonsYaml(
  content: string,
  repo: Pick<SourceRepo, 'path' | 'addons'>,
): string {
  const blockPattern = new RegExp(`^private/${escapeRegExp(repo.path)}:\\s*$`, 'm');
  if (blockPattern.test(content)) {
    return content;
  }

  const base = ensureFinalNewline(content.trimEnd());
  return `${base}\n${renderSourceRepoBlock(repo)}`;
}

export function removeSourceRepoFromAddonsYaml(content: string, repoPath: string): string {
  const blockPattern = new RegExp(
    `(^|\\n)private/${escapeRegExp(repoPath)}:\\n(?:[ \\t].*(?:\\n|$))*`,
    'g',
  );
  const updated = content
    .replace(blockPattern, (match, prefix: string) => (prefix === '\n' && match.endsWith('\n') ? '\n' : ''))
    .replace(/\n{3,}/g, '\n\n');

  return ensureFinalNewline(updated.trimEnd());
}
