import { defaultOdooVersion, readEnvironmentMetadata, replaceSourceRepos } from './environment.js';
import { realGit, stageAll, type GitRunner } from './git.js';
import {
  listGitmoduleSources,
  readSourceManifest,
  sourceManifestEntriesFromMetadata,
  sourceReposFromManifest,
  syncManifestFromMetadataAndGitmodules,
  writeSourceManifest,
  type SourceManifestEntry,
} from './source-manifest.js';

export type SourceSyncOptions = {
  target: string;
  stage: boolean;
};

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
