import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('src/index.ts exposes the snapshot tools in the TypeScript registry', async () => {
  const source = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');

  for (const toolName of [
    'sitebay_create_snapshot_job',
    'sitebay_get_snapshot_job',
  ]) {
    assert.match(source, new RegExp(`"${toolName}"`, 'g'));
  }
});
