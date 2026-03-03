import pathlib
import sys
import types
from unittest.mock import MagicMock

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

    # Add src to sys.path
    src_path = str(pathlib.Path(__file__).resolve().parents[2] / "src")
    if src_path not in sys.path:
        sys.path.append(src_path)

    # Instead of stubbing the whole world, we just need to make sure 
    # the server can be imported and _load_spec called.
    # We use a context manager or just clean up sys.modules to avoid side effects.
    
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
