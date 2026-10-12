import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Follow the production launcher without executing it. Negative assertions see both files.
export function productionBackendSource(): string {
  const launcher = readFileSync(new URL('../../server/index.ts', import.meta.url), 'utf8');
  assert.match(launcher, /import \{ constructBackend \} from '\.\/backend_application\.ts';/);
  assert.match(launcher, /const backend = constructBackend\(\);/);
  assert.equal((launcher.match(/constructBackend\(/g) ?? []).length, 1);
  assert.doesNotMatch(launcher, /process\.env|from ['"][^'"]*(?:test|fixture)[^'"]*['"]/);
  return launcher + '\n' + readFileSync(new URL('../../server/backend_application.ts', import.meta.url), 'utf8');
}
