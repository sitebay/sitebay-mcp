import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import embeddingsData from "./embeddings.json";
import { resolveProxyPayloadArgs } from "./proxy-payload.js";
import {
  buildMachineToolResponse,
  buildWordpressCreatePageEnvelope,
  buildWordpressSettingsEnvelope,
} from "./tool-response.js";

type EmbeddingEntry = { title: string; description: string; path: string; content: string; embedding: number[] };
const EMBEDDINGS: EmbeddingEntry[] = embeddingsData as EmbeddingEntry[];

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

const BASE_URL = "https://my.sitebay.org";
const API_PREFIX = "/f/api/v1";

const SERVER_INFO = {
  name: "sitebay-mcp",
  title: "SiteBay WordPress Hosting",
  version: "0.1.0",
  description: "Manage WordPress sites, run WP-CLI commands, edit files, handle backups, and proxy requests to WordPress/Shopify/PostHog APIs via SiteBay.",
  websiteUrl: "https://www.sitebay.org",
  icons: [{ src: "https://www.sitebay.org/icon-512x512.png", mimeType: "image/png", sizes: ["512x512"] }],
};

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
  const { data } = await apiRequestDetailed(apiKey, method, endpoint, body, params);
  return data;
}

async function apiRequestDetailed(
  apiKey: string,
  method: string,
  endpoint: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const normalized = path.endsWith("/") ? path : `${path}/`;
  const url = new URL(`${API_PREFIX}${normalized}`, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method,
    redirect: "follow",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  const detail =
    typeof data === "object" && data !== null && "detail" in data
      ? (data as Record<string, unknown>).detail
      : text;

  if (!res.ok) {
    const errParts = [
      `HTTP ${res.status} ${res.statusText}`,
      `URL: ${url.toString()}`,
      `Method: ${method}`,
      `Response: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
    ];
    if (body) errParts.push(`Body: ${JSON.stringify(body)}`);
    throw new Error(errParts.join(" | "));
  }

  return {
    status: res.status,
    data,
  };
}

function normalizeWpFrontPageId(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
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

/** Register all tools, prompts, and resources on an McpServer instance */
function registerCapabilities(server: McpServer, apiKey: string, env?: Env) {
  // --- Prompts ---

  server.prompt(
    "manage-site",
    "Get guidance on managing a specific WordPress site",
    { fqdn: z.string().describe("Site domain to manage") },
    async ({ fqdn }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `I want to manage my WordPress site at ${fqdn}. Help me with common tasks like checking site status, running WP-CLI commands, managing plugins/themes, creating backups, and editing files. Start by getting the site details.`,
        },
      }],
    }),
  );

  server.prompt(
    "setup-new-site",
    "Walk through creating a new WordPress site on SiteBay",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "I want to create a new WordPress site on SiteBay. First list my teams so I can pick one, then help me set up the site with a domain, admin credentials, and optionally a ready-made template.",
        },
      }],
    }),
  );

  // --- Resources ---

  // Bible docs: curated source-of-truth articles about SiteBay
  const BIBLE_INDEX_URL = "https://raw.githubusercontent.com/sitebay/docs/main/articles/bible-index.json";

  server.resource(
    "knowledge-base",
    "sitebay://knowledge-base",
    { description: "Curated source-of-truth documentation about SiteBay platform, features, and guides", mimeType: "application/json" },
    async () => {
      const res = await fetch(BIBLE_INDEX_URL);
      if (!res.ok) throw new Error(`Failed to fetch bible index: ${res.status}`);
      const articles = await res.json() as Array<{ title: string; description: string; path: string; content: string }>;
      // Return index without full content for listing
      const index = articles.map(({ title, description, path }) => ({ title, description, path }));
      return { contents: [{ uri: "sitebay://knowledge-base", text: JSON.stringify(index, null, 2), mimeType: "application/json" }] };
    },
  );

  server.resource(
    "sites",
    "sitebay://sites",
    { description: "List of all WordPress sites for the authenticated user", mimeType: "application/json" },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/site");
      return { contents: [{ uri: "sitebay://sites", text: JSON.stringify(data, null, 2), mimeType: "application/json" }] };
    },
  );

  server.resource(
    "teams",
    "sitebay://teams",
    { description: "List of all teams for the authenticated user", mimeType: "application/json" },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/team");
      return { contents: [{ uri: "sitebay://teams", text: JSON.stringify(data, null, 2), mimeType: "application/json" }] };
    },
  );

  // --- Tools ---

  server.tool(
    "sitebay_get_knowledge",
    "Search and retrieve curated SiteBay documentation. Use this to answer questions about SiteBay features, setup, billing, or how things work.",
    { query: z.string().describe("Search term or topic (e.g. 'git sync', 'staging', 'plans', 'migrate')") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ query }) => {
      if (EMBEDDINGS.length === 0) {
        return { content: [{ type: "text" as const, text: `No documentation available.` }] };
      }

      let scored: Array<{ entry: EmbeddingEntry; score: number }>;

      if (env?.AI) {
        const aiResult = await env.AI.run("@cf/baai/bge-small-en-v1.5" as any, { text: [query] }) as { data: number[][] };
        const queryEmbedding = aiResult.data[0];
        scored = EMBEDDINGS.map((entry) => ({ entry, score: cosineSim(queryEmbedding, entry.embedding) }));
      } else {
        // Fallback: keyword search
        const q = query.toLowerCase();
        scored = EMBEDDINGS.map((entry) => {
          const searchable = `${entry.title} ${entry.description} ${entry.content}`.toLowerCase();
          const score = q.split(/\s+/).filter((word) => searchable.includes(word)).length;
          return { entry, score };
        });
      }

      scored.sort((a, b) => b.score - a.score);
      const top3 = scored.slice(0, 3).filter((s) => s.score > 0);

      if (top3.length === 0) {
        return { content: [{ type: "text" as const, text: `No documentation found for "${query}". Available topics: ${EMBEDDINGS.map((a) => a.title).join(", ")}` }] };
      }

      const results = top3.map((s) => `# ${s.entry.title}\n\n${s.entry.content}`).join("\n\n---\n\n");
      return { content: [{ type: "text" as const, text: results }] };
    },
  );

  server.tool(
    "sitebay_list_sites",
    "List all WordPress sites for the authenticated user",
    { team_id: z.string().uuid().optional().describe("Optional team ID to filter sites") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ team_id }) => {
      const params = team_id ? { team_id } : undefined;
      const data = await apiRequest(apiKey, "GET", "/site", undefined, params);
      const sites = getResults(data);
      if (!sites.length) return { content: [{ type: "text" as const, text: "[]" }] };
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
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    "sitebay_create_snapshot_job",
    "Queue a public-site snapshot job for a SiteBay site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      url: z.string().describe("Source URL to snapshot"),
      mode: z.enum(["suckit", "playwright", "auto"]).default("auto").describe("Snapshot crawl mode"),
      depth: z.number().int().min(1).default(3).describe("Maximum crawl depth"),
      max_pages: z.number().int().min(1).default(25).describe("Maximum number of pages to snapshot"),
      include: z.string().optional().describe("Optional include pattern"),
      exclude: z.string().optional().describe("Optional exclude pattern"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ fqdn, url, mode, depth, max_pages, include, exclude }) => {
      const body: Record<string, unknown> = { url, mode, depth, max_pages };
      if (include !== undefined) body.include = include;
      if (exclude !== undefined) body.exclude = exclude;
      const result = (await apiRequest(apiKey, "POST", `/site/${fqdn}/snapshot_jobs`, body)) as Record<string, unknown>;
      let text = `Snapshot job queued for ${fqdn}.\n`;
      text += `• Job ID: ${field(result, "job_id")}\n`;
      text += `• Status: ${field(result, "status", "queued")}`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_get_snapshot_job",
    "Get current status for a queued or completed snapshot job. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      job_id: z.string().describe("Snapshot job UUID"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, job_id }) => {
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/snapshot_jobs/${job_id}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ fqdn, command, cwd, auto_track_dir }) => {
      const body: Record<string, unknown> = { cmd: command };
      if (cwd !== undefined) body.cwd = cwd;
      if (auto_track_dir !== undefined) body.auto_track_dir = auto_track_dir;
      const result = (await apiRequest(apiKey, "POST", `/site/${fqdn}/cmd`, body)) as Record<string, unknown>;
      const output = result.response ?? result.output ?? result.result ?? JSON.stringify(result);
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
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
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

  server.tool(
    "sitebay_list_teams",
    "List all teams for the authenticated user",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/team");
      const teams = getResults(data);
      if (!teams.length) return { content: [{ type: "text" as const, text: "[]" }] };
      let text = `**Your Teams** (${teams.length}):\n\n`;
      for (const t of teams as Record<string, unknown>[]) {
        text += `• **${field(t, "name")}**\n`;
        text += `  - ID: ${field(t, "id")}\n`;
        text += `  - Plan: ${field(t, "plan_type_name")}\n`;
        text += `  - Active: ${field(t, "is_active")}\n\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_list_ready_made_sites",
    "List available ready-made site templates",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/ready_made_site");
      const items = getResults(data);
      if (!items.length) return { content: [{ type: "text" as const, text: "[]" }] };
      let text = `**Ready-made Sites** (${items.length}):\n\n`;
      for (const i of items as Record<string, unknown>[]) {
        text += `• **${field(i, "name")}** — ${field(i, "description", "")}\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_wordpress_proxy",
    "Proxy requests to a WordPress site's REST API",
    {
      fqdn: z.string().describe("Site domain"),
      path: z.string().default("/wp-json/wp/v2/").describe("WordPress API path"),
      query_params_json: z.string().optional().describe("JSON payload or query params"),
      body: z.union([z.string(), z.record(z.unknown())]).optional().describe("Legacy alias for query_params_json"),
      method: z.string().transform(s => s.toLowerCase()).default("get").describe("HTTP method (get/post/put/delete, case-insensitive)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (args) => {
      const { fqdn, path, method } = args;
      const body: Record<string, unknown> = { fqdn, method, path };
      const { payload, warnings } = resolveProxyPayloadArgs(args);
      if (payload) body.query_params_json = payload;
      const { status, data } = await apiRequestDetailed(apiKey, "POST", "/wp-proxy", body);
      return buildMachineToolResponse({
        ok: true,
        http_status: status,
        request: { fqdn, method, path },
        result: data,
        warnings,
      });
    },
  );

  server.tool(
    "sitebay_wp_create_page",
    "Create a WordPress page with a typed schema and semantic validation",
    {
      fqdn: z.string().describe("Site domain"),
      title: z.string().describe("Page title"),
      content: z.string().optional().describe("Page HTML or block content"),
      status: z.enum(["draft", "publish", "private"]).default("publish").describe("WordPress post status"),
      slug: z.string().optional().describe("Page slug"),
      excerpt: z.string().optional().describe("Page excerpt"),
      template: z.string().optional().describe("Page template"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ fqdn, ...request }) => {
      const body: Record<string, unknown> = {
        fqdn,
        method: "post",
        path: "/wp-json/wp/v2/pages",
        query_params_json: JSON.stringify(request),
      };
      const { status, data } = await apiRequestDetailed(apiKey, "POST", "/wp-proxy", body);
      return buildMachineToolResponse(
        buildWordpressCreatePageEnvelope({
          request,
          httpStatus: status,
          result: data,
        }),
      );
    },
  );

  server.tool(
    "sitebay_wp_update_settings",
    "Update WordPress reading/front-page settings with a typed schema and semantic validation",
    {
      fqdn: z.string().describe("Site domain"),
      show_on_front: z.enum(["posts", "page"]).optional().describe("Whether the homepage shows posts or a static page"),
      page_on_front: z.union([z.number().int(), z.string()]).optional().describe("Page ID to use as the static front page"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async ({ fqdn, show_on_front, page_on_front }) => {
      const normalizedPageOnFront = normalizeWpFrontPageId(page_on_front);
      const request = {
        ...(show_on_front !== undefined ? { show_on_front } : {}),
        ...(normalizedPageOnFront !== undefined ? { page_on_front: normalizedPageOnFront } : {}),
      };
      const body: Record<string, unknown> = {
        fqdn,
        method: "post",
        path: "/wp-json/wp/v2/settings",
        query_params_json: JSON.stringify(request),
      };
      const { status, data } = await apiRequestDetailed(apiKey, "POST", "/wp-proxy", body);
      return buildMachineToolResponse(
        buildWordpressSettingsEnvelope({
          request,
          httpStatus: status,
          result: data,
        }),
      );
    },
  );

  server.tool(
    "sitebay_shopify_proxy",
    "Proxy requests to Shopify Admin API",
    {
      shop_name: z.string().describe("Shopify shop name"),
      path: z.string().default("/admin/api/2024-04").describe("Shopify API path"),
      query_params_json: z.string().optional().describe("JSON payload"),
      body: z.union([z.string(), z.record(z.unknown())]).optional().describe("Legacy alias for query_params_json"),
      method: z.string().transform(s => s.toLowerCase()).default("get").describe("HTTP method (get/post/put/delete, case-insensitive)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (args) => {
      const { shop_name, path, method } = args;
      const body: Record<string, unknown> = { shop_name, method, path };
      const { payload, warnings } = resolveProxyPayloadArgs(args);
      if (payload) body.query_params_json = payload;
      const { status, data } = await apiRequestDetailed(apiKey, "POST", "/shopify-proxy", body);
      return buildMachineToolResponse({
        ok: true,
        http_status: status,
        request: { shop_name, method, path },
        result: data,
        warnings,
      });
    },
  );

  server.tool(
    "sitebay_posthog_proxy",
    "Proxy requests to PostHog analytics API",
    {
      path: z.string().describe("PostHog API path"),
      query_params_json: z.string().optional().describe("JSON payload"),
      body: z.union([z.string(), z.record(z.unknown())]).optional().describe("Legacy alias for query_params_json"),
      method: z.string().transform(s => s.toLowerCase()).default("get").describe("HTTP method (get/post/put/delete, case-insensitive)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (args) => {
      const { path, method } = args;
      const body: Record<string, unknown> = { path, method };
      const { payload, warnings } = resolveProxyPayloadArgs(args);
      if (payload) body.query_params_json = payload;
      const { status, data } = await apiRequestDetailed(apiKey, "POST", "/posthog-proxy", body);
      return buildMachineToolResponse({
        ok: true,
        http_status: status,
        request: { method, path },
        result: data,
        warnings,
      });
    },
  );

  server.tool(
    "sitebay_backup_list_commits",
    "List available backup commits for point-in-time restore",
    {
      fqdn: z.string().describe("Site domain"),
      number_to_fetch: z.number().int().default(1).describe("Number of backups to fetch"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, ...opts }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined) body[k] = v;
      }
      await apiRequest(apiKey, "POST", `/site/${fqdn}/pit_restore`, body);
      return { content: [{ type: "text" as const, text: `Restore initiated for ${fqdn}.` }] };
    },
  );

  server.tool(
    "sitebay_create_checkpoint",
    "Create a named checkpoint with an auto-captured screenshot. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      name: z.string().describe("Checkpoint name"),
      description: z.string().optional().describe("Checkpoint description"),
      page_path: z.string().optional().describe("Page path to screenshot (default: /)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, name, description, page_path }) => {
      const body: Record<string, unknown> = { name };
      if (description) body.description = description;
      if (page_path) body.page_path = page_path;
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/checkpoints`, body) as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_list_checkpoints",
    "List all checkpoints for a site, newest first. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const data = await apiRequest(apiKey, "GET", `/site/${fqdn}/checkpoints`) as Record<string, unknown>;
      const items = getResults(data);
      if (!items.length) return { content: [{ type: "text" as const, text: "[]" }] };
      let text = `**Checkpoints** (${items.length}):\n\n`;
      for (const cp of items as Record<string, unknown>[]) {
        text += `• **${field(cp, "name")}** (${field(cp, "id")}) — ${field(cp, "created_at")}\n`;
        if (cp.description) text += `  ${field(cp, "description")}\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_get_checkpoint",
    "Get details of a specific checkpoint. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      checkpoint_id: z.string().describe("Checkpoint ID"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, checkpoint_id }) => {
      const data = await apiRequest(apiKey, "GET", `/site/${fqdn}/checkpoints/${checkpoint_id}`) as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_delete_checkpoint",
    "Delete checkpoint metadata. The underlying backup is not affected. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      checkpoint_id: z.string().describe("Checkpoint ID to delete"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, checkpoint_id }) => {
      await apiRequest(apiKey, "DELETE", `/site/${fqdn}/checkpoints/${checkpoint_id}`);
      return { content: [{ type: "text" as const, text: `Checkpoint ${checkpoint_id} deleted.` }] };
    },
  );

  server.tool(
    "sitebay_restore_checkpoint",
    "Restore the site to the state at this checkpoint using PIT restore. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      checkpoint_id: z.string().describe("Checkpoint ID to restore"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, checkpoint_id }) => {
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/checkpoints/${checkpoint_id}/restore`, {}) as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_admin_cookie",
    "Generate a WordPress admin auth cookie for the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn }) => {
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/admin-cookie`, {});
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_goto",
    "Navigate browser to a path on the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      path: z.string().optional().describe("Path to navigate to (default: /)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, path }) => {
      const body: Record<string, unknown> = {};
      if (path !== undefined) body.path = path;
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/goto`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_screenshot",
    "Take a screenshot of the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      full_page: z.boolean().optional().describe("Capture full page (default: false)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, full_page }) => {
      const body: Record<string, unknown> = {};
      if (full_page !== undefined) body.full_page = full_page;
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/screenshot`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_click",
    "Click an element on the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      selector: z.string().describe("CSS selector of element to click"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, selector }) => {
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/click`, { selector });
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_fill",
    "Fill a form field on the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      selector: z.string().describe("CSS selector of the form field"),
      value: z.string().describe("Value to fill into the field"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, selector, value }) => {
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/fill`, { selector, value });
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_eval",
    "Run JavaScript on the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      js: z.string().describe("JavaScript code to execute"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, js }) => {
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/eval`, { js });
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_browser_text",
    "Get text content of an element on the site. MCP Enabled.",
    {
      fqdn: z.string().describe("Site domain"),
      selector: z.string().optional().describe("CSS selector of element (default: body)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, selector }) => {
      const body: Record<string, unknown> = {};
      if (selector !== undefined) body.selector = selector;
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/browser/text`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
    },
  );

  server.tool(
    "sitebay_account_affiliates",
    "Get affiliate referral information",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/account/referred_user");
      const affiliates = getResults(data);
      if (!affiliates.length) return { content: [{ type: "text" as const, text: "[]" }] };
      let text = `**Affiliate Referrals** (${affiliates.length}):\n\n`;
      for (const a of affiliates as Record<string, unknown>[]) {
        text += `• ${field(a, "email")} — ${field(a, "full_name")} (${field(a, "created_at")})\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_account_create_checkout",
    "Create a Stripe checkout session for team billing",
    {
      plan_name: z.enum(["starter", "business", "micro"]).default("starter").describe("Plan type"),
      interval: z.enum(["month", "year"]).default("month").describe("Billing interval"),
      team_id: z.string().optional().describe("Team ID to purchase for"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ plan_name, interval, team_id }) => {
      const body: Record<string, unknown> = { plan_name, interval };
      if (team_id) body.for_team_id = team_id;
      const result = (await apiRequest(apiKey, "POST", "/create_checkout_session", body)) as Record<string, unknown>;
      return {
        content: [{ type: "text" as const, text: `Checkout: ${plan_name} (${interval})\nURL: ${result.url ?? "N/A"}` }],
      };
    },
  );

  // --- DNS Management ---

  server.tool(
    "sitebay_get_dns_records",
    "Get DNS records for a nameserver-configured site",
    { fqdn: z.string().describe("Site domain (must have nameserver configured)") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const data = await apiRequest(apiKey, "GET", `/site/${fqdn}/dns`);
      const records = Array.isArray(data) ? data : [];
      if (!records.length) return { content: [{ type: "text" as const, text: `No DNS records found for ${fqdn}.` }] };
      let text = `**DNS Records for ${fqdn}** (${records.length}):\n\n`;
      for (const r of records as Record<string, unknown>[]) {
        text += `• **${field(r, "type")}** ${field(r, "name")} → ${field(r, "content")} (proxied: ${field(r, "proxied", "false")})\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_create_dns_record",
    "Create a new DNS record (A or CNAME) for a nameserver-configured site",
    {
      fqdn: z.string().describe("Site domain"),
      dns_name: z.string().describe("DNS record name"),
      dns_content: z.string().describe("DNS record value (IP or target)"),
      dns_type: z.enum(["A", "CNAME"]).describe("DNS record type"),
      proxied: z.boolean().default(false).describe("Proxy through Cloudflare"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, dns_name, dns_content, dns_type, proxied }) => {
      const params: Record<string, string> = {
        dns_name,
        dns_content,
        dns_type,
        proxied: String(proxied),
      };
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/dns`, undefined, params);
      return { content: [{ type: "text" as const, text: `DNS record created for ${fqdn}:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
    },
  );

  server.tool(
    "sitebay_delete_dns_record",
    "Delete a DNS record by ID. Cannot be undone.",
    {
      fqdn: z.string().describe("Site domain"),
      dns_id: z.string().describe("Cloudflare DNS record ID to delete"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, dns_id }) => {
      await apiRequest(apiKey, "DELETE", `/site/${fqdn}/dns/${dns_id}`);
      return { content: [{ type: "text" as const, text: `DNS record ${dns_id} deleted from ${fqdn}.` }] };
    },
  );

  // --- Log Management ---

  server.tool(
    "sitebay_get_site_logs",
    "Get WordPress, git-sync, access, error, php, or mysql logs for a site",
    {
      fqdn: z.string().describe("Site domain"),
      log_type: z.enum(["wordpress", "git-sync", "access", "error", "php", "mysql"]).default("wordpress").describe("Type of logs"),
      lines: z.number().int().min(1).max(10000).default(100).describe("Number of log lines"),
      level: z.enum(["error", "warning", "info", "debug"]).optional().describe("Log level filter"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, log_type, lines, level }) => {
      const params: Record<string, string> = { log_type, lines: String(lines) };
      if (level) params.level = level;
      const data = (await apiRequest(apiKey, "GET", `/site/${fqdn}/logs`, undefined, params)) as Record<string, unknown>;
      const logs = Array.isArray(data.logs) ? data.logs : [];
      let text = `**${log_type} logs for ${fqdn}** (${logs.length} lines):\n\n\`\`\`\n`;
      text += logs.join("\n");
      text += "\n```";
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_get_container_logs",
    "Get raw container logs from a site's Kubernetes pod",
    {
      fqdn: z.string().describe("Site domain"),
      container_name: z.enum(["wordpress", "mysql", "nginx", "redis", "git-sync", "backup", "monitor"]).describe("Container name"),
      lines: z.number().int().min(1).max(10000).default(100).describe("Number of log lines"),
      since: z.string().optional().describe("ISO timestamp to retrieve logs since (e.g. 2024-01-01T00:00:00Z)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, container_name, lines, since }) => {
      const params: Record<string, string> = { lines: String(lines) };
      if (since) params.since = since;
      const data = (await apiRequest(apiKey, "GET", `/site/${fqdn}/logs/${container_name}`, undefined, params)) as Record<string, unknown>;
      const logs = Array.isArray(data.logs) ? data.logs : [];
      let text = `**${container_name} container logs for ${fqdn}** (${logs.length} lines):\n\n\`\`\`\n`;
      text += logs.join("\n");
      text += "\n```";
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // --- Advanced PIT Restore ---

  server.tool(
    "sitebay_backup_get_files",
    "List wp-content files available at a point in time (read-only, does not restore)",
    {
      fqdn: z.string().describe("Site domain"),
      restore_point: z.string().describe("ISO datetime for the point in time"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, restore_point }) => {
      const data = await apiRequest(apiKey, "GET", `/site/${fqdn}/pit_restore/files`, undefined, { restore_point });
      const files = Array.isArray(data) ? data : [];
      let text = `**Files at ${restore_point} for ${fqdn}** (${files.length}):\n\n`;
      for (const f of files.slice(0, 50) as Record<string, unknown>[]) {
        text += `• ${field(f, "key", field(f, "Key", ""))}\n`;
      }
      if (files.length > 50) text += `\n... and ${files.length - 50} more files`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_backup_get_download_urls",
    "Generate signed download URLs for specific backup files",
    {
      fqdn: z.string().describe("Site domain"),
      keys: z.array(z.string()).describe("File paths (e.g. ['/wp-content/themes/mytheme/style.css'])"),
      version_ids: z.array(z.string()).optional().describe("Optional version IDs matching keys"),
      at_date: z.string().optional().describe("ISO datetime for historical file versions"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, keys, version_ids, at_date }) => {
      const body: Record<string, unknown> = { keys };
      if (version_ids) body.version_ids = version_ids;
      if (at_date) body.at_date = at_date;
      const data = await apiRequest(apiKey, "POST", `/site/${fqdn}/get_download_urls`, body);
      return { content: [{ type: "text" as const, text: `Download URLs:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` }] };
    },
  );

  server.tool(
    "sitebay_backup_preview_restore",
    "Preview what a point-in-time restore would change without actually restoring",
    {
      fqdn: z.string().describe("Site domain"),
      restore_point: z.string().describe("ISO datetime for restore point"),
      restore_db: z.boolean().optional().describe("Include database in preview"),
      restore_wp_content: z.boolean().optional().describe("Include wp-content in preview"),
      delete_extra_files: z.boolean().optional().describe("Preview deleting extra files"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, restore_point, ...opts }) => {
      const body: Record<string, unknown> = { restore_point };
      for (const [k, v] of Object.entries(opts)) {
        if (v !== undefined) body[k] = v;
      }
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/pit_restore/preview`, body);
      return { content: [{ type: "text" as const, text: `Restore preview for ${fqdn}:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`` }] };
    },
  );

  // --- Shopify Store Management ---

  server.tool(
    "sitebay_list_shopify_stores",
    "List Shopify stores connected to your account via Shopify Link",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/account/shopify_store");
      const stores = getResults(data);
      return { content: [{ type: "text" as const, text: JSON.stringify(stores) }] };
    },
  );

  server.tool(
    "sitebay_get_shopify_store",
    "Get details of a specific linked Shopify store",
    { id: z.number().int().describe("Shopify store ID") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ id }) => {
      const store = (await apiRequest(apiKey, "GET", `/account/shopify_store/${id}`)) as Record<string, unknown>;
      let text = `**Shopify Store ${id}**\n\n`;
      text += `• Shop URL: ${field(store, "shop_url")}\n`;
      text += `• Blog URL: ${field(store, "blog_url", "—")}\n`;
      text += `• Inject Header: ${field(store, "inject_header", "—")}\n`;
      text += `• Created: ${field(store, "created_at")}\n`;
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_update_shopify_store",
    "Update a linked Shopify store's blog URL or header injection",
    {
      id: z.number().int().describe("Shopify store ID"),
      blog_url: z.string().optional().describe("Blog URL to link"),
      inject_header: z.string().optional().describe("Header HTML to inject"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ id, ...updates }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) body[k] = v;
      }
      if (!Object.keys(body).length) {
        return { content: [{ type: "text" as const, text: "No updates specified." }] };
      }
      const store = (await apiRequest(apiKey, "PATCH", `/account/shopify_store/${id}`, body)) as Record<string, unknown>;
      return { content: [{ type: "text" as const, text: `Shopify store ${id} updated.\n• Blog URL: ${field(store, "blog_url", "—")}` }] };
    },
  );

  // --- External Path Proxying ---

  server.tool(
    "sitebay_get_external_paths",
    "List external path proxies configured for a site",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const data = await apiRequest(apiKey, "GET", `/site/${fqdn}/external_path`);
      const paths = getResults(data);
      if (!paths.length) return { content: [{ type: "text" as const, text: `No external paths for ${fqdn}.` }] };
      let text = `**External Paths for ${fqdn}** (${paths.length}):\n\n`;
      for (const p of paths as Record<string, unknown>[]) {
        text += `• ${field(p, "path")} → ${field(p, "external_name")}\n`;
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  server.tool(
    "sitebay_create_external_path",
    "Create an external path proxy on a site (e.g. /blog → https://blog.example.com)",
    {
      fqdn: z.string().describe("Site domain"),
      external_name: z.string().describe("External URL to proxy to"),
      path: z.string().describe("Path on your site (must start with /)"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, external_name, path }) => {
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/external_path`, { external_name, path });
      return { content: [{ type: "text" as const, text: `External path created on ${fqdn}: ${path} → ${external_name}` }] };
    },
  );

  // --- Git Integration ---

  server.tool(
    "sitebay_get_git_sync_repos",
    "List git-sync repositories linked to your account",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = await apiRequest(apiKey, "GET", "/get_git_sync_repos");
      return { content: [{ type: "text" as const, text: `Git Sync Repos:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`` }] };
    },
  );

  server.tool(
    "sitebay_get_linked_git_repos",
    "Get linked GitHub, GitLab, and Bitbucket repositories",
    {},
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async () => {
      const data = (await apiRequest(apiKey, "GET", "/account/git_repos")) as Record<string, unknown>;
      let text = "**Linked Git Repos**\n\n";
      for (const provider of ["github_repos", "gitlab_repos", "bitbucket_repos"]) {
        const repos = Array.isArray(data[provider]) ? data[provider] : [];
        text += `**${provider.replace("_repos", "").replace(/^\w/, c => c.toUpperCase())}** (${repos.length}):\n`;
        for (const r of repos.slice(0, 20) as Record<string, unknown>[]) {
          text += `• ${field(r, "full_name", field(r, "name", "unknown"))}\n`;
        }
        text += "\n";
      }
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // --- File Management (wp-content) ---

  server.tool(
    "sitebay_read_file",
    "Read a WordPress file from wp-content/. Supports line ranges.",
    {
      fqdn: z.string().describe("Site domain"),
      file_path: z.string().describe("Path relative to wp-content/, e.g. themes/mytheme/functions.php"),
      start_line: z.number().int().optional().describe("First line to return (1-indexed)"),
      end_line: z.number().int().optional().describe("Last line to return (inclusive)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, file_path, start_line, end_line }) => {
      const body: Record<string, unknown> = { file_path };
      if (start_line !== undefined) body.start_line = start_line;
      if (end_line !== undefined) body.end_line = end_line;
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/wpfile/read`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_edit_file",
    "Edit a WordPress file using search/replace blocks. Supports dry_run to preview diff.",
    {
      fqdn: z.string().describe("Site domain"),
      file_path: z.string().describe("Path relative to wp-content/"),
      file_edit_using_search_replace_blocks: z.string().describe(
        "Search/replace blocks in <<<<<<< SEARCH / ======= / >>>>>>> REPLACE format",
      ),
      dry_run: z.boolean().optional().describe("Preview diff without applying changes"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, file_path, file_edit_using_search_replace_blocks, dry_run }) => {
      const body: Record<string, unknown> = { file_path, file_edit_using_search_replace_blocks };
      if (dry_run !== undefined) body.dry_run = dry_run;
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/wpfile/edit`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_read_and_edit_file",
    "Atomically read a WordPress file and apply edits. Returns the original content alongside the edit result. Supports dry_run.",
    {
      fqdn: z.string().describe("Site domain"),
      file_path: z.string().describe("Path relative to wp-content/"),
      file_edit_using_search_replace_blocks: z.string().describe(
        "Search/replace blocks in <<<<<<< SEARCH / ======= / >>>>>>> REPLACE format",
      ),
      dry_run: z.boolean().optional().describe("Preview diff without applying changes"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, file_path, file_edit_using_search_replace_blocks, dry_run }) => {
      const body: Record<string, unknown> = { file_path, file_edit_using_search_replace_blocks };
      if (dry_run !== undefined) body.dry_run = dry_run;
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/wpfile/read_and_edit`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_file_tree",
    "List the wp-content file tree with file sizes",
    {
      fqdn: z.string().describe("Site domain"),
      path: z.string().optional().describe("Subdirectory relative to wp-content/ (empty = root)"),
      max_depth: z.number().int().min(1).max(10).optional().describe("Max directory depth to traverse (default 3)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, path, max_depth }) => {
      const body: Record<string, unknown> = {};
      if (path !== undefined) body.path = path;
      if (max_depth !== undefined) body.max_depth = max_depth;
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/wpfile/tree`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_multi_edit_files",
    "Edit multiple WordPress files atomically. All-or-nothing: if any edit fails, all changes are rolled back. Supports dry_run.",
    {
      fqdn: z.string().describe("Site domain"),
      edits: z.array(z.object({
        file_path: z.string().describe("Path relative to wp-content/"),
        search_replace_blocks: z.string().describe("Search/replace blocks"),
      })).describe("Array of file edits to apply"),
      dry_run: z.boolean().optional().describe("Preview all diffs without applying"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, edits, dry_run }) => {
      const body: Record<string, unknown> = { edits };
      if (dry_run !== undefined) body.dry_run = dry_run;
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/wpfile/multi_edit`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Staging Sites ---

  server.tool(
    "sitebay_get_staging_site",
    "Get the staging site for a live site, if one exists",
    { fqdn: z.string().describe("Live site domain") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/stage`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_create_staging_site",
    "Create a staging site from a live site",
    {
      fqdn: z.string().describe("Live site domain"),
      subdomain: z.string().describe("Subdomain for the staging site (e.g. 'staging')"),
      restore_point: z.string().optional().describe("ISO datetime to base staging site on"),
      git_staging_branch: z.string().optional().describe("Git branch for the staging site"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, subdomain, restore_point, git_staging_branch }) => {
      const body: Record<string, unknown> = { subdomain };
      if (restore_point !== undefined) body.restore_point = restore_point;
      if (git_staging_branch !== undefined) body.git_staging_branch = git_staging_branch;
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/stage`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_delete_staging_site",
    "Delete a staging site. Cannot be undone.",
    { fqdn: z.string().describe("Live site domain") },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      await apiRequest(apiKey, "DELETE", `/site/${fqdn}/stage`);
      return { content: [{ type: "text" as const, text: `Staging site for ${fqdn} deleted.` }] };
    },
  );

  // --- Dolt Database Version Control ---

  server.tool(
    "sitebay_dolt_log",
    "Get recent Dolt commits for a site's database. Shows what tables changed and when.",
    {
      fqdn: z.string().describe("Site domain"),
      limit: z.number().int().max(100).optional().describe("Number of commits to fetch (default 20)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, limit }) => {
      const params: Record<string, string> = {};
      if (limit !== undefined) params.limit = String(limit);
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/dolt/log`, undefined, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_dolt_diff",
    "Show what changed in the database between two Dolt commits. If only from_commit is given, diffs to HEAD.",
    {
      fqdn: z.string().describe("Site domain"),
      from_commit: z.string().optional().describe("Start commit hash"),
      to_commit: z.string().optional().describe("End commit hash (default: HEAD)"),
      table: z.string().optional().describe("Specific table to diff"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, from_commit, to_commit, table }) => {
      const params: Record<string, string> = {};
      if (from_commit !== undefined) params.from_commit = from_commit;
      if (to_commit !== undefined) params.to_commit = to_commit;
      if (table !== undefined) params.table = table;
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/dolt/diff`, undefined, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_dolt_diff_summary",
    "Get a human-readable summary of what changed in the database between two Dolt commits",
    {
      fqdn: z.string().describe("Site domain"),
      from_commit: z.string().optional().describe("Start commit hash"),
      to_commit: z.string().optional().describe("End commit hash (default: HEAD)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, from_commit, to_commit }) => {
      const params: Record<string, string> = {};
      if (from_commit !== undefined) params.from_commit = from_commit;
      if (to_commit !== undefined) params.to_commit = to_commit;
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/dolt/diff-summary`, undefined, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Cloudflare / CDN / Security ---

  server.tool(
    "sitebay_get_cloudflare_tools",
    "Get Cloudflare tools info and current zone settings for a site",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/tools`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_update_cf_settings",
    "Toggle one or more Cloudflare performance/security settings for a site",
    {
      fqdn: z.string().describe("Site domain"),
      dev_mode: z.boolean().optional().describe("Enable/disable development mode"),
      always_online: z.boolean().optional().describe("Enable/disable always online"),
      hotlink_protection: z.boolean().optional().describe("Enable/disable hotlink protection"),
      rocket_loader: z.boolean().optional().describe("Enable/disable Rocket Loader"),
      bot_fight_mode: z.boolean().optional().describe("Enable/disable bot fight mode"),
      email_obfuscation: z.boolean().optional().describe("Enable/disable email obfuscation"),
      minify_html: z.boolean().optional().describe("Enable/disable HTML minification"),
      minify_css: z.boolean().optional().describe("Enable/disable CSS minification"),
      minify_js: z.boolean().optional().describe("Enable/disable JS minification"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, ...settings }) => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(settings)) {
        if (v !== undefined) body[k] = v;
      }
      if (!Object.keys(body).length) {
        return { content: [{ type: "text" as const, text: "No settings specified." }] };
      }
      const result = await apiRequest(apiKey, "PATCH", `/site/${fqdn}/cf_settings`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_clear_cache",
    "Purge all Cloudflare CDN cached content for a site",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/clear_cache`);
      return { content: [{ type: "text" as const, text: `Cache purged for ${fqdn}.\n${JSON.stringify(result, null, 2)}` }] };
    },
  );

  server.tool(
    "sitebay_check_ns_status",
    "Check whether a domain's nameservers point to SiteBay. Used to verify NS propagation.",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/ns_status`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_toggle_waf_login_protection",
    "Enable or disable rate-limiting on /wp-login.php to prevent brute-force attacks",
    {
      fqdn: z.string().describe("Site domain"),
      enabled: z.boolean().describe("Whether to enable WAF login protection"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, enabled }) => {
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/waf_login_protection`, { enabled });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Custom Hostnames ---

  server.tool(
    "sitebay_list_custom_hostnames",
    "List all custom hostnames attached to a site with DCV/SSL status",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/custom_hostname`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_add_custom_hostname",
    "Attach a custom domain (e.g. shop.theirclient.com) to a site via Cloudflare for SaaS",
    {
      fqdn: z.string().describe("Site domain"),
      hostname: z.string().describe("Custom hostname to attach"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ fqdn, hostname }) => {
      const result = await apiRequest(apiKey, "POST", `/site/${fqdn}/custom_hostname`, { hostname });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_remove_custom_hostname",
    "Remove a custom hostname from a site. Cannot be undone.",
    {
      fqdn: z.string().describe("Site domain"),
      hostname_id: z.string().describe("Hostname ID to remove"),
    },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, hostname_id }) => {
      await apiRequest(apiKey, "DELETE", `/site/${fqdn}/custom_hostname/${hostname_id}`);
      return { content: [{ type: "text" as const, text: `Custom hostname ${hostname_id} removed from ${fqdn}.` }] };
    },
  );

  // --- PIT Restore Status ---

  server.tool(
    "sitebay_get_pit_restores",
    "Get all point-in-time restore results for a site",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/pit_restore`);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_get_pit_restore",
    "Get the result of a specific point-in-time restore by ID",
    {
      fqdn: z.string().describe("Site domain"),
      pit_restore_id: z.string().describe("PIT restore UUID"),
      format: z.string().optional().describe("Response format (default: json)"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ fqdn, pit_restore_id, format }) => {
      const params: Record<string, string> = {};
      if (format !== undefined) params.format = format;
      const result = await apiRequest(apiKey, "GET", `/site/${fqdn}/pit_restore/${pit_restore_id}`, undefined, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Git Management ---

  server.tool(
    "sitebay_unlink_git",
    "Unlink the git repository from a site",
    { fqdn: z.string().describe("Site domain") },
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ fqdn }) => {
      await apiRequest(apiKey, "DELETE", `/site/${fqdn}/git`);
      return { content: [{ type: "text" as const, text: `Git repository unlinked from ${fqdn}.` }] };
    },
  );

  // --- Shopify Theme Management ---

  server.tool(
    "sitebay_read_asset",
    "Read a Shopify theme asset by key",
    {
      shop_name: z.string().describe("Shopify shop name"),
      theme_id: z.number().int().describe("Shopify theme ID"),
      key: z.string().describe("Theme file key, e.g. sections/hero.liquid"),
    },
    { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ shop_name, theme_id, key }) => {
      const result = await apiRequest(apiKey, "GET", `/shopify/${shop_name}/theme/${theme_id}/asset`, undefined, { key });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_edit_asset",
    "Edit a Shopify theme asset using search/replace blocks. Supports dry_run.",
    {
      shop_name: z.string().describe("Shopify shop name"),
      theme_id: z.number().int().describe("Shopify theme ID"),
      key: z.string().describe("Theme file key, e.g. sections/hero.liquid"),
      file_edit_using_search_replace_blocks: z.string().describe(
        "Search/replace blocks in <<<<<<< SEARCH / ======= / >>>>>>> REPLACE format",
      ),
      dry_run: z.boolean().optional().describe("Preview diff without applying changes"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ shop_name, theme_id, key, file_edit_using_search_replace_blocks, dry_run }) => {
      const body: Record<string, unknown> = { key, file_edit_using_search_replace_blocks };
      if (dry_run !== undefined) body.dry_run = dry_run;
      const result = await apiRequest(apiKey, "POST", `/shopify/${shop_name}/theme/${theme_id}/asset/edit`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_multi_edit_assets",
    "Edit multiple Shopify theme assets in one request. Supports dry_run and rollback reporting.",
    {
      shop_name: z.string().describe("Shopify shop name"),
      theme_id: z.number().int().describe("Shopify theme ID"),
      edits: z.array(z.object({
        key: z.string().describe("Theme file key, e.g. sections/hero.liquid"),
        search_replace_blocks: z.string().describe("Search/replace blocks"),
      })).describe("Array of asset edits to apply"),
      dry_run: z.boolean().optional().describe("Preview all diffs without applying"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ shop_name, theme_id, edits, dry_run }) => {
      const body: Record<string, unknown> = { edits };
      if (dry_run !== undefined) body.dry_run = dry_run;
      const result = await apiRequest(apiKey, "POST", `/shopify/${shop_name}/theme/${theme_id}/assets/multi_edit`, body);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "sitebay_duplicate_theme",
    "Duplicate a Shopify theme to create a rollback checkpoint",
    {
      shop_name: z.string().describe("Shopify shop name"),
      theme_id: z.number().int().describe("Shopify theme ID to duplicate"),
      name: z.string().describe("Name for the duplicated checkpoint theme"),
    },
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ shop_name, theme_id, name }) => {
      const result = await apiRequest(apiKey, "POST", `/shopify/${shop_name}/theme/${theme_id}/duplicate`, { name });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}

// --- CF Workers: McpAgent + Durable Object ---

type Env = {
  MCP_OBJECT: DurableObjectNamespace;
  AI: Ai;
};

export class SiteBayMCP extends McpAgent<Env, {}, { apiKey?: string }> {
  server = new McpServer(SERVER_INFO);

  async init() {
    // props are set by the fetch handler below via ctx.props
    const apiKey = this.props?.apiKey ?? "";
    registerCapabilities(this.server, apiKey, (this as any).env as Env);
  }
}

const mcpHandler = SiteBayMCP.serve("/mcp");

const SERVER_CARD = {
  serverInfo: SERVER_INFO,
  authentication: { required: true, schemes: ["bearer"] },
  tools: [
    { name: "sitebay_list_sites", description: "List all WordPress sites for the authenticated user", inputSchema: { type: "object", properties: { team_id: { type: "string", description: "Optional team ID to filter sites" } } } },
    { name: "sitebay_get_site", description: "Get detailed information about a specific WordPress site", inputSchema: { type: "object", properties: { fqdn: { type: "string", description: "Site domain" } }, required: ["fqdn"] } },
    { name: "sitebay_create_snapshot_job", description: "Queue a public-site snapshot job for a SiteBay site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, url: { type: "string" }, mode: { type: "string" }, depth: { type: "number" }, max_pages: { type: "number" }, include: { type: "string" }, exclude: { type: "string" } }, required: ["fqdn", "url"] } },
    { name: "sitebay_get_snapshot_job", description: "Get current status for a queued or completed snapshot job", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, job_id: { type: "string" } }, required: ["fqdn", "job_id"] } },
    { name: "sitebay_create_site", description: "Create a new WordPress site", inputSchema: { type: "object", properties: { team_id: { type: "string" }, fqdn: { type: "string" }, wordpress_blog_name: { type: "string" }, wordpress_first_name: { type: "string" }, wordpress_last_name: { type: "string" }, wordpress_email: { type: "string" }, wordpress_username: { type: "string" }, wordpress_password: { type: "string" } }, required: ["team_id", "fqdn", "wordpress_blog_name", "wordpress_first_name", "wordpress_last_name", "wordpress_email", "wordpress_username", "wordpress_password"] } },
    { name: "sitebay_update_site", description: "Update an existing WordPress site configuration", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_delete_site", description: "Delete a WordPress site permanently. Cannot be undone.", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_site_shell_command", description: "Execute a shell command on a WordPress site (supports WP-CLI)", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, command: { type: "string" } }, required: ["fqdn", "command"] } },
    { name: "sitebay_site_edit_file", description: "Edit a file in the site's wp-content directory using search/replace blocks", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, file_path: { type: "string" }, file_edit_using_search_replace_blocks: { type: "string" } }, required: ["fqdn", "file_path", "file_edit_using_search_replace_blocks"] } },
    { name: "sitebay_list_teams", description: "List all teams for the authenticated user", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_list_ready_made_sites", description: "List available ready-made site templates", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_wordpress_proxy", description: "Proxy requests to a WordPress site's REST API", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, path: { type: "string" }, method: { type: "string" }, query_params_json: { type: "string" }, body: { oneOf: [{ type: "string" }, { type: "object" }] } }, required: ["fqdn"] } },
    { name: "sitebay_wp_create_page", description: "Create a WordPress page with a typed schema and semantic validation", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, title: { type: "string" }, content: { type: "string" }, status: { type: "string" }, slug: { type: "string" }, excerpt: { type: "string" }, template: { type: "string" } }, required: ["fqdn", "title"] } },
    { name: "sitebay_wp_update_settings", description: "Update WordPress reading/front-page settings with a typed schema and semantic validation", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, show_on_front: { type: "string" }, page_on_front: { oneOf: [{ type: "number" }, { type: "string" }] } }, required: ["fqdn"] } },
    { name: "sitebay_shopify_proxy", description: "Proxy requests to Shopify Admin API", inputSchema: { type: "object", properties: { shop_name: { type: "string" }, path: { type: "string" }, method: { type: "string" } }, required: ["shop_name"] } },
    { name: "sitebay_posthog_proxy", description: "Proxy requests to PostHog analytics API", inputSchema: { type: "object", properties: { path: { type: "string" }, method: { type: "string" } }, required: ["path"] } },
    { name: "sitebay_backup_list_commits", description: "List available backup commits for point-in-time restore", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, number_to_fetch: { type: "number" } }, required: ["fqdn"] } },
    { name: "sitebay_backup_restore", description: "Restore a site to a previous point in time", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_account_affiliates", description: "Get affiliate referral information", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_account_create_checkout", description: "Create a Stripe checkout session for team billing", inputSchema: { type: "object", properties: { plan_name: { type: "string" }, interval: { type: "string" } } } },
    { name: "sitebay_get_dns_records", description: "Get DNS records for a nameserver-configured site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_create_dns_record", description: "Create a new DNS record (A or CNAME)", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, dns_name: { type: "string" }, dns_content: { type: "string" }, dns_type: { type: "string" }, proxied: { type: "boolean" } }, required: ["fqdn", "dns_name", "dns_content", "dns_type"] } },
    { name: "sitebay_delete_dns_record", description: "Delete a DNS record by ID. Cannot be undone.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, dns_id: { type: "string" } }, required: ["fqdn", "dns_id"] } },
    { name: "sitebay_get_site_logs", description: "Get WordPress, git-sync, access, error, php, or mysql logs", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, log_type: { type: "string" }, lines: { type: "number" }, level: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_get_container_logs", description: "Get raw container logs from a site's Kubernetes pod", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, container_name: { type: "string" }, lines: { type: "number" }, since: { type: "string" } }, required: ["fqdn", "container_name"] } },
    { name: "sitebay_backup_get_files", description: "List wp-content files at a point in time (read-only)", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, restore_point: { type: "string" } }, required: ["fqdn", "restore_point"] } },
    { name: "sitebay_backup_get_download_urls", description: "Generate signed download URLs for backup files", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, keys: { type: "array", items: { type: "string" } } }, required: ["fqdn", "keys"] } },
    { name: "sitebay_backup_preview_restore", description: "Preview a point-in-time restore without applying", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, restore_point: { type: "string" } }, required: ["fqdn", "restore_point"] } },
    { name: "sitebay_list_shopify_stores", description: "List Shopify stores connected via Shopify Link", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_get_shopify_store", description: "Get details of a specific linked Shopify store", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
    { name: "sitebay_update_shopify_store", description: "Update a linked Shopify store's blog URL or header injection", inputSchema: { type: "object", properties: { id: { type: "number" }, blog_url: { type: "string" }, inject_header: { type: "string" } }, required: ["id"] } },
    { name: "sitebay_get_external_paths", description: "List external path proxies for a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_create_external_path", description: "Create an external path proxy on a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, external_name: { type: "string" }, path: { type: "string" } }, required: ["fqdn", "external_name", "path"] } },
    { name: "sitebay_get_git_sync_repos", description: "List git-sync repositories linked to your account", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_get_linked_git_repos", description: "Get linked GitHub, GitLab, and Bitbucket repositories", inputSchema: { type: "object", properties: {} } },
    { name: "sitebay_create_checkpoint", description: "Create a named checkpoint with an auto-captured screenshot. MCP Enabled.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, name: { type: "string" }, description: { type: "string" }, page_path: { type: "string" } }, required: ["fqdn", "name"] } },
    { name: "sitebay_list_checkpoints", description: "List all checkpoints for a site, newest first. MCP Enabled.", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_get_checkpoint", description: "Get details of a specific checkpoint. MCP Enabled.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, checkpoint_id: { type: "string" } }, required: ["fqdn", "checkpoint_id"] } },
    { name: "sitebay_delete_checkpoint", description: "Delete checkpoint metadata. MCP Enabled.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, checkpoint_id: { type: "string" } }, required: ["fqdn", "checkpoint_id"] } },
    { name: "sitebay_restore_checkpoint", description: "Restore the site to the state at this checkpoint. MCP Enabled.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, checkpoint_id: { type: "string" } }, required: ["fqdn", "checkpoint_id"] } },
    { name: "sitebay_read_file", description: "Read a WordPress file from wp-content/. Supports line ranges.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, file_path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" } }, required: ["fqdn", "file_path"] } },
    { name: "sitebay_edit_file", description: "Edit a WordPress file using search/replace blocks. Supports dry_run.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, file_path: { type: "string" }, file_edit_using_search_replace_blocks: { type: "string" }, dry_run: { type: "boolean" } }, required: ["fqdn", "file_path", "file_edit_using_search_replace_blocks"] } },
    { name: "sitebay_read_and_edit_file", description: "Atomically read a WordPress file and apply edits. Returns original content alongside edit result.", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, file_path: { type: "string" }, file_edit_using_search_replace_blocks: { type: "string" }, dry_run: { type: "boolean" } }, required: ["fqdn", "file_path", "file_edit_using_search_replace_blocks"] } },
    { name: "sitebay_file_tree", description: "List the wp-content file tree with file sizes", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, path: { type: "string" }, max_depth: { type: "number" } }, required: ["fqdn"] } },
    { name: "sitebay_multi_edit_files", description: "Edit multiple WordPress files atomically with rollback on failure", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, edits: { type: "array", items: { type: "object", properties: { file_path: { type: "string" }, search_replace_blocks: { type: "string" } }, required: ["file_path", "search_replace_blocks"] } }, dry_run: { type: "boolean" } }, required: ["fqdn", "edits"] } },
    { name: "sitebay_get_staging_site", description: "Get the staging site for a live site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_create_staging_site", description: "Create a staging site from a live site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, subdomain: { type: "string" }, restore_point: { type: "string" }, git_staging_branch: { type: "string" } }, required: ["fqdn", "subdomain"] } },
    { name: "sitebay_delete_staging_site", description: "Delete a staging site. Cannot be undone.", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_dolt_log", description: "Get recent Dolt commits for a site's database", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, limit: { type: "number" } }, required: ["fqdn"] } },
    { name: "sitebay_dolt_diff", description: "Show what changed in the database between two Dolt commits", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, from_commit: { type: "string" }, to_commit: { type: "string" }, table: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_dolt_diff_summary", description: "Get a human-readable summary of database changes between Dolt commits", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, from_commit: { type: "string" }, to_commit: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_get_cloudflare_tools", description: "Get Cloudflare tools info and current zone settings", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_update_cf_settings", description: "Toggle Cloudflare performance/security settings", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, dev_mode: { type: "boolean" }, always_online: { type: "boolean" }, hotlink_protection: { type: "boolean" }, rocket_loader: { type: "boolean" }, bot_fight_mode: { type: "boolean" }, email_obfuscation: { type: "boolean" }, minify_html: { type: "boolean" }, minify_css: { type: "boolean" }, minify_js: { type: "boolean" } }, required: ["fqdn"] } },
    { name: "sitebay_clear_cache", description: "Purge all Cloudflare CDN cached content for a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_check_ns_status", description: "Check whether a domain's nameservers point to SiteBay", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_toggle_waf_login_protection", description: "Enable or disable rate-limiting on /wp-login.php", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, enabled: { type: "boolean" } }, required: ["fqdn", "enabled"] } },
    { name: "sitebay_list_custom_hostnames", description: "List all custom hostnames attached to a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_add_custom_hostname", description: "Attach a custom domain to a site via Cloudflare for SaaS", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, hostname: { type: "string" } }, required: ["fqdn", "hostname"] } },
    { name: "sitebay_remove_custom_hostname", description: "Remove a custom hostname from a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, hostname_id: { type: "string" } }, required: ["fqdn", "hostname_id"] } },
    { name: "sitebay_get_pit_restores", description: "Get all point-in-time restore results for a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_get_pit_restore", description: "Get the result of a specific point-in-time restore by ID", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, pit_restore_id: { type: "string" }, format: { type: "string" } }, required: ["fqdn", "pit_restore_id"] } },
    { name: "sitebay_unlink_git", description: "Unlink the git repository from a site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_read_asset", description: "Read a Shopify theme asset by key", inputSchema: { type: "object", properties: { shop_name: { type: "string" }, theme_id: { type: "number" }, key: { type: "string" } }, required: ["shop_name", "theme_id", "key"] } },
    { name: "sitebay_edit_asset", description: "Edit a Shopify theme asset using search/replace blocks", inputSchema: { type: "object", properties: { shop_name: { type: "string" }, theme_id: { type: "number" }, key: { type: "string" }, file_edit_using_search_replace_blocks: { type: "string" }, dry_run: { type: "boolean" } }, required: ["shop_name", "theme_id", "key", "file_edit_using_search_replace_blocks"] } },
    { name: "sitebay_multi_edit_assets", description: "Edit multiple Shopify theme assets in one request", inputSchema: { type: "object", properties: { shop_name: { type: "string" }, theme_id: { type: "number" }, edits: { type: "array", items: { type: "object", properties: { key: { type: "string" }, search_replace_blocks: { type: "string" } }, required: ["key", "search_replace_blocks"] } }, dry_run: { type: "boolean" } }, required: ["shop_name", "theme_id", "edits"] } },
    { name: "sitebay_duplicate_theme", description: "Duplicate a Shopify theme to create a rollback checkpoint", inputSchema: { type: "object", properties: { shop_name: { type: "string" }, theme_id: { type: "number" }, name: { type: "string" } }, required: ["shop_name", "theme_id", "name"] } },
    { name: "sitebay_browser_admin_cookie", description: "Generate a WordPress admin auth cookie for the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_browser_goto", description: "Navigate browser to a path on the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, path: { type: "string" } }, required: ["fqdn"] } },
    { name: "sitebay_browser_screenshot", description: "Take a screenshot of the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, full_page: { type: "boolean" } }, required: ["fqdn"] } },
    { name: "sitebay_browser_click", description: "Click an element on the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, selector: { type: "string" } }, required: ["fqdn", "selector"] } },
    { name: "sitebay_browser_fill", description: "Fill a form field on the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, selector: { type: "string" }, value: { type: "string" } }, required: ["fqdn", "selector", "value"] } },
    { name: "sitebay_browser_eval", description: "Run JavaScript on the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, js: { type: "string" } }, required: ["fqdn", "js"] } },
    { name: "sitebay_browser_text", description: "Get text content of an element on the site", inputSchema: { type: "object", properties: { fqdn: { type: "string" }, selector: { type: "string" } }, required: ["fqdn"] } },
  ],
  resources: [
    { uri: "sitebay://knowledge-base", name: "knowledge-base", description: "Curated source-of-truth documentation about SiteBay platform", mimeType: "application/json" },
    { uri: "sitebay://sites", name: "sites", description: "List of all WordPress sites for the authenticated user", mimeType: "application/json" },
    { uri: "sitebay://teams", name: "teams", description: "List of all teams for the authenticated user", mimeType: "application/json" },
  ],
  prompts: [
    { name: "manage-site", description: "Get guidance on managing a specific WordPress site", arguments: [{ name: "fqdn", description: "Site domain to manage", required: true }] },
    { name: "setup-new-site", description: "Walk through creating a new WordPress site on SiteBay" },
  ],
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/.well-known/mcp/server-card.json") {
      return new Response(JSON.stringify(SERVER_CARD), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
    // Extract apiKey from URL and pass as props to the Durable Object
    const apiKey = url.searchParams.get("apiKey") ?? "";
    (ctx as any).props = { apiKey };
    return mcpHandler.fetch(request, env, ctx);
  },
};

// --- Smithery compatibility ---

export function createServer({ config }: { config: Config }) {
  const server = new McpServer(SERVER_INFO);
  registerCapabilities(server, config.apiKey);
  return server.server;
}

export function createSandboxServer() {
  return createServer({ config: { apiKey: "test-key" } });
}
