# SiteBay MCP Server
[![smithery badge](https://smithery.ai/badge/@sitebay/sitebay-mcp)](https://smithery.ai/server/@sitebay/sitebay-mcp)

A Model Context Protocol (MCP) server that provides Claude Code users with direct access to the SiteBay WordPress hosting platform. Manage your hosted WordPress sites, execute server commands, and more through natural language interactions with the SiteBay cloud infrastructure.

## Features

### 🌐 Site Management
- List all your hosted WordPress sites
- Get detailed site information (active, HTTP auth, plan)
- Create new WordPress sites using SiteBay's ready-made sites
- Update site settings (Cloudflare dev mode, domain, HTTP auth, Git URL)
- Delete sites

### ⚡ Site Operations
- Execute shell commands and WP-CLI commands on SiteBay servers
- Edit files in wp-content directory on your hosted sites
 
 

### 🛠 Advanced Features
- Point-in-time backup restores from SiteBay's backup system (coming soon)
- Team management for collaborative hosting (coming soon)
- WordPress/Shopify/PostHog API proxy services through SiteBay (coming soon)

### 🗺 Helper Tools
- Browse SiteBay's ready-made sites
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

## HTTP Transport (Recommended for hosted deployments)

This server now supports Streamable HTTP transport in addition to STDIO. Use HTTP for hosted or remote deployments and to comply with Smithery’s hosted requirements.

### Run over HTTP

```bash
# Defaults to 127.0.0.1:7823
uvx sitebay-mcp --http

# Or specify host/port
uvx sitebay-mcp --http --host 0.0.0.0 --port 7823

# Environment variables also supported
MCP_TRANSPORT=http MCP_HTTP_HOST=0.0.0.0 MCP_HTTP_PORT=7823 uvx sitebay-mcp
```

### Configure Claude Desktop for HTTP

Add a server URL entry instead of a command:

```json
{
  "mcpServers": {
    "sitebay": {
      "url": "http://127.0.0.1:7823",
      "env": {
        "SITEBAY_API_TOKEN": "your_api_token_here"
      }
    }
}
}
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

#### For uvx installation (STDIO mode):
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

#### For pip installation (STDIO mode):
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

#### For HTTP mode (any installation):
```json
{
  "mcpServers": {
    "sitebay": {
      "url": "http://127.0.0.1:7823",
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
Claude: Create a new WordPress site on team 00000000-0000-4000-a000-000000000000 with domain "www.example.org". Blog name "Example", admin Jane Smith (email admin@example.org), username "taylor89", password "AStrongPassword". Use ready-made site name "blog-basic" and set Git URL to https://github.com/acme/wp-site
```

### Managing Existing Sites

```
Claude: List all my WordPress sites and show their current status

Claude: Get detailed information about myblog.example.com

Claude: Enable Cloudflare dev mode for myblog.example.com
Claude: Set the Git URL for myblog.example.com to https://github.com/acme/wp-site
Claude: Turn on HTTP auth for myblog.example.com
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
```

 

### Getting Information

```
Claude: List all the ready-made sites available on SiteBay for new sites
```

## Available Tools

### Site Management
- `sitebay_list_sites` - List all WordPress sites hosted on SiteBay
- `sitebay_get_site` - Get detailed information about a hosted site
- `sitebay_create_site` - Create a new WordPress site on SiteBay infrastructure
- `sitebay_update_site` - Update site configuration on SiteBay servers
- `sitebay_delete_site` - Delete a hosted site

### Site Operations
- `sitebay_site_shell_command` - Execute shell/WP-CLI commands on SiteBay servers
- `sitebay_site_edit_file` - Edit files in wp-content on SiteBay-hosted sites
 
 

### Helper Tools
- `sitebay_list_ready_made_sites` - List ready-made sites available on SiteBay

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
- Ready-made site catalog listing
