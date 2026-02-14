#!/usr/bin/env bash
set -euo pipefail
curl -sf http://mydev.dev.sitebay.org/f/api/v1/gpt.json \
  | python3 -m json.tool \
  > src/sitebay_mcp/openapi_spec.json
echo "OpenAPI spec updated."
