"""
Site operations tools for SiteBay MCP Server
"""

from typing import Optional, List, Dict, Any
from ..client import SiteBayClient
from ..exceptions import SiteBayError


async def sitebay_site_shell_command(
    client: SiteBayClient,
    fqdn: str,
    command: str,
    cwd: Optional[str] = None,
    auto_track_dir: Optional[bool] = None,
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
        result = await client.execute_shell_command(
            fqdn, cmd=command, cwd=cwd, auto_track_dir=auto_track_dir
        )
        
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
        if cwd is not None:
            response += f"Working dir: {cwd}\n\n"
        response += f"**Output:**\n```\n{output}\n```"
        
        return response
        
    except SiteBayError as e:
        return f"Error executing command on {fqdn}: {str(e)}"


async def sitebay_site_edit_file(
    client: SiteBayClient,
    fqdn: str,
    file_path: str,
    file_edit_using_search_replace_blocks: str,
) -> str:
    """
    Edit a file in the site's wp-content directory using diff-edit blocks.
    
    Args:
        fqdn: The fully qualified domain name of the site
        file_path: Path to the file relative to wp-content (e.g., "wp-content/themes/mytheme/style.css")
        file_edit_using_search_replace_blocks: A single string containing blocks in the form:
            <<<<<< SEARCH\nold text\n=======\nnew text\n>>>>>> REPLACE
    
    Returns:
        Success message or error
    """
    try:
        # Normalize path (server also handles this, but we pre-normalize to help users)
        normalized_path = file_path.replace(
            "/bitnami/wordpress/wp-content", "wp-content"
        )
        
        if not normalized_path.startswith("wp-content"):
            return (
                "❌ Invalid file_path: must start with 'wp-content/'. "
                "Example: wp-content/themes/mytheme/style.css"
            )
        
        text = file_edit_using_search_replace_blocks
        if (
            "<<<<<< SEARCH" not in text
            or "=======" not in text
            or ">>>>>> REPLACE" not in text
        ):
            return (
                "❌ Invalid diff-edit block format. Make sure blocks are in correct sequence, "
                "and the markers are on separate lines:\n\n"
                "<<<<<< SEARCH\n    example old\n=======\n    example new\n>>>>>> REPLACE\n"
            )
        
        result = await client.edit_file(
            fqdn, normalized_path, text
        )
        
        response = f"✅ **File Updated Successfully**\n\n"
        response += f"• **Site**: {fqdn}\n"
        response += f"• **File**: wp-content/{file_path}\n"
        response += f"• **Content Length**: {len(text)} characters\n"
        
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
    return "Site events are not available via schema endpoints."


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
    return "External path tools are no longer supported."


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
    return "External path tools are no longer supported."



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
    return "External path tools are no longer supported."
