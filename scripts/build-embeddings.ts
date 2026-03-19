#!/usr/bin/env tsx
/**
 * build-embeddings.ts
 * Fetches the SiteBay docs bible index and generates embeddings via Cloudflare Workers AI.
 * Saves the result to src/embeddings.json.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const BIBLE_INDEX_URL =
  "https://raw.githubusercontent.com/sitebay/docs/main/articles/bible-index.json";
const ACCOUNT_ID = "ce0a39fc595f34ab1839c3f3497d805c";
const OUTPUT_PATH = path.resolve(import.meta.dirname ?? __dirname, "../src/embeddings.json");

type Article = { title: string; description: string; path: string; content: string };
type EmbeddingEntry = Article & { embedding: number[] };

function getCfApiToken(): string {
  // 1. Check env var
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }

  // 2. Try reading from wrangler config file
  const configPaths = [
    path.join(process.env.HOME ?? "~", ".config/.wrangler/config/default.toml"),
    path.join(process.env.HOME ?? "~", ".wrangler/config/default.toml"),
  ];
  for (const cfgPath of configPaths) {
    if (fs.existsSync(cfgPath)) {
      const content = fs.readFileSync(cfgPath, "utf-8");
      const match = content.match(/oauth_token\s*=\s*"([^"]+)"/);
      if (match) {
        console.log(`Using OAuth token from ${cfgPath}`);
        return match[1];
      }
      const apiMatch = content.match(/api_token\s*=\s*"([^"]+)"/);
      if (apiMatch) {
        console.log(`Using API token from ${cfgPath}`);
        return apiMatch[1];
      }
    }
  }

  // 3. Try npx wrangler whoami to confirm auth, then read token via wrangler secret
  try {
    const whoami = execSync("npx wrangler whoami 2>&1", { encoding: "utf-8" });
    console.log("Wrangler whoami output:", whoami.slice(0, 200));
  } catch (_) {
    // ignore
  }

  throw new Error(
    "No Cloudflare API token found. Set CLOUDFLARE_API_TOKEN env var or log in with `npx wrangler login`.",
  );
}

async function getEmbedding(token: string, text: string): Promise<number[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/baai/bge-small-en-v1.5`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: [text] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`CF AI API error ${res.status}: ${errText}`);
  }

  const json = (await res.json()) as { result: { data: number[][] }; success: boolean };
  if (!json.success) throw new Error(`CF AI returned success=false`);
  return json.result.data[0];
}

const PLACEHOLDER_ARTICLES: Article[] = [
  {
    title: "SiteBay Overview",
    description: "Introduction to SiteBay WordPress hosting platform",
    path: "/overview",
    content:
      "SiteBay is a managed WordPress hosting platform that provides git-based deployments, staging environments, WP-CLI access, backups, and more.",
  },
  {
    title: "Git Sync",
    description: "Deploy WordPress sites using Git",
    path: "/git-sync",
    content:
      "SiteBay supports git-based deployments. Push to your repository and your site updates automatically. Supports GitHub, GitLab, and Bitbucket.",
  },
  {
    title: "Staging Environments",
    description: "Create staging copies of your WordPress sites",
    path: "/staging",
    content:
      "Create a staging environment to test changes before deploying to production. Staging sites are isolated copies of your live site.",
  },
];

const LOCAL_BIBLE_PATH = "/home/bitnami/docs/articles/bible-index.json";

async function main() {
  let articles: Article[];

  // Try local file first
  if (fs.existsSync(LOCAL_BIBLE_PATH)) {
    console.log(`Loading bible index from local file: ${LOCAL_BIBLE_PATH}`);
    articles = JSON.parse(fs.readFileSync(LOCAL_BIBLE_PATH, "utf-8")) as Article[];
    console.log(`Loaded ${articles.length} articles.`);
  } else {
    console.log(`Fetching bible index from ${BIBLE_INDEX_URL}...`);
    try {
      const res = await fetch(BIBLE_INDEX_URL);
      if (!res.ok) {
        console.warn(`Bible index fetch returned ${res.status}, using placeholder articles.`);
        articles = PLACEHOLDER_ARTICLES;
      } else {
        articles = (await res.json()) as Article[];
        console.log(`Fetched ${articles.length} articles.`);
      }
    } catch (err) {
      console.warn(`Failed to fetch bible index: ${err}. Using placeholder articles.`);
      articles = PLACEHOLDER_ARTICLES;
    }
  }

  let token: string;
  try {
    token = getCfApiToken();
  } catch (err) {
    console.error(`Could not get CF API token: ${err}`);
    console.warn("Writing stub embeddings.json with empty embeddings.");
    const stub: EmbeddingEntry[] = articles.map((a) => ({ ...a, embedding: [] }));
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(stub, null, 2));
    console.log(`Wrote stub to ${OUTPUT_PATH}`);
    return;
  }

  const results: EmbeddingEntry[] = [];
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const inputText = `title: ${a.title}\n\ndescription: ${a.description ?? ""}\n\ncontent: ${(a.content ?? "").slice(0, 500)}`;
    try {
      console.log(`[${i + 1}/${articles.length}] Embedding: ${a.title}`);
      const embedding = await getEmbedding(token, inputText);
      results.push({ ...a, embedding });
    } catch (err) {
      console.warn(`  Failed to embed "${a.title}": ${err}. Skipping.`);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} embeddings to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("build-embeddings failed:", err);
  process.exit(1);
});
