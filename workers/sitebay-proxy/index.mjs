export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Serve a simple server-card for Smithery scanning
    if (url.pathname === '/.well-known/mcp/server-card.json') {
      return new Response(JSON.stringify({
        serverInfo: { name: 'SiteBay MCP', version: '0.1.0' },
        authentication: { required: false },
        tools: [],
        resources: [],
        prompts: [],
      }), { headers: { 'content-type': 'application/json' } });
    }

    const backend = env.BACKEND_URL || 'http://localhost:7823';
    // Construct target preserving path and query
    const backendUrl = new URL(backend);
    // join paths safely
    backendUrl.pathname = (backendUrl.pathname.replace(/\/$/, '') + url.pathname);
    backendUrl.search = url.search;

    const init = {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    };

    const resp = await fetch(backendUrl.toString(), init);

    // Return proxied response (streaming preserved)
    const headers = new Headers(resp.headers);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  }
};
