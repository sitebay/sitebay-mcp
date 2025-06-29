import pathlib
import sys
import types
import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[2] / "src"))

# Stub out fastmcp to satisfy sitebay_mcp package imports
fastmcp_stub = types.ModuleType("fastmcp")

class _FastMCP:
    def __init__(self, *args, **kwargs):
        pass

fastmcp_stub.FastMCP = _FastMCP
server_stub = types.ModuleType("fastmcp.server")
server_stub.Context = object
sys.modules.setdefault("fastmcp", fastmcp_stub)
sys.modules.setdefault("fastmcp.server", server_stub)

# Stub sitebay_mcp.server module
server_module = types.ModuleType("sitebay_mcp.server")
server_module.main = lambda: None
sys.modules.setdefault("sitebay_mcp.server", server_module)

from sitebay_mcp.client import SiteBayClient, SiteBayAuth


def test_get_url_slash():
    auth = SiteBayAuth(api_token="x" * 25)
    client = SiteBayClient(auth)
    assert client._get_url("/test") == "/f/api/v1/test"


def test_get_url_no_slash():
    auth = SiteBayAuth(api_token="x" * 25)
    client = SiteBayClient(auth)
    assert client._get_url("test") == "/f/api/v1/test"


def test_format_validation_error_basic():
    auth = SiteBayAuth(api_token="x" * 25)
    client = SiteBayClient(auth)
    data = {"detail": [{"loc": ["field"], "msg": "required"}]}
    msg = client._format_validation_error(data)
    assert "field" in msg
    assert "required" in msg


def test_extract_field_errors():
    auth = SiteBayAuth(api_token="x" * 25)
    client = SiteBayClient(auth)
    data = {"detail": [{"loc": ["field"], "msg": "required"}]}
    errors = client._extract_field_errors(data)
    assert errors == {"field": "required"}
