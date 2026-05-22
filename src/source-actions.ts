import { defaultOdooVersion, readEnvironmentMetadata, replaceSourceRepos } from './environment.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import {
  listGitmoduleSources,
  readSourceManifest,
  sourceManifestEntriesFromMetadata,
  sourceManifestPath,
  sourceReposFromManifest,
  syncManifestFromMetadataAndGitmodules,
  writeSourceManifest,
  type SourceManifestEntry,
} from './source-manifest.js';

export type SourceSyncOptions = {
  target: string;
  stage: boolean;
};

export type SourceDriftChange = {
  file: string;
  kind: 'add' | 'remove' | 'update';
  source: string;
  field?: 'url' | 'branch' | 'addons';
  before?: string | string[] | SourceManifestEntry;
  after?: string | string[] | SourceManifestEntry;
};

export type SourceSyncPlan = {
  target: string;
  sources: SourceManifestEntry[];
  changes: SourceDriftChange[];
};

export type SourceListJsonPayload = {
  schemaVersion: 1;
  command: 'source list';
  ok: true;
  sources: SourceManifestEntry[];
};

export type SourceSyncJsonPayload = {
  schemaVersion: 1;
  command: 'source sync';
  ok: true;
  target: string;
  sources: SourceManifestEntry[];
};

export type SourceSyncPreviewJsonPayload = {
  schemaVersion: 1;
  command: 'source sync preview';
  ok: true;
  target: string;
  dryRun: true;
  sources: SourceManifestEntry[];
  changes: SourceDriftChange[];
};

function cloneSourceEntries(entries: SourceManifestEntry[]): SourceManifestEntry[] {
  return entries.map((entry) => ({
    ...entry,
    addons: [...entry.addons],
  }));
}

export async function listSources(target: string): Promise<SourceManifestEntry[]> {
  const metadata = await readEnvironmentMetadata(target);
  const manifest = await readSourceManifest(target);
  if (manifest.sources.length > 0) {
    return manifest.sources;
  }

  if (metadata?.sourceRepos.length) {
    return sourceManifestEntriesFromMetadata(metadata.sourceRepos, metadata.odooVersion);
  }

  return syncManifestFromMetadataAndGitmodules(
    [],
    metadata?.odooVersion ?? defaultOdooVersion,
    await listGitmoduleSources(target),
  );
}

export function renderSourceList(entries: SourceManifestEntry[]): string {
  if (entries.length === 0) {
    return 'No source repositories configured.';
  }

  return entries
    .map((entry) => {
      const branch = entry.branch ? ` @ ${entry.branch}` : '';
      const addons = entry.addons.length ? ` addons: ${entry.addons.join(', ')}` : '';
      return `${entry.type}/${entry.path}${branch} -> ${entry.url}${addons}`;
    })
    .join('\n');
}

export function sourceListJson(entries: SourceManifestEntry[]): SourceListJsonPayload {
  return {
    schemaVersion: 1,
    command: 'source list',
    ok: true,
    sources: cloneSourceEntries(entries),
  };
}

export function sourceSyncJson(
  entries: SourceManifestEntry[],
  target: string,
): SourceSyncJsonPayload {
  return {
    schemaVersion: 1,
    command: 'source sync',
    ok: true,
    target,
    sources: cloneSourceEntries(entries),
  };
}

function sourceKey(entry: SourceManifestEntry): string {
  return `${entry.type}/${entry.path}`;
}

function sourceMap(entries: readonly SourceManifestEntry[]): Map<string, SourceManifestEntry> {
  return new Map(entries.map((entry) => [sourceKey(entry), entry]));
}

function addonsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sourceDriftChanges(
  file: string,
  currentEntries: readonly SourceManifestEntry[],
  nextEntries: readonly SourceManifestEntry[],
): SourceDriftChange[] {
  const changes: SourceDriftChange[] = [];
  const current = sourceMap(currentEntries);
  const next = sourceMap(nextEntries);

  for (const [key, nextEntry] of next) {
    const currentEntry = current.get(key);
    if (!currentEntry) {
      changes.push({ file, kind: 'add', source: key, after: cloneSourceEntries([nextEntry])[0] });
      continue;
    }

    for (const field of ['url', 'branch'] as const) {
      const before = currentEntry[field] ?? '';
      const after = nextEntry[field] ?? '';
      if (before !== after) {
        changes.push({ file, kind: 'update', source: key, field, before, after });
      }
    }

    if (!addonsEqual(currentEntry.addons, nextEntry.addons)) {
      changes.push({
        file,
        kind: 'update',
        source: key,
        field: 'addons',
        before: [...currentEntry.addons],
        after: [...nextEntry.addons],
      });
    }
  }

  for (const [key, currentEntry] of current) {
    if (!next.has(key)) {
      changes.push({ file, kind: 'remove', source: key, before: cloneSourceEntries([currentEntry])[0] });
    }
  }

  return changes;
}

export async function sourceSyncPlan(target: string): Promise<SourceSyncPlan> {
  const metadata = await readEnvironmentMetadata(target);
  const manifest = await readSourceManifest(target);
  const gitmodules = await listGitmoduleSources(target);
  const fallbackBranch = metadata?.odooVersion ?? defaultOdooVersion;
  const baseRepos = metadata?.sourceRepos.length ? metadata.sourceRepos : sourceReposFromManifest(manifest.sources);
  const sources = syncManifestFromMetadataAndGitmodules(baseRepos, fallbackBranch, gitmodules);

  return {
    target,
    sources,
    changes: sourceDriftChanges(sourceManifestPath, manifest.sources, sources),
  };
}

function renderValue(value: SourceDriftChange['before'] | SourceDriftChange['after']): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && value) return JSON.stringify(value);
  return `"${value ?? ''}"`;
}

export function renderSourceSyncPlan(plan: SourceSyncPlan): string {
  if (plan.changes.length === 0) {
    return 'Source manifest already in sync.';
  }

  return plan.changes
    .map((change) => {
      if (change.kind === 'add') return `source manifest add ${change.source}`;
      if (change.kind === 'remove') return `source manifest remove ${change.source}`;
      return `source manifest update ${change.source} ${change.field}: ${renderValue(change.before)} -> ${renderValue(change.after)}`;
    })
    .join('\n');
}

export function sourceSyncPlanJson(plan: SourceSyncPlan): SourceSyncPreviewJsonPayload {
  return {
    schemaVersion: 1,
    command: 'source sync preview',
    ok: true,
    target: plan.target,
    dryRun: true,
    sources: cloneSourceEntries(plan.sources),
    changes: plan.changes.map((change) => ({ ...change })),
  };
}

export async function syncSources(
  options: SourceSyncOptions,
  git: GitRunner = realGit,
): Promise<SourceManifestEntry[]> {
  const metadata = await readEnvironmentMetadata(options.target);
  const manifest = await readSourceManifest(options.target);
  const gitmodules = await listGitmoduleSources(options.target);
  const fallbackBranch = metadata?.odooVersion ?? defaultOdooVersion;
  const baseRepos = metadata?.sourceRepos.length ? metadata.sourceRepos : sourceReposFromManifest(manifest.sources);
  const entries = syncManifestFromMetadataAndGitmodules(baseRepos, fallbackBranch, gitmodules);

  await writeSourceManifest(options.target, entries);
  if (metadata) {
    await replaceSourceRepos(options.target, sourceReposFromManifest(entries));
  }

  if (options.stage) {
    await stageAll(git, options.target);
  }

  return entries;
}
