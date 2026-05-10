#!/usr/bin/env node
import { intro, isCancel, note, outro, select, text } from '@clack/prompts';

import { defaultTargetForProduct, isHelpRequested, optionsFromArgs } from './args.js';
import { getOriginUrl, realGit } from './git.js';
import { renderHelp } from './help.js';
import { supportedOdooVersions } from './odoo-versions.js';
import { inferGitHubOwner, inferRepoPath } from './repo-url.js';
import { scaffold } from './scaffold.js';
import { renderBanner } from './templates.js';
import type { ScaffoldOptions, SourceRepo } from './types.js';

function asString(value: unknown, fallback: string): string {
  if (isCancel(value)) {
    process.exit(1);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function requiredString(value: unknown, label: string): string {
  if (isCancel(value)) {
    process.exit(1);
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  throw new Error(`${label} is required`);
}

async function optionsFromPrompts(): Promise<ScaffoldOptions> {
  console.log(renderBanner());
  intro('Create Odoo dev environment');

  const product = asString(
    await text({
      message: 'Product slug',
      placeholder: 'odoo_sample_module',
      validate: (value) => (value.trim() ? undefined : 'Enter a product/module slug.'),
    }),
    'odoo_sample_module',
  );

  const target = defaultTargetForProduct(product);
  note(
    [
      `Create or have access to these Git repositories before continuing:`,
      ``,
      `- Dev environment repo: ${product}_dev`,
      `- Module source repo: ${product}`,
      ``,
      `The CLI writes into ./${product}_dev and adds ${product} as a submodule under:`,
      `odoo/custom/src/private/${product}`,
      ``,
      `If ./${product}_dev does not exist locally, the CLI will clone the dev repo URL you enter.`,
    ].join('\n'),
    'Repository setup',
  );

  const selectedVersion = await select({
    message: 'Odoo version',
    options: supportedOdooVersions.map((version) => ({ value: version, label: version })),
    initialValue: supportedOdooVersions[0],
  });
  if (isCancel(selectedVersion)) process.exit(1);
  const odooVersion = String(selectedVersion);

  const detectedDevRepoUrl = await getOriginUrl(realGit, target);
  const devRepoUrl = requiredString(
    await text({
      message: 'Dev environment repo URL',
      placeholder: `https://github.com/your-account/${product}_dev.git`,
      defaultValue: detectedDevRepoUrl,
      validate: (value) => (value.trim() ? undefined : 'Enter the dev repository URL.'),
    }),
    'Dev environment repo URL',
  );
  const defaultOwner = inferGitHubOwner(devRepoUrl);

  const sourceRepos: SourceRepo[] = [];
  let addAnother = true;

  while (addAnother) {
    const repoIndex = sourceRepos.length;
    const suggestedRepo =
      defaultOwner === undefined
        ? undefined
        : `https://github.com/${defaultOwner}/${repoIndex === 0 ? product : `${product}_${repoIndex + 1}`}.git`;
    const sourceRepoUrl = asString(
      await text({
        message: repoIndex === 0 ? 'Module source repo URL' : `Additional source repo ${repoIndex + 1} URL`,
        placeholder: `https://github.com/owner/${repoIndex === 0 ? product : `${product}_${repoIndex + 1}`}.git`,
        defaultValue: suggestedRepo,
        validate: (value) => (value.trim() ? undefined : 'Enter the source repository URL.'),
      }),
      suggestedRepo ?? '',
    );
    const sourcePath = inferRepoPath(sourceRepoUrl);

    sourceRepos.push({
      url: sourceRepoUrl,
      path: sourcePath,
      addons: [sourcePath],
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
