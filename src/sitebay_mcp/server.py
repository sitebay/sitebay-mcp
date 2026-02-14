"""
SiteBay MCP Server

Auto-generated MCP tools from the SiteBay OpenAPI spec via FastMCPOpenAPI.
The bundled openapi_spec.json is the single source of truth.
"""

import asyncio
import json
import os
import sys
import argparse
from pathlib import Path

import httpx
import fastmcp
from fastmcp.server.openapi import FastMCPOpenAPI
from fastmcp.exceptions import ToolError
from fastmcp.server.middleware.middleware import Middleware
from fastmcp.tools.tool import ToolResult


def _load_spec() -> dict:
    spec_path = Path(__file__).parent / "openapi_spec.json"
    with open(spec_path) as f:
        spec = json.load(f)

    # FastMCP's OpenAPI parsing stack is currently stricter than FastAPI's
    # OpenAPI 3.1 output. In particular, schemas that model optional fields
    # via JSON Schema constructs like `anyOf: [{...}, {"type": "null"}]` can
    # be rejected by the OpenAPI parser.
    #
    # We normalize these to OpenAPI 3.0-style `nullable: true` so the spec can
    # be parsed reliably.
    def _is_null_schema(node: object) -> bool:
        if not isinstance(node, dict):
            return False
        if node.get("type") == "null":
            return True
        if "const" in node and node.get("const") is None:
            return True
        enum = node.get("enum")
        if isinstance(enum, list) and len(enum) == 1 and enum[0] is None:
            return True
        return False

    def _normalize_nullable(schema: object) -> object:
        if isinstance(schema, list):
            return [_normalize_nullable(x) for x in schema]
        if not isinstance(schema, dict):
            return schema

        # Recurse first
        for k, v in list(schema.items()):
            schema[k] = _normalize_nullable(v)

        # Handle JSON Schema union types like: {"type": ["string", "null"]}
        t = schema.get("type")
        if isinstance(t, list) and any(x == "null" for x in t):
            non_null = [x for x in t if x != "null"]
            schema["nullable"] = True
            if len(non_null) == 1:
                schema["type"] = non_null[0]
            else:
                schema["type"] = non_null

        # Handle anyOf/oneOf patterns like: anyOf: [{...}, {"type": "null"}]
        for key in ("anyOf", "oneOf"):
            variants = schema.get(key)
            if isinstance(variants, list) and any(_is_null_schema(x) for x in variants):
                kept = [x for x in variants if not _is_null_schema(x)]
                schema["nullable"] = True
                if len(kept) == 1:
                    # Replace union with the single remaining schema, but keep
                    # local annotations like title/description.
                    keep0 = kept[0]
                    for ann in ("title", "description", "default", "examples"):
                        if ann in schema and ann not in keep0:
                            keep0[ann] = schema[ann]
                    schema.pop(key, None)
                    schema.update(keep0)
                else:
                    schema[key] = kept

        return schema

    spec = _normalize_nullable(spec)
    if not isinstance(spec, dict):
        raise ValueError("OpenAPI spec must be a JSON object")

    # Treat as OpenAPI 3.0 after normalization.
    spec["openapi"] = "3.0.3"

    return spec


def _prefix_names(route, component):
    """Add 'sitebay_' prefix to every generated component name."""
    if not component.name.startswith("sitebay_"):
        component.name = f"sitebay_{component.name}"


# Rename map: operationId -> desired tool name (before prefix)
_MCP_NAMES = {
    "diff_edit": "edit_wp_file",
    "proxy_to_wp_site": "wp_proxy",
    "proxy_to_shopify_site": "shopify_proxy",
    "proxy_to_posthog": "posthog_proxy",
    "get_referred_users": "get_affiliates",
}

_token = os.getenv("SITEBAY_API_TOKEN", "")
_base_url = os.getenv("SITEBAY_API_URL", "https://my.sitebay.org")

mcp = FastMCPOpenAPI(
    openapi_spec=_load_spec(),
    client=httpx.AsyncClient(
        base_url=_base_url,
        headers={"Authorization": f"Bearer {_token}"},
        timeout=60.0,
    ),
    name="SiteBay WordPress Hosting",
    mcp_names=_MCP_NAMES,
    mcp_component_fn=_prefix_names,
    timeout=60.0,
)


class _SiteBayToolRobustnessMiddleware(Middleware):
    """Improve stability and readability for upstream OpenAPI errors.

    - Retries transient upstream failures (502/503/504 and request errors)
    - Normalizes noisy ToolError messages into a consistent format
    """

    def __init__(
        self,
        max_retries: int = 3,
        base_delay_seconds: float = 0.5,
    ) -> None:
        self._max_retries = max_retries
        self._base_delay_seconds = base_delay_seconds

    def _should_retry(self, message: str) -> bool:
        msg = message.lower()
        return (
            "http error 502" in msg
            or "http error 503" in msg
            or "http error 504" in msg
            or "request error:" in msg
            or "connecterror" in msg
            or "timed out" in msg
        )

    def _normalize_message(self, tool_name: str, message: str) -> str:
        # Common ToolManager wrapping format: "Error calling tool 'x': <details>"
        prefix = f"Error calling tool {tool_name!r}: "
        if message.startswith(prefix):
            message = message[len(prefix) :]
        return f"Upstream API error for {tool_name}: {message}"

    async def on_call_tool(self, context, call_next):
        tool_name = context.message.name
        last_error: ToolError | None = None
        for attempt in range(self._max_retries + 1):
            try:
                return await call_next(context)
            except ToolError as e:
                msg = str(e)
                # If upstream returned 404 and this tool is safe to soften,
                # return a neutral ToolResult instead of raising an error.
                if "http error 404" in msg.lower():
                    args = context.message.arguments or {}
                    try:
                        fallback = _SOFT_404_FALLBACKS.get(tool_name)
                        if fallback:
                            return fallback(args)
                    except Exception:
                        # Fall through to raising normalized error below
                        pass

                last_error = ToolError(self._normalize_message(tool_name, msg))
                if attempt >= self._max_retries or not self._should_retry(msg):
                    raise last_error
                delay = self._base_delay_seconds * (2**attempt)
                await asyncio.sleep(delay)
        assert last_error is not None
        raise last_error


# Soft-404 fallbacks: mapping tool name -> callable(args) -> ToolResult
# When an upstream 404 is considered benign for a particular tool, the
# middleware will call the fallback instead of raising a ToolError. Keep
# these fallbacks simple and return neutral, well-typed structured content
# that matches the tool's typical successful response shape (or `None` when
# the tool commonly returns `null`). Adjust as needed per-tool.


def _fallback_none(args: dict) -> ToolResult:
    """Return a neutral `None` structured result for tools that may
    legitimately have no resource (e.g. staging site absent)."""
    return ToolResult(structured_content=None)


def _fallback_empty_list(args: dict) -> ToolResult:
    """Return an empty list for tools that normally return a list of
    items but may legitimately have zero entries."""
    return ToolResult(structured_content=[])


_SOFT_404_FALLBACKS = {
    # Staging site may not exist for a site -> return null
    "sitebay_get_staging_site": _fallback_none,
    # PIT restores list may be empty -> return []
    "sitebay_get_pit_restores": _fallback_empty_list,
    # Single PIT restore lookup when absent -> null
    "sitebay_get_pit_restore": _fallback_none,
    # Treat get_site 404 as "not found" -> return null (keeps callers simple)
    "sitebay_get_site": _fallback_none,
}


mcp.add_middleware(_SiteBayToolRobustnessMiddleware())

# Work around a schema-resolution issue in the upstream MCP SDK's output
# validation when OpenAPI-derived output schemas contain nested refs.
#
# Symptoms: calling `sitebay_get_teams` returns
#   PointerToNowhere: '/$defs/UserLimited' ...
#
# Disabling output_schema for the affected tool keeps the tool usable and
# preserves structured JSON content in the result.
try:
    _t = mcp._tool_manager._tools.get("sitebay_get_teams")  # type: ignore[attr-defined]
    if _t is not None:
        _t.output_schema = None

    # create_site can return non-object JSON (e.g. `null`) on some error paths,
    # which triggers strict output validation in the MCP SDK. Keep the tool
    # tolerant to avoid runtime validation errors during normal runs.
    _t = mcp._tool_manager._tools.get("sitebay_create_site")  # type: ignore[attr-defined]
    if _t is not None:
        _t.output_schema = None

    _t = mcp._tool_manager._tools.get("sitebay_get_site")  # type: ignore[attr-defined]
    if _t is not None:
        _t.output_schema = None
except Exception:
    pass


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def _run_stdio():
    """Run the MCP server over STDIO (default)."""
    mcp.run()


def _run_http(host: str, port: int):
    """Run the MCP server over HTTP (streamable)."""
    server_url = f"http://{host}:{port}{fastmcp.settings.streamable_http_path}"

    if hasattr(mcp, "run_http_async"):
        print(f"Starting SiteBay MCP HTTP server on {server_url}")
        asyncio.run(
            mcp.run_http_async(host=host, port=port, transport="streamable-http")
        )
    elif hasattr(mcp, "run_http"):
        print(f"Starting SiteBay MCP HTTP server on {server_url}")
        mcp.run_http(host=host, port=port)
    else:
        raise RuntimeError(
            "FastMCP does not support HTTP transport in this environment. "
            "Please upgrade fastmcp to >= 2.9."
        )


def main():
    """Main entry point for the MCP server.

    Supports both STDIO (default) and HTTP transport:
      - stdio (default): sitebay-mcp
      - http:            sitebay-mcp --http --port 7823 --host 0.0.0.0

    Environment variables:
      SITEBAY_API_TOKEN  - Bearer token for the SiteBay API
      SITEBAY_API_URL    - Base URL (default https://my.sitebay.org)
      MCP_TRANSPORT      - stdio|http
      MCP_HTTP_HOST      - default 127.0.0.1
      MCP_HTTP_PORT/PORT - default 7823
    """
    parser = argparse.ArgumentParser(prog="sitebay-mcp", add_help=True)
    parser.add_argument(
        "--http",
        action="store_true",
        help="Run the MCP server using HTTP transport (streamable)",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        help="Transport mode (overrides --http)",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="HTTP host to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="HTTP port to bind (default: 7823)",
    )

    args = parser.parse_args()

    env_transport = os.getenv("MCP_TRANSPORT")
    transport = (
        args.transport
        if args.transport
        else ("http" if args.http else (env_transport or "stdio"))
    )

    try:
        if transport == "http":
            host = args.host or os.getenv("MCP_HTTP_HOST") or "127.0.0.1"
            # Only use MCP-specific env vars for port selection.
            #
            # NOTE: Many platforms set a generic `PORT` env var which can
            # unexpectedly override CLI flags if used here. We intentionally do
            # not read `PORT`.
            port = args.port or int(os.getenv("MCP_HTTP_PORT") or 7823)
            _run_http(host, port)
        else:
            _run_stdio()

    except KeyboardInterrupt:
        print("\nShutting down SiteBay MCP Server...")
        sys.exit(0)
    except Exception as e:
        print(f"Error starting SiteBay MCP Server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
