import { spawn } from 'node:child_process';
import { join } from 'node:path';

export async function runLocalCockpit(target: string): Promise<void> {
  const child = spawn(join(target, 'moo'), [], {
    cwd: target,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Local WPMoo cockpit exited with code ${exitCode ?? 'unknown'}: ${join(target, 'moo')}`);
  }
}
