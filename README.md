<div align="center">

# 🚀 SiteBay MCP Server

[![Smithery](https://smithery.ai/badge/@sitebay/sitebay-mcp)](https://smithery.ai/server/@sitebay/sitebay-mcp)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)

**Manage WordPress hosting through natural language with Claude**

[Features](#-features) • [Installation](#-installation) • [Configuration](#-configuration) • [Usage](#-usage-examples) • [Support](#-support)

</div>

---

A **Model Context Protocol (MCP)** server that gives Claude direct access to the [SiteBay](https://sitebay.org) WordPress hosting platform. Manage sites, execute commands, and control your cloud infrastructure—all through conversation.

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🌐 Site Management
- List all your hosted WordPress sites
- Get detailed site information (active, HTTP auth, plan)
- Create new WordPress sites using ready-made templates
- Update settings (Cloudflare, domain, HTTP auth, Git URL)
- Delete sites

</td>
<td width="50%">

### ⚡ Site Operations
- Execute shell commands on SiteBay servers
- Run WP-CLI commands directly
- Edit files in wp-content directory

</td>
</tr>
<tr>
<td width="50%">

### 🛠 Advanced Features
- 🔜 Point-in-time backup restores
- 🔜 Team management for collaborative hosting
- 🔜 WordPress/Shopify/PostHog API proxy

</td>
<td width="50%">

### 🗺 Helper Tools
- Browse ready-made site templates
- 🔜 Account and billing information

</td>
</tr>
</table>

---

## 📦 Installation

### 🎯 Via Smithery (Fastest)

```bash
npx -y @smithery/cli install @sitebay/sitebay-mcp --client claude
```

### 📦 Using uvx (Recommended)

```bash
# Install and run directly
uvx sitebay-mcp

# Or install for repeated use
uv tool install sitebay-mcp
sitebay-mcp
```

### 🌐 HTTP Transport

> 💡 **Recommended for hosted deployments**

<details>
<summary><strong>📡 Run over HTTP</strong></summary>

```bash
# Defaults to 127.0.0.1:7823
uvx sitebay-mcp --http

# Or specify host/port
uvx sitebay-mcp --http --host 0.0.0.0 --port 7823

# Environment variables also supported
MCP_TRANSPORT=http MCP_HTTP_HOST=0.0.0.0 MCP_HTTP_PORT=7823 uvx sitebay-mcp
```

</details>

### 🐍 Using pip

```bash
pip install sitebay-mcp

# Or from source
git clone https://github.com/sitebay/sitebay-mcp.git
cd sitebay-mcp && pip install -e .
```

---

## ⚙️ Configuration

### Step 1: Get Your API Token

1. Log in to [my.sitebay.org](https://my.sitebay.org)
2. Navigate to **Settings** → **API Tokens**
3. Generate and copy your token

### Step 2: Configure Claude Desktop

Choose your installation method:

<details>
<summary><strong>📦 uvx (STDIO mode)</strong></summary>

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

</details>

<details>
<summary><strong>🐍 pip (STDIO mode)</strong></summary>

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

</details>

<details>
<summary><strong>🌐 HTTP mode</strong></summary>

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

</details>

### Config File Locations

| Platform | Path |
|----------|------|
| 🍎 macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| 🪟 Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| �� Linux | `~/.config/claude/claude_desktop_config.json` |

---

## 💬 Usage Examples

### 🆕 Create a Site

```
Create a new WordPress site on team 00000000-0000-4000-a000-000000000000 
with domain "www.example.org", blog name "Example", admin Jane Smith 
(email admin@example.org), username "taylor89", password "AStrongPassword". 
Use ready-made site "blog-basic" and set Git URL to https://github.com/acme/wp-site
```

### 📋 Manage Sites

```
List all my WordPress sites and show their current status
Get detailed information about myblog.example.com
Enable Cloudflare dev mode for myblog.example.com
Turn on HTTP auth for myblog.example.com
```

### 🖥️ Execute Commands

```
Run "wp plugin list" on myblog.example.com
Execute "wp search-replace 'http://old.com' 'https://new.com'" on myblog.example.com
Check disk usage on myblog.example.com with "df -h"
```

### 📁 File Management

```
Edit the style.css file in my active theme on myblog.example.com
```

---

## 🧰 Available Tools

| Tool | Description |
|------|-------------|
| `sitebay_list_sites` | List all WordPress sites hosted on SiteBay |
| `sitebay_get_site` | Get detailed information about a hosted site |
| `sitebay_create_site` | Create a new WordPress site on SiteBay |
| `sitebay_update_site` | Update site configuration |
| `sitebay_delete_site` | Delete a hosted site |
| `sitebay_site_shell_command` | Execute shell/WP-CLI commands |
| `sitebay_site_edit_file` | Edit files in wp-content |
| `sitebay_list_ready_made_sites` | List available ready-made templates |

---

## 🔒 Security

- ✅ API tokens stored securely in environment variables
- ✅ All communications use HTTPS encryption
- ✅ Tokens can be revoked anytime from your dashboard
- ✅ MCP server runs locally—no data stored

---

## 🐛 Troubleshooting

<details>
<summary><strong>🔑 Authentication Issues</strong></summary>

1. Verify your API token is correct
2. Check that the token is properly set in the environment variable
3. Ensure the token hasn't expired
4. Try regenerating from your SiteBay account

</details>

<details>
<summary><strong>🌐 Connection Issues</strong></summary>

1. Check your internet connection
2. Verify SiteBay service status
3. Check firewall settings
4. Try restarting Claude Desktop

</details>

<details>
<summary><strong>🔧 Tool Not Found</strong></summary>

1. Restart Claude Desktop after configuration changes
2. Verify the configuration file location
3. Check JSON syntax is valid
4. Ensure uvx or Python is properly installed

</details>

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🆘 Support

| Resource | Link |
|----------|------|
| 🐛 Issues | [GitHub Issues](https://github.com/sitebay/sitebay-mcp/issues) |
| 📖 API Docs | [SiteBay API Documentation](https://my.sitebay.org/f/api/v1/docs) |
| 💬 Help | [SiteBay Help Center](https://sitebay.org/support) |

---

<div align="center">

**Made with ❤️ by [SiteBay](https://sitebay.org)**

</div>
