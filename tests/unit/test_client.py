import asyncio
import pytest
from sitebay_mcp.auth import SiteBayAuth
from sitebay_mcp.client import SiteBayClient


@pytest.fixture()
def client():
    auth = SiteBayAuth(api_token="x" * 30)
    c = SiteBayClient(auth)
    yield c
    asyncio.run(c.close())


def test_get_url(client):
    assert client._get_url("foo") == "/f/api/v1/foo"
    assert client._get_url("/bar") == "/f/api/v1/bar"


def test_format_validation_error(client):
    data = {"detail": [{"loc": ["body", "field"], "msg": "invalid"}]}
    msg = client._format_validation_error(data)
    assert "field" in msg


def test_extract_field_errors(client):
    data = {"detail": [{"loc": ["name"], "msg": "required"}]}
    assert client._extract_field_errors(data) == {"name": "required"}
