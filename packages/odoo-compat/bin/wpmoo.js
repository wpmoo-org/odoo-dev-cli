#!/usr/bin/env node
import { runCli } from '@wpmoo/toolkit';

console.error('Package renamed: @wpmoo/odoo is now @wpmoo/toolkit. Use: npx @wpmoo/toolkit');

runCli().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
