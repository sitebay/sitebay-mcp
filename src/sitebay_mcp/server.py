"""
SiteBay MCP Server

Main server implementation that provides MCP tools for SiteBay WordPress hosting platform.
"""

import asyncio
import os
import sys
import argparse
from typing import Any, Optional
from pydantic import UUID4

import fastmcp
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
            # Avoid upfront network calls during initialization so startup stays fast.
            
        except Exception as e:
            raise ConfigurationError(f"Failed to initialize SiteBay client: {str(e)}")
    
    return sitebay_client


# Site Management Tools
@mcp.tool
async def sitebay_list_sites(ctx: Context, team_id: Optional[UUID4] = None) -> str:
    """
    List all WordPress sites for the authenticated user.
    
    Args:
        team_id: Optional team ID (UUID4) to filter sites by team
    
    Returns:
        Formatted string with site details including domain, status, region, and versions
    """
    try:
        await ctx.info("Fetching WordPress sites from SiteBay")
        if team_id:
            await ctx.info(f"Filtering by team ID: {team_id}")
        
        client = await initialize_client()
        team_id_str = str(team_id) if team_id is not None else None
        result = await sites.sitebay_list_sites(client, team_id_str)
        
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
        fqdn: The fully qualified domain name of the site (e.g., "www.example.com")
    
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
    team_id: str,
    fqdn: str,
    wordpress_blog_name: str,
    wordpress_first_name: str,
    wordpress_last_name: str,
    wordpress_email: str,
    wordpress_username: str,
    wordpress_password: str,
    git_url: Optional[str] = None,
    ready_made_site_name: Optional[str] = None,
    is_free: Optional[bool] = None,
) -> str:
    """
    Create a new WordPress site (SiteLiveCreate schema).
    
    Args:
        team_id: Team UUID that owns the site
        fqdn: The fully qualified domain name for the new site (e.g., "www.example.org")
        wordpress_blog_name: Blog/site title
        wordpress_first_name: Admin first name
        wordpress_last_name: Admin last name
        wordpress_email: Admin email address
        wordpress_username: Admin username
        wordpress_password: Admin password (strong)
        git_url: Optional Git repository URL
        ready_made_site_name: Optional ready-made site name
        is_free: Optional flag for free plan
    
    Returns:
        Success message with new site details and access information
    """
    try:
        await ctx.info(f"Starting site creation for: {fqdn}")
        
        client = await initialize_client()
        
        # Basic validation
        if not fqdn or '.' not in fqdn:
            raise ValueError("Invalid domain name provided")
        if not team_id:
            raise ValueError("team_id is required")
        
        result = await sites.sitebay_create_site(
            client,
            team_id,
            fqdn,
            wordpress_blog_name,
            wordpress_first_name,
            wordpress_last_name,
            wordpress_email,
            wordpress_username,
            wordpress_password,
            git_url,
            ready_made_site_name,
            is_free,
        )
        
        await ctx.info(f"Successfully created site: {fqdn}")
        return result
        
    except ValueError as e:
        await ctx.error(f"Validation error creating site {fqdn}: {str(e)}")
        return f"❌ Validation Error: {str(e)}"
    except ValidationError as e:
        await ctx.error(f"SiteBay validation error creating site {fqdn}: {str(e)}")
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
    cf_dev_mode_enabled: Optional[bool] = None,
    new_fqdn: Optional[str] = None,
    git_url: Optional[str] = None,
    http_auth_enabled: Optional[bool] = None,
    team_id: Optional[str] = None,
    is_free: Optional[bool] = None,
) -> str:
    """
    Update an existing SiteBay site configuration.
    
    Args:
        fqdn: Site domain to update
        cf_dev_mode_enabled: Enable/disable Cloudflare dev mode
        new_fqdn: Change the site domain
        git_url: Set repository URL for deployments
        http_auth_enabled: Enable/disable HTTP basic auth
        team_id: Move site to a different team
        is_free: Toggle free plan flag
    
    Returns:
        Confirmation message with updated settings
    """
    client = await initialize_client()
    return await sites.sitebay_update_site(
        client,
        fqdn,
        cf_dev_mode_enabled=cf_dev_mode_enabled,
        new_fqdn=new_fqdn,
        git_url=git_url,
        http_auth_enabled=http_auth_enabled,
        team_id=team_id,
        is_free=is_free,
    )


@mcp.tool
async def sitebay_delete_site(fqdn: str) -> str:
    """
    Delete a WordPress site permanently. This action cannot be undone.
    
    Args:
        fqdn: The fully qualified domain name of the site to delete
    
    Returns:
        Confirmation message
    """
    client = await initialize_client()
    return await sites.sitebay_delete_site(client, fqdn)


# Site Operations Tools
@mcp.tool
async def sitebay_site_shell_command(
    fqdn: str,
    command: str,
    cwd: Optional[str] = None,
    auto_track_dir: Optional[bool] = None,
) -> str:
    """
    Execute a shell command on a WordPress site. Supports WP-CLI commands, system commands, etc.
    
    Args:
        fqdn: The fully qualified domain name of the site
        command: The shell command to execute (e.g., "wp plugin list", "ls -la", "wp search-replace")
    
    Returns:
        Command output and execution details
    """
    client = await initialize_client()
    return await operations.sitebay_site_shell_command(
        client, fqdn, command, cwd=cwd, auto_track_dir=auto_track_dir
    )


@mcp.tool
async def sitebay_site_edit_file(
    fqdn: str,
    file_path: str,
    file_edit_using_search_replace_blocks: str,
) -> str:
    """
    Edit a file in the site's wp-content directory.
    
    Args:
        fqdn: The fully qualified domain name of the site
        file_path: Path to the file in wp-content (e.g., "wp-content/themes/mytheme/style.css")
        content: New content for the file
    
    Returns:
        Success confirmation with file details
    """
    client = await initialize_client()
    return await operations.sitebay_site_edit_file(
        client, fqdn, file_path, file_edit_using_search_replace_blocks
    )


# Site events tool removed (not present in schema)


# External path tools removed (no longer supported)


# Helper Tools


@mcp.tool
async def sitebay_list_ready_made_sites() -> str:
    """
    List available ready-made sites for quick launches.
    
    Returns:
        List of ready-made sites with descriptions
    """
    try:
        client = await initialize_client()
        items = await client.list_ready_made_sites()
        
        if not items:
            return "No ready-made sites available."
        
        result = f"**Available Ready-made Sites** ({len(items)}):\n\n"
        
        for item in items:
            result += f"• **{item.get('name', 'Unknown')}**\n"
            result += f"  - ID: {item.get('id', 'Unknown')}\n"
            
            if item.get('description'):
                result += f"  - Description: {item.get('description')}\n"
            
            if item.get('category'):
                result += f"  - Category: {item.get('category')}\n"
            
            result += "\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error listing ready-made sites: {str(e)}"


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
            result += f"  - Plan: {team.get('plan_type_name', 'Unknown')}\n"
            result += f"  - Active: {team.get('is_active', 'Unknown')}\n"
            result += f"  - Default: {team.get('is_default', 'Unknown')}\n"
            result += f"  - Created: {team.get('created_at', 'Unknown')}\n\n"
        
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
    fqdn: str,
    path: str = "/wp-json/wp/v2/",
    query_params_json: str = "",
    method: str = "get",
) -> str:
    """
    Proxy requests to a WordPress site's REST API.
    
    Args:
        fqdn: The site domain
        path: WordPress API path (e.g., "/wp-json/wp/v2/posts")
        query_params_json: Optional JSON string for payload or query params
        method: HTTP method (get, post, put, delete)
    
    Returns:
        WordPress API response
    """
    try:
        await ctx.info(f"WordPress proxy request to {fqdn}{path or ''}")
        
        client = await initialize_client()
        proxy_data: dict[str, Any] = {"fqdn": fqdn, "method": method, "path": path}
        if query_params_json:
            proxy_data["query_params_json"] = query_params_json
            
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
    shop_name: str,
    path: str = "/admin/api/2024-04",
    query_params_json: str = "",
    method: str = "get",
) -> str:
    """
    Proxy requests to a Shopify Admin API.
    
    Args:
        shop_name: Shopify shop name
        path: Shopify API path (e.g., "/admin/api/2024-04/products.json")
        query_params_json: Optional JSON string for payload or query params
        method: HTTP method (get, post, put, delete)
    
    Returns:
        Shopify API response
    """
    try:
        await ctx.info(f"Shopify proxy request to {shop_name}{path or ''}")
        
        client = await initialize_client()
        proxy_data: dict[str, Any] = {"shop_name": shop_name, "method": method, "path": path}
        if query_params_json:
            proxy_data["query_params_json"] = query_params_json
            
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
    path: str,
    query_params_json: str = "",
    method: str = "get",
) -> str:
    """
    Proxy POST requests to PostHog analytics API.
    
    Args:
        path: PostHog API path
        query_params_json: Optional JSON string for payload or query params
        method: HTTP method (get, post, put, delete)
    
    Returns:
        PostHog API response
    """
    try:
        await ctx.info(f"PostHog proxy request to {path}")
        
        client = await initialize_client()
        proxy_data: dict[str, Any] = {"path": path, "method": method}
        if query_params_json:
            proxy_data["query_params_json"] = query_params_json
            
        result = await client.posthog_proxy(proxy_data)
        return f"✅ PostHog API Response:\n```json\n{result}\n```"
        
    except SiteBayError as e:
        await ctx.error(f"PostHog proxy error: {str(e)}")
        return f"❌ PostHog Proxy Error: {str(e)}"
    except Exception as e:
        await ctx.error(f"Unexpected proxy error: {str(e)}")
        return f"❌ Unexpected error: {str(e)}"


# Staging tools removed (no longer supported)


# Backup/Restore Tools
@mcp.tool
async def sitebay_backup_list_commits(
    ctx: Context,
    fqdn: str,
    number_to_fetch: int = 1
) -> str:
    """
    List available backup commits for point-in-time restore.
    
    Args:
        fqdn: The site domain
        number_to_fetch: Number of backup entries to fetch (default: 1)
    
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
    restore_point: Optional[str] = None,
    for_stage_site: Optional[bool] = None,
    restore_db: Optional[bool] = None,
    restore_wp_content: Optional[bool] = None,
    delete_extra_files: Optional[bool] = None,
    dolt_restore_hash: Optional[str] = None,
    is_dry_run: Optional[bool] = None,
) -> str:
    """
    Restore a site to a previous point in time.
    
    Args (PITRestoreCreate schema):
        fqdn: The site domain
        restore_point: ISO datetime string (or omit for latest)
        for_stage_site: Whether to restore the stage site
        restore_db: Restore database (default true)
        restore_wp_content: Restore wp-content (default true)
        delete_extra_files: Delete extra files from target (default false)
        dolt_restore_hash: Optional Dolt hash to restore DB
        is_dry_run: Simulate restore without applying changes
    
    Returns:
        Restore operation confirmation
    """
    try:
        await ctx.info(f"Starting point-in-time restore for {fqdn}")
        client = await initialize_client()

        restore_data: dict[str, Any] = {}
        if restore_point is not None:
            restore_data["restore_point"] = restore_point
        if for_stage_site is not None:
            restore_data["for_stage_site"] = for_stage_site
        if restore_db is not None:
            restore_data["restore_db"] = restore_db
        if restore_wp_content is not None:
            restore_data["restore_wp_content"] = restore_wp_content
        if delete_extra_files is not None:
            restore_data["delete_extra_files"] = delete_extra_files
        if dolt_restore_hash is not None:
            restore_data["dolt_restore_hash"] = dolt_restore_hash
        if is_dry_run is not None:
            restore_data["is_dry_run"] = is_dry_run

        result = await client.create_restore(fqdn, restore_data)

        await ctx.info(f"Successfully initiated restore for {fqdn}")
        return (
            "✅ **Point-in-Time Restore Initiated**\n\n"
            f"Restore operation for {fqdn} has been started."
        )
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
            result += f"• **Email**: {affiliate.get('email', 'Unknown')}\n"
            result += f"  - Name: {affiliate.get('full_name', 'Unknown')}\n"
            result += f"  - Signed up: {affiliate.get('created_at', 'Unknown')}\n"
            result += f"  - Active: {affiliate.get('is_active', 'Unknown')}\n\n"
        
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
        plan_name: Plan type ("starter", "business", "micro")
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


# Site events resource removed (not present in schema)


@mcp.resource("sitebay://account/summary")
async def account_summary_resource(ctx: Context) -> str:
    """
    Get account summary as a readable resource.
    
    Returns:
        JSON formatted account overview including site counts, ready-made catalog size, and recent activity
    """
    return await resources.get_account_summary_resource(ctx)


async def cleanup():
    """Cleanup function to close the client connection"""
    global sitebay_client
    if sitebay_client:
        await sitebay_client.close()


def _run_stdio():
    """Run the MCP server over STDIO (default)."""
    mcp.run()


def _run_http(host: str, port: int):
    """Run the MCP server over HTTP (streamable)."""
    server_url = f"http://{host}:{port}{fastmcp.settings.streamable_http_path}"

    if hasattr(mcp, "run_http_async"):
        print(f"Starting SiteBay MCP HTTP server on {server_url}")
        asyncio.run(
            mcp.run_http_async(host=host, port=port, transport="streamable-http")
        )
    elif hasattr(mcp, "run_http"):
        print(f"Starting SiteBay MCP HTTP server on {server_url}")
        mcp.run_http(host=host, port=port)
    else:
        raise RuntimeError(
            "FastMCP does not support HTTP transport in this environment. "
            "Please upgrade fastmcp to >= 2.9."
        )


def main():
    """Main entry point for the MCP server.

    Supports both STDIO (default) and HTTP transport. Use one of:
      - stdio (default): `sitebay-mcp`
      - http:           `sitebay-mcp --http --port 7823 --host 0.0.0.0`

    Environment variables (used if flags not provided):
      - MCP_TRANSPORT=stdio|http
      - MCP_HTTP_HOST (default: 127.0.0.1)
      - MCP_HTTP_PORT or PORT (default: 7823)
    """
    parser = argparse.ArgumentParser(prog="sitebay-mcp", add_help=True)
    parser.add_argument(
        "--http",
        action="store_true",
        help="Run the MCP server using HTTP transport (streamable)",
    )
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        help="Transport mode (overrides --http)",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="HTTP host to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="HTTP port to bind (default: 7823)",
    )

    args = parser.parse_args()

    # Resolve transport
    env_transport = os.getenv("MCP_TRANSPORT")
    transport = (
        args.transport
        if args.transport
        else ("http" if args.http else (env_transport or "stdio"))
    )

    # Set up cleanup
    try:
        import atexit
        atexit.register(lambda: asyncio.run(cleanup()))
    except Exception:
        pass

    try:
        if transport == "http":
            host = args.host or os.getenv("MCP_HTTP_HOST") or "127.0.0.1"
            port = (
                args.port
                or int(os.getenv("MCP_HTTP_PORT") or os.getenv("PORT") or 7823)
            )
            _run_http(host, port)
        else:
            _run_stdio()

    except KeyboardInterrupt:
        print("\nShutting down SiteBay MCP Server...")
        asyncio.run(cleanup())
        sys.exit(0)
    except Exception as e:
        print(f"Error starting SiteBay MCP Server: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
