import test from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-runtime-fallback-'));
after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test('production cannot select the memory adapter as an outage fallback', () => {
  const script = `import('./db/index.js').then(() => process.exit(1)).catch((error) => {
    process.exit(String(error.message).includes('DB_DRIVER=memory') ? 0 : 2);
  });`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      DB_DRIVER: 'memory',
      NODE_ENV: 'production',
      DEPLOY_ENV: '',
      APP_ENV: '',
      K_SERVICE: '',
      JER_MEMORY_DATA_FILE: path.join(tempRoot, 'db.json'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
