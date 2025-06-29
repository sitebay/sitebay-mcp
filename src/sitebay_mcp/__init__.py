"""
SiteBay MCP Server

Provides Model Context Protocol (MCP) integration for SiteBay WordPress hosting platform.
Allows Claude Code users to manage WordPress sites, execute commands, handle staging,
backups, and more through natural language interactions.
"""

__version__ = "0.1.0"
__author__ = "SiteBay"
__email__ = "support@sitebay.org"

from .server import main

__all__ = ["main"]