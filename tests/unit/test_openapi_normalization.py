import pathlib
import sys
import types


def _walk(node):
    stack = [node]
    while stack:
        cur = stack.pop()
        yield cur
        if isinstance(cur, dict):
            stack.extend(cur.values())
        elif isinstance(cur, list):
            stack.extend(cur)


def test_openapi_spec_is_normalized():
    """Ensure our bundled OpenAPI spec is parseable by FastMCP.

    The upstream SiteBay spec uses OpenAPI 3.1 nullable constructs (e.g. type:
    null and anyOf with {"type": "null"}). FastMCP's OpenAPI parser is stricter,
    so sitebay_mcp.server._load_spec() normalizes these away.
    """

    sys.path.append(str(pathlib.Path(__file__).resolve().parents[2] / "src"))

    # Stub out httpx/fastmcp so importing server doesn't spin up a real client.
    httpx_stub = types.ModuleType("httpx")

    class _AsyncClient:
        def __init__(self, *args, **kwargs):
            pass

    httpx_stub.AsyncClient = _AsyncClient
    sys.modules.setdefault("httpx", httpx_stub)

    fastmcp_stub = types.ModuleType("fastmcp")
    fastmcp_stub.settings = types.SimpleNamespace(streamable_http_path="/mcp")
    sys.modules.setdefault("fastmcp", fastmcp_stub)

    openapi_stub = types.ModuleType("fastmcp.server.openapi")

    class _FastMCPOpenAPI:
        def __init__(self, *args, **kwargs):
            pass

    openapi_stub.FastMCPOpenAPI = _FastMCPOpenAPI
    sys.modules.setdefault("fastmcp.server.openapi", openapi_stub)

    from sitebay_mcp.server import _load_spec

    spec = _load_spec()
    assert spec["openapi"] == "3.0.3"

    # No raw JSON Schema null types should remain.
    for node in _walk(spec):
        if isinstance(node, dict):
            assert node.get("type") != "null"
            for k in ("anyOf", "oneOf"):
                v = node.get(k)
                if isinstance(v, list):
                    assert not any(
                        isinstance(x, dict) and x.get("type") == "null" for x in v
                    )
