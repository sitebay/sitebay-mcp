"""
SiteBay MCP Resources

Provides readable resources for site configurations, logs, and metrics.
"""

import json
from typing import Any, Dict, List
from fastmcp.server import Context
from .client import SiteBayClient
from .exceptions import SiteBayError


async def get_site_config_resource(ctx: Context, site_fqdn: str) -> str:
    """
    Get site configuration as a resource.
    
    Args:
        ctx: FastMCP context
        site_fqdn: Site domain name
    
    Returns:
        JSON formatted site configuration
    """
    try:
        await ctx.info(f"Fetching configuration resource for: {site_fqdn}")
        
        from .server import initialize_client
        client = await initialize_client()
        
        site = await client.get_site(site_fqdn)
        
        # Format as readable configuration (schema-aligned fields)
        config = {
            "site_info": {
                "domain": site.get("fqdn"),
                "active": site.get("active"),
                "team_id": site.get("team_id"),
                "created": site.get("created_at"),
            },
            "features": {
                "http_auth_enabled": site.get("http_auth_enabled", False),
                "is_free": site.get("is_free", False),
                "git_url": site.get("git_url"),
            }
        }
        
        return json.dumps(config, indent=2)
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching config for {site_fqdn}: {str(e)}")
        return f"Error: {str(e)}"


# Site events resource removed (not present in schema)


async def get_account_summary_resource(ctx: Context) -> str:
    """
    Get account summary as a resource.
    
    Args:
        ctx: FastMCP context
    
    Returns:
        JSON formatted account summary
    """
    try:
        await ctx.info("Fetching account summary resource")
        
        from .server import initialize_client
        client = await initialize_client()
        
        # Get sites and teams in parallel
        sites = await client.list_sites()
        teams = await client.list_teams()
        # Regions endpoint removed; ready-made sites replaces templates
        ready_made_sites = await client.list_ready_made_sites()
        
        summary: dict[str, Any] = {
            "account_overview": {
                "total_sites": len(sites),
                "total_teams": len(teams),
                "available_ready_made_sites": len(ready_made_sites),
                # Filled below
                "active_sites": 0,
                "inactive_sites": 0,
            },
            "recent_sites": []
        }
        
        # Analyze sites
        active_count = 0
        inactive_count = 0
        for site in sites:
            if bool(site.get("active", False)):
                active_count += 1
            else:
                inactive_count += 1
        summary["account_overview"]["active_sites"] = active_count
        summary["account_overview"]["inactive_sites"] = inactive_count
        
        # Get 5 most recent sites
        sorted_sites = sorted(sites, key=lambda x: x.get("created_at", ""), reverse=True)
        summary["recent_sites"] = [
            {
                "domain": site.get("fqdn"),
                "active": site.get("active"),
                "created": site.get("created_at"),
            }
            for site in sorted_sites[:5]
        ]
        
        return json.dumps(summary, indent=2)
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching account summary: {str(e)}")
        return f"Error: {str(e)}"
