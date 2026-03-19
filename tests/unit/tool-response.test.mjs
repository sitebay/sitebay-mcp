import assert from 'node:assert/strict';
import test from 'node:test';

test('buildMachineToolResponse exposes structuredContent and plain JSON text', async () => {
  const { buildMachineToolResponse } = await import('../../src/tool-response.js');

  const response = buildMachineToolResponse({
    ok: true,
    http_status: 200,
    result: {
      id: 23,
      status: 'publish',
    },
    warnings: [],
  });

  assert.deepEqual(response.structuredContent, {
    ok: true,
    http_status: 200,
    result: {
      id: 23,
      status: 'publish',
    },
    warnings: [],
  });
  assert.equal(response.content[0].type, 'text');
  assert.equal(response.content[0].text, JSON.stringify(response.structuredContent));
  assert.doesNotMatch(response.content[0].text, /```|\*\*/);
});

test('buildWordpressCreatePageEnvelope fails when a publish request comes back draft', async () => {
  const { buildWordpressCreatePageEnvelope } = await import('../../src/tool-response.js');

  const envelope = buildWordpressCreatePageEnvelope({
    request: {
      title: 'Espresso Home',
      content: '<p>Bold coffee shop homepage</p>',
      status: 'publish',
    },
    httpStatus: 200,
    result: {
      id: 23,
      status: 'draft',
      title: {
        raw: '',
        rendered: '',
      },
      link: 'https://example.com/?page_id=23',
    },
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.http_status, 200);
  assert.equal(envelope.semantic_checks.status_matches_request, false);
  assert.equal(envelope.semantic_checks.title_matches_request, false);
  assert.equal(envelope.result.status, 'draft');
});

test('buildWordpressSettingsEnvelope fails when reading settings do not match the requested front page', async () => {
  const { buildWordpressSettingsEnvelope } = await import('../../src/tool-response.js');

  const envelope = buildWordpressSettingsEnvelope({
    request: {
      show_on_front: 'page',
      page_on_front: 23,
    },
    httpStatus: 200,
    result: {
      show_on_front: 'posts',
      page_on_front: 0,
    },
  });

  assert.equal(envelope.ok, false);
  assert.equal(envelope.semantic_checks.show_on_front_matches_request, false);
  assert.equal(envelope.semantic_checks.page_on_front_matches_request, false);
});
