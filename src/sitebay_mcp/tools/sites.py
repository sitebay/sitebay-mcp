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
        if team_id is not None and not isinstance(team_id, str):
            msg = "team_id must be a string if provided"
            raise ValueError(msg)

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
            result += f"  - Status: {site.get('status', 'Unknown')}\n"
            result += f"  - Region: {site.get('region_name', 'Unknown')}\n"
            result += f"  - WordPress Version: {site.get('wp_version', 'Unknown')}\n"
            result += f"  - PHP Version: {site.get('php_version', 'Unknown')}\n"
            result += f"  - Created: {site.get('created_at', 'Unknown')}\n"
            if site.get('staging_site'):
                result += f"  - Has Staging Site: Yes\n"
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
        result += f"• **Status**: {site.get('status', 'Unknown')}\n"
        result += f"• **Region**: {site.get('region_name', 'Unknown')}\n"
        result += f"• **WordPress Version**: {site.get('wp_version', 'Unknown')}\n"
        result += f"• **PHP Version**: {site.get('php_version', 'Unknown')}\n"
        result += f"• **MySQL Version**: {site.get('mysql_version', 'Unknown')}\n"
        result += f"• **Site URL**: {site.get('site_url', 'Unknown')}\n"
        result += f"• **Admin URL**: {site.get('admin_url', 'Unknown')}\n"
        result += f"• **Created**: {site.get('created_at', 'Unknown')}\n"
        result += f"• **Updated**: {site.get('updated_at', 'Unknown')}\n"
        
        if site.get('staging_site'):
            result += f"• **Staging Site**: Available\n"
        else:
            result += f"• **Staging Site**: Not created\n"
        
        if site.get('git_enabled'):
            result += f"• **Git Integration**: Enabled\n"
            if site.get('git_repo'):
                result += f"• **Git Repository**: {site.get('git_repo')}\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error getting site details: {str(e)}"


async def sitebay_create_site(
    client: SiteBayClient,
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
        fqdn: The fully qualified domain name for the new site
        wp_title: WordPress site title
        wp_username: WordPress admin username
        wp_password: WordPress admin password
        wp_email: WordPress admin email
        region_name: Optional region name (uses default if not specified)
        template_id: Optional template ID to use for site creation
        team_id: Optional team ID to create site under
    
    Returns:
        Formatted string with new site details
    """
    try:
        site_data = {
            "fqdn": fqdn,
            "wp_title": wp_title,
            "wp_username": wp_username,
            "wp_password": wp_password,
            "wp_email": wp_email,
        }
        
        if region_name:
            site_data["region_name"] = region_name
        if template_id:
            site_data["template_id"] = template_id
        if team_id:
            site_data["team_id"] = team_id
        
        site = await client.create_site(site_data)
        
        result = f"✅ **Site Created Successfully!**\n\n"
        result += f"• **Domain**: {site.get('fqdn')}\n"
        result += f"• **Status**: {site.get('status')}\n"
        result += f"• **Region**: {site.get('region_name')}\n"
        result += f"• **Site URL**: {site.get('site_url')}\n"
        result += f"• **Admin URL**: {site.get('admin_url')}\n"
        result += f"• **WordPress Admin**: {wp_username}\n"
        result += f"• **WordPress Email**: {wp_email}\n"
        result += f"\n🚀 Your WordPress site is being deployed and will be ready shortly!"
        
        return result
        
    except SiteBayError as e:
        return f"Error creating site: {str(e)}"


async def sitebay_update_site(
    client: SiteBayClient,
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
        php_version: New PHP version (e.g., "8.1", "8.2")
    
    Returns:
        Formatted string with update confirmation
    """
    try:
        site_data = {}
        
        if wp_title:
            site_data["wp_title"] = wp_title
        if wp_username:
            site_data["wp_username"] = wp_username
        if wp_password:
            site_data["wp_password"] = wp_password
        if wp_email:
            site_data["wp_email"] = wp_email
        if php_version:
            site_data["php_version"] = php_version
        
        if not site_data:
            return "No updates specified. Please provide at least one field to update."
        
        site = await client.update_site(fqdn, site_data)
        
        result = f"✅ **Site Updated Successfully!**\n\n"
        result += f"• **Domain**: {site.get('fqdn')}\n"
        result += f"• **Status**: {site.get('status')}\n"
        
        if wp_title:
            result += f"• **Title**: Updated to '{wp_title}'\n"
        if wp_username:
            result += f"• **Admin Username**: Updated to '{wp_username}'\n"
        if wp_password:
            result += f"• **Admin Password**: Updated\n"
        if wp_email:
            result += f"• **Admin Email**: Updated to '{wp_email}'\n"
        if php_version:
            result += f"• **PHP Version**: Updated to {php_version}\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error updating site: {str(e)}"


async def sitebay_delete_site(
    client: SiteBayClient,
    fqdn: str,
    confirm: bool = False
) -> str:
    """
    Delete a WordPress site permanently.
    
    Args:
        fqdn: The fully qualified domain name of the site to delete
        confirm: Must be True to actually delete the site (safety check)
    
    Returns:
        Confirmation message or error
    """
    if not confirm:
        return (
            f"⚠️  **CONFIRMATION REQUIRED**\n\n"
            f"You are about to permanently delete the site: **{fqdn}**\n\n"
            f"This action will:\n"
            f"• Delete all website files and content\n"
            f"• Delete the database and all data\n"
            f"• Remove any staging sites\n"
            f"• Cannot be undone\n\n"
            f"To proceed with deletion, call this function again with confirm=True"
        )
    
    try:
        await client.delete_site(fqdn)
        
        return (
            "✅ **Site Deleted Successfully**\n\n"
            f"The site {fqdn} has been permanently deleted."
        )
        
    except SiteBayError as e:
        return f"Error deleting site: {str(e)}"