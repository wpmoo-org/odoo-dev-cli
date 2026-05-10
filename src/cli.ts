#!/usr/bin/env node
import { intro, isCancel, multiselect, outro, select, text } from '@clack/prompts';

import { optionsFromArgs } from './args.js';
import { scaffold } from './scaffold.js';
import { defaultCommunityAddons, defaultProAddons } from './templates.js';
import type { ScaffoldOptions } from './types.js';

function asString(value: unknown, fallback: string): string {
  if (isCancel(value)) {
    process.exit(1);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function optionsFromPrompts(): Promise<ScaffoldOptions> {
  intro('Create WPMoo Odoo dev environment');

  const product = asString(
    await text({
      message: 'Product slug',
      placeholder: 'moo_olympiad',
      defaultValue: 'moo_olympiad',
    }),
    'moo_olympiad',
  );
  const org = asString(
    await text({
      message: 'GitHub organization',
      defaultValue: 'wpmoo-org',
    }),
    'wpmoo-org',
  );
  const odooVersion = asString(
    await text({
      message: 'Odoo version branch',
      defaultValue: '19.0',
    }),
    '19.0',
  );
  const devRepo = asString(
    await text({
      message: 'Dev environment repo name',
      defaultValue: `${product}_dev`,
    }),
    `${product}_dev`,
  );
  const communityRepo = asString(
    await text({
      message: 'Community repo name',
      defaultValue: product,
    }),
    product,
  );
  const proRepo = asString(
    await text({
      message: 'Pro repo name',
      defaultValue: `${product}_pro`,
    }),
    `${product}_pro`,
  );
  const target = asString(
    await text({
      message: 'Target directory',
      defaultValue: process.cwd(),
    }),
    process.cwd(),
  );

  const defaultCommunity = defaultCommunityAddons(product);
  const defaultPro = defaultProAddons(product);

  const communityAddons = await multiselect({
    message: 'Community addons',
    options: defaultCommunity.map((addon) => ({ value: addon, label: addon })),
    required: false,
    initialValues: defaultCommunity,
  });
  if (isCancel(communityAddons)) process.exit(1);

  const proAddons = await multiselect({
    message: 'Pro addons',
    options: defaultPro.map((addon) => ({ value: addon, label: addon })),
    required: false,
    initialValues: defaultPro,
  });
  if (isCancel(proAddons)) process.exit(1);

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
    org,
    odooVersion,
    devRepo,
    communityRepo,
    proRepo,
    communityRepoUrl: `https://github.com/${org}/${communityRepo}.git`,
    proRepoUrl: `https://github.com/${org}/${proRepo}.git`,
    communityAddons: communityAddons as string[],
    proAddons: proAddons as string[],
    target,
    dryRun: false,
    initEmptyRepos: Boolean(initEmpty),
    stage: true,
  };
}

async function main(): Promise<void> {
  const options = optionsFromArgs(process.argv.slice(2)) ?? (await optionsFromPrompts());
  const result = await scaffold(options);

  if (options.dryRun) {
    console.log('Dry run: planned files');
    for (const file of result.plannedFiles) console.log(`- ${file}`);
    console.log('Dry run: planned commands');
    for (const command of result.plannedCommands) console.log(`- ${command}`);
    return;
  }

  outro(`Created WPMoo dev overlay in ${options.target}. Review staged changes, then commit.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

