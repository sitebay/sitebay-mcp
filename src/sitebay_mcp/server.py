"""
SiteBay MCP Server

Main server implementation that provides MCP tools for SiteBay WordPress hosting platform.
"""

import asyncio
import sys
from typing import Any, Optional

from fastmcp import FastMCP
from fastmcp.server import Context
from .auth import SiteBayAuth
from .client import SiteBayClient
from .exceptions import ConfigurationError, SiteBayError, ValidationError
from .tools import sites, operations
from . import resources


# Create the MCP server instance
mcp: FastMCP = FastMCP("SiteBay WordPress Hosting")


# Global client instance (will be initialized on startup)
sitebay_client: Optional[SiteBayClient] = None


async def initialize_client() -> SiteBayClient:
    """Initialize the SiteBay client with authentication"""
    global sitebay_client
    
    if sitebay_client is None:
        try:
            auth = SiteBayAuth()
            sitebay_client = SiteBayClient(auth)
            
            # Test the connection by trying to list regions (public endpoint)
            await sitebay_client.list_regions()
            
        except Exception as e:
            raise ConfigurationError(f"Failed to initialize SiteBay client: {str(e)}")
    
    return sitebay_client


# Site Management Tools
@mcp.tool
async def sitebay_list_sites(ctx: Context, team_id: Optional[str] = None) -> str:
    """
    List all WordPress sites for the authenticated user.
    
    Args:
        team_id: Optional team ID to filter sites by team
    
    Returns:
        Formatted string with site details including domain, status, region, and versions
    """
    try:
        await ctx.info("Fetching WordPress sites from SiteBay")
        if team_id:
            await ctx.info(f"Filtering by team ID: {team_id}")
        
        client = await initialize_client()
        result = await sites.sitebay_list_sites(client, team_id)
        
        await ctx.info("Successfully retrieved site list")
        return result
        
    except SiteBayError as e:
        await ctx.error(f"SiteBay API error: {str(e)}")
        return f"❌ SiteBay Error: {str(e)}"
    except ValueError as e:
        await ctx.error(f"Validation error listing sites: {str(e)}")
        return f"❌ Validation Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected error listing sites: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_get_site(ctx: Context, fqdn: str) -> str:
    """
    Get detailed information about a specific WordPress site.
    
    Args:
        fqdn: The fully qualified domain name of the site (e.g., "example.com")
    
    Returns:
        Detailed site information including status, versions, URLs, and configuration
    """
    try:
        await ctx.info(f"Fetching details for site: {fqdn}")
        
        client = await initialize_client()
        result = await sites.sitebay_get_site(client, fqdn)
        
        await ctx.info(f"Successfully retrieved details for {fqdn}")
        return result
        
    except SiteBayError as e:
        await ctx.error(f"SiteBay API error for {fqdn}: {str(e)}")
        return f"❌ SiteBay Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected error getting site {fqdn}: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_create_site(
    ctx: Context,
    fqdn: str,
    wp_title: str,
    wp_username: str,
    wp_password: str,
    wp_email: str,
    region_name: Optional[str] = None,
    template_id: Optional[str] = None,
    team_id: Optional[str] = None
) -> str:
    """
    Create a new WordPress site.
    
    Args:
        fqdn: The fully qualified domain name for the new site (e.g., "myblog.example.com")
        wp_title: WordPress site title
        wp_username: WordPress admin username
        wp_password: WordPress admin password (should be strong)
        wp_email: WordPress admin email address
        region_name: Optional region name for hosting (uses default if not specified)
        template_id: Optional template ID to use for site creation
        team_id: Optional team ID to create site under
    
    Returns:
        Success message with new site details and access information
    """
    try:
        await ctx.info(f"Starting site creation for: {fqdn}")
        
        # Progress reporting
        
        client = await initialize_client()
        
        
        # Basic validation
        if not fqdn or '.' not in fqdn:
            raise ValueError("Invalid domain name provided")
        
        
        result = await sites.sitebay_create_site(
            client, fqdn, wp_title, wp_username, wp_password, wp_email,
            region_name, template_id, team_id
        )
        
        
        await ctx.info(f"Successfully created site: {fqdn}")
        return result
        
    except ValueError as e:
        await ctx.error(f"Validation error creating site {fqdn}: {str(e)}")
        return f"❌ Validation Error: {str(e)}"
    except ValidationError as e:
        await ctx.error(f"SiteBay validation error creating site {fqdn}: {str(e)}")
        
        # Provide detailed feedback for the agent with field-specific errors
        error_msg = f"❌ Validation Error - Please check your input:\n{str(e)}\n"
        
        if hasattr(e, 'field_errors') and e.field_errors:
            error_msg += "\nSpecific field errors:\n"
            for field, msg in e.field_errors.items():
                error_msg += f"  • {field}: {msg}\n"
        
        error_msg += "\nPlease adjust your parameters and try again."
        return error_msg
    except SiteBayError as e:
        await ctx.error(f"SiteBay API error creating site {fqdn}: {str(e)}")
        return f"❌ SiteBay Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected error creating site {fqdn}: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_update_site(
    fqdn: str,
    wp_title: Optional[str] = None,
    wp_username: Optional[str] = None,
    wp_password: Optional[str] = None,
    wp_email: Optional[str] = None,
    php_version: Optional[str] = None
) -> str:
    """
    Update an existing WordPress site configuration.
    
    Args:
        fqdn: The fully qualified domain name of the site to update
        wp_title: New WordPress site title
        wp_username: New WordPress admin username
        wp_password: New WordPress admin password
        wp_email: New WordPress admin email
        php_version: New PHP version (e.g., "8.1", "8.2", "8.3")
    
    Returns:
        Confirmation message with updated settings
    """
    client = await initialize_client()
    return await sites.sitebay_update_site(
        client, fqdn, wp_title, wp_username, wp_password, wp_email, php_version
    )


@mcp.tool
async def sitebay_delete_site(fqdn: str, confirm: bool = False) -> str:
    """
    Delete a WordPress site permanently. This action cannot be undone.
    
    Args:
        fqdn: The fully qualified domain name of the site to delete
        confirm: Must be True to actually delete the site (safety check)
    
    Returns:
        Confirmation message or deletion requirements if confirm=False
    """
    client = await initialize_client()
    return await sites.sitebay_delete_site(client, fqdn, confirm)


# Site Operations Tools
@mcp.tool
async def sitebay_site_shell_command(fqdn: str, command: str) -> str:
    """
    Execute a shell command on a WordPress site. Supports WP-CLI commands, system commands, etc.
    
    Args:
        fqdn: The fully qualified domain name of the site
        command: The shell command to execute (e.g., "wp plugin list", "ls -la", "wp search-replace")
    
    Returns:
        Command output and execution details
    """
    client = await initialize_client()
    return await operations.sitebay_site_shell_command(client, fqdn, command)


@mcp.tool
async def sitebay_site_edit_file(fqdn: str, file_path: str, content: str) -> str:
    """
    Edit a file in the site's wp-content directory.
    
    Args:
        fqdn: The fully qualified domain name of the site
        file_path: Path to the file relative to wp-content (e.g., "themes/mytheme/style.css")
        content: New content for the file
    
    Returns:
        Success confirmation with file details
    """
    client = await initialize_client()
    return await operations.sitebay_site_edit_file(client, fqdn, file_path, content)


@mcp.tool
async def sitebay_site_get_events(
    fqdn: str,
    after_datetime: Optional[str] = None,
    limit: int = 20
) -> str:
    """
    Get recent events for a site (deployments, updates, restores, etc.).
    
    Args:
        fqdn: The fully qualified domain name of the site
        after_datetime: Optional ISO datetime to filter events after (e.g., "2024-01-01T00:00:00Z")
        limit: Maximum number of events to return (default: 20)
    
    Returns:
        Formatted list of recent site events with timestamps and details
    """
    client = await initialize_client()
    return await operations.sitebay_site_get_events(client, fqdn, after_datetime, limit)


@mcp.tool
async def sitebay_site_external_path_list(fqdn: str) -> str:
    """
    List external path configurations for a site (URL proxying/routing).
    
    Args:
        fqdn: The fully qualified domain name of the site
    
    Returns:
        List of configured external paths with their target URLs and status
    """
    client = await initialize_client()
    return await operations.sitebay_site_external_path_list(client, fqdn)


@mcp.tool
async def sitebay_site_external_path_create(
    fqdn: str,
    path: str,
    target_url: str,
    description: Optional[str] = None
) -> str:
    """
    Create an external path configuration to proxy requests to external URLs.
    
    Args:
        fqdn: The fully qualified domain name of the site
        path: The path on your site (e.g., "/api", "/external")
        target_url: The external URL to proxy requests to
        description: Optional description for this path configuration
    
    Returns:
        Success message with external path details
    """
    client = await initialize_client()
    return await operations.sitebay_site_external_path_create(
        client, fqdn, path, target_url, description
    )


# Helper Tools
@mcp.tool
async def sitebay_list_regions() -> str:
    """
    List all available hosting regions for site deployment.
    
    Returns:
        List of available regions with their details
    """
    try:
        client = await initialize_client()
        regions = await client.list_regions()
        
        if not regions:
            return "No regions available."
        
        result = f"**Available Hosting Regions** ({len(regions)} regions):\n\n"
        
        for region in regions:
            result += f"• **{region.get('name', 'Unknown')}**\n"
            result += f"  - Location: {region.get('location', 'Unknown')}\n"
            result += f"  - Status: {region.get('status', 'Unknown')}\n"
            
            if region.get('description'):
                result += f"  - Description: {region.get('description')}\n"
            
            result += "\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error listing regions: {str(e)}"


@mcp.tool
async def sitebay_list_templates() -> str:
    """
    List all available site templates for quick site creation.
    
    Returns:
        List of available templates with descriptions
    """
    try:
        client = await initialize_client()
        templates = await client.list_templates()
        
        if not templates:
            return "No templates available."
        
        result = f"**Available Site Templates** ({len(templates)} templates):\n\n"
        
        for template in templates:
            result += f"• **{template.get('name', 'Unknown')}**\n"
            result += f"  - ID: {template.get('id', 'Unknown')}\n"
            
            if template.get('description'):
                result += f"  - Description: {template.get('description')}\n"
            
            if template.get('category'):
                result += f"  - Category: {template.get('category')}\n"
            
            result += "\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error listing templates: {str(e)}"


@mcp.tool
async def sitebay_list_teams(ctx: Context) -> str:
    """
    List all teams for the authenticated user.
    
    Returns:
        Formatted list of teams with their details and member information
    """
    try:
        await ctx.info("Fetching teams from SiteBay")
        
        client = await initialize_client()
        teams = await client.list_teams()
        
        if not teams:
            return "No teams found for your account."
        
        result = f"**Your Teams** ({len(teams)} teams):\n\n"
        
        for team in teams:
            result += f"• **{team.get('name', 'Unknown')}**\n"
            result += f"  - ID: {team.get('id', 'Unknown')}\n"
            result += f"  - Role: {team.get('role', 'Unknown')}\n"
            result += f"  - Created: {team.get('created_at', 'Unknown')}\n"
            
            if team.get('description'):
                result += f"  - Description: {team.get('description')}\n"
            
            result += "\n"
        
        await ctx.info("Successfully retrieved teams list")
        return result
        
    except SiteBayError as e:
        await ctx.error(f"SiteBay API error: {str(e)}")
        return f"❌ SiteBay Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected error listing teams: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


# Proxy Tools
@mcp.tool
async def sitebay_wordpress_proxy(
    ctx: Context,
    site_fqdn: str,
    endpoint: str,
    method: str = "GET",
    data: Optional[dict] = None
) -> str:
    """
    Proxy requests to a WordPress site's REST API.
    
    Args:
        site_fqdn: The site domain
        endpoint: WordPress API endpoint (e.g., "/wp/v2/posts")
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Optional data for POST/PUT requests
    
    Returns:
        WordPress API response
    """
    try:
        await ctx.info(f"WordPress proxy request to {site_fqdn}{endpoint}")
        
        client = await initialize_client()
        proxy_data: dict[str, Any] = {
            "site_fqdn": site_fqdn,
            "endpoint": endpoint,
            "method": method
        }
        if data:
            proxy_data["data"] = data
            
        result = await client.wordpress_proxy(proxy_data)
        return f"✅ WordPress API Response:\n```json\n{result}\n```"
        
    except SiteBayError as e:
        await ctx.error(f"WordPress proxy error: {str(e)}")
        return f"❌ WordPress Proxy Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected proxy error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_shopify_proxy(
    ctx: Context,
    shop_domain: str,
    endpoint: str,
    access_token: str,
    method: str = "GET",
    data: Optional[dict] = None
) -> str:
    """
    Proxy requests to a Shopify Admin API.
    
    Args:
        shop_domain: Shopify shop domain (e.g., "myshop.myshopify.com")
        endpoint: Shopify API endpoint (e.g., "/admin/api/2023-10/products.json")
        access_token: Shopify access token
        method: HTTP method (GET, POST, PUT, DELETE)
        data: Optional data for POST/PUT requests
    
    Returns:
        Shopify API response
    """
    try:
        await ctx.info(f"Shopify proxy request to {shop_domain}{endpoint}")
        
        client = await initialize_client()
        proxy_data: dict[str, Any] = {
            "shop_domain": shop_domain,
            "endpoint": endpoint,
            "access_token": access_token,
            "method": method
        }
        if data:
            proxy_data["data"] = data
            
        result = await client.shopify_proxy(proxy_data)
        return f"✅ Shopify API Response:\n```json\n{result}\n```"
        
    except SiteBayError as e:
        await ctx.error(f"Shopify proxy error: {str(e)}")
        return f"❌ Shopify Proxy Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected proxy error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_posthog_proxy(
    ctx: Context,
    endpoint: str,
    data: dict,
    api_key: Optional[str] = None
) -> str:
    """
    Proxy POST requests to PostHog analytics API.
    
    Args:
        endpoint: PostHog API endpoint
        data: Data to send to PostHog
        api_key: Optional PostHog API key
    
    Returns:
        PostHog API response
    """
    try:
        await ctx.info(f"PostHog proxy request to {endpoint}")
        
        client = await initialize_client()
        proxy_data: dict[str, Any] = {
            "endpoint": endpoint,
            "data": data
        }
        if api_key:
            proxy_data["api_key"] = api_key
            
        result = await client.posthog_proxy(proxy_data)
        return f"✅ PostHog API Response:\n```json\n{result}\n```"
        
    except SiteBayError as e:
        await ctx.error(f"PostHog proxy error: {str(e)}")
        return f"❌ PostHog Proxy Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected proxy error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


# Staging Tools
@mcp.tool
async def sitebay_staging_create(
    ctx: Context,
    fqdn: str,
    staging_subdomain: Optional[str] = None
) -> str:
    """
    Create a staging site for testing changes.
    
    Args:
        fqdn: The live site domain
        staging_subdomain: Optional custom staging subdomain
    
    Returns:
        Staging site creation confirmation
    """
    try:
        await ctx.info(f"Creating staging site for {fqdn}")
        
        
        client = await initialize_client()
        staging_data = {}
        if staging_subdomain:
            staging_data["staging_subdomain"] = staging_subdomain
            
        result = await client.create_staging_site(fqdn, staging_data)
        
        
        await ctx.info(f"Successfully created staging site for {fqdn}")
        return f"✅ **Staging Site Created**\n\nStaging environment for {fqdn} is now available for testing changes safely."
        
    except SiteBayError as e:
        await ctx.error(f"Error creating staging site: {str(e)}")
        return f"❌ Staging Creation Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected staging error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_staging_delete(ctx: Context, fqdn: str) -> str:
    """
    Delete the staging site.
    
    Args:
        fqdn: The live site domain
    
    Returns:
        Staging deletion confirmation
    """
    try:
        await ctx.info(f"Deleting staging site for {fqdn}")
        
        client = await initialize_client()
        await client.delete_staging_site(fqdn)
        
        await ctx.info(f"Successfully deleted staging site for {fqdn}")
        return f"✅ **Staging Site Deleted**\n\nThe staging environment for {fqdn} has been removed."
        
    except SiteBayError as e:
        await ctx.error(f"Error deleting staging site: {str(e)}")
        return f"❌ Staging Deletion Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected staging error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_staging_commit(ctx: Context, fqdn: str) -> str:
    """
    Commit staging changes to live site (sync staging to live).
    
    Args:
        fqdn: The live site domain
    
    Returns:
        Staging commit confirmation
    """
    try:
        await ctx.info(f"Committing staging changes for {fqdn}")
        
        
        client = await initialize_client()
        result = await client.commit_staging_site(fqdn)
        
        
        await ctx.info(f"Successfully committed staging for {fqdn}")
        return f"✅ **Staging Committed to Live**\n\nChanges from staging have been synchronized to the live site {fqdn}."
        
    except SiteBayError as e:
        await ctx.error(f"Error committing staging: {str(e)}")
        return f"❌ Staging Commit Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected staging error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


# Backup/Restore Tools
@mcp.tool
async def sitebay_backup_list_commits(
    ctx: Context,
    fqdn: str,
    number_to_fetch: int = 10
) -> str:
    """
    List available backup commits for point-in-time restore.
    
    Args:
        fqdn: The site domain
        number_to_fetch: Number of backup entries to fetch (default: 10)
    
    Returns:
        List of available backup commits
    """
    try:
        await ctx.info(f"Fetching backup commits for {fqdn}")
        
        client = await initialize_client()
        commits = await client.get_backup_commits(fqdn, number_to_fetch)
        
        if not commits:
            return f"No backup commits found for {fqdn}."
        
        result = f"**Available Backup Commits for {fqdn}** ({len(commits)} entries):\n\n"
        
        for commit in commits:
            result += f"• **{commit.get('created_at', 'Unknown time')}**\n"
            result += f"  - ID: {commit.get('id', 'Unknown')}\n"
            result += f"  - Commit Hash: {commit.get('commit_hash', 'Unknown')}\n"
            result += f"  - Tables Saved: {len(commit.get('tables_saved', []))} tables\n"
            result += f"  - Status: {'Completed' if commit.get('finished_at') else 'In Progress'}\n"
            result += "\n"
        
        await ctx.info(f"Successfully retrieved backup commits for {fqdn}")
        return result
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching backup commits: {str(e)}")
        return f"❌ Backup Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected backup error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_backup_restore(
    ctx: Context,
    fqdn: str,
    commit_id: str,
    restore_type: str = "full"
) -> str:
    """
    Restore a site to a previous point in time.
    
    Args:
        fqdn: The site domain
        commit_id: The backup commit ID to restore from
        restore_type: Type of restore ("full", "database", "files")
    
    Returns:
        Restore operation confirmation
    """
    try:
        await ctx.info(f"Starting point-in-time restore for {fqdn}")
        
        
        client = await initialize_client()
        restore_data = {
            "commit_id": commit_id,
            "restore_type": restore_type
        }
        
        
        result = await client.create_restore(fqdn, restore_data)
        
        
        await ctx.info(f"Successfully initiated restore for {fqdn}")
        return f"✅ **Point-in-Time Restore Initiated**\n\nRestore operation for {fqdn} has been started. The site will be restored to the selected backup point."
        
    except SiteBayError as e:
        await ctx.error(f"Error starting restore: {str(e)}")
        return f"❌ Restore Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected restore error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


# Account Tools
@mcp.tool
async def sitebay_account_affiliates(ctx: Context) -> str:
    """
    Get affiliate referral information.
    
    Returns:
        List of users who signed up using your affiliate links
    """
    try:
        await ctx.info("Fetching affiliate referrals")
        
        client = await initialize_client()
        affiliates = await client.get_affiliate_referrals()
        
        if not affiliates:
            return "No affiliate referrals found."
        
        result = f"**Your Affiliate Referrals** ({len(affiliates)} referrals):\n\n"
        
        for affiliate in affiliates:
            result += f"• **User**: {affiliate.get('email', 'Unknown')}\n"
            result += f"  - Signed up: {affiliate.get('created_at', 'Unknown')}\n"
            result += f"  - Status: {affiliate.get('status', 'Unknown')}\n"
            result += "\n"
        
        await ctx.info("Successfully retrieved affiliate referrals")
        return result
        
    except SiteBayError as e:
        await ctx.error(f"Error fetching affiliates: {str(e)}")
        return f"❌ Affiliate Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected affiliate error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


@mcp.tool
async def sitebay_account_create_checkout(
    ctx: Context,
    plan_name: str = "starter",
    interval: str = "month",
    team_id: Optional[str] = None
) -> str:
    """
    Create a Stripe checkout session for team billing.
    
    Args:
        plan_name: Plan type ("starter", "pro", "enterprise")
        interval: Billing interval ("month", "year")
        team_id: Optional team ID to purchase for
    
    Returns:
        Stripe checkout URL
    """
    try:
        await ctx.info(f"Creating checkout session for {plan_name} plan")
        
        client = await initialize_client()
        checkout_data = {
            "plan_name": plan_name,
            "interval": interval
        }
        if team_id:
            checkout_data["for_team_id"] = team_id
            
        result = await client.create_checkout_session(checkout_data)
        
        await ctx.info("Successfully created checkout session")
        return f"✅ **Checkout Session Created**\n\nPlan: {plan_name} ({interval}ly)\nCheckout URL: {result.get('url', 'URL not provided')}"
        
    except SiteBayError as e:
        await ctx.error(f"Error creating checkout: {str(e)}")
        return f"❌ Checkout Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected checkout error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


# Resources
@mcp.resource("sitebay://site/{site_fqdn}/config")
async def site_config_resource(ctx: Context, site_fqdn: str) -> str:
    """
    Get site configuration as a readable resource.
    
    Args:
        site_fqdn: The fully qualified domain name of the site
    
    Returns:
        JSON formatted site configuration including technical specs, URLs, and features
    """
    return await resources.get_site_config_resource(ctx, site_fqdn)


@mcp.resource("sitebay://site/{site_fqdn}/events")
async def site_events_resource(ctx: Context, site_fqdn: str, limit: int = 50) -> str:
    """
    Get site events and logs as a readable resource.
    
    Args:
        site_fqdn: The fully qualified domain name of the site
        limit: Maximum number of events to return (default: 50)
    
    Returns:
        JSON formatted site events and deployment logs
    """
    return await resources.get_site_events_resource(ctx, site_fqdn, limit)


@mcp.resource("sitebay://account/summary")
async def account_summary_resource(ctx: Context) -> str:
    """
    Get account summary as a readable resource.
    
    Returns:
        JSON formatted account overview including site counts, regions, and recent activity
    """
    return await resources.get_account_summary_resource(ctx)


async def cleanup():
    """Cleanup function to close the client connection"""
    global sitebay_client
    if sitebay_client:
        await sitebay_client.close()


def main():
    """Main entry point for the MCP server"""
    try:
        # Set up cleanup
        import atexit
        atexit.register(lambda: asyncio.run(cleanup()))
        
        # Run the FastMCP server
        mcp.run()
        
    except KeyboardInterrupt:
        print("\nShutting down SiteBay MCP Server...")
        asyncio.run(cleanup())
        sys.exit(0)
    except Exception as e:
        print(f"Error starting SiteBay MCP Server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()