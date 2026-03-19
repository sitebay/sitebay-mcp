import assert from 'node:assert/strict';
import test from 'node:test';

test('normalizeProxyPayloadArgs preserves query_params_json when provided', async () => {
  const { normalizeProxyPayloadArgs } = await import('../../src/proxy-payload.js');

  assert.equal(
    normalizeProxyPayloadArgs({
      fqdn: 'example.com',
      path: '/wp-json/wp/v2/pages',
      method: 'post',
      query_params_json: '{"title":"Espresso Home"}',
      title: 'ignored',
    }),
    '{"title":"Espresso Home"}',
  );
});

test('normalizeProxyPayloadArgs falls back to body and stray top-level keys', async () => {
  const { normalizeProxyPayloadArgs } = await import('../../src/proxy-payload.js');

  assert.equal(
    normalizeProxyPayloadArgs({
      fqdn: 'example.com',
      path: '/wp-json/wp/v2/pages',
      method: 'post',
      title: 'Espresso Home',
      status: 'publish',
      content: '<p>Hello</p>',
    }),
    JSON.stringify({
      title: 'Espresso Home',
      status: 'publish',
      content: '<p>Hello</p>',
    }),
  );

  assert.equal(
    normalizeProxyPayloadArgs({
      fqdn: 'example.com',
      path: '/wp-json/wp/v2/pages/23',
      method: 'post',
      body: { page_on_front: 23, show_on_front: 'page' },
    }),
    JSON.stringify({ page_on_front: 23, show_on_front: 'page' }),
  );
});
