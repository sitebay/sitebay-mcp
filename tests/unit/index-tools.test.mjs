import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('src/index.ts exposes the snapshot tools in the TypeScript registry', async () => {
  const source = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');

  for (const toolName of [
    'sitebay_create_snapshot_job',
    'sitebay_get_snapshot_job',
    'sitebay_search_dolt_history',
  ]) {
    assert.match(source, new RegExp(`"${toolName}"`, 'g'));
  }
});

test('dolt history search tool forwards cache freshness metadata in structured content', async () => {
  const source = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /"sitebay_search_dolt_history"[\s\S]*?\/site\/\$\{fqdn\}\/dolt\/history-search/,
  );
  assert.match(
    source,
    /"sitebay_search_dolt_history"[\s\S]*?structuredContent:\s*result/,
  );
  assert.match(
    source,
    /"sitebay_search_dolt_history"[\s\S]*?cache freshness metadata/i,
  );
});

test('browser admin cookie tool advertises and returns a Playwright-compatible cookie object', async () => {
  const source = await readFile(new URL('../../src/index.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /"sitebay_browser_admin_cookie"[\s\S]*?Playwright-compatible cookie object/i,
  );
  assert.match(
    source,
    /"sitebay_browser_admin_cookie"[\s\S]*?structuredContent:\s*data/,
  );
});
