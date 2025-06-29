# SiteBay MCP Server
[![smithery badge](https://smithery.ai/badge/@sitebay/sitebay-mcp)](https://smithery.ai/server/@sitebay/sitebay-mcp)

A Model Context Protocol (MCP) server that provides Claude Code users with direct access to the SiteBay WordPress hosting platform. Manage your hosted WordPress sites, execute server commands, handle staging environments, and more through natural language interactions with the SiteBay cloud infrastructure.

## Features

### 🌐 Site Management
- List all your hosted WordPress sites
- Get detailed site information (status, region, PHP version, etc.)
- Create new WordPress sites using SiteBay's templates
- Update site configurations (PHP version, admin credentials, etc.)
- Delete sites with safety confirmations

### ⚡ Site Operations
- Execute shell commands and WP-CLI commands on SiteBay servers
- Edit files in wp-content directory on your hosted sites
- View site events and deployment logs from SiteBay infrastructure  
- Manage external path configurations for URL proxying through SiteBay

### 🛠 Advanced Features
- Staging site management on SiteBay infrastructure (coming soon)
- Point-in-time backup restores from SiteBay's backup system (coming soon)
- Team management for collaborative hosting (coming soon)
- WordPress/Shopify/PostHog API proxy services through SiteBay (coming soon)

### 🗺 Helper Tools
- List available SiteBay hosting regions
- Browse SiteBay's WordPress templates
- Account and billing information (coming soon)

## Installation

### Installing via Smithery

To install SiteBay MCP for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@sitebay/sitebay-mcp):

```bash
npx -y @smithery/cli install @sitebay/sitebay-mcp --client claude
```

### Using uvx (Recommended)

```bash
# Install and run directly with uvx
uvx sitebay-mcp

# Or install for repeated use
uv tool install sitebay-mcp
sitebay-mcp
```

### Using pip

```bash
# Install from PyPI (when published)
pip install sitebay-mcp

# Or install from source
git clone https://github.com/your-username/sitebay-mcp.git
cd sitebay-mcp
pip install -e .
```

## Configuration

### 1. Get Your SiteBay API Token

1. Log in to your [SiteBay account](https://my.sitebay.org)
2. Navigate to Settings in your account dashboard
3. Generate a new API token
4. Copy the token for use in configuration

### 2. Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

#### For uvx installation:
```json
{
  "mcpServers": {
    "sitebay": {
      "command": "uvx",
      "args": ["sitebay-mcp"],
      "env": {
        "SITEBAY_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

#### For pip installation:
```json
{
  "mcpServers": {
    "sitebay": {
      "command": "python",
      "args": ["-m", "sitebay_mcp.server"],
      "env": {
        "SITEBAY_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

### 3. Claude Desktop Configuration File Locations

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

## Usage Examples

### Creating a New WordPress Site

```
Claude: Create a new WordPress site called "myblog.example.com" with the title "My Amazing Blog", admin username "admin", password "SecurePass123!", and email "me@example.com"
```

### Managing Existing Sites

```
Claude: List all my WordPress sites and show their current status

Claude: Get detailed information about myblog.example.com

Claude: Update the PHP version for myblog.example.com to 8.2
```

### Executing Commands

```
Claude: Run "wp plugin list" on myblog.example.com to see what plugins are installed on the SiteBay server

Claude: Execute "wp search-replace 'http://old-domain.com' 'https://new-domain.com'" on myblog.example.com through SiteBay

Claude: Check the disk usage on myblog.example.com with "df -h" on the SiteBay server
```

### File Management

```
Claude: Edit the style.css file in my active theme on myblog.example.com hosted on SiteBay

Claude: Show me recent events and deployment logs for myblog.example.com from SiteBay
```

### External Paths (URL Proxying)

```
Claude: Create an external path "/api" on myblog.example.com that proxies to "https://my-external-api.com" through SiteBay

Claude: List all external path configurations for myblog.example.com on SiteBay
```

### Getting Information

```
Claude: Show me all available SiteBay hosting regions

Claude: List all the WordPress templates available on SiteBay for new sites
```

## Available Tools

### Site Management
- `sitebay_list_sites` - List all WordPress sites hosted on SiteBay
- `sitebay_get_site` - Get detailed information about a hosted site
- `sitebay_create_site` - Create a new WordPress site on SiteBay infrastructure
- `sitebay_update_site` - Update site configuration on SiteBay servers
- `sitebay_delete_site` - Delete a hosted site (with confirmation)

### Site Operations
- `sitebay_site_shell_command` - Execute shell/WP-CLI commands on SiteBay servers
- `sitebay_site_edit_file` - Edit files in wp-content on SiteBay-hosted sites
- `sitebay_site_get_events` - View site events and deployment logs from SiteBay
- `sitebay_site_external_path_list` - List external path configs on SiteBay
- `sitebay_site_external_path_create` - Create external path through SiteBay proxy

### Helper Tools
- `sitebay_list_regions` - List available SiteBay hosting regions
- `sitebay_list_templates` - List WordPress templates available on SiteBay

## Security Notes

- Your SiteBay API token is stored securely in environment variables
- All communications with SiteBay infrastructure use HTTPS encryption
- API tokens can be revoked at any time from your SiteBay account dashboard
- The MCP server runs locally and only proxies requests to SiteBay - no data is stored locally

## Error Handling

The server provides clear error messages for common issues:

- **Authentication errors**: Invalid or expired API tokens
- **Site not found**: When referencing non-existent sites
- **Validation errors**: Invalid parameters or missing required fields
- **Network errors**: Connection issues with SiteBay API

## Troubleshooting

### Authentication Issues

1. Verify your API token is correct
2. Check that the token is properly set in the environment variable
3. Ensure the token hasn't expired
4. Try regenerating the token from your SiteBay account

### Connection Issues

1. Check your internet connection
2. Verify SiteBay service status
3. Check firewall settings
4. Try restarting Claude Desktop

### Tool Not Found

1. Restart Claude Desktop after configuration changes
2. Verify the configuration file is in the correct location
3. Check the JSON syntax is valid
4. Ensure uvx or Python is properly installed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass and code is properly formatted
6. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Issues**: GitHub Issues
- **Documentation**: [SiteBay API Docs](https://my.sitebay.org/f/api/v1/docs)
- **SiteBay Support**: [SiteBay Help Center](https://sitebay.org/support)

## Changelog

### v0.1.0 (2024-01-XX)
- Initial release
- Site management tools
- Shell command execution
- File editing capabilities
- External path management
- Region and template listing
