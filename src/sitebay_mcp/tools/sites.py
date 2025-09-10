"""
Site management tools for SiteBay MCP Server
"""

from typing import Optional, Dict, Any, List
from sitebay_mcp.client import SiteBayClient
from sitebay_mcp.exceptions import SiteBayError


async def sitebay_list_sites(
    client: SiteBayClient,
    team_id: Optional[str] = None
) -> str:
    """
    List all WordPress sites for the authenticated user.
    
    Args:
        team_id: Optional team ID to filter sites by team
    
    Returns:
        Formatted string with site details
    """
    try:
        # Normalize team_id to string (UUID4 expected by API)
        if team_id is not None:
            team_id = str(team_id)

        sites = await client.list_sites(team_id=team_id)

        if isinstance(sites, str):
            return f"Error listing sites: {sites}"

        if not isinstance(sites, list) or not all(isinstance(s, dict) for s in sites):
            return f"Unexpected response format when listing sites: {sites}"
        
        if not sites:
            return "No sites found for your account."
        
        result = f"Found {len(sites)} site(s):\n\n"
        
        for site in sites:
            result += f"• **{site.get('fqdn', 'Unknown')}**\n"
            result += f"  - Active: {site.get('active', 'Unknown')}\n"
            result += f"  - HTTP Auth Enabled: {site.get('http_auth_enabled', 'Unknown')}\n"
            result += f"  - Is Free: {site.get('is_free', 'Unknown')}\n"
            result += f"  - Created: {site.get('created_at', 'Unknown')}\n"
            result += "\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error listing sites: {str(e)}"
    except ValueError as e:
        return f"Error listing sites: {str(e)}"


async def sitebay_get_site(
    client: SiteBayClient,
    fqdn: str
) -> str:
    """
    Get detailed information about a specific WordPress site.
    
    Args:
        fqdn: The fully qualified domain name of the site
    
    Returns:
        Formatted string with detailed site information
    """
    try:
        site = await client.get_site(fqdn)
        
        result = f"**Site Details for {fqdn}**\n\n"
        result += f"• **Active**: {site.get('active', 'Unknown')}\n"
        result += f"• **HTTP Auth Enabled**: {site.get('http_auth_enabled', 'Unknown')}\n"
        result += f"• **Is Free**: {site.get('is_free', 'Unknown')}\n"
        result += f"• **Git URL**: {site.get('git_url', '—')}\n"
        result += f"• **Created**: {site.get('created_at', 'Unknown')}\n"
        result += f"• **Updated**: {site.get('updated_at', 'Unknown')}\n"
        

        
        if site.get('git_enabled'):
            result += f"• **Git Integration**: Enabled\n"
            if site.get('git_repo'):
                result += f"• **Git Repository**: {site.get('git_repo')}\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error getting site details: {str(e)}"


async def sitebay_create_site(
    client: SiteBayClient,
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
        team_id: Team UUID
        fqdn: New site domain
        wordpress_blog_name: Blog/site title
        wordpress_first_name: Admin first name
        wordpress_last_name: Admin last name
        wordpress_email: Admin email
        wordpress_username: Admin username
        wordpress_password: Admin password
        git_url: Optional repository URL
        ready_made_site_name: Optional ready-made site name
        is_free: Optional free plan flag
    
    Returns:
        Formatted string with new site details
    """
    try:
        site_data: Dict[str, Any] = {
            "team_id": team_id,
            "fqdn": fqdn,
            "wordpress_blog_name": wordpress_blog_name,
            "wordpress_first_name": wordpress_first_name,
            "wordpress_last_name": wordpress_last_name,
            "wordpress_email": wordpress_email,
            "wordpress_username": wordpress_username,
            "wordpress_password": wordpress_password,
        }
        if git_url:
            site_data["git_url"] = git_url
        if ready_made_site_name:
            site_data["ready_made_site_name"] = ready_made_site_name
        if is_free is not None:
            site_data["is_free"] = is_free

        site = await client.create_site(site_data)

        result = f"✅ **Site Created Successfully!**\n\n"
        result += f"• **Domain**: {site.get('fqdn')}\n"
        result += f"• **Active**: {site.get('active', 'Unknown')}\n"
        result += f"• **HTTP Auth Enabled**: {site.get('http_auth_enabled', 'Unknown')}\n"
        result += f"• **Admin Username**: {wordpress_username}\n"
        result += f"• **Admin Email**: {wordpress_email}\n"
        if git_url:
            result += f"• **Git URL**: {git_url}\n"
        if ready_made_site_name:
            result += f"• **Ready-made**: {ready_made_site_name}\n"
        if is_free is not None:
            result += f"• **Plan**: {'Free' if is_free else 'Paid'}\n"
        result += "\n🚀 Your WordPress site is being deployed and will be ready shortly!"

        return result

    except SiteBayError as e:
        return f"Error creating site: {str(e)}"


async def sitebay_update_site(
    client: SiteBayClient,
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
        fqdn: The fully qualified domain name of the site to update
        cf_dev_mode_enabled: Enable/disable Cloudflare dev mode
        new_fqdn: New domain for the site
        git_url: Git repository URL
        http_auth_enabled: Enable/disable HTTP basic auth
        team_id: Move site to a different team
        is_free: Toggle free plan flag
    
    Returns:
        Formatted string with update confirmation
    """
    try:
        site_data: Dict[str, Any] = {}
        
        if cf_dev_mode_enabled is not None:
            site_data["cf_dev_mode_enabled"] = cf_dev_mode_enabled
        if new_fqdn:
            site_data["new_fqdn"] = new_fqdn
        if git_url:
            site_data["git_url"] = git_url
        if http_auth_enabled is not None:
            site_data["http_auth_enabled"] = http_auth_enabled
        if team_id:
            site_data["team_id"] = team_id
        if is_free is not None:
            site_data["is_free"] = is_free
        
        if not site_data:
            return "No updates specified. Provide at least one supported field."
        
        site = await client.update_site(fqdn, site_data)
        
        result = f"✅ **Site Updated Successfully!**\n\n"
        result += f"• **Domain**: {site.get('fqdn')}\n"
        result += f"• **Status**: {site.get('status')}\n"
        
        if cf_dev_mode_enabled is not None:
            result += f"• **Cloudflare Dev Mode**: {'Enabled' if cf_dev_mode_enabled else 'Disabled'}\n"
        if new_fqdn:
            result += f"• **New Domain**: {new_fqdn}\n"
        if git_url:
            result += f"• **Git URL**: {git_url}\n"
        if http_auth_enabled is not None:
            result += f"• **HTTP Auth**: {'Enabled' if http_auth_enabled else 'Disabled'}\n"
        if team_id:
            result += f"• **Team ID**: Moved to {team_id}\n"
        if is_free is not None:
            result += f"• **Plan**: {'Free' if is_free else 'Paid'}\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error updating site: {str(e)}"


async def sitebay_delete_site(
    client: SiteBayClient,
    fqdn: str,
) -> str:
    """
    Delete a WordPress site permanently.
    
    Args:
        fqdn: The fully qualified domain name of the site to delete
    
    Returns:
        Confirmation message or error
    """
    try:
        await client.delete_site(fqdn)
        
        return (
            "✅ **Site Deleted Successfully**\n\n"
            f"The site {fqdn} has been permanently deleted."
        )
        
    except SiteBayError as e:
        return f"Error deleting site: {str(e)}"
