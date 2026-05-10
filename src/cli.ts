#!/usr/bin/env node
import { intro, isCancel, outro, select, text } from '@clack/prompts';

import { isHelpRequested, optionsFromArgs } from './args.js';
import { getOriginUrl, realGit } from './git.js';
import { renderHelp } from './help.js';
import { inferRepoPath } from './repo-url.js';
import { scaffold } from './scaffold.js';
import { defaultCommunityAddons, defaultProAddons, renderBanner } from './templates.js';
import type { ScaffoldOptions, SourceRepo } from './types.js';

function asString(value: unknown, fallback: string): string {
  if (isCancel(value)) {
    process.exit(1);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function csv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function optionsFromPrompts(): Promise<ScaffoldOptions> {
  console.log(renderBanner());
  intro('Create WPMoo Odoo dev environment');

  const product = asString(
    await text({
      message: 'Product slug',
      placeholder: 'moo_olympiad',
      defaultValue: 'moo_olympiad',
    }),
    'moo_olympiad',
  );
  const odooVersion = asString(
    await text({
      message: 'Odoo version branch',
      defaultValue: '19.0',
    }),
    '19.0',
  );
  const target = asString(
    await text({
      message: 'Target directory',
      defaultValue: process.cwd(),
    }),
    process.cwd(),
  );

  const detectedDevRepoUrl = await getOriginUrl(realGit, target);
  const devRepoUrl = asString(
    await text({
      message: 'Dev environment repo URL',
      defaultValue: detectedDevRepoUrl ?? `https://github.com/wpmoo-org/${product}_dev.git`,
    }),
    detectedDevRepoUrl ?? `https://github.com/wpmoo-org/${product}_dev.git`,
  );

  const sourceRepos: SourceRepo[] = [];
  let addAnother = true;

  while (addAnother) {
    const repoIndex = sourceRepos.length;
    const sourceRepoUrl = asString(
      await text({
        message: `Source repo ${repoIndex + 1} URL`,
        defaultValue:
          repoIndex === 0
            ? `https://github.com/wpmoo-org/${product}.git`
            : `https://github.com/wpmoo-org/${product}_pro.git`,
      }),
      repoIndex === 0 ? `https://github.com/wpmoo-org/${product}.git` : `https://github.com/wpmoo-org/${product}_pro.git`,
    );
    const defaultPath = inferRepoPath(sourceRepoUrl);
    const sourcePath = asString(
      await text({
        message: `Source repo ${repoIndex + 1} local folder`,
        defaultValue: defaultPath,
      }),
      defaultPath,
    );
    const defaultAddons =
      repoIndex === 0 ? defaultCommunityAddons(product).join(',') : defaultProAddons(product).join(',');
    const sourceAddons = asString(
      await text({
        message: `Source repo ${repoIndex + 1} addons`,
        defaultValue: defaultAddons,
      }),
      defaultAddons,
    );

    sourceRepos.push({
      url: sourceRepoUrl,
      path: sourcePath,
      addons: csv(sourceAddons),
    });

    const shouldAddAnother = await select({
      message: 'Add another source repo?',
      options: [
        { value: false, label: 'No' },
        { value: true, label: 'Yes' },
      ],
      initialValue: false,
    });
    if (isCancel(shouldAddAnother)) process.exit(1);
    addAnother = Boolean(shouldAddAnother);
  }

  const initEmpty = await select({
    message: 'Initialize empty source repos if needed?',
    options: [
      { value: true, label: 'Yes, after confirmation in this wizard' },
      { value: false, label: 'No, fail with instructions' },
    ],
    initialValue: true,
  });
  if (isCancel(initEmpty)) process.exit(1);

  return {
    product,
    odooVersion,
    devRepo: inferRepoPath(devRepoUrl),
    devRepoUrl,
    sourceRepos,
    target,
    dryRun: false,
    initEmptyRepos: Boolean(initEmpty),
    stage: true,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (isHelpRequested(argv)) {
    console.log(renderHelp());
    return;
  }

  const options = optionsFromArgs(argv);
  if (options) {
    console.log(renderBanner());
  }

  const resolvedOptions = options ?? (await optionsFromPrompts());
  const result = await scaffold(resolvedOptions);

  if (resolvedOptions.dryRun) {
    console.log('Dry run: planned files');
    for (const file of result.plannedFiles) console.log(`- ${file}`);
    console.log('Dry run: planned commands');
    for (const command of result.plannedCommands) console.log(`- ${command}`);
    return;
  }

  outro(`Created WPMoo dev overlay in ${resolvedOptions.target}. Review staged changes, then commit.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
