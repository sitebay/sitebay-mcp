const RESERVED_KEYS = new Set([
  'fqdn',
  'shop_name',
  'path',
  'method',
  'query_params_json',
  'body',
]);

function stringifyPayload(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function resolveProxyPayloadArgs(args) {
  if (typeof args.query_params_json === 'string' && args.query_params_json.trim()) {
    return {
      payload: args.query_params_json,
      warnings: [],
    };
  }

  if (args.query_params_json && typeof args.query_params_json === 'object') {
    return {
      payload: stringifyPayload(args.query_params_json),
      warnings: ['normalized object query_params_json into a JSON string'],
    };
  }

  if (typeof args.body === 'string' && args.body.trim()) {
    return {
      payload: args.body,
      warnings: ['normalized legacy body into query_params_json'],
    };
  }

  if (args.body && typeof args.body === 'object') {
    return {
      payload: stringifyPayload(args.body),
      warnings: ['normalized legacy body into query_params_json'],
    };
  }

  const fallbackEntries = Object.entries(args).filter(
    ([key, value]) => !RESERVED_KEYS.has(key) && value !== undefined,
  );
  if (fallbackEntries.length === 0) {
    return {
      payload: undefined,
      warnings: [],
    };
  }

  return {
    payload: JSON.stringify(Object.fromEntries(fallbackEntries)),
    warnings: [
      `normalized top-level payload fields into query_params_json: ${fallbackEntries
        .map(([key]) => key)
        .join(', ')}`,
    ],
  };
}

export function normalizeProxyPayloadArgs(args) {
  return resolveProxyPayloadArgs(args).payload;
}
