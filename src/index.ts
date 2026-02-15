import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const BASE_URL = "https://my.sitebay.org";
const API_PREFIX = "/f/api/v1";

interface Config {
  apiKey: string;
}

export const configSchema = z.object({
  apiKey: z.string().describe("Your SiteBay API token from https://my.sitebay.org"),
});

async function apiRequest(
  apiKey: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<unknown> {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${API_PREFIX}${path}`, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) throw new Error("Invalid or expired API token");
  if (res.status === 404) throw new Error("Resource not found");

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (res.status === 422) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? (data as Record<string, unknown>).detail
        : text;
    throw new Error(`Validation Error: ${JSON.stringify(detail)}`);
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "detail" in data
        ? (data as Record<string, unknown>).detail
        : text;
    throw new Error(`API Error ${res.status}: ${msg}`);
  }

  return data;
}

function getResults(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null && "results" in data) {
    return (data as Record<string, unknown>).results as unknown[];
  }
  return [];
}

function field(obj: Record<string, unknown>, key: string, fallback = "Unknown"): string {
  const v = obj[key];
  return v !== undefined && v !== null ? String(v) : fallback;
}

/** Register all 16 SiteBay tools on an McpServer instance */
function registerTools(server: McpServer, apiKey: string) {
  server.tool(
    "sitebay_list_sites",
    "List all WordPress sites for the authenticated user",
    { team_id: z.string().uuid().optional().describe("Optional team ID to filter sites") },
    async ({ team_id }) => {
      const params = team_id ? { team_id } : undefined;
      const data = await apiRequest(apiKey, "GET", "/site", undefined, params);
      const sites = getResults(data);
      if (!sites.length) return { content: [{ type: "text" as const, text: "No sites found." }] };
      let text = `Found ${sites.length} site(s):\n\n`;
      for (const s of sites as Record<string, unknown>[]) {
        text += `• **${field(s, "fqdn")}**\n`;
        text += `  - Active: ${field(s, "active")}\n`;
        text += `  - HTTP Auth: ${field(s, "http_auth_enabled")}\n`;
        text += `  - Free: ${field(s, "is_free")}\n`;
        text += `  - Created: ${field(s, "created_at")}\n\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_get_site",
    "Get detailed information about a specific WordPress site",
    { fqdn: z.string().describe("Site domain (e.g. www.example.com)") },
    async ({ fqdn }) => {
      const site = (await apiRequest(apiKey, "GET", `/site/${fqdn}`)) as Record<string, unknown>;
      let text = `**Site Details for ${fqdn}**\n\n`;
      text += `• Active: ${field(site, "active")}\n`;
      text += `• HTTP Auth: ${field(site, "http_auth_enabled")}\n`;
      text += `• Free: ${field(site, "is_free")}\n`;
      text += `• Git URL: ${field(site, "git_url", "—")}\n`;
      text += `• Created: ${field(site, "created_at")}\n`;
      text += `• Updated: ${field(site, "updated_at")}\n`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_create_site",
    "Create a new WordPress site",
    {
      team_id: z.string().describe("Team UUID that owns the site"),
      fqdn: z.string().describe("Domain for the new site"),
      wordpress_blog_name: z.string().describe("Blog/site title"),
      wordpress_first_name: z.string().describe("Admin first name"),
      wordpress_last_name: z.string().describe("Admin last name"),
      wordpress_email: z.string().email().describe("Admin email"),
      wordpress_username: z.string().describe("Admin username"),
      wordpress_password: z.string().describe("Admin password"),
      git_url: z.string().optional().describe("Git repository URL"),
      ready_made_site_name: z.string().optional().describe("Ready-made site template name"),
      is_free: z.boolean().optional().describe("Free plan flag"),
    },
    async (args) => {
      const body: Record<string, unknown> = {
        team_id: args.team_id,
        fqdn: args.fqdn,
        wordpress_blog_name: args.wordpress_blog_name,
        wordpress_first_name: args.wordpress_first_name,
        wordpress_last_name: args.wordpress_last_name,
        wordpress_email: args.wordpress_email,
        wordpress_username: args.wordpress_username,
        wordpress_password: args.wordpress_password,
      };
      if (args.git_url) body.git_url = args.git_url;
      if (args.ready_made_site_name) body.ready_made_site_name = args.ready_made_site_name;
      if (args.is_free !== undefined) body.is_free = args.is_free;

      const site = (await apiRequest(apiKey, "POST", "/site", body)) as Record<string, unknown>;
      let text = `Site Created Successfully!\n\n`;
      text += `• Domain: ${field(site, "fqdn")}\n`;
      text += `• Active: ${field(site, "active")}\n`;
      text += `• Admin: ${args.wordpress_username}\n`;
      text += `\nYour WordPress site is being deployed!`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_update_site",
    "Update an existing WordPress site configuration",
    {
      fqdn: z.string().describe("Site domain to update"),
      cf_dev_mode_enabled: z.boolean().optional().describe("Enable/disable Cloudflare dev mode"),
      new_fqdn: z.string().optional().describe("Change the site domain"),
      git_url: z.string().optional().describe("Set git repository URL"),
      http_auth_enabled: z.boolean().optional().describe("Enable/disable HTTP basic auth"),
      team_id: z.string().optional().describe("Move site to a different team"),
      is_free: z.boolean().optional().describe("Toggle free plan"),
    },
    async ({ fqdn, ...updates }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) body[k] = v;
      }
      if (!Object.keys(body).length) {
        return { content: [{ type: "text" as const, text: "No updates specified." }] };
      }
      const site = (await apiRequest(apiKey, "PATCH", `/site/${fqdn}`, body)) as Record<string, unknown>;
      let text = `Site Updated!\n• Domain: ${field(site, "fqdn")}\n`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_delete_site",
    "Delete a WordPress site permanently. Cannot be undone.",
    { fqdn: z.string().describe("Domain of the site to delete") },
    async ({ fqdn }) => {
      await apiRequest(apiKey, "DELETE", `/site/${fqdn}`);
      return { content: [{ type: "text" as const, text: `Site ${fqdn} deleted.` }] };
    },
  );

  server.tool(
    "sitebay_site_shell_command",
    "Execute a shell command on a WordPress site (supports WP-CLI)",
    {
      fqdn: z.string().describe("Site domain"),
      command: z.string().describe("Shell command to execute (e.g. 'wp plugin list')"),
      cwd: z.string().optional().describe("Working directory"),
      auto_track_dir: z.boolean().optional().describe("Auto track directory changes"),
    },
    async ({ fqdn, command, cwd, auto_track_dir }) => {
      const body: Record<string, unknown> = { cmd: command };
      if (cwd !== undefined) body.cwd = cwd;
      if (auto_track_dir !== undefined) body.auto_track_dir = auto_track_dir;
      const result = (await apiRequest(apiKey, "POST", `/site/${fqdn}/cmd`, body)) as Record<string, unknown>;
      const output = result.output ?? result.result ?? JSON.stringify(result);
      let text = `**Command on ${fqdn}:**\n\`\`\`bash\n${command}\n\`\`\`\n\n`;
      if (cwd) text += `Working dir: ${cwd}\n\n`;
      text += `**Output:**\n\`\`\`\n${output}\n\`\`\``;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_site_edit_file",
    "Edit a file in the site's wp-content directory using search/replace blocks",
    {
      fqdn: z.string().describe("Site domain"),
      file_path: z.string().describe("Path in wp-content (e.g. wp-content/themes/mytheme/style.css)"),
      file_edit_using_search_replace_blocks: z.string().describe(
        "Diff blocks: <<<<<< SEARCH\\nold\\n=======\\nnew\\n>>>>>> REPLACE",
      ),
    },
    async ({ fqdn, file_path, file_edit_using_search_replace_blocks }) => {
      const normalized = file_path.replace("/bitnami/wordpress/wp-content", "wp-content");
      if (!normalized.startsWith("wp-content")) {
        return { content: [{ type: "text" as const, text: "file_path must start with 'wp-content/'" }] };
      }
      if (
        !file_edit_using_search_replace_blocks.includes("<<<<<< SEARCH") ||
        !file_edit_using_search_replace_blocks.includes("=======") ||
        !file_edit_using_search_replace_blocks.includes(">>>>>> REPLACE")
      ) {
        return { content: [{ type: "text" as const, text: "Invalid diff-edit block format." }] };
      }
      await apiRequest(apiKey, "POST", `/site/${fqdn}/wpfile_diff_edit`, {
        file_path: normalized,
        file_edit_using_search_replace_blocks,
      });
      return { content: [{ type: "text" as const, text: `File updated on ${fqdn}: ${normalized}` }] };
    },
  );

  server.tool("sitebay_list_teams", "List all teams for the authenticated user", {}, async () => {
    const data = await apiRequest(apiKey, "GET", "/team");
    const teams = getResults(data);
    if (!teams.length) return { content: [{ type: "text" as const, text: "No teams found." }] };
    let text = `**Your Teams** (${teams.length}):\n\n`;
    for (const t of teams as Record<string, unknown>[]) {
      text += `• **${field(t, "name")}**\n`;
      text += `  - ID: ${field(t, "id")}\n`;
      text += `  - Plan: ${field(t, "plan_type_name")}\n`;
      text += `  - Active: ${field(t, "is_active")}\n\n`;
    }
    return { content: [{ type: "text" as const, text }] };
  });

  server.tool("sitebay_list_ready_made_sites", "List available ready-made site templates", {}, async () => {
    const data = await apiRequest(apiKey, "GET", "/ready_made_site");
    const items = getResults(data);
    if (!items.length) return { content: [{ type: "text" as const, text: "No ready-made sites available." }] };
    let text = `**Ready-made Sites** (${items.length}):\n\n`;
    for (const i of items as Record<string, unknown>[]) {
      text += `• **${field(i, "name")}** — ${field(i, "description", "")}\n`;
    }
    return { content: [{ type: "text" as const, text }] };
  });

  server.tool(
    "sitebay_wordpress_proxy",
    "Proxy requests to a WordPress site's REST API",
    {
      fqdn: z.string().describe("Site domain"),
      path: z.string().default("/wp-json/wp/v2/").describe("WordPress API path"),
      query_params_json: z.string().optional().describe("JSON payload or query params"),
      method: z.enum(["get", "post", "put", "delete"]).default("get").describe("HTTP method"),
    },
    async ({ fqdn, path, query_params_json, method }) => {
      const body: Record<string, unknown> = { fqdn, method, path };
      if (query_params_json) body.query_params_json = query_params_json;
      const result = await apiRequest(apiKey, "POST", "/wp-proxy", body);
      return { content: [{ type: "text" as const, text: `WordPress API Response:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
    },
  );

  server.tool(
    "sitebay_shopify_proxy",
    "Proxy requests to Shopify Admin API",
    {
      shop_name: z.string().describe("Shopify shop name"),
      path: z.string().default("/admin/api/2024-04").describe("Shopify API path"),
      query_params_json: z.string().optional().describe("JSON payload"),
      method: z.enum(["get", "post", "put", "delete"]).default("get"),
    },
    async ({ shop_name, path, query_params_json, method }) => {
      const body: Record<string, unknown> = { shop_name, method, path };
      if (query_params_json) body.query_params_json = query_params_json;
      const result = await apiRequest(apiKey, "POST", "/shopify-proxy", body);
      return { content: [{ type: "text" as const, text: `Shopify Response:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
    },
  );

  server.tool(
    "sitebay_posthog_proxy",
    "Proxy requests to PostHog analytics API",
    {
      path: z.string().describe("PostHog API path"),
      query_params_json: z.string().optional().describe("JSON payload"),
      method: z.enum(["get", "post", "put", "delete"]).default("get"),
    },
    async ({ path, query_params_json, method }) => {
      const body: Record<string, unknown> = { path, method };
      if (query_params_json) body.query_params_json = query_params_json;
      const result = await apiRequest(apiKey, "POST", "/posthog-proxy", body);
      return { content: [{ type: "text" as const, text: `PostHog Response:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
    },
  );

  server.tool(
    "sitebay_backup_list_commits",
    "List available backup commits for point-in-time restore",
    {
      fqdn: z.string().describe("Site domain"),
      number_to_fetch: z.number().int().default(1).describe("Number of backups to fetch"),
    },
    async ({ fqdn, number_to_fetch }) => {
      const data = await apiRequest(apiKey, "GET", `/site/${fqdn}/pit_restore/commits`, undefined, {
        number_to_fetch: String(number_to_fetch),
      });
      const commits = Array.isArray(data) ? data : [];
      if (!commits.length) return { content: [{ type: "text" as const, text: `No backups for ${fqdn}.` }] };
      let text = `**Backups for ${fqdn}** (${commits.length}):\n\n`;
      for (const c of commits as Record<string, unknown>[]) {
        text += `• ${field(c, "created_at")} — hash: ${field(c, "commit_hash")}\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_backup_restore",
    "Restore a site to a previous point in time",
    {
      fqdn: z.string().describe("Site domain"),
      restore_point: z.string().optional().describe("ISO datetime for restore point"),
      restore_db: z.boolean().optional().describe("Restore database"),
      restore_wp_content: z.boolean().optional().describe("Restore wp-content"),
      delete_extra_files: z.boolean().optional().describe("Delete extra files"),
      dolt_restore_hash: z.string().optional().describe("Dolt hash for DB restore"),
      is_dry_run: z.boolean().optional().describe("Simulate without applying"),
    },
    async ({ fqdn, ...opts }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined) body[k] = v;
      }
      await apiRequest(apiKey, "POST", `/site/${fqdn}/pit_restore`, body);
      return { content: [{ type: "text" as const, text: `Restore initiated for ${fqdn}.` }] };
    },
  );

  server.tool("sitebay_account_affiliates", "Get affiliate referral information", {}, async () => {
    const data = await apiRequest(apiKey, "GET", "/account/referred_user");
    const affiliates = getResults(data);
    if (!affiliates.length) return { content: [{ type: "text" as const, text: "No affiliate referrals." }] };
    let text = `**Affiliate Referrals** (${affiliates.length}):\n\n`;
    for (const a of affiliates as Record<string, unknown>[]) {
      text += `• ${field(a, "email")} — ${field(a, "full_name")} (${field(a, "created_at")})\n`;
    }
    return { content: [{ type: "text" as const, text }] };
  });

  server.tool(
    "sitebay_account_create_checkout",
    "Create a Stripe checkout session for team billing",
    {
      plan_name: z.enum(["starter", "business", "micro"]).default("starter").describe("Plan type"),
      interval: z.enum(["month", "year"]).default("month").describe("Billing interval"),
      team_id: z.string().optional().describe("Team ID to purchase for"),
    },
    async ({ plan_name, interval, team_id }) => {
      const body: Record<string, unknown> = { plan_name, interval };
      if (team_id) body.for_team_id = team_id;
      const result = (await apiRequest(apiKey, "POST", "/create_checkout_session", body)) as Record<string, unknown>;
      return {
        content: [{ type: "text" as const, text: `Checkout: ${plan_name} (${interval})\nURL: ${result.url ?? "N/A"}` }],
      };
    },
  );
}

// --- CF Workers: McpAgent + Durable Object ---

type Env = {
  MCP_OBJECT: DurableObjectNamespace;
};

export class SiteBayMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "SiteBay WordPress Hosting",
    version: "0.1.0",
  });

  async init() {
    const url = new URL(this.request?.url ?? "http://localhost");
    const apiKey = url.searchParams.get("apiKey") ?? "";
    registerTools(this.server, apiKey);
  }
}

const mcpHandler = SiteBayMCP.serve("/mcp");

const SERVER_CARD = {
  serverInfo: { name: "SiteBay WordPress Hosting", version: "0.1.0" },
  authentication: { required: true, schemes: ["bearer"] },
  tools: [
    { name: "sitebay_list_sites", description: "List all WordPress sites for the authenticated user", inputSchema: { type: "object", properties: { team_id: { type: "string", description: "Optional team ID to filter sites" } } } },
    { name: "sitebay_get_site", description: "Get detailed information about a specific WordPress site", inputSchema: { type: "object", properties: { fqdn: { type: "string", description: "Site domain" } }, required: ["fqdn"] } },
    { name: "sitebay_create_site", description: "Create a new WordPress site", inputSchema: { type: "object", properties: { team_id: { type: "string" }, fqdn: { type: "string" }, wordpress_blog_name: { type: "string" }, wordpress_first_name: { type: "string" }, wordpress_last_name: { type: "string" }, wordpress_email: { type: "string" }, wordpress_username: { type: "string" }, wordpress_password: { type: "string" } }, required: ["team_id", "fqdn", "wordpress_blog_name", "wordpress_first_name", "wordpress_last_name", "wordpress_email", "wordpress_username", "wordpress_password"] } },
    { name: "sitebay_update_site", description: "Update an existing WordPress site configuration", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_delete_site", description: "Delete a WordPress site permanently. Cannot be undone.", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_site_shell_command", description: "Execute a shell command on a WordPress site (supports WP-CLI)", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, command: { type: "string" } }, required: ["fqdn", "command"] } },
    { name: "sitebay_site_edit_file", description: "Edit a file in the site's wp-content directory using search/replace blocks", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, file_path: { type: "string" }, file_edit_using_search_replace_blocks: { type: "string" } }, required: ["fqdn", "file_path", "file_edit_using_search_replace_blocks"] } },
    { name: "sitebay_list_teams", description: "List all teams for the authenticated user", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_list_ready_made_sites", description: "List available ready-made site templates", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_wordpress_proxy", description: "Proxy requests to a WordPress site's REST API", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, path: { type: "string" }, method: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_shopify_proxy", description: "Proxy requests to Shopify Admin API", inputSchema: { type: "object", properties: { shop_name: { type: "string" }, path: { type: "string" }, method: { type: "string" } }, required: ["shop_name"] } },
    { name: "sitebay_posthog_proxy", description: "Proxy requests to PostHog analytics API", inputSchema: { type: "object", properties: { path: { type: "string" }, method: { type: "string" } }, required: ["path"] } },
    { name: "sitebay_backup_list_commits", description: "List available backup commits for point-in-time restore", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, number_to_fetch: { type: "number" } }, required: ["fqdn"] } },
    { name: "sitebay_backup_restore", description: "Restore a site to a previous point in time", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_account_affiliates", description: "Get affiliate referral information", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_account_create_checkout", description: "Create a Stripe checkout session for team billing", inputSchema: { type: "object", properties: { plan_name: { type: "string" }, interval: { type: "string" } } } },
  ],
  resources: [],
  prompts: [],
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/mcp/server-card.json") {
      return new Response(JSON.stringify(SERVER_CARD), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    return mcpHandler.fetch(request, env, ctx);
  },
};

// --- Smithery compatibility ---

export function createServer({ config }: { config: Config }) {
  const server = new McpServer({
    name: "SiteBay WordPress Hosting",
    version: "0.1.0",
  });
  registerTools(server, config.apiKey);
  return server.server;
}

export function createSandboxServer() {
  return createServer({ config: { apiKey: "test-key" } });
}
