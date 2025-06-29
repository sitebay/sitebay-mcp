import os
import pathlib
import sys
import types
import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[2] / "src"))

# Provide a minimal stub for the fastmcp package used in sitebay_mcp.__init__
fastmcp_stub = types.ModuleType("fastmcp")

class _FastMCP:
    def __init__(self, *args, **kwargs):
        pass

fastmcp_stub.FastMCP = _FastMCP
server_stub = types.ModuleType("fastmcp.server")
server_stub.Context = object
sys.modules.setdefault("fastmcp", fastmcp_stub)
sys.modules.setdefault("fastmcp.server", server_stub)

# Stub sitebay_mcp.server to avoid importing the real server during tests
server_module = types.ModuleType("sitebay_mcp.server")
server_module.main = lambda: None
sys.modules.setdefault("sitebay_mcp.server", server_module)

from sitebay_mcp.auth import SiteBayAuth
from sitebay_mcp.exceptions import ConfigurationError


def test_validate_token_length():
    auth = SiteBayAuth(api_token="x" * 25)
    assert auth.validate_token() is True


def test_validate_token_short():
    auth = SiteBayAuth(api_token="short")
    assert auth.validate_token() is False


def test_get_headers():
    token = "x" * 25
    auth = SiteBayAuth(api_token=token)
    headers = auth.get_headers()
    assert headers["Authorization"] == f"Bearer {token}"
    assert headers["Content-Type"] == "application/json"
    assert headers["Accept"] == "application/json"


def test_missing_token_raises(monkeypatch):
    monkeypatch.delenv("SITEBAY_API_TOKEN", raising=False)
    with pytest.raises(ConfigurationError):
        SiteBayAuth()
