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
        
        # Format as readable configuration
        config = {
            "site_info": {
                "domain": site.get("fqdn"),
                "title": site.get("wp_title"),
                "status": site.get("status"),
                "region": site.get("region_name"),
                "created": site.get("created_at"),
                "updated": site.get("updated_at")
            },
            "technical_specs": {
                "php_version": site.get("php_version"),
                "mysql_version": site.get("mysql_version"),
                "wordpress_version": site.get("wp_version"),
                "git_enabled": site.get("git_enabled", False)
            },
            "urls": {
                "site_url": site.get("site_url"),
                "admin_url": site.get("admin_url")
            },
            "features": {
                "staging_available": bool(site.get("staging_site")),
                "git_integration": site.get("git_enabled", False),
                "backup_enabled": True  # SiteBay always has backups
            }
        }
        
        return json.dumps(config, indent=2)
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching config for {site_fqdn}: {str(e)}")
        return f"Error: {str(e)}"


async def get_site_events_resource(ctx: Context, site_fqdn: str, limit: int = 50) -> str:
    """
    Get site events/logs as a resource.
    
    Args:
        ctx: FastMCP context
        site_fqdn: Site domain name
        limit: Maximum number of events to fetch
    
    Returns:
        JSON formatted site events
    """
    try:
        await ctx.info(f"Fetching events resource for: {site_fqdn}")
        
        from .server import initialize_client
        client = await initialize_client()
        
        events = await client.get_site_events(site_fqdn)
        
        # Limit and format events
        limited_events = events[:limit]
        
        formatted_events = {
            "site": site_fqdn,
            "total_events": len(events),
            "showing": len(limited_events),
            "events": [
                {
                    "timestamp": event.get("created_at"),
                    "type": event.get("event_type"),
                    "status": event.get("status"),
                    "description": event.get("description"),
                    "metadata": event.get("metadata", {})
                }
                for event in limited_events
            ]
        }
        
        return json.dumps(formatted_events, indent=2)
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching events for {site_fqdn}: {str(e)}")
        return f"Error: {str(e)}"


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
        regions = await client.list_regions()
        templates = await client.list_templates()
        
        summary: dict[str, Any] = {
            "account_overview": {
                "total_sites": len(sites),
                "total_teams": len(teams),
                "available_regions": len(regions),
                "available_templates": len(templates)
            },
            "sites_by_status": {},
            "sites_by_region": {},
            "recent_sites": []
        }
        
        # Analyze sites
        for site in sites:
            status = site.get("status", "unknown")
            summary["sites_by_status"][status] = summary["sites_by_status"].get(status, 0) + 1
            
            region = site.get("region_name", "unknown")
            summary["sites_by_region"][region] = summary["sites_by_region"].get(region, 0) + 1
        
        # Get 5 most recent sites
        sorted_sites = sorted(sites, key=lambda x: x.get("created_at", ""), reverse=True)
        summary["recent_sites"] = [
            {
                "domain": site.get("fqdn"),
                "status": site.get("status"),
                "created": site.get("created_at"),
                "region": site.get("region_name")
            }
            for site in sorted_sites[:5]
        ]
        
        return json.dumps(summary, indent=2)
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching account summary: {str(e)}")
        return f"Error: {str(e)}"