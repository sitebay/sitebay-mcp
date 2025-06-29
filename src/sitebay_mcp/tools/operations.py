"""
Site operations tools for SiteBay MCP Server
"""

from typing import Optional, List, Dict, Any
from ..client import SiteBayClient
from ..exceptions import SiteBayError


async def sitebay_site_shell_command(
    client: SiteBayClient,
    fqdn: str,
    command: str
) -> str:
    """
    Execute a shell command on a WordPress site (including WP-CLI commands).
    
    Args:
        fqdn: The fully qualified domain name of the site
        command: The shell command to execute (e.g., "wp plugin list")
    
    Returns:
        Command output or error message
    """
    try:
        result = await client.execute_shell_command(fqdn, command)
        
        # Handle different response formats
        if isinstance(result, dict):
            if 'output' in result:
                output = result['output']
            elif 'result' in result:
                output = result['result']
            else:
                output = str(result)
        else:
            output = str(result)
        
        response = f"**Command executed on {fqdn}:**\n"
        response += f"```bash\n{command}\n```\n\n"
        response += f"**Output:**\n```\n{output}\n```"
        
        return response
        
    except SiteBayError as e:
        return f"Error executing command on {fqdn}: {str(e)}"


async def sitebay_site_edit_file(
    client: SiteBayClient,
    fqdn: str,
    file_path: str,
    content: str
) -> str:
    """
    Edit a file in the site's wp-content directory.
    
    Args:
        fqdn: The fully qualified domain name of the site
        file_path: Path to the file relative to wp-content (e.g., "themes/mytheme/style.css")
        content: New content for the file
    
    Returns:
        Success message or error
    """
    try:
        result = await client.edit_file(fqdn, file_path, content)
        
        response = f"✅ **File Updated Successfully**\n\n"
        response += f"• **Site**: {fqdn}\n"
        response += f"• **File**: wp-content/{file_path}\n"
        response += f"• **Content Length**: {len(content)} characters\n"
        
        if isinstance(result, str) and result:
            response += f"\n**Server Response:**\n```\n{result}\n```"
        
        return response
        
    except SiteBayError as e:
        return f"Error editing file on {fqdn}: {str(e)}"


async def sitebay_site_get_events(
    client: SiteBayClient,
    fqdn: str,
    after_datetime: Optional[str] = None,
    limit: int = 20
) -> str:
    """
    Get recent events for a site (deployments, updates, restores, etc.).
    
    Args:
        fqdn: The fully qualified domain name of the site
        after_datetime: Optional datetime to filter events after (ISO format)
        limit: Maximum number of events to return (default: 20)
    
    Returns:
        Formatted list of site events
    """
    try:
        events = await client.get_site_events(fqdn, after_datetime)
        
        if not events:
            return f"No events found for {fqdn}."
        
        # Limit the results
        events = events[:limit]
        
        result = f"**Recent Events for {fqdn}** (showing {len(events)} events):\n\n"
        
        for event in events:
            result += f"• **{event.get('event_type', 'Unknown Event')}**\n"
            result += f"  - Time: {event.get('created_at', 'Unknown')}\n"
            result += f"  - Status: {event.get('status', 'Unknown')}\n"
            
            if event.get('description'):
                result += f"  - Description: {event.get('description')}\n"
            
            if event.get('metadata'):
                metadata = event.get('metadata') or {}
                for key, value in metadata.items():
                    result += f"  - {key.title()}: {value}\n"
            
            result += "\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error getting events for {fqdn}: {str(e)}"


async def sitebay_site_external_path_list(
    client: SiteBayClient,
    fqdn: str
) -> str:
    """
    List external path configurations for a site.
    
    Args:
        fqdn: The fully qualified domain name of the site
    
    Returns:
        List of external path configurations
    """
    try:
        paths = await client.list_external_paths(fqdn)
        
        if not paths:
            return f"No external paths configured for {fqdn}."
        
        result = f"**External Paths for {fqdn}**:\n\n"
        
        for path in paths:
            result += f"• **Path**: {path.get('path', 'Unknown')}\n"
            result += f"  - Target URL: {path.get('target_url', 'Unknown')}\n"
            result += f"  - Status: {path.get('status', 'Unknown')}\n"
            result += f"  - Created: {path.get('created_at', 'Unknown')}\n"
            result += f"  - ID: {path.get('id', 'Unknown')}\n"
            result += "\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error listing external paths for {fqdn}: {str(e)}"


async def sitebay_site_external_path_create(
    client: SiteBayClient,
    fqdn: str,
    path: str,
    target_url: str,
    description: Optional[str] = None
) -> str:
    """
    Create an external path configuration for a site.
    
    Args:
        fqdn: The fully qualified domain name of the site
        path: The path on your site (e.g., "/api")
        target_url: The external URL to proxy to
        description: Optional description for the path
    
    Returns:
        Success message with path details
    """
    try:
        path_data = {
            "path": path,
            "target_url": target_url,
        }
        
        if description:
            path_data["description"] = description
        
        external_path = await client.create_external_path(fqdn, path_data)
        
        result = f"✅ **External Path Created Successfully**\n\n"
        result += f"• **Site**: {fqdn}\n"
        result += f"• **Path**: {external_path.get('path')}\n"
        result += f"• **Target URL**: {external_path.get('target_url')}\n"
        result += f"• **Status**: {external_path.get('status')}\n"
        result += f"• **ID**: {external_path.get('id')}\n"
        
        if description:
            result += f"• **Description**: {description}\n"
        
        result += f"\n🔗 Your site path {fqdn}{path} now proxies to {target_url}"
        
        return result
        
    except SiteBayError as e:
        return f"Error creating external path for {fqdn}: {str(e)}"


async def sitebay_site_external_path_update(
    client: SiteBayClient,
    fqdn: str,
    path_id: str,
    path: Optional[str] = None,
    target_url: Optional[str] = None,
    description: Optional[str] = None
) -> str:
    """
    Update an external path configuration.
    
    Args:
        fqdn: The fully qualified domain name of the site
        path_id: The ID of the external path to update
        path: New path value (optional)
        target_url: New target URL (optional)
        description: New description (optional)
    
    Returns:
        Update confirmation message
    """
    try:
        path_data = {}
        
        if path:
            path_data["path"] = path
        if target_url:
            path_data["target_url"] = target_url
        if description:
            path_data["description"] = description
        
        if not path_data:
            return "No updates specified. Please provide at least one field to update."
        
        external_path = await client.update_external_path(fqdn, path_id, path_data)
        
        result = f"✅ **External Path Updated Successfully**\n\n"
        result += f"• **Site**: {fqdn}\n"
        result += f"• **Path**: {external_path.get('path')}\n"
        result += f"• **Target URL**: {external_path.get('target_url')}\n"
        result += f"• **Status**: {external_path.get('status')}\n"
        result += f"• **ID**: {external_path.get('id')}\n"
        
        return result
        
    except SiteBayError as e:
        return f"Error updating external path for {fqdn}: {str(e)}"


async def sitebay_site_external_path_delete(
    client: SiteBayClient,
    fqdn: str,
    path_id: str
) -> str:
    """
    Delete an external path configuration.
    
    Args:
        fqdn: The fully qualified domain name of the site
        path_id: The ID of the external path to delete
    
    Returns:
        Deletion confirmation message
    """
    try:
        await client.delete_external_path(fqdn, path_id)
        
        return f"✅ **External Path Deleted Successfully**\n\nExternal path {path_id} has been removed from {fqdn}."
        
    except SiteBayError as e:
        return f"Error deleting external path for {fqdn}: {str(e)}"