import os
import pytest
from sitebay_mcp.auth import SiteBayAuth


def test_validate_token_true():
    auth = SiteBayAuth(api_token="x" * 25)
    assert auth.validate_token() is True


def test_validate_token_false():
    auth = SiteBayAuth(api_token="short")
    assert auth.validate_token() is False


def test_get_headers_contains_token():
    token = "y" * 30
    auth = SiteBayAuth(api_token=token)
    headers = auth.get_headers()
    assert headers["Authorization"] == f"Bearer {token}"
