# SiteBay MCP Server - Implementation Plan

## Overview
This project creates a Model Context Protocol (MCP) server that provides Claude Code users with direct access to the SiteBay WordPress hosting platform. Users can manage their WordPress sites, execute commands, handle staging environments, and more through natural language interactions.

## Architecture

### Core Components
1. **MCP Server** - Built using FastMCP framework
2. **API Client** - Handles authentication and API communication with SiteBay
3. **Tool Categories** - Logical groupings of SiteBay functionality
4. **Authentication** - OAuth2 Bearer token management

### Tool Categories & Functions

#### 1. Site Management (`sitebay_`)
- `sitebay_list_sites` - Get all user sites
- `sitebay_get_site` - Get specific site details
- `sitebay_create_site` - Create new WordPress site
- `sitebay_update_site` - Update site configuration
- `sitebay_delete_site` - Delete site permanently

#### 2. Site Operations (`sitebay_site_`)
- `sitebay_site_shell_command` - Execute shell/WP-CLI commands
- `sitebay_site_edit_file` - Edit files in wp-content
- `sitebay_site_get_events` - View site events/logs
- `sitebay_site_external_path_list` - List external path configs
- `sitebay_site_external_path_create` - Create external path
- `sitebay_site_external_path_update` - Update external path
- `sitebay_site_external_path_delete` - Delete external path

#### 3. Staging & Backup (`sitebay_staging_`, `sitebay_backup_`)
- `sitebay_staging_create` - Create staging site
- `sitebay_staging_delete` - Delete staging site
- `sitebay_staging_commit` - Sync staging to live
- `sitebay_backup_list_restores` - List available backups
- `sitebay_backup_get_commits` - Get backup commit history
- `sitebay_backup_restore` - Restore site to point-in-time

#### 4. Proxy Services (`sitebay_proxy_`)
- `sitebay_proxy_wordpress` - WordPress REST API proxy
- `sitebay_proxy_shopify` - Shopify Admin API proxy
- `sitebay_proxy_posthog` - PostHog analytics proxy

#### 5. Team Management (`sitebay_team_`)
- `sitebay_team_list` - List user teams
- `sitebay_team_get` - Get team details
- `sitebay_team_create` - Create new team
- `sitebay_team_update` - Update team settings
- `sitebay_team_delete` - Delete team

#### 6. Account & Billing (`sitebay_account_`)
- `sitebay_account_affiliates` - Get affiliate referrals
- `sitebay_account_create_checkout` - Create Stripe checkout session

#### 7. Templates & Regions (`sitebay_template_`, `sitebay_region_`)
- `sitebay_template_list` - List available templates
- `sitebay_region_list` - List hosting regions

## Implementation Details

### Authentication Flow
1. User provides SiteBay API token via MCP configuration
2. Server validates token on startup
3. All API calls use OAuth2 Bearer authentication
4. Token refresh handling (if needed)

### Error Handling
- Comprehensive error messages for API failures
- Validation of required parameters
- Graceful handling of network issues
- Clear user feedback for authentication problems

### Configuration
```json
{
  "mcpServers": {
    "sitebay": {
      "command": "python",
      "args": ["-m", "sitebay_mcp"],
      "env": {
        "SITEBAY_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

## File Structure
```
sitebay_mcp/
├── __init__.py
├── server.py              # Main MCP server
├── client.py              # SiteBay API client
├── tools/
│   ├── __init__.py
│   ├── sites.py          # Site management tools
│   ├── operations.py     # Site operations tools
│   ├── staging.py        # Staging & backup tools
│   ├── proxy.py          # Proxy service tools
│   ├── teams.py          # Team management tools
│   └── account.py        # Account & billing tools
├── auth.py               # Authentication handling
├── exceptions.py         # Custom exceptions
└── schemas.py           # Pydantic models for API responses
```

## Development Phases

### Phase 1: Core Infrastructure
- [ ] Set up project structure
- [ ] Implement authentication system
- [ ] Create base API client
- [ ] Basic MCP server setup

### Phase 2: Essential Site Management
- [ ] Site listing and details
- [ ] Site creation and deletion
- [ ] Shell command execution
- [ ] File editing capabilities

### Phase 3: Advanced Features
- [ ] Staging site management
- [ ] Backup and restore functionality
- [ ] External path configuration
- [ ] Proxy services

### Phase 4: Team & Account Features
- [ ] Team management
- [ ] Account and billing tools
- [ ] Template and region queries

### Phase 5: Testing & Documentation
- [ ] Comprehensive testing
- [ ] Usage documentation
- [ ] Example configurations
- [ ] Performance optimization

## Key Benefits

1. **Natural Language Interface** - Users can manage WordPress sites through conversational commands
2. **Comprehensive Coverage** - All SiteBay API functionality available
3. **Integrated Workflow** - Seamless integration with Claude Code development workflows
4. **Secure Authentication** - Proper token management and secure API communication
5. **Error Resilience** - Robust error handling and user feedback

## Usage Examples

### Creating a New Site
```
Claude: Create a new WordPress site called "myblog.example.com" using the basic template
```

### Executing WP-CLI Commands
```
Claude: Run "wp plugin list" on myblog.example.com to see installed plugins
```

### Managing Staging
```
Claude: Create a staging site for myblog.example.com, then install the Yoast SEO plugin on staging
```

### Backup and Restore
```
Claude: Show me the backup history for myblog.example.com from the last week, then restore to yesterday at 2 PM
```

This plan provides a comprehensive roadmap for building a robust, user-friendly MCP server that makes SiteBay's powerful WordPress hosting platform accessible through natural language interactions in Claude Code.